const mongoose = require('mongoose');

// A single scheduled session inside a saved allocation. Faculty/classroom names
// are snapshotted at generation time so the saved record stays readable even if
// the underlying faculty/classroom is later renamed or removed.
const allocationEntrySchema = new mongoose.Schema(
  {
    semester: { type: Number, required: true },
    section: { type: String, required: true },
    department: { type: String, required: true },
    subject: { type: String, required: true },
    faculty: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    facultyName: { type: String, required: true },
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
    classroomName: { type: String, required: true },
    day: { type: String, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
  },
  { _id: false }
);

const unscheduledSchema = new mongoose.Schema(
  {
    semester: Number,
    section: String,
    department: String,
    subject: String,
    needed: Number,
    placed: Number,
    reason: String,
  },
  { _id: false }
);

const allocationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'applied'],
      default: 'draft',
    },
    entries: [allocationEntrySchema],
    unscheduled: [unscheduledSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Allocation', allocationSchema);
