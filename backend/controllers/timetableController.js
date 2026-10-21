const Timetable = require('../models/Timetable');
const Classroom = require('../models/Classroom');
const User = require('../models/User');
const { timesOverlap } = require('../utils/time');
const { notifyUser, notifyStudentGroup } = require('../utils/notify');
const { renderTimetablePdf } = require('../utils/timetablePdf');
const { seedSemester5Timetable } = require('../scripts/seedSemester5Timetable');
const { getScopeDepartment, isAllowedDepartment } = require('../utils/scope');

// Was Monday-Friday only on the assumption Saturday was Booking-only — but
// the Timetable model's own day enum, the admin Matrix View, and the
// frontend's shared DAYS constant all already include Saturday, so regular
// Saturday classes exist in the data and showed up everywhere except this
// PDF export. Matching the same list everywhere keeps the download in sync
// with what the app actually displays.
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Shared by getTimetable and the PDF export — same role-based visibility rules.
function buildTimetableFilter(req) {
  const filter = {};
  const { day, section, semester, department, faculty } = req.query;
  if (day) filter.day = day;

  if (req.user.role === 'faculty') {
    filter.faculty = req.user._id;
  } else if (req.user.role === 'student') {
    if (!req.user.semester || !req.user.section || !req.user.department) {
      return { filter: null };
    }
    filter.department = req.user.department;
    filter.semester = req.user.semester;
    filter.section = req.user.section;
  } else {
    // Admin. A department-scoped admin is locked to their own department —
    // any department query param they send is ignored/overridden. A global
    // admin (no department) can filter by whatever was passed, or see all.
    const scope = getScopeDepartment(req.user);
    if (section) filter.section = section.toUpperCase();
    if (semester) filter.semester = Number(semester);
    if (scope) {
      filter.department = scope;
    } else if (department) {
      filter.department = department;
    }
    if (faculty) filter.faculty = faculty;
  }
  return { filter };
}

// @route  POST /api/timetable
// @access Private/Admin
const createEntry = async (req, res) => {
  try {
    const { classroom, faculty, subject, day, startTime, endTime, semester, section } = req.body;
    const classType = ['theory', 'lab'].includes(req.body.classType) ? req.body.classType : undefined;
    let { department } = req.body;
    const scope = getScopeDepartment(req.user);
    if (scope) department = scope;

    if (!classroom || !faculty || !subject || !department || !day || !startTime || !endTime || !semester || !section) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (startTime >= endTime) {
      return res.status(400).json({ message: 'startTime must be before endTime' });
    }

    const [classroomDoc, facultyDoc] = await Promise.all([
      Classroom.findById(classroom),
      User.findOne({ _id: faculty, role: 'faculty' }),
    ]);

    if (!classroomDoc) return res.status(404).json({ message: 'Classroom not found' });
    if (!facultyDoc) return res.status(404).json({ message: 'Faculty member not found' });
    if (!isAllowedDepartment(req.user, classroomDoc.department)) {
      return res.status(403).json({ message: 'That classroom belongs to a different department' });
    }
    if (!isAllowedDepartment(req.user, facultyDoc.department)) {
      return res.status(403).json({ message: 'That faculty member belongs to a different department' });
    }

    // Pull every entry on the same day that could possibly conflict
    // (same room, same faculty, or same class group) and check overlap in JS
    // since Mongo can't compare time-range overlap in a simple query.
    // Note: "class group" is department + semester + section together —
    // different departments can share the same semester/section label
    // (e.g. "Sem 5 A" exists in both CSE and ISE) without clashing.
    const sameDayEntries = await Timetable.find({
      day,
      $or: [{ classroom }, { faculty }, { department, semester, section }],
    });

    const conflict = sameDayEntries.find((entry) =>
      timesOverlap(startTime, endTime, entry.startTime, entry.endTime)
    );

    if (conflict) {
      let reason = 'Time slot conflict';
      if (String(conflict.classroom) === String(classroom)) {
        reason = `Classroom is already booked ${conflict.startTime}-${conflict.endTime} on ${day}`;
      } else if (String(conflict.faculty) === String(faculty)) {
        reason = `This faculty member already has a class ${conflict.startTime}-${conflict.endTime} on ${day}`;
      } else {
        reason = `${department} Sem ${semester} Section ${section} already has a class ${conflict.startTime}-${conflict.endTime} on ${day}`;
      }
      return res.status(409).json({ message: reason });
    }

    const entry = await Timetable.create({
      classroom,
      faculty,
      subject,
      department,
      day,
      startTime,
      endTime,
      semester,
      section,
      ...(classType ? { classType } : {}),
    });

    const populated = await entry.populate([
      { path: 'classroom', select: 'name building type' },
      { path: 'faculty', select: 'name department' },
    ]);

    notifyUser(faculty, {
      title: 'New class added',
      message: `${subject} added to your timetable — ${day} ${startTime}-${endTime} in ${populated.classroom.name}`,
      type: 'timetable',
    });
    notifyStudentGroup(
      { department, semester, section },
      {
        title: 'Timetable updated',
        message: `${subject} added — ${day} ${startTime}-${endTime} in ${populated.classroom.name}`,
        type: 'timetable',
      }
    );

    return res.status(201).json({ entry: populated });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Create timetable entry error:', err);
    return res.status(500).json({ message: 'Server error creating timetable entry' });
  }
};

