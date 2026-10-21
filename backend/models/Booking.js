const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
  {
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Classroom',
      required: true,
    },
    // Stored as "YYYY-MM-DD" — a booking is for one specific calendar date,
    // unlike Timetable entries which repeat every week on a given day.
    date: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format'],
    },
    startTime: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'startTime must be in HH:MM 24-hour format'],
    },
    endTime: {
      type: String,
      required: true,
      match: [/^([01]\d|2[0-3]):([0-5]\d)$/, 'endTime must be in HH:MM 24-hour format'],
    },
    purpose: {
      type: String,
      required: [true, 'Purpose is required'],
      trim: true,
    },
    // "cancelled" used to be its own status, separate from "rejected" — they
    // were really the same outcome (this booking isn't happening) with two
    // different names depending on which screen called it off. Collapsed
    // into one "rejected" status; rejectionType below tells apart how it
    // got there.
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    // Only meaningful when status is 'rejected':
    //   'auto'   — the system's own overdue-pending sweep expired it, nobody reviewed in time
    //   'manual' — an admin explicitly rejected it, or it was cancelled (by
    //              an admin or by the requester themselves)
    rejectionType: {
      type: String,
      enum: ['auto', 'manual'],
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Optional — who this class is actually FOR, distinct from who booked
    // it. Lets an admin book a room on a faculty member's behalf and have
    // that faculty member notified and see it under their own bookings.
    forFaculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Optional — which student group this class is for, so those students
    // can be notified. All three must be set together to mean anything.
    department: { type: String, trim: true },
    semester: { type: Number, min: 1, max: 8 },
    section: { type: String, trim: true, uppercase: true },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewNote: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

bookingSchema.index({ classroom: 1, date: 1, status: 1 });
bookingSchema.index({ requestedBy: 1 });

module.exports = mongoose.model('Booking', bookingSchema);