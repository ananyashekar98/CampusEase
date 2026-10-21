// Run with: node scripts/fillMissingFacultyTimetables.js  (from backend/)
//
// WHAT THIS FIXES:
// resetAndSeed.js gives every faculty member it creates a timetable (via the
// real auto-allocator) for a RANDOM semester — but that random semester is
// always odd (1, 3, 5, or 7), and the section is sometimes "A". seedRealisticSem1.js,
// seedRealisticSem3.js and seedRealisticSem5.js each CLEAR every timetable
// entry for (their department, their semester, Section A) before rebuilding
// it — which, if a resetAndSeed faculty member happened to land on that exact
// semester+section, deleted their timetable along with it, leaving them with
// zero classes.
//
// UPDATED: the first version of this script only gave a fixed-up faculty
// member 3 periods for the ENTIRE WEEK (one class Monday, one Wednesday, one
// Friday) — not a believable timetable. This version builds a real week:
// 3–4 periods EVERY weekday (Monday–Friday), nothing on Saturday (Saturday
// is a student holiday, so faculty shouldn't have classes that day either).
//
// It now also regenerates anyone who was already patched by the OLD version
// of this script (anyone with fewer than 12 timetable entries total — a real
// 5-day week of 3-4 periods/day is always well above that, so a full,
// properly-seeded faculty member is never touched). Their old thin entries
// are deleted first, then replaced with the full week below.
//
// Safe to re-run: after running once, everyone affected has 15-18+ entries,
// which is above the threshold, so running it again does nothing further.

require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Classroom = require('../models/Classroom');
const Timetable = require('../models/Timetable');

const SUBJECT_POOL = [
  'Data Structures', 'Operating Systems', 'Database Management Systems', 'Computer Networks',
  'Object Oriented Programming', 'Software Engineering', 'Web Technologies', 'Artificial Intelligence',
  'Machine Learning', 'Discrete Mathematics', 'Design and Analysis of Algorithms', 'Microprocessors',
  'Cloud Computing', 'Compiler Design', 'Engineering Mathematics', 'Digital Electronics',
];
const SECTIONS = ['A', 'B', 'C'];
const EVEN_SEMESTERS = [2, 4, 6, 8]; // never touched by the Sem 1/3/5 scripts
// No Saturday — Saturday is a student holiday, faculty don't have class that day.
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
// The same 6 class periods used everywhere else in the app (TimetableScreen's
// TIME_ROWS), breaks excluded.
const CLASS_SLOTS = [
  { start: '08:30', end: '09:30' },
  { start: '09:30', end: '10:30' },
  { start: '11:00', end: '12:00' },
  { start: '12:00', end: '13:00' },
  { start: '14:00', end: '15:00' },
  { start: '15:00', end: '16:00' },
];
// Anyone with fewer entries than this gets their week (re)built from scratch.
// A real 5-day, 3-4-periods-a-day week is always well above this, so a
// faculty member who's already properly seeded is never touched.
const LOW_ENTRY_THRESHOLD = 12;

function pick(arr, i) {
  return arr[i % arr.length];
}

