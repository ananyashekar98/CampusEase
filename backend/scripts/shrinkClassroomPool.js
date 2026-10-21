// Run with: node scripts/shrinkClassroomPool.js  (from backend/)
//
// seedClassrooms.js used to create 20 lecture rooms + 3 labs per
// department (23 total) — far more than any department actually needs, and
// it meant sections never really SHARED a room; each semester's slot just
// quietly claimed its own 2 lecture rooms + 1 lab out of the 20/3 and the
// rest sat unused. The pool is now 5 lecture rooms + 2 labs (7 total) per
// department, with every section genuinely sharing them across the week.
//
// This deletes the now-excess rooms (CODE-106 through CODE-120, and
// CODE-LAB-3) — but ONLY a room with zero Timetable entries and zero
// Bookings referencing it. If a room is still in use, this skips it and
// tells you to re-run the Sem1/3/5 seed scripts first (which now schedule
// everything through the smaller shared pool), then run this again.
//
// Safe to re-run.

require('dotenv').config();
const connectDB = require('../config/db');
const Classroom = require('../models/Classroom');
const Timetable = require('../models/Timetable');
const Booking = require('../models/Booking');
const { LECTURE_ROOMS_PER_DEPT, LAB_ROOMS_PER_DEPT } = require('./seedClassrooms');

async function run() {
  await connectDB();

  const allRooms = await Classroom.find();
  let deleted = 0;
  let skipped = 0;

  for (const room of allRooms) {
    const lectureMatch = room.name.match(/-(\d+)$/);
    const labMatch = room.name.match(/-LAB-(\d+)$/i);

    let isExcess = false;
    if (labMatch) {
      isExcess = Number(labMatch[1]) > LAB_ROOMS_PER_DEPT;
    } else if (lectureMatch && room.type === 'lecture') {
      const roomNumber = Number(lectureMatch[1]); // e.g. 112 from "AIML-112"
      const index = roomNumber - 100; // 112 -> 12th lecture room
      isExcess = index > LECTURE_ROOMS_PER_DEPT;
    }

    if (!isExcess) continue;

    const [ttCount, bkCount] = await Promise.all([
      Timetable.countDocuments({ classroom: room._id }),
      Booking.countDocuments({ classroom: room._id }),
    ]);

    if (ttCount > 0 || bkCount > 0) {
      console.log(`  SKIP ${room.name} — still referenced by ${ttCount} timetable entr${ttCount === 1 ? 'y' : 'ies'} and ${bkCount} booking(s). Re-run the Sem1/3/5 seed scripts first, then run this again.`);
      skipped += 1;
      continue;
    }

    await room.deleteOne();
    console.log(`  deleted ${room.name}`);
    deleted += 1;
  }

  console.log(`\n=== DONE === ${deleted} excess classroom(s) deleted, ${skipped} skipped (still in use).`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Shrink classroom pool failed:', err);
  process.exit(1);
});