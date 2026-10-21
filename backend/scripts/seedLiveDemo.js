// Run with: node scripts/seedLiveDemo.js  (from the backend/ folder)
//
// This is ADDITIVE — it does not wipe your existing data. It just gives the
// hero demo faculty (ramesh.kumar@ise.edu) a REALISTIC weekly schedule (max
// 4 periods/day, with real gaps — not a continuous 8:30-4 block) on a
// dedicated classroom that nothing else uses. Each day still has at least
// one class in the morning and one in the afternoon, so whenever you demo
// the app the "In Class Now" detection on Faculty Locator, the Upcoming
// Class widget, and Classroom Map View usually have something real to show
// — it's just no longer an unrealistic back-to-back all-day schedule.
//
// Run resetAndSeed.js (or seed.js) FIRST so ramesh.kumar@ise.edu exists.

require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Classroom = require('../models/Classroom');
const Timetable = require('../models/Timetable');

const HERO_FACULTY_EMAIL = 'ramesh.kumar@ise.edu';
const HERO_DEPARTMENT = 'Information Science & Engineering';
const HERO_SEMESTER = 7;
const HERO_SECTION = 'A';
const DEMO_ROOM_NAME = 'LiveDemo-301'; // dedicated room, nothing else is ever scheduled here

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
// Real college day: 8:30-10:30 classes, 10:30-11:00 tea break, 11:00-1:00
// classes, 1:00-2:00 lunch, 2:00-4:00 classes, day winds up at 4:00.
const PERIODS = [
  { start: '08:30', end: '09:30' },
  { start: '09:30', end: '10:30' },
  { start: '11:00', end: '12:00' },
  { start: '12:00', end: '13:00' },
  { start: '14:00', end: '15:00' },
  { start: '15:00', end: '16:00' },
];
// Real teachers have a MAX of 4 periods a day, never all 6 — each day here
// picks 4 of the 6 periods, leaving 2 free/gap periods, and which 2 are free
// changes day to day (just like a real timetable, not the same gap always).
const DAY_PERIOD_INDEXES = {
  Monday: [0, 2, 3, 5],
  Tuesday: [1, 2, 4, 5],
  Wednesday: [0, 1, 3, 4],
  Thursday: [0, 2, 4, 5],
  Friday: [1, 3, 4, 5],
};
const SUBJECTS = [
  'Data Structures', 'Compiler Design', 'Software Engineering',
  'Database Management Systems', 'Computer Networks', 'Cloud Computing',
];

async function run() {
  await connectDB();

  const faculty = await User.findOne({ email: HERO_FACULTY_EMAIL });
  if (!faculty) {
    console.log(`Could not find ${HERO_FACULTY_EMAIL} — run "node scripts/resetAndSeed.js --yes-delete-everything"`);
    console.log('(or scripts/seed.js) first to create the demo accounts, then run this script.');
    process.exit(1);
  }

  let room = await Classroom.findOne({ name: DEMO_ROOM_NAME });
  if (!room) {
    room = await Classroom.create({ name: DEMO_ROOM_NAME, department: HERO_DEPARTMENT, building: 'Main Block', capacity: 60, type: 'lecture' });
    console.log(`Created dedicated demo classroom: ${DEMO_ROOM_NAME}`);
  }

  // Clear out this faculty's old entries so the new schedule is clean and
  // consistent (no leftover entries from an older/different slot scheme).
  const removed = await Timetable.deleteMany({ faculty: faculty._id });
  console.log(`Cleared ${removed.deletedCount} old timetable entries for ${faculty.name}`);

  let subjectIdx = 0;
  const docs = [];
  for (const day of DAYS) {
    const periodIndexes = DAY_PERIOD_INDEXES[day];
    for (const idx of periodIndexes) {
      const slot = PERIODS[idx];
      docs.push({
        day,
        startTime: slot.start,
        endTime: slot.end,
        subject: SUBJECTS[subjectIdx % SUBJECTS.length],
        department: HERO_DEPARTMENT,
        classroom: room._id,
        faculty: faculty._id,
        semester: HERO_SEMESTER,
        section: HERO_SECTION,
      });
      subjectIdx += 1;
    }
  }
  await Timetable.insertMany(docs);

  // Make sure the faculty's manual toggle defaults to "Available" so the
  // moments they're NOT in class also demo cleanly.
  faculty.isAvailable = true;
  await faculty.save();

  console.log(`\nCreated ${docs.length} timetable entries for ${faculty.name} (4 periods/day, Mon-Fri).`);
  console.log(`Room: ${DEMO_ROOM_NAME}. Free periods rotate by day, same as a real timetable.`);
  console.log('\nDemo it with:');
  console.log(`  Faculty : ${HERO_FACULTY_EMAIL} / Faculty@123`);
  console.log('  Student : chiru@ise.edu / Student@123 (same Sem 7 Section A — sees the same classes)');

  process.exit(0);
}

run().catch((err) => {
  console.error('Live demo seed failed:', err);
  process.exit(1);
});
