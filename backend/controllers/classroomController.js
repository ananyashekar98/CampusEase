const Classroom = require('../models/Classroom');
const Timetable = require('../models/Timetable');
const Booking = require('../models/Booking');
const { toMinutes, getNow, timesOverlap } = require('../utils/time');
const { getScopeDepartment, isAllowedDepartment } = require('../utils/scope');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Reads the weekday straight off a "YYYY-MM-DD" string — no timezone math
// needed here since a calendar date has no time component to misinterpret.
function getDayOfWeekFromDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

// @route  POST /api/classrooms
// @access Private/Admin
const createClassroom = async (req, res) => {
  try {
    const { name, building, floor, capacity, type } = req.body;
    let { department } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Classroom name is required' });
    }

    const scope = getScopeDepartment(req.user);
    if (scope) {
      // A department-scoped admin can only ever add rooms to their own
      // department — force it rather than trust whatever was sent.
      department = scope;
    } else if (!department) {
      return res.status(400).json({ message: 'Department is required' });
    }

    const existing = await Classroom.findOne({ name: name.trim() });
    if (existing) {
      return res.status(409).json({ message: `Classroom "${name}" already exists` });
    }

    const classroom = await Classroom.create({ name, department, building, floor, capacity, type });
    return res.status(201).json({ classroom });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Create classroom error:', err);
    return res.status(500).json({ message: 'Server error creating classroom' });
  }
};

// @route  GET /api/classrooms
// @access Private (any authenticated role)
// Every account only sees its own department's rooms — except a global
// admin (no department on their own account), who sees every room.
const getClassrooms = async (req, res) => {
  try {
    const scope = getScopeDepartment(req.user);
    const filter = scope ? { department: scope } : {};
    const classrooms = await Classroom.find(filter).sort({ name: 1 });
    return res.status(200).json({ classrooms });
  } catch (err) {
    console.error('Get classrooms error:', err);
    return res.status(500).json({ message: 'Server error fetching classrooms' });
  }
};

// @route  DELETE /api/classrooms/:id
// @access Private/Admin
const deleteClassroom = async (req, res) => {
  try {
    const classroom = await Classroom.findById(req.params.id);
    if (!classroom) {
      return res.status(404).json({ message: 'Classroom not found' });
    }
    if (!isAllowedDepartment(req.user, classroom.department)) {
      return res.status(403).json({ message: 'You can only manage your own department\'s classrooms' });
    }
    await classroom.deleteOne();
    return res.status(200).json({ message: 'Classroom deleted' });
  } catch (err) {
    console.error('Delete classroom error:', err);
    return res.status(500).json({ message: 'Server error deleting classroom' });
  }
};

