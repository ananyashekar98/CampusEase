// READ-ONLY. Lists classes that are in a room belonging to a different department, and which
// rooms of their OWN department are free at that time (so you can move them).
//
//   node scripts/showCrossDept.js
require('dotenv').config();
const connectDB = require('../config/db');
const Timetable = require('../models/Timetable');
const Classroom = require('../models/Classroom');

const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const overlap = (a, b) => toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime);

(async () => {
  await connectDB();
  const rooms = await Classroom.find().lean();
  const roomById = new Map(rooms.map((r) => [String(r._id), r]));
  const all = await Timetable.find().lean();
  const bad = all.filter((e) => { const r = roomById.get(String(e.classroom)); return r && r.department !== e.department; });
  console.log(`${bad.length} class(es) in another department's room:\n`);
  bad.forEach((e, i) => {
    const r = roomById.get(String(e.classroom));
    const isLab = e.classType === 'lab';
    const free = rooms.filter((x) => x.department === e.department && (x.type === 'lab') === isLab
      && !all.some((o) => String(o.classroom) === String(x._id) && o.day === e.day && o._id.toString() !== e._id.toString() && overlap(o, e)));
    console.log(`${i + 1}. ${e.department} Sem ${e.semester} ${e.section}: "${e.subject}" (${isLab ? 'lab' : 'lecture'}) ${e.day} ${e.startTime}-${e.endTime}`);
    console.log(`   now in: ${r.name} (${r.department}, ${r.type}, ${r.capacity || '?'} seats)`);
    console.log(`   free ${isLab ? 'labs' : 'lecture rooms'} of its own department at that time: ${free.length ? free.map((x) => `${x.name} (${x.capacity || '?'})`).join(', ') : 'NONE'}\n`);
  });
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });