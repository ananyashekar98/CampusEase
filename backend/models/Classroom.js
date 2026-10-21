const mongoose = require('mongoose');

const classroomSchema = new mongoose.Schema(
  {
    name: {
      // e.g. "CSE-101", "ISE-LAB-2"
      type: String,
      required: [true, 'Classroom name is required'],
      unique: true,
      trim: true,
    },
    // Every room belongs to exactly one department — rooms are not a shared
    // campus pool. A department only ever sees/books its own rooms; a
    // global admin (no department on their own account) sees all of them.
    department: {
      type: String,
      required: [true, 'Classroom department is required'],
      trim: true,
    },
    building: {
      type: String,
      trim: true,
      default: 'Main Block',
    },
    floor: {
      type: String,
      trim: true,
    },
    capacity: {
      type: Number,
      min: 1,
    },
    type: {
      type: String,
      enum: ['lecture', 'lab', 'seminar'],
      default: 'lecture',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Classroom', classroomSchema);
