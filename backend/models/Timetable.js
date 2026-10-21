const mongoose = require('mongoose');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const timetableSchema = new mongoose.Schema(
  {
    classroom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Classroom',
      required: true,
    },
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
    },
    day: {
      type: String,
      enum: DAYS,
      required: true,
    },
    // Stored as "HH:MM" 24-hour, e.g. "09:00", "14:30"
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
    semester: {
      type: Number,
      required: true,
    },
    section: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    // Optional but recommended: says explicitly whether this class is a lab practical
    // or a normal lecture. The Auto Allocator uses it first and only guesses from the
    // subject name / current room when it is empty.
    classType: {
      type: String,
      enum: ['theory', 'lab'],
      default: undefined,
    },
  },
  { timestamps: true }
);

timetableSchema.index({ day: 1, classroom: 1 });
timetableSchema.index({ day: 1, faculty: 1 });
timetableSchema.index({ day: 1, semester: 1, section: 1, department: 1 });

const Timetable = mongoose.model('Timetable', timetableSchema);
Timetable.DAYS = DAYS;

module.exports = Timetable;