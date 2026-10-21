// Creates a deliberate room clash so you can watch the Auto Allocator fix it.
//   node scripts/makeTestClash.js         -> puts CSE Sem 1 Sec B into Sec A's room on Monday (same time)
//   node scripts/makeTestClash.js --undo  -> puts Sec B back exactly as it was
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Timetable = require('../models/Timetable');

const DEPT = 'Computer Science & Engineering';
const SAVE = path.join(__dirname, '.testClashBackup.json');

(async () => {
  await connectDB();
  if (process.argv.includes('--undo')) {
    if (!fs.existsSync(SAVE)) { console.log('Nothing to undo.'); return; }
    const { id, classroom } = JSON.parse(fs.readFileSync(SAVE, 'utf8'));
    await Timetable.updateOne({ _id: id }, { $set: { classroom } });
    fs.unlinkSync(SAVE);
    console.log('Restored Sec B to its original room.');
    return;
  }
  const a = await Timetable.findOne({ department: DEPT, semester: 1, section: 'A', day: 'Monday' }).sort({ startTime: 1 });
  if (!a) { console.log('No Sem 1 Section A Monday class found.'); return; }
  const b = await Timetable.findOne({ department: DEPT, semester: 1, section: 'B', day: 'Monday', startTime: a.startTime });
  if (!b) { console.log('No matching Sem 1 Section B class at', a.startTime); return; }
  fs.writeFileSync(SAVE, JSON.stringify({ id: String(b._id), classroom: String(b.classroom) }));
  await Timetable.updateOne({ _id: b._id }, { $set: { classroom: a.classroom } });
  console.log(`Clash created: Sem 1 A and Sem 1 B are both in the same room on Monday ${a.startTime}.`);
})().catch((e) => console.error(e)).finally(() => mongoose.disconnect());