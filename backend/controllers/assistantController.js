const Classroom = require('../models/Classroom');
const User = require('../models/User');
const { askGroq } = require('../utils/groq');

// @route  POST /api/assistant/parse-booking
// @access Private/Admin
// Takes free text like "book LH-301 for Prof. Sharma's DS class tomorrow at 2pm"
// and returns a structured, matched-against-real-records booking draft for the
// admin to review and confirm — this endpoint never books anything itself.
const parseBookingRequest = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Please describe the booking you want to make' });
    }

    const [classrooms, faculty] = await Promise.all([
      Classroom.find().select('name'),
      User.find({ role: 'faculty' }).select('name'),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    const systemPrompt = `You are a scheduling assistant for a college classroom booking system.
Today's date is ${today} (${dayName}).
Known classrooms: ${classrooms.map((c) => c.name).join(', ') || 'none yet'}.
Known faculty: ${faculty.map((f) => f.name).join(', ') || 'none yet'}.

Read the admin's request and extract a single classroom booking. Respond with ONLY a JSON
object, no other text, in exactly this shape:
{
  "classroomName": string or null,
  "facultyName": string or null,
  "subject": string or null,
  "date": "YYYY-MM-DD" or null,
  "startTime": "HH:MM" in 24-hour format, or null,
  "endTime": "HH:MM" in 24-hour format, or null,
  "purpose": a short human-readable description combining subject and faculty name,
  "notes": any ambiguity, missing info, or assumptions you made, as a short string, or null
}
Resolve relative dates ("today", "tomorrow", "next Monday") against today's date above.
If no end time is given, assume a 1-hour class.
Try to match classroomName and facultyName as closely as possible to the known lists above,
but if nothing matches well, use what the admin actually said and mention it in "notes".`;

    const raw = await askGroq([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ]);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      return res.status(502).json({
        message: 'The assistant returned something unexpected. Please try rephrasing your request.',
      });
    }

    // Match the AI's free-text names back to real records so the admin sees
    // exactly what will be booked, not just raw guessed strings.
    const matchedClassroom = parsed.classroomName
      ? classrooms.find((c) => c.name.toLowerCase() === String(parsed.classroomName).toLowerCase()) ||
        classrooms.find((c) => c.name.toLowerCase().includes(String(parsed.classroomName).toLowerCase()))
      : null;

    const matchedFaculty = parsed.facultyName
      ? faculty.find((f) => f.name.toLowerCase() === String(parsed.facultyName).toLowerCase()) ||
        faculty.find((f) => f.name.toLowerCase().includes(String(parsed.facultyName).toLowerCase()))
      : null;

    return res.status(200).json({
      parsed,
      matchedClassroomId: matchedClassroom?._id || null,
      matchedClassroomName: matchedClassroom?.name || null,
      matchedFacultyId: matchedFaculty?._id || null,
      matchedFacultyName: matchedFaculty?.name || null,
    });
  } catch (err) {
    console.error('Parse booking request error:', err);
    return res.status(500).json({ message: err.message || 'Server error parsing your request' });
  }
};

module.exports = { parseBookingRequest };
