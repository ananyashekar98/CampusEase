const mongoose = require('mongoose');

// Each requirement says: "this subject, taught by this faculty member, to this
// semester+section, needs N one-hour sessions per week in a room of this type."
// The auto-allocator's job is to find clash-free day/time/room slots for all of these.
const subjectRequirementSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      required: [true, 'Subject name is required'],
      trim: true,
    },
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
    },
    faculty: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
    roomType: {
      type: String,
      enum: ['lecture', 'lab'],
      default: 'lecture',
    },
    periodsPerWeek: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SubjectRequirement', subjectRequirementSchema);
