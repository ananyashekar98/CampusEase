const Booking = require('../models/Booking');
const Classroom = require('../models/Classroom');
const User = require('../models/User');
const { findBookingConflict, findFacultyConflict } = require('../utils/bookingConflicts');
const { notifyAdmins, notifyUser, notifyStudentGroup } = require('../utils/notify');
const { getScopeDepartment, isAllowedDepartment } = require('../utils/scope');

// A normal college day runs 8:30 AM to 4:30 PM. Only Admin can book outside
// this window (genuine extra/after-hours classes) — Faculty requests must
// stay inside it.
const COLLEGE_START_TIME = '08:30';
const COLLEGE_END_TIME = '16:30';
function isOutsideCollegeHours(startTime, endTime) {
  return startTime < COLLEGE_START_TIME || endTime > COLLEGE_END_TIME;
}

// The college is in India, but the server this runs on might not be (cloud
// hosts are commonly UTC) — so "now" for the purpose of "is this date/time
// already in the past" has to be computed in IST explicitly, not just read
// off the server's own clock. Date.now() is already a UTC-based timestamp,
// so shifting it by the fixed +5:30 offset and reading it back with the
// UTC getters gives IST wall-clock values regardless of server timezone.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
function getNowIST() {
  const ist = new Date(Date.now() + IST_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`,
    time: `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`,
  };
}

// "date" is a "YYYY-MM-DD" string and "startTime" is "HH:MM" — both compare
// correctly with plain string comparison, so no date-parsing library needed.
function isInPast(date, startTime) {
  const now = getNowIST();
  if (date < now.date) return true;
  if (date === now.date && startTime <= now.time) return true;
  return false;
}

// The college runs no classes and allows no room bookings on Sundays at
// all. The date picker already greys Sundays out in the app, but that's
// just UI — this is the actual enforcement, in case a request ever reaches
// the API some other way than that picker.
function isSunday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() === 0;
}

// Every notification message below used to interpolate the raw 24-hour
// "HH:MM" strings directly, so a rejection/approval/after-hours message would
// read "14:00-15:00" — this is the 12-hour version for all of them.
function formatTime12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}
function formatTimeRange12h(startTime, endTime) {
  return `${formatTime12h(startTime)}-${formatTime12h(endTime)}`;
}

// "4 Oct 2026" instead of the raw "2026-10-04" the date is stored as — the
// stored/compared value never changes, this is purely how it reads in a
// notification.
function formatDateReadable(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Every notification used to be its own ad-hoc sentence, so the same event
// read differently depending on which screen triggered it. These two
// helpers give every booking notification, for every role, one consistent
// shape: "<who> booked <room> for <purpose> on <date>, <time>."
// `person` is a populated user doc ({ name, role, ... }) or null/undefined.
function describeBookedBy(person) {
  if (!person) return 'Someone';
  const title = person.role === 'faculty' ? 'Prof. ' : '';
  return `${title}${person.name}`;
}
function describeClass({ classroomName, purpose, date, startTime, endTime }) {
  return `${classroomName} for ${purpose} on ${formatDateReadable(date)}, ${formatTimeRange12h(startTime, endTime)}`;
}

// The college runs no classes and allows no room bookings on Sundays at
// all. Building a plain Date from the Y/M/D numbers (not parsing the
// string directly) means this reads the weekday of that calendar date
// itself, unaffected by server timezone.
function isSundayDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() === 0;
}

const POPULATE_FIELDS = [
  { path: 'classroom', select: 'name department building type capacity' },
  { path: 'requestedBy', select: 'name email role department' },
  { path: 'forFaculty', select: 'name email role department' },
  { path: 'reviewedBy', select: 'name' },
];

// Every room now belongs to exactly one department. A scoped user
// (student/faculty/department-admin) may only ever touch rooms in their
// own department — this returns the classroom IDs allowed for a request,
// or null to mean "no restriction" (global admin).
async function allowedClassroomIds(user) {
  const scope = getScopeDepartment(user);
  if (!scope) return null;
  const rooms = await Classroom.find({ department: scope }).select('_id');
  return rooms.map((r) => r._id);
}

// Notifies the specific faculty member (if this class was booked "for" them
// by someone else) and/or the specific student group (if one was given) —
// called once a booking is actually approved, whether that's immediately
// (admin direct booking) or later (approveBooking).
function notifyBookingParticipants(booking, classroomName) {
  const classLine = describeClass({
    classroomName,
    purpose: booking.purpose,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
  });
  // .populate() mutates the document in place, so by the time this runs
  // booking.forFaculty/.requestedBy are already populated User objects
  // ({ name, role, ... }), not raw ObjectIds — handle both forms safely
  // in case a caller ever passes an unpopulated booking in.
  const forFacultyId = booking.forFaculty?._id || booking.forFaculty;
  const requestedById = booking.requestedBy?._id || booking.requestedBy;
  const requestedByPerson = booking.requestedBy?.name ? booking.requestedBy : null;
  // The faculty actually teaching this class: whoever it was booked "for",
  // or — if nobody was named — whoever booked it (a faculty member booking
  // their own class).
  const teachingFaculty = (booking.forFaculty?.name ? booking.forFaculty : null) || requestedByPerson;

  if (forFacultyId && String(forFacultyId) !== String(requestedById)) {
    notifyUser(forFacultyId, {
      title: 'A class was booked for you',
      message: `${describeBookedBy(requestedByPerson)} booked ${classLine} on your behalf.`,
      type: 'extra-class',
    });
  }

  if (booking.department && booking.semester && booking.section) {
    // This is the student-facing announcement of an approved extra/one-off
    // session — it used to be the entire reason the separate "Classroom
    // Bookings" screen existed. Now that screen is gone, so this
    // notification (type 'extra-class', not plain 'booking') IS how a
    // student finds out about it: same info, just delivered here instead.
    notifyStudentGroup(
      { department: booking.department, semester: booking.semester, section: booking.section },
      {
        title: 'Extra Class Added',
        message: `${describeBookedBy(teachingFaculty)} booked ${classLine}.`,
        type: 'extra-class',
      }
    );
  }
}

// @route  POST /api/bookings
// @access Private/Faculty,Admin
// Faculty requests land as "pending". Admin bookings ("Admin Direct Booking")
// are auto-approved since the admin has full authority over the room already.
const createBooking = async (req, res) => {
  try {
    const { classroom, date, startTime, endTime, purpose, forFaculty, department, semester, section } = req.body;

    if (!classroom || !date || !startTime || !endTime || !purpose) {
      return res.status(400).json({ message: 'Classroom, date, time range and purpose are required' });
    }
    if (startTime >= endTime) {
      return res.status(400).json({ message: 'startTime must be before endTime' });
    }
    // Nothing stopped a booking for a date/time that's already gone — a
    // room can't actually be used in the past, so this is never a valid
    // request regardless of role.
    if (isInPast(date, startTime)) {
      return res.status(400).json({
        message: 'That date/time has already passed. Pick a date and time that are still ahead of now.',
      });
    }
    if (isSunday(date)) {
      return res.status(400).json({ message: 'Classrooms cannot be booked on Sundays.' });
    }
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && isOutsideCollegeHours(startTime, endTime)) {
      return res.status(400).json({
        message: `Faculty bookings must be within college hours (${formatTimeRange12h(COLLEGE_START_TIME, COLLEGE_END_TIME)}). For an after-hours or extra class, ask an admin to book it directly.`,
      });
    }

    const classroomDoc = await Classroom.findById(classroom);
    if (!classroomDoc) {
      return res.status(404).json({ message: 'Classroom not found' });
    }
    if (!isAllowedDepartment(req.user, classroomDoc.department)) {
      return res.status(403).json({ message: 'That classroom belongs to a different department' });
    }
    if (forFaculty) {
      const forFacultyUser = await User.findById(forFaculty).select('department');
      if (forFacultyUser && !isAllowedDepartment(req.user, forFacultyUser.department)) {
        return res.status(403).json({ message: 'That faculty member belongs to a different department' });
      }
    }
    const scope = getScopeDepartment(req.user);
    if (scope && department && department !== scope) {
      return res.status(403).json({ message: 'You can only notify your own department\'s students' });
    }

    const conflictReason = await findBookingConflict({ classroom, date, startTime, endTime });
    if (conflictReason) {
      return res.status(409).json({ message: conflictReason });
    }

    const booking = await Booking.create({
      classroom,
      date,
      startTime,
      endTime,
      purpose,
      forFaculty: forFaculty || undefined,
      department: department || undefined,
      semester: semester || undefined,
      section: section || undefined,
      requestedBy: req.user._id,
      status: isAdmin ? 'approved' : 'pending',
      reviewedBy: isAdmin ? req.user._id : undefined,
    });

    const populated = await booking.populate(POPULATE_FIELDS);

    if (!isAdmin) {
      notifyAdmins({
        title: 'New booking request',
        message: `${describeBookedBy(req.user)} requested ${describeClass({ classroomName: classroomDoc.name, purpose, date, startTime, endTime })}.`,
        type: 'booking',
        // Lets this notification carry its own Approve/Reject buttons —
        // see relatedBooking on the Notification model.
        relatedBooking: booking._id,
      });
    } else {
      // Admin bookings are approved the instant they're created, so this is
      // the only point at which the faculty/students for it should hear about it.
      notifyBookingParticipants(booking, classroomDoc.name);
    }

    return res.status(201).json({ booking: populated });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Create booking error:', err);
    return res.status(500).json({ message: 'Server error creating booking' });
  }
};

// A pending request whose date/time has already passed was never acted on
// in time. Leaving it sitting as "pending" forever is misleading (it still
// looks like it's awaiting a decision, when the window for one has actually
// closed), and approving it at that point would "approve" a class that can
// no longer happen — approveBooking already blocks that, but nothing moved
// the booking itself out of "pending". This sweeps those over to
// "cancelled" and notifies the requester the same way a human cancellation
// would. There's no scheduled-job infrastructure here, so it runs
// opportunistically at the top of the two read paths (admin's "All
// Bookings" and a faculty member's "My Bookings") instead — cheap for a
// college-sized dataset, and it means the list is never stale by more than
// one request.
async function expireOverduePendingBookings() {
  const pending = await Booking.find({ status: 'pending' }).populate('classroom', 'name');
  const overdue = pending.filter((b) => isInPast(b.date, b.startTime));
  if (overdue.length === 0) return;

  await Promise.all(
    overdue.map(async (booking) => {
      // "Rejected" is now the one and only call-it-off status — this is the
      // "auto" flavor of it (the system did it, nobody reviewed in time),
      // as opposed to an admin's or the requester's own manual action.
      booking.status = 'rejected';
      booking.rejectionType = 'auto';
      booking.reviewNote = 'Automatically rejected — no action was taken before the requested time passed.';
      await booking.save();

      const classLine = describeClass({
        classroomName: booking.classroom?.name,
        purpose: booking.purpose,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
      });
      notifyUser(booking.requestedBy, {
        title: 'Request expired',
        message: `Your booking request — ${classLine} — was never reviewed in time and has been automatically cancelled.`,
        type: 'booking',
      });
    })
  );
}

// @route  GET /api/bookings/mine
// @access Private/Faculty
// Includes bookings the faculty member made themselves AND bookings someone
// else (e.g. an admin) made specifically for them. Not department-scoped —
// these are always "mine" regardless of which department the room is in.
const getMyBookings = async (req, res) => {
  try {
    await expireOverduePendingBookings();
    const bookings = await Booking.find({
      $or: [{ requestedBy: req.user._id }, { forFaculty: req.user._id }],
    })
      .populate(POPULATE_FIELDS)
      .sort({ date: -1, startTime: 1 });
    return res.status(200).json({ bookings });
  } catch (err) {
    console.error('Get my bookings error:', err);
    return res.status(500).json({ message: 'Server error fetching your bookings' });
  }
};

// @route  GET /api/bookings?status=pending
// @access Private/Admin
const getAllBookings = async (req, res) => {
  try {
    await expireOverduePendingBookings();
    const { status } = req.query;
    const filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    const roomIds = await allowedClassroomIds(req.user);
    if (roomIds) filter.classroom = { $in: roomIds };

    const bookings = await Booking.find(filter)
      .populate(POPULATE_FIELDS)
      .sort({ date: -1, startTime: 1 });
    return res.status(200).json({ bookings });
  } catch (err) {
    console.error('Get all bookings error:', err);
    return res.status(500).json({ message: 'Server error fetching bookings' });
  }
};

// @route  GET /api/bookings/approved
// @access Private (any authenticated role — students can see what's booked
// in their own department; a global admin sees all)
const getApprovedBookings = async (req, res) => {
  try {
    const { date } = req.query;
    const filter = { status: 'approved' };
    if (date) filter.date = date;
    const roomIds = await allowedClassroomIds(req.user);
    if (roomIds) filter.classroom = { $in: roomIds };

    const bookings = await Booking.find(filter)
      .populate(POPULATE_FIELDS)
      .sort({ date: 1, startTime: 1 });
    return res.status(200).json({ bookings });
  } catch (err) {
    console.error('Get approved bookings error:', err);
    return res.status(500).json({ message: 'Server error fetching bookings' });
  }
};

// @route  PUT /api/bookings/:id/approve
// @access Private/Admin
const approveBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('classroom', 'name department');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (!isAllowedDepartment(req.user, booking.classroom.department)) {
      return res.status(403).json({ message: 'You can only manage bookings in your own department' });
    }
    if (booking.status !== 'pending') {
      return res.status(400).json({ message: `Booking is already ${booking.status}` });
    }
    // A pending request can sit unreviewed long enough that its own date/time
    // quietly passes — approving it at that point would "approve" a class
    // that can never actually happen. Catch it here too, not just at creation.
    if (isInPast(booking.date, booking.startTime)) {
      return res.status(400).json({
        message: 'This request\'s date/time has already passed — it can no longer be approved. Ask the requester to submit a new one.',
      });
    }

    // Re-check in case another booking was approved in the meantime.
    const conflictReason = await findBookingConflict({
      classroom: booking.classroom._id,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      excludeBookingId: booking._id,
    });
    if (conflictReason) {
      return res.status(409).json({ message: `Cannot approve — ${conflictReason}` });
    }

    booking.status = 'approved';
    booking.reviewedBy = req.user._id;
    await booking.save();

    const populated = await booking.populate(POPULATE_FIELDS);

    notifyUser(booking.requestedBy, {
      title: 'Booking approved',
      message: `Your booking — ${describeClass({ classroomName: populated.classroom.name, purpose: booking.purpose, date: booking.date, startTime: booking.startTime, endTime: booking.endTime })} — has been approved.`,
      // A faculty member's approved booking shows under "Extra Classes" too.
      type: 'extra-class',
    });
    notifyBookingParticipants(booking, populated.classroom.name);

    return res.status(200).json({ booking: populated });
  } catch (err) {
    console.error('Approve booking error:', err);
    return res.status(500).json({ message: 'Server error approving booking' });
  }
};

// @route  PUT /api/bookings/:id/reject
// @access Private/Admin
const rejectBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('classroom', 'name department');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (!isAllowedDepartment(req.user, booking.classroom.department)) {
      return res.status(403).json({ message: 'You can only manage bookings in your own department' });
    }
    if (booking.status !== 'pending') {
      return res.status(400).json({ message: `Booking is already ${booking.status}` });
    }

    booking.status = 'rejected';
    booking.rejectionType = 'manual';
    booking.reviewedBy = req.user._id;
    booking.reviewNote = req.body.note || undefined;
    await booking.save();

    const populated = await booking.populate(POPULATE_FIELDS);

    notifyUser(booking.requestedBy, {
      title: 'Booking rejected',
      message: `Your booking — ${describeClass({ classroomName: populated.classroom.name, purpose: booking.purpose, date: booking.date, startTime: booking.startTime, endTime: booking.endTime })} — has been rejected.${booking.reviewNote ? ` Reason: ${booking.reviewNote}` : ''}`,
      type: 'booking',
    });

    return res.status(200).json({ booking: populated });
  } catch (err) {
    console.error('Reject booking error:', err);
    return res.status(500).json({ message: 'Server error rejecting booking' });
  }
};

// @route  GET /api/bookings/faculty-availability?facultyId=&date=&startTime=&endTime=
// @access Private/Faculty,Admin
// A free room doesn't mean the faculty member it's being booked "for" is
// free — this is a separate, non-blocking check so the booking screen can
// warn ("Prof. X already has DBMS, Sem 5 ISE-A at this time") for both a
// faculty member booking for themselves and an admin booking on a faculty's
// behalf. It never rejects the booking, it only reports what it found.
const checkFacultyAvailability = async (req, res) => {
  try {
    const { facultyId, date, startTime, endTime } = req.query;
    if (!facultyId || !date || !startTime || !endTime) {
      return res.status(400).json({ message: 'facultyId, date, startTime and endTime are required' });
    }
    const facultyUser = await User.findById(facultyId).select('name');
    if (!facultyUser) {
      return res.status(404).json({ message: 'Faculty not found' });
    }
    const conflict = await findFacultyConflict({ facultyId, date, startTime, endTime });
    if (!conflict) {
      return res.status(200).json({ conflict: null });
    }
    return res.status(200).json({
      conflict: {
        facultyName: facultyUser.name,
        subject: conflict.subject,
        classroomName: conflict.classroomName,
        semester: conflict.semester,
        section: conflict.section,
        time: formatTimeRange12h(conflict.startTime, conflict.endTime),
        day: conflict.day,
        source: conflict.source,
      },
    });
  } catch (err) {
    console.error('Check faculty availability error:', err);
    return res.status(500).json({ message: 'Server error checking faculty availability' });
  }
};

// @route  PUT /api/bookings/:id/cancel
// @access Private (the requester, the faculty it's for, or an admin —
// department-scoped admins may only cancel bookings in their own department)
const cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate(POPULATE_FIELDS);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const requestedById = booking.requestedBy?._id || booking.requestedBy;
    const forFacultyId = booking.forFaculty?._id || booking.forFaculty;
    const isRequester = String(requestedById) === String(req.user._id);
    const isForFaculty = forFacultyId && String(forFacultyId) === String(req.user._id);
    const isAdmin = req.user.role === 'admin';
    const isAdminInScope = isAdmin && isAllowedDepartment(req.user, booking.classroom?.department);
    if (!isRequester && !isForFaculty && !isAdminInScope) {
      return res.status(403).json({ message: 'You can only cancel your own bookings' });
    }
    if (booking.status === 'rejected') {
      return res.status(400).json({ message: 'Booking is already rejected' });
    }

    const wasApproved = booking.status === 'approved';
    // "Cancel" folds into the same single "rejected" status as an explicit
    // admin rejection or the auto-expiry sweep above — this is its "manual"
    // flavor, whether an admin or the requester themselves called it off.
    booking.status = 'rejected';
    booking.rejectionType = 'manual';
    if (!booking.reviewNote) {
      booking.reviewNote = `Cancelled by ${describeBookedBy(req.user)}.`;
    }
    await booking.save();

    // Let anyone who isn't the one cancelling know it's off — matches the
    // same notify-on-status-change pattern as approve/reject.
    const classroomName = booking.classroom?.name;
    const classLine = describeClass({
      classroomName,
      purpose: booking.purpose,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
    });
    const cancelledBy = describeBookedBy(req.user);
    if (!isRequester) {
      notifyUser(requestedById, {
        title: 'Booking cancelled',
        message: `${cancelledBy} cancelled your booking — ${classLine}.`,
        type: 'booking',
      });
    }
    if (wasApproved) {
      if (forFacultyId && !isForFaculty && String(forFacultyId) !== String(requestedById)) {
        notifyUser(forFacultyId, {
          title: 'Booking cancelled',
          message: `${cancelledBy} cancelled ${classLine}.`,
          type: 'extra-class',
        });
      }
      if (booking.department && booking.semester && booking.section) {
        notifyStudentGroup(
          { department: booking.department, semester: booking.semester, section: booking.section },
          { title: 'Extra Class Cancelled', message: `${classLine} has been cancelled.`, type: 'extra-class' }
        );
      }
    }

    return res.status(200).json({ booking });
  } catch (err) {
    console.error('Cancel booking error:', err);
    return res.status(500).json({ message: 'Server error cancelling booking' });
  }
};

const { locked } = require('../utils/allocationLock');
const { isValidObjectId } = require('mongoose');

// A malformed id in the URL/body is a client mistake (404/400), not a server crash.
const validBookingId = (h) => (req, res, next) =>
  (isValidObjectId(req.params.id) ? h(req, res, next) : res.status(404).json({ message: 'Booking not found' }));
const validRoomInBody = (h) => (req, res, next) =>
  (req.body && req.body.classroom && !isValidObjectId(req.body.classroom) ? res.status(400).json({ message: 'Invalid classroom' }) : h(req, res, next));

// Creating or approving a booking changes which rooms are free, so these run inside the
// same lock as a room-allocation publish (they can never happen halfway through one).
module.exports = {
  createBooking: validRoomInBody(locked(createBooking)),
  getMyBookings,
  getAllBookings,
  getApprovedBookings,
  approveBooking: validBookingId(locked(approveBooking)),
  rejectBooking: validBookingId(rejectBooking),
  cancelBooking: validBookingId(cancelBooking),
  checkFacultyAvailability,
};