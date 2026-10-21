const mongoose = require('mongoose');

// A saved (or published) Auto Allocator proposal. Only the admin's selection
// (config) and the chosen room per session are stored; every other detail
// (subject, timings, faculty ...) is re-read from the live Timetable whenever
// the draft is opened or published, so a draft can never alter the timetable
// itself and can never go stale silently.
const draftSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    config: { type: mongoose.Schema.Types.Mixed, required: true },
    assignments: [
      {
        _id: false,
        key: { type: String, required: true }, // timetableEntryId  or  timetableEntryId|YYYY-MM-DD
        room: { type: mongoose.Schema.Types.ObjectId, ref: 'Classroom', default: null },
      },
    ],
    summary: { type: mongoose.Schema.Types.Mixed },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RoomAllocationDraft', draftSchema);