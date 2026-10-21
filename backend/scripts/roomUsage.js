// Read-only: shows how many CSE rooms are busy/free at every time slot. Changes nothing.
//   node scripts/roomUsage.js            (or: node scripts/roomUsage.js "Information Science & Engineering")
require('dotenv').config();
const connectDB = require('../config/db');
const Timetable = require('../models/Timetable');
const Classroom = require('../models/Classroom');

const DEPT = process.argv[2] || 'Computer Science & Engineering';
(async () => {
  await connectDB();
  const rooms = await Classroom.find({ department: DEPT, type: 'lecture' }).lean();
  const entries = await Timetable.find({ department: DEPT }).lean();
  const sections = new Set(entries.map((e) => `${e.semester}${e.section}`));
  console.log(`${DEPT}: ${rooms.length} lecture rooms, ${sections.size} sections, ${entries.length} timetable entries\n`);
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const starts = [...new Set(entries.map((e) => e.startTime))].sort();
  console.log('Day        ' + starts.map((s) => s.padEnd(7)).join(''));
  for (const d of days) {
    let line = d.padEnd(11);
    for (const s of starts) {
      const used = new Set(entries.filter((e) => e.day === d && e.startTime === s && rooms.some((r) => String(r._id) === String(e.classroom))).map((e) => String(e.classroom)));
      line += `${rooms.length - used.size} free`.padEnd(7);
    }
    console.log(line);
  }
  process.exit(0);
})();