// @route  GET /api/timetable
// @access Private
// Admin: all entries (optionally filter by ?day=, ?section=, ?semester=)
// Faculty: only their own entries
// Student: only their section's entries (from their profile)
const getTimetable = async (req, res) => {
  try {
    const { filter } = buildTimetableFilter(req);
    if (!filter) {
      return res.status(200).json({ entries: [], message: 'Your profile has no department/semester/section set yet' });
    }

    const entries = await Timetable.find(filter)
      .populate('classroom', 'name building type')
      .populate('faculty', 'name department')
      .sort({ day: 1, startTime: 1 });

    return res.status(200).json({ entries });
  } catch (err) {
    console.error('Get timetable error:', err);
    return res.status(500).json({ message: 'Server error fetching timetable' });
  }
};

// @route  GET /api/timetable/pdf
// @access Private (same visibility rules as getTimetable)
// Streams a landscape A4 PDF of the caller's (role-appropriate) weekly timetable.
const downloadTimetablePdf = async (req, res) => {
  try {
    const { filter } = buildTimetableFilter(req);
    if (!filter) {
      return res.status(400).json({ message: 'Your profile has no department/semester/section set yet' });
    }
    // A PDF renders one entry per day/time cell, so it only makes sense for
    // a single person's or single class group's week. Department alone (or
    // semester alone) still spans multiple sections and can collide — a
    // real single group needs a specific faculty member, OR both semester
    // AND section picked together.
    const hasScope = filter.faculty || (filter.semester && filter.section);
    if (req.user.role === 'admin' && !hasScope) {
      return res.status(400).json({ message: 'Select a semester AND section (or a specific faculty member) first.' });
    }

    const entries = await Timetable.find(filter)
      .populate('classroom', 'name building type')
      .populate('faculty', 'name department')
      .sort({ day: 1, startTime: 1 });

    let title = 'My Timetable';
    let subtitle = req.user.name;
    if (req.user.role === 'student') {
      subtitle = `${req.user.name} · ${req.user.department} · Sem ${req.user.semester} ${req.user.section}`;
    } else if (req.user.role === 'faculty') {
      subtitle = `${req.user.name} · ${req.user.department || ''}`;
    } else {
      title = 'Timetable';
      const { section, semester, department, faculty } = req.query;
      if (faculty && entries[0]?.faculty?.name) {
        subtitle = entries[0].faculty.name;
      } else if (faculty) {
        // A faculty member with zero classes this week has no entries to
        // read the name off of (entries[0] above) — look it up directly so
        // the PDF still says whose empty week this is, instead of falling
        // through to the generic "All classes" subtitle below.
        const facultyDoc = await User.findById(faculty).select('name');
        subtitle = facultyDoc?.name || 'Faculty';
      } else if (department || semester || section) {
        subtitle = [department, semester ? `Sem ${semester}` : null, section].filter(Boolean).join(' · ');
      } else {
        subtitle = 'All classes';
      }
    }

    renderTimetablePdf(res, { title, subtitle, entries, days: DAYS });
  } catch (err) {
    console.error('Download timetable PDF error:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error generating PDF' });
    }
  }
};


// @route POST /api/timetable/seed-sem5
// @access Private/Admin
// Creates a realistic demo timetable for Sem 5 (ISE, CSE, ECE; sections A/B/C).
const seedSemester5 = async (req, res) => {
  try {
    const replace = req.body?.replace === true;
    const result = await seedSemester5Timetable({ replace });
    return res.status(result.seeded ? 201 : 200).json(result);
  } catch (err) {
    console.error('Seed Semester 5 timetable error:', err);
    return res.status(500).json({ message: err.message || 'Could not seed Semester 5 timetable' });
  }
};

// @route  DELETE /api/timetable/:id
// @access Private/Admin
const deleteEntry = async (req, res) => {
  try {
    const entry = await Timetable.findById(req.params.id).populate('classroom', 'name');
    if (!entry) {
      return res.status(404).json({ message: 'Timetable entry not found' });
    }
    if (!isAllowedDepartment(req.user, entry.department)) {
      return res.status(403).json({ message: 'You can only manage your own department\'s timetable' });
    }
    await entry.deleteOne();

    notifyUser(entry.faculty, {
      title: 'Class removed',
      message: `${entry.subject} removed from your timetable — was ${entry.day} ${entry.startTime}-${entry.endTime}`,
      type: 'timetable',
    });
    notifyStudentGroup(
      { department: entry.department, semester: entry.semester, section: entry.section },
      {
        title: 'Timetable updated',
        message: `${entry.subject} removed — was ${entry.day} ${entry.startTime}-${entry.endTime}`,
        type: 'timetable',
      }
    );

    return res.status(200).json({ message: 'Timetable entry deleted' });
  } catch (err) {
    console.error('Delete timetable entry error:', err);
    return res.status(500).json({ message: 'Server error deleting timetable entry' });
  }
};

const { locked } = require('../utils/allocationLock');

// Adding or deleting a class changes which rooms are free, so these share the allocator's lock.
module.exports = { createEntry: locked(createEntry), getTimetable, downloadTimetablePdf, deleteEntry: locked(deleteEntry), seedSemester5 };