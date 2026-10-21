const mongoose = require('mongoose');

const staffroomSchema = new mongoose.Schema(
  {
    department: {
      type: String,
      required: [true, 'Department is required'],
      trim: true,
    },
    roomLabel: {
      type: String,
      required: [true, 'Room label is required'],
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
    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Staffroom', staffroomSchema);
