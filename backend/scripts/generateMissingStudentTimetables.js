// One-time fix: the realistic-semester seed scripts only ever build
// Sections A and B for each department+semester. Any student whose actual
// section is something else (C, or a semester like 7 that no seed script
// covers) ends up with ZERO Timetable entries — "No classes scheduled yet"
// on their login, even though they're a real enrolled student.
//
// This finds every (department, semester, section) group that currently has
// no Timetable entries at all, and builds one for it by reusing the SAME
// subjects and SAME real teachers already assigned to that department for
// that semester (taken from whichever section already has a timetable) —
// so it's the same staff member teaching an extra section, not a new fake
// teacher, exactly like a real department would run it. Every placement is
// checked against EVERY existing Timetable entry in the whole database
// (not just this department), so nothing created here can ever double-book
// a teacher or a room that's already busy with a real class.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Timetable = require('../models/Timetable');
const Classroom = require('../models/Classroom');

const FULL_DAY_SLOTS = [
  { start: '08:30', end: '09:30' },
  { start: '09:30', end: '10:30' },
  { start: '11:00', end: '12:00' },
  { start: '12:00', end: '13:00' },
  { start: '14:00', end: '15:00' },
  { start: '15:00', end: '16:00' },
];
const WED_SLOTS = [
  { start: '08:30', end: '09:30' },
  { start: '09:30', end: '10:30' },
  { start: '11:00', end: '12:00' },
];
// Monday-Friday only — no regular Saturday classes. Wednesday is the
// lighter half-day, same as every other section in the app.
const DAY_CONFIGS = [
  ['Monday', FULL_DAY_SLOTS],
  ['Tuesday', FULL_DAY_SLOTS],
  ['Wednesday', WED_SLOTS],
  ['Thursday', FULL_DAY_SLOTS],
  ['Friday', FULL_DAY_SLOTS],
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected. Looking for student groups with no timetable...\n');

  const students = await User.find({ role: 'student' }).select('department semester section');
  const combos = new Map(); // "dept|sem|section" -> { department, semester, section }
  students.forEach((s) => {
    if (!s.department || !s.semester || !s.section) return;
    const key = `${s.department}|${s.semester}|${s.section}`;
    if (!combos.has(key)) combos.set(key, { department: s.department, semester: s.semester, section: s.section });
  });

  // One shared "what's already busy, anywhere in the whole app" snapshot,
  // kept up to date as we go so groups processed later in this same run see
  // the slots the earlier groups in this run just filled too.
  const allEntries = await Timetable.find({}).select('faculty classroom day startTime');
  const facultyBusy = new Set(); // `${facultyId}|${day}|${start}`
  const roomBusy = new Set(); // `${roomId}|${day}|${start}`
  allEntries.forEach((e) => {
    facultyBusy.add(`${e.faculty}|${e.day}|${e.startTime}`);
    roomBusy.add(`${e.classroom}|${e.day}|${e.startTime}`);
  });

  let groupsFixed = 0;
  let periodsCreated = 0;
  let groupsSkipped = 0;

  for (const { department, semester, section } of combos.values()) {
    const existingCount = await Timetable.countDocuments({ department, semester, section });
    if (existingCount > 0) continue; // already has a real timetable, leave it alone

    // Model this section on whichever section in the same department+semester
    // already has a real timetable — same subjects, same real teachers.
    const sourceEntries = await Timetable.find({ department, semester }).limit(500);
    if (sourceEntries.length === 0) {
      console.log(`SKIPPED: ${department}, Sem ${semester}, Section ${section} — no sibling section exists yet for this semester to model subjects/teachers from. Add subject requirements for this semester via the admin Auto Allocator instead.`);
      groupsSkipped += 1;
      continue;
    }
    const bySubject = new Map();
    sourceEntries.forEach((e) => {
      if (!bySubject.has(e.subject)) bySubject.set(e.subject, { subject: e.subject, faculty: e.faculty });
    });
    const subjectTeacherPairs = [...bySubject.values()];

    const classrooms = await Classroom.find({ department });
    const lectureRooms = classrooms.filter((c) => c.type !== 'lab');
    if (lectureRooms.length === 0) {
      console.log(`SKIPPED: ${department}, Sem ${semester}, Section ${section} — no lecture classrooms exist for this department.`);
      groupsSkipped += 1;
      continue;
    }

    const docs = [];
    let cursor = 0;
    for (const [day, slots] of DAY_CONFIGS) {
      for (const slot of slots) {
        for (let attempt = 0; attempt < subjectTeacherPairs.length; attempt += 1) {
          const idx = (cursor + attempt) % subjectTeacherPairs.length;
          const { subject, faculty } = subjectTeacherPairs[idx];
          const fKey = `${faculty}|${day}|${slot.start}`;
          if (facultyBusy.has(fKey)) continue;

          const room = lectureRooms.find((r) => !roomBusy.has(`${r._id}|${day}|${slot.start}`));
          if (!room) continue;

          facultyBusy.add(fKey);
          roomBusy.add(`${room._id}|${day}|${slot.start}`);
          docs.push({
            day,
            startTime: slot.start,
            endTime: slot.end,
            subject,
            department,
            classroom: room._id,
            faculty,
            semester,
            section,
          });
          cursor = (idx + 1) % subjectTeacherPairs.length;
          break;
        }
      }
    }

    if (docs.length > 0) {
      await Timetable.insertMany(docs);
      console.log(`CREATED: ${department}, Sem ${semester}, Section ${section} — ${docs.length} periods across ${subjectTeacherPairs.length} subjects, reusing that semester's existing teachers.`);
      groupsFixed += 1;
      periodsCreated += docs.length;
    } else {
      console.log(`SKIPPED: ${department}, Sem ${semester}, Section ${section} — every teacher/room was already fully booked at every slot; nothing could be placed clash-free.`);
      groupsSkipped += 1;
    }
  }

  console.log(`\nDone. ${groupsFixed} student group(s) given a real timetable (${periodsCreated} periods total). ${groupsSkipped} group(s) skipped (see reasons above).`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Generate missing student timetables failed:', err);
  process.exit(1);
});
