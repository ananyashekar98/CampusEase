// Run with: node scripts/auditTimetables.js  (from backend/)
//
// READ-ONLY. Changes nothing. Tells you, from the real database, exactly
// where timetables are missing or broken, so we fix facts instead of
// guessing:
//
//   1. Every student group (department + semester + section) that has
//      students but ZERO classes — those students see "No classes
//      scheduled yet" — and every group with suspiciously few classes.
//   2. Every faculty account with ZERO classes, or very few.
//   3. Any teacher booked in two places at the same day+time.
//   4. Any room booked for two classes at the same day+time.
//
// If it lists empty student groups or faculty, re-run the semester seeds
// in order (Sem 1, 3, 5, 7) — each rebuilds its own semester completely.

require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Timetable = require('../models/Timetable');
const Classroom = require('../models/Classroom');

const THIN_GROUP = 20; // a normal section has ~27 slots a week
const THIN_FACULTY = 8;

async function run() {
  await connectDB();

  const [students, faculty, entries, rooms] = await Promise.all([
    User.find({ role: 'student' }).select('name email department semester section'),
    User.find({ role: 'faculty' }).select('name email department'),
    Timetable.find().select('department semester section faculty classroom day startTime subject'),
    Classroom.find().select('name'),
  ]);
  const roomName = new Map(rooms.map((r) => [String(r._id), r.name]));

  // --- 1. Student groups ---
  const studentGroups = new Map(); // "dept|sem|sec" -> student count
  students.forEach((s) => {
    if (!s.department || !s.semester || !s.section) return;
    const k = `${s.department}|${s.semester}|${s.section}`;
    studentGroups.set(k, (studentGroups.get(k) || 0) + 1);
  });
  const entryGroups = new Map();
  entries.forEach((e) => {
    const k = `${e.department}|${e.semester}|${e.section}`;
    entryGroups.set(k, (entryGroups.get(k) || 0) + 1);
  });

  const emptyGroups = [];
  const thinGroups = [];
  [...studentGroups.entries()].sort().forEach(([k, n]) => {
    const count = entryGroups.get(k) || 0;
    if (count === 0) emptyGroups.push([k, n]);
    else if (count < THIN_GROUP) thinGroups.push([k, n, count]);
  });

  console.log('=== 1. STUDENT GROUPS WITH NO TIMETABLE ===');
  if (emptyGroups.length === 0) console.log('  none — every student group has classes.');
  emptyGroups.forEach(([k, n]) => {
    const [d, sem, sec] = k.split('|');
    console.log(`  EMPTY  ${d} | Sem ${sem} | Section ${sec}  (${n} student account(s) see "No classes scheduled")`);
  });
  if (thinGroups.length > 0) {
    console.log(`\n  Groups with fewer than ${THIN_GROUP} classes a week (likely incomplete):`);
    thinGroups.forEach(([k, n, c]) => {
      const [d, sem, sec] = k.split('|');
      console.log(`  THIN   ${d} | Sem ${sem} | Section ${sec}  — ${c} classes, ${n} student(s)`);
    });
  }

  // --- 2. Faculty ---
  const perFaculty = new Map();
  entries.forEach((e) => {
    const k = String(e.faculty);
    perFaculty.set(k, (perFaculty.get(k) || 0) + 1);
  });
  const noClasses = faculty.filter((f) => !perFaculty.get(String(f._id)));
  const fewClasses = faculty.filter((f) => {
    const c = perFaculty.get(String(f._id)) || 0;
    return c > 0 && c < THIN_FACULTY;
  });

  console.log('\n=== 2. FACULTY ===');
  console.log(`  ${faculty.length} faculty accounts: ${noClasses.length} with NO classes, ${fewClasses.length} with fewer than ${THIN_FACULTY}.`);
  noClasses.slice(0, 40).forEach((f) => console.log(`  NO CLASSES  ${f.name} | ${f.department || '-'} | ${f.email}`));
  if (noClasses.length > 40) console.log(`  ...and ${noClasses.length - 40} more`);
  fewClasses.slice(0, 40).forEach((f) => console.log(`  FEW (${perFaculty.get(String(f._id))})  ${f.name} | ${f.department || '-'} | ${f.email}`));

  // --- 3 & 4. Double bookings ---
  const facultyName = new Map(faculty.map((f) => [String(f._id), f.name]));
  const byTeacherSlot = new Map();
  const byRoomSlot = new Map();
  entries.forEach((e) => {
    const slot = `${e.day}|${e.startTime}`;
    const tk = `${e.faculty}|${slot}`;
    const rk = `${e.classroom}|${slot}`;
    if (!byTeacherSlot.has(tk)) byTeacherSlot.set(tk, []);
    byTeacherSlot.get(tk).push(e);
    if (!byRoomSlot.has(rk)) byRoomSlot.set(rk, []);
    byRoomSlot.get(rk).push(e);
  });
  const teacherClashes = [...byTeacherSlot.values()].filter((l) => l.length > 1);
  const roomClashes = [...byRoomSlot.values()].filter((l) => l.length > 1);

  console.log('\n=== 3. TEACHER DOUBLE-BOOKINGS ===');
  if (teacherClashes.length === 0) console.log('  none.');
  teacherClashes.slice(0, 40).forEach((l) => {
    const e = l[0];
    console.log(`  ${facultyName.get(String(e.faculty)) || e.faculty} — ${e.day} ${e.startTime}: ${l.map((x) => `Sem ${x.semester}${x.section} ${x.subject}`).join('  AND  ')}`);
  });
  if (teacherClashes.length > 40) console.log(`  ...and ${teacherClashes.length - 40} more`);

  console.log('\n=== 4. ROOM DOUBLE-BOOKINGS ===');
  if (roomClashes.length === 0) console.log('  none.');
  roomClashes.slice(0, 40).forEach((l) => {
    const e = l[0];
    console.log(`  ${roomName.get(String(e.classroom)) || e.classroom} — ${e.day} ${e.startTime}: ${l.map((x) => `Sem ${x.semester}${x.section} ${x.subject}`).join('  AND  ')}`);
  });
  if (roomClashes.length > 40) console.log(`  ...and ${roomClashes.length - 40} more`);

  console.log('\n=== SUMMARY ===');
  console.log(`  Empty student groups: ${emptyGroups.length} | Thin groups: ${thinGroups.length}`);
  console.log(`  Faculty with no classes: ${noClasses.length} | Teacher clashes: ${teacherClashes.length} | Room clashes: ${roomClashes.length}`);
  if (emptyGroups.length || noClasses.length) {
    console.log('\n  Fix: node scripts/seedRealisticSem1.js, then Sem3, Sem5, Sem7 — in that order.');
    console.log('  Then run this audit again to confirm everything shows "none".');
  }

  process.exit(0);
}

run().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});