async function run() {
  await connectDB();

  const entryCounts = await Timetable.aggregate([
    { $group: { _id: '$faculty', count: { $sum: 1 } } },
  ]);
  const countByFaculty = new Map(entryCounts.map((e) => [String(e._id), e.count]));

  const allFaculty = await User.find({ role: 'faculty' });
  const needsFix = allFaculty.filter((f) => (countByFaculty.get(String(f._id)) || 0) < LOW_ENTRY_THRESHOLD);

  if (needsFix.length === 0) {
    console.log('Every faculty member already has a full week — nothing to do.');
    process.exit(0);
  }

  console.log(`Found ${needsFix.length} faculty member(s) with a thin or empty timetable. Rebuilding...\n`);

  // Clear out whatever thin/stale entries these specific faculty already
  // have, so the new full week replaces them instead of sitting alongside
  // the old 3-periods-a-week leftovers.
  const needsFixIds = needsFix.map((f) => f._id);
  await Timetable.deleteMany({ faculty: { $in: needsFixIds } });

  // Cache classrooms per department.
  const roomsByDept = new Map();
  async function roomsFor(department) {
    if (!roomsByDept.has(department)) {
      roomsByDept.set(department, await Classroom.find({ department }));
    }
    return roomsByDept.get(department);
  }

  // Baseline of what's already booked (classroom, and class-group) across the
  // rest of the DB, recomputed AFTER the delete above so the thin entries we
  // just removed don't block their own replacements.
  const freshlyBookedRoom = new Set(); // `${classroomId}|${day}|${start}`
  const freshlyBookedGroup = new Set(); // `${department}|${semester}|${section}|${day}|${start}`
  const existingEntries = await Timetable.find({}, 'classroom department semester section day startTime');
  existingEntries.forEach((e) => {
    freshlyBookedRoom.add(`${e.classroom}|${e.day}|${e.startTime}`);
    freshlyBookedGroup.add(`${e.department}|${e.semester}|${e.section}|${e.day}|${e.startTime}`);
  });

  const docs = [];
  const summary = [];

  for (let i = 0; i < needsFix.length; i += 1) {
    const faculty = needsFix[i];
    const rooms = await roomsFor(faculty.department);
    if (rooms.length === 0) {
      console.log(`  Skipped ${faculty.name} (${faculty.email}) — no classrooms exist for ${faculty.department} yet.`);
      continue;
    }

    const semester = pick(EVEN_SEMESTERS, i);
    const primarySection = pick(SECTIONS, i);
    const secondarySection = pick(SECTIONS, i + 1);
    const subjectA = pick(SUBJECT_POOL, i * 2);
    const subjectB = pick(SUBJECT_POOL, i * 2 + 1);

    let placedCount = 0;
    const dayBreakdown = [];

    WEEKDAYS.forEach((day, dayIdx) => {
      // Alternates 4, 3, 4, 3, 4 across Mon-Fri — averages 3.6 periods/day,
      // satisfying "at least 3 to 4 periods every day".
      const periodsToday = dayIdx % 2 === 0 ? 4 : 3;
      let placedThisDay = 0;

      for (let slotIdx = 0; slotIdx < periodsToday; slotIdx += 1) {
        const slot = CLASS_SLOTS[slotIdx];
        // Teach the secondary section on the last two weekdays for variety —
        // real faculty usually teach more than one section/subject a week.
        const section = dayIdx >= 3 ? secondarySection : primarySection;
        const groupKey = `${faculty.department}|${semester}|${section}|${day}|${slot.start}`;
        if (freshlyBookedGroup.has(groupKey)) continue; // this class-group already has a class this period

        let room = null;
        for (let r = 0; r < rooms.length; r += 1) {
          const candidate = rooms[(i + r + slotIdx) % rooms.length];
          const roomKey = `${candidate._id}|${day}|${slot.start}`;
          if (!freshlyBookedRoom.has(roomKey)) {
            room = candidate;
            freshlyBookedRoom.add(roomKey);
            break;
          }
        }
        if (!room) continue; // every room busy this period — skip it, not fatal

        freshlyBookedGroup.add(groupKey);

        docs.push({
          day,
          startTime: slot.start,
          endTime: slot.end,
          subject: slotIdx % 2 === 0 ? subjectA : subjectB,
          department: faculty.department,
          classroom: room._id,
          faculty: faculty._id,
          semester,
          section,
        });
        placedCount += 1;
        placedThisDay += 1;
      }
      dayBreakdown.push(`${day.slice(0, 3)}:${placedThisDay}`);
    });

    summary.push(`  ${faculty.name} (${faculty.email}) — Sem ${semester} ${primarySection}/${secondarySection}, ${placedCount} period(s) [${dayBreakdown.join(' ')}]`);
  }

  await Timetable.insertMany(docs);

  summary.forEach((line) => console.log(line));
  console.log(`\n=== DONE === Created ${docs.length} timetable entries for ${needsFix.length} faculty member(s).`);
  console.log('Monday-Friday, 3-4 periods/day, no Saturday classes.');

  process.exit(0);
}

run().catch((err) => {
  console.error('Fill missing faculty timetables failed:', err);
  process.exit(1);
});