// Today's date as "YYYY-MM-DD", explicitly in IST regardless of the
// server's own timezone — matches how Booking.date is stored and compared
// everywhere else in the app.
function getTodayIST() {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  const yyyy = istNow.getUTCFullYear();
  const mm = String(istNow.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(istNow.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// @route  GET /api/classrooms/occupancy
// @access Private (any authenticated role)
// A "map" view: every classroom plus whether it's in use right now, and if
// so, what's running there — checked against BOTH today's live weekly
// Timetable AND today's approved one-off Bookings (extra classes, guest
// lectures). Checking the Timetable alone would wrongly show a room as
// "Free" while an approved extra class is actually sitting in it.
const getClassroomOccupancy = async (req, res) => {
  try {
    const scope = getScopeDepartment(req.user);
    const filter = scope ? { department: scope } : {};
    const classrooms = await Classroom.find(filter).sort({ building: 1, name: 1 });
    const roomIds = classrooms.map((c) => c._id);

    const { day, time } = getNow();
    const nowMinutes = toMinutes(time);
    const today = getTodayIST();

    const [todaysEntries, todaysBookings] = await Promise.all([
      Timetable.find({ day, classroom: { $in: roomIds } })
        .populate({ path: 'faculty', select: 'name' })
        .select('classroom startTime endTime subject department semester section faculty'),
      Booking.find({ date: today, status: 'approved', classroom: { $in: roomIds } })
        .populate({ path: 'forFaculty', select: 'name' })
        .select('classroom startTime endTime purpose department semester section forFaculty'),
    ]);

    // Normalize both sources into one shape per room so "what's on now" and
    // "what's next" don't have to special-case where a slot came from.
    const slotsByRoom = new Map();
    const addSlot = (roomId, slot) => {
      const key = String(roomId);
      if (!slotsByRoom.has(key)) slotsByRoom.set(key, []);
      slotsByRoom.get(key).push(slot);
    };

    todaysEntries.forEach((e) => {
      addSlot(e.classroom, {
        startTime: e.startTime,
        endTime: e.endTime,
        subject: e.subject,
        faculty: e.faculty?.name || null,
        department: e.department,
        semester: e.semester,
        section: e.section,
        source: 'timetable',
      });
    });
    todaysBookings.forEach((b) => {
      addSlot(b.classroom, {
        startTime: b.startTime,
        endTime: b.endTime,
        subject: b.purpose,
        faculty: b.forFaculty?.name || null,
        department: b.department,
        semester: b.semester,
        section: b.section,
        source: 'booking',
      });
    });

    slotsByRoom.forEach((list) => list.sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime)));

    const result = classrooms.map((room) => {
      const slots = slotsByRoom.get(String(room._id)) || [];
      const current = slots.find((s) => nowMinutes >= toMinutes(s.startTime) && nowMinutes < toMinutes(s.endTime));
      let freeUntil = null;
      if (!current) {
        const upcoming = slots.find((s) => toMinutes(s.startTime) > nowMinutes);
        freeUntil = upcoming ? upcoming.startTime : null; // null = free for the rest of today
      }
      return {
        ...room.toObject(),
        occupied: !!current,
        currentClass: current
          ? {
              subject: current.subject,
              faculty: current.faculty,
              department: current.department,
              semester: current.semester,
              section: current.section,
              until: current.endTime,
              source: current.source, // 'timetable' | 'booking' — lets the UI say "one-off booking" vs a regular class
            }
          : null,
        freeUntil,
      };
    });

    return res.status(200).json({ classrooms: result });
  } catch (err) {
    console.error('Get classroom occupancy error:', err);
    return res.status(500).json({ message: 'Server error fetching classroom occupancy' });
  }
};

// @route  GET /api/classrooms/available?date=YYYY-MM-DD&startTime=HH:MM&endTime=HH:MM
// @access Private (any authenticated role)
// Book Classroom used to list EVERY classroom and only find out about a
// clash after submitting. This returns just the rooms with no Timetable
// class and no approved Booking overlapping the chosen date/time range, so
// the picker can only ever show rooms that are actually free for that slot.
const getAvailableClassrooms = async (req, res) => {
  try {
    const { date, startTime, endTime } = req.query;
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!datePattern.test(date) || !timePattern.test(startTime) || !timePattern.test(endTime) || startTime >= endTime) {
      return res.status(400).json({ message: 'A valid date, startTime and endTime are required' });
    }

    const scope = getScopeDepartment(req.user);
    const filter = scope ? { department: scope } : {};
    const classrooms = await Classroom.find(filter).sort({ name: 1 });
    const roomIds = classrooms.map((c) => c._id);

    const day = getDayOfWeekFromDate(date);

    const [dayEntries, dateBookings] = await Promise.all([
      Timetable.find({ day, classroom: { $in: roomIds } }).select('classroom startTime endTime'),
      Booking.find({ date, status: 'approved', classroom: { $in: roomIds } }).select('classroom startTime endTime'),
    ]);

    const busyRoomIds = new Set();
    dayEntries.forEach((e) => {
      if (timesOverlap(startTime, endTime, e.startTime, e.endTime)) busyRoomIds.add(String(e.classroom));
    });
    dateBookings.forEach((b) => {
      if (timesOverlap(startTime, endTime, b.startTime, b.endTime)) busyRoomIds.add(String(b.classroom));
    });

    const available = classrooms.filter((c) => !busyRoomIds.has(String(c._id)));
    return res.status(200).json({ classrooms: available });
  } catch (err) {
    console.error('Get available classrooms error:', err);
    return res.status(500).json({ message: 'Server error fetching available classrooms' });
  }
};

module.exports = { createClassroom, getClassrooms, deleteClassroom, getClassroomOccupancy, getAvailableClassrooms };