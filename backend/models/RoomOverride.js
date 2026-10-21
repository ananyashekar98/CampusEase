const mongoose = require('mongoose');

// A room used for ONE specific date instead of the room on the recurring
// weekly timetable. Created only by a published "Custom Date Range"
// allocation; the recurring master Timetable is never modified by it.
const roomOverrideSchema = new mongoose.Schema(
  {
    timetable: { type: mongoose.Schema.Types.ObjectId, ref: 'Timetable', required: true },
    date: { type: String, required: true, match: [/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'] },
    classroom: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', required: true },
    department: { type: String, required: true, trim: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// One override per class per date — re-publishing updates it instead of duplicating.
roomOverrideSchema.index({ timetable: 1, date: 1 }, { unique: true });
roomOverrideSchema.index({ classroom: 1, date: 1 });

module.exports = mongoose.model('RoomOverride', roomOverrideSchema);