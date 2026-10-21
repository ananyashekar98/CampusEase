const Timetable = require('../models/Timetable');
const Booking = require('../models/Booking');
const { timesOverlap, dateToDayName } = require('./time');

// Same raw-24-hour-string problem as the notification messages in
// bookingController.js — these conflict reasons get shown directly to the
// person trying to book, so they need to read in 12-hour clock too.
function formatTime12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}
function formatTimeRange12h(startTime, endTime) {
  return `${formatTime12h(startTime)}-${formatTime12h(endTime)}`;
}

// Returns a human-readable conflict reason, or null if the requested
// classroom/date/time slot is free. Checks two sources:
//   1. The recurring weekly Timetable (regular classes)
//   2. Other already-approved Bookings on the same date
// `excludeBookingId` lets a re-check on approval ignore the booking being approved itself.
async function findBookingConflict({ classroom, date, startTime, endTime, excludeBookingId }) {
  const day = dateToDayName(date);

  const timetableEntries = await Timetable.find({ classroom, day });
  const ttConflict = timetableEntries.find((entry) =>
    timesOverlap(startTime, endTime, entry.startTime, entry.endTime)
  );
  if (ttConflict) {
    return `This room has a regular class (${ttConflict.subject}) ${formatTimeRange12h(ttConflict.startTime, ttConflict.endTime)} every ${day}`;
  }

  const bookingQuery = { classroom, date, status: 'approved' };
  if (excludeBookingId) {
    bookingQuery._id = { $ne: excludeBookingId };
  }
  const approvedBookings = await Booking.find(bookingQuery);
  const bkConflict = approvedBookings.find((b) =>
    timesOverlap(startTime, endTime, b.startTime, b.endTime)
  );
  if (bkConflict) {
    return `This room is already booked ${formatTimeRange12h(bkConflict.startTime, bkConflict.endTime)} on ${date}`;
  }

  return null;
}

// Returns a human-readable description of what a faculty member is already
// doing at the requested date/time, or null if they're free — checked
// separately from findBookingConflict above, which only looks at whether
// the ROOM is free. A room can be free while the faculty member it's being
// booked "for" is already teaching an entirely different class elsewhere;
// this surfaces that as a warning rather than silently double-booking them.
// Checks two sources, same shape as the room check:
//   1. Their own recurring weekly Timetable
//   2. Any other approved Booking made for/by them on that date
async function findFacultyConflict({ facultyId, date, startTime, endTime, excludeBookingId }) {
  if (!facultyId) return null;
  const day = dateToDayName(date);

  const timetableEntries = await Timetable.find({ faculty: facultyId, day }).populate('classroom', 'name');
  const ttConflict = timetableEntries.find((entry) =>
    timesOverlap(startTime, endTime, entry.startTime, entry.endTime)
  );
  if (ttConflict) {
    return {
      source: 'timetable',
      subject: ttConflict.subject,
      classroomName: ttConflict.classroom?.name || null,
      semester: ttConflict.semester,
      section: ttConflict.section,
      startTime: ttConflict.startTime,
      endTime: ttConflict.endTime,
      day,
    };
  }

  const bookingQuery = {
    date,
    status: 'approved',
    $or: [{ requestedBy: facultyId }, { forFaculty: facultyId }],
  };
  if (excludeBookingId) {
    bookingQuery._id = { $ne: excludeBookingId };
  }
  const approvedBookings = await Booking.find(bookingQuery).populate('classroom', 'name');
  const bkConflict = approvedBookings.find((b) =>
    timesOverlap(startTime, endTime, b.startTime, b.endTime)
  );
  if (bkConflict) {
    return {
      source: 'booking',
      subject: bkConflict.purpose,
      classroomName: bkConflict.classroom?.name || null,
      semester: bkConflict.semester || null,
      section: bkConflict.section || null,
      startTime: bkConflict.startTime,
      endTime: bkConflict.endTime,
      day,
    };
  }

  return null;
}

module.exports = { findBookingConflict, findFacultyConflict };