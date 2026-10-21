// Shared by seedRealisticSem1.js / seedRealisticSem3.js / seedRealisticSem5.js
// / seedRealisticSem7.js so all four semesters are built by the exact same
// logic instead of separately hand-tweaked copies that can drift out of
// sync with each other.
//
// SECTIONS: every semester now has 3 sections (A/B/C), so across the 4 odd
// semesters a department runs 12 sections total — a real department-sized
// load, not a token 1-2 sections.
//
// ROOM SHARING: each department has a shared pool (12 lecture rooms + 3
// labs — see seedClassrooms.js), and EVERY section across EVERY semester
// draws from that same pool. A room is never permanently owned by one
// section — Sem 1-A might use Lecture Room 1 at 9am while Sem 7-C uses the
// exact same room at 10am. Before placing any class, this reads every
// OTHER class already on the department's live timetable (any semester,
// any section) so a newly-scheduled class can never double-book a room
// that's already busy at that exact day+time.
//
// LAB TEACHER COLLISIONS: a subject's lab is taught by ONE teacher to all
// 3 sections, so that teacher needs 3 DIFFERENT weekly day/time slots — one
// per section — that never overlap each other. LAB_DAY_PLAN below assigns
// each (section, lab-subject-index) pair a specific day so this is true by
// construction, not by luck: subject 0's teacher runs labs on Tuesday (A),
// Monday (B), Thursday (C) — three different days — and subject 1's
// teacher runs labs on Thursday (A), Friday (B), Monday (C) — again three
// different days. Two DIFFERENT subjects' labs can land on the same day
// (different teachers, different lab rooms out of the 3 available), but
// the same subject's teacher is never double-booked.
//
// LOGIN EMAILS:
//   Students — firstname.usn@campusease.edu (e.g.
//     ananya.1ga24is101@campusease.edu). The USN is already
//     guaranteed unique per student (year prefix + dept code + semester +
//     section + serial), so this can never collide between two different
//     students, and needs no extra semester/section tag baked in.
//   Faculty  — firstname.deptcode+staffid@campusease.edu (e.g.
//     lakshmi.eee16151@campusease.edu). staffId is a unique 5-digit number
//     assigned the FIRST time this exact (name, department) is created —
//     never recomputed afterwards, so the email is stable across reruns.
//
// TEACHER IDENTITY: lookup is by (name, department), not by email — if this
// exact name was already created for this department by a different
// semester's run, this finds and reuses that same account instead of making
// a second login. That teacher just accumulates classes across every
// semester they're generated for, under one single login.

const User = require('../../models/User');
const Timetable = require('../../models/Timetable');
const { ensureDepartmentClassrooms } = require('../seedClassrooms');
const { DEPT_CODE } = require('../../utils/departments');

const SECTIONS = ['A', 'B', 'C'];
const DESIGNATIONS = ['Assistant Professor', 'Associate Professor', 'Professor'];

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
const LAB_SLOT_PAIR = [
  { start: '14:00', end: '15:00' },
  { start: '15:00', end: '16:00' },
];
// No Saturday: regular classes run Monday-Friday only. Saturday is handled
// separately as an admin-approved Booking, not a recurring Timetable entry.
const DAY_CONFIGS = [
  ['Monday', FULL_DAY_SLOTS],
  ['Tuesday', FULL_DAY_SLOTS],
  ['Wednesday', WED_SLOTS],
  ['Thursday', FULL_DAY_SLOTS],
  ['Friday', FULL_DAY_SLOTS],
];
// Which 2 of the department's subjects (by index) get a weekly lab.
const LAB_SUBJECT_INDEXES = [0, 1];
// LAB_DAY_PLAN[section][labSubjectIndex] = day. Each lab-subject's teacher
// gets a DIFFERENT day per section (see big comment above) — this is what
// actually guarantees that one teacher running a lab for 3 sections never
// gets double-booked, by construction rather than by luck.
const LAB_DAY_PLAN = {
  A: { 0: 'Tuesday', 1: 'Thursday' },
  B: { 0: 'Monday', 1: 'Friday' },
  C: { 0: 'Thursday', 1: 'Monday' },
};

// Matches on email OR USN, so a student already in the database (same USN,
// possibly under an older email) is reused instead of creating a second
// login for the same person.
async function findOrCreateUser(data) {
  const or = [{ email: data.email }];
  if (data.usn) or.push({ usn: data.usn });
  const existing = await User.findOne({ $or: or });
  if (existing) return existing;
  return User.create(data);
}

/**
 * @param {object} opts
 * @param {number} opts.semester
 * @param {Array<{name:string, code:string, subjects:string[]}>} opts.departments
 *   `subjects` must have exactly 6 entries; subjects[0] and [1] get a lab.
 * @param {string[]} opts.teacherFirst
 * @param {string[]} opts.teacherLast
 * @param {string[]} opts.studentFirst
 * @param {string[]} opts.studentLast
 * @param {number} opts.studentsPerSection
 * @param {string} opts.usnYearPrefix - e.g. '1GA24'
 */
async function seedRealisticSemester(opts) {
  const {
    semester,
    departments,
    teacherFirst,
    teacherLast,
    studentFirst,
    studentLast,
    studentsPerSection,
    usnYearPrefix,
  } = opts;

  // One shared pool for every department — created once per run, found
  // (not re-created) on every run after the first. This is the SAME pool
  // Book Classroom, Classroom Map View and the orphaned-faculty fill-in
  // script all already read from.
  const { byDept } = await ensureDepartmentClassrooms();

  // Staff IDs are handed out sequentially, continuing on from the highest
  // one already in use anywhere in the system — same rule assignStaffIds.js
  // and renameEmails.js follow, so numbers never clash across scripts.
  const existingWithStaffId = await User.find({ staffId: { $exists: true, $ne: null } }).select('staffId');
  let nextStaffId = 10000;
  existingWithStaffId.forEach((u) => {
    const n = parseInt(u.staffId, 10);
    if (!Number.isNaN(n) && n > nextStaffId) nextStaffId = n;
  });

  for (const dept of departments) {
    const deptIdx = departments.indexOf(dept);
    console.log(`\n--- ${dept.name} (Sem ${semester}, Sections A/B/C) ---`);

    if (dept.subjects.length !== 6) {
      throw new Error(`${dept.name}: expected exactly 6 subjects, got ${dept.subjects.length}`);
    }

    // --- Rooms: the department's WHOLE shared pool, not a fixed slot.
    // Every section of every semester draws from this same list. ---
    const deptRooms = byDept[dept.name] || [];
    const lectureRooms = deptRooms.filter((r) => r.type === 'lecture');
    const labRooms = deptRooms.filter((r) => r.type === 'lab');
    if (lectureRooms.length === 0 || labRooms.length === 0) {
      throw new Error(`${dept.name}: no lecture/lab rooms in the pool — check ensureDepartmentClassrooms().`);
    }

    // --- Teachers: one per subject, teaches that subject to ALL 3
    // sections. Matched by (name, department) — if this exact name was
    // already created for this department by a different semester's run,
    // that same account is reused (and its existing email/staffId are left
    // alone). A genuinely new teacher gets the next free staffId and an
    // email built from it, so two different real people can never end up
    // sharing one. ---
    const teachers = [];
    for (let i = 0; i < dept.subjects.length; i += 1) {
      const first = teacherFirst[(deptIdx + i) % teacherFirst.length];
      const last = teacherLast[(deptIdx * 2 + i) % teacherLast.length];
      const name = `${i % 2 === 0 ? 'Prof.' : 'Dr.'} ${first} ${last}`;

      let teacher = await User.findOne({ role: 'faculty', department: dept.name, name });
      if (!teacher) {
        nextStaffId += 1;
        const staffId = String(nextStaffId).padStart(5, '0');
        const code = String(DEPT_CODE[dept.name] || dept.code).toLowerCase();
        const email = `${first.toLowerCase()}.${code}${staffId}@campusease.edu`;
        teacher = await User.create({
          name,
          email,
          password: 'Faculty@123',
          role: 'faculty',
          department: dept.name,
          designation: DESIGNATIONS[i % DESIGNATIONS.length],
          cabinLocation: `Staffroom ${(i % 2) + 1}`,
          isAvailable: true,
          staffId,
        });
      }
      teachers.push(teacher);
    }

    // --- Students: studentsPerSection per section (A/B/C). Email is built
    // from the USN, which is already guaranteed unique on its own — no
    // extra tag needed to keep two students from colliding. ---
    const studentsBySection = {};
    for (let sIdx = 0; sIdx < SECTIONS.length; sIdx += 1) {
      const section = SECTIONS[sIdx];
      const list = [];
      for (let s = 0; s < studentsPerSection; s += 1) {
        const sectionOffset = sIdx * studentsPerSection;
        const sFirst = studentFirst[(deptIdx + s + sectionOffset) % studentFirst.length];
        const sLast = studentLast[(deptIdx * 3 + s + sectionOffset) % studentLast.length];
        const usn = `${usnYearPrefix}${dept.code.toUpperCase().slice(0, 2)}${semester}${section}${String(s + 1).padStart(2, '0')}`;
        const email = `${sFirst.toLowerCase()}.${usn.toLowerCase()}@campusease.edu`;
        const student = await findOrCreateUser({
          name: `${sFirst} ${sLast}`,
          email,
          password: 'Student@123',
          role: 'student',
          department: dept.name,
          usn,
          semester,
          section,
        });
        list.push(student);
      }
      studentsBySection[section] = list;
    }

    // --- Clear old entries for all 3 sections before rebuilding ---
    const removed = await Timetable.deleteMany({ department: dept.name, semester, section: { $in: SECTIONS } });

    // --- Room sharing: seed roomBusy with every OTHER class already on
    // this department's live timetable (any other semester, any other
    // section) so a room this run assigns can never collide with a class
    // that already exists. Keyed by "day|startTime" -> Set(roomId). ---
    const otherDeptEntries = await Timetable.find({ department: dept.name }).select('classroom day startTime');
    const roomBusy = new Map();
    otherDeptEntries.forEach((e) => {
      const key = `${e.day}|${e.startTime}`;
      if (!roomBusy.has(key)) roomBusy.set(key, new Set());
      roomBusy.get(key).add(String(e.classroom));
    });

    function pickRoom(pool, day, startTime) {
      const key = `${day}|${startTime}`;
      const busy = roomBusy.get(key) || new Set();
      const room = pool.find((r) => !busy.has(String(r._id)));
      if (room) {
        if (!roomBusy.has(key)) roomBusy.set(key, new Set());
        roomBusy.get(key).add(String(room._id));
      }
      return room;
    }

    // --- Schedule ---
    // teacherBusy is shared across ALL 3 sections being built right now, so
    // a subject's teacher can never be placed twice at the same day+time —
    // this is also what makes LAB_DAY_PLAN's collision-free guarantee real
    // rather than assumed.
    const teacherBusy = new Set(); // `${teacherId}|${day}|${startTime}`
    // A teacher can also be teaching in ANOTHER semester (same name, same
    // department -> same login). Seed their existing classes so they are
    // never placed twice at the same day+time across semesters.
    const teacherEntries = await Timetable.find({ faculty: { $in: teachers.map((t) => t._id) } }).select('faculty day startTime');
    teacherEntries.forEach((e) => teacherBusy.add(`${e.faculty}|${e.day}|${e.startTime}`));
    const docs = [];
    const reservedSlots = {}; // reservedSlots[section][day] = Set(startTime) used by labs
    SECTIONS.forEach((s) => { reservedSlots[s] = {}; });
    const skippedForNoRoom = []; // slots a teacher was free for but every shared room was already taken

    // Labs first, since they claim fixed slots that the lecture rotation
    // below needs to skip over. Driven by LAB_DAY_PLAN so each lab
    // subject's one teacher lands on a different day per section.
    SECTIONS.forEach((section) => {
      LAB_SUBJECT_INDEXES.forEach((subjIdx) => {
        const day = LAB_DAY_PLAN[section][subjIdx];
        const teacher = teachers[subjIdx];
        if (LAB_SLOT_PAIR.some((slot) => teacherBusy.has(`${teacher._id}|${day}|${slot.start}`))) {
          skippedForNoRoom.push(`${dept.subjects[subjIdx]} Lab — Sec ${section} — ${day} (teacher already busy in another semester)`);
          return;
        }
        LAB_SLOT_PAIR.forEach((slot) => {
          const room = pickRoom(labRooms, day, slot.start);
          if (!room) {
            skippedForNoRoom.push(`${dept.subjects[subjIdx]} Lab — Sec ${section} — ${day} ${slot.start} (every lab room already booked)`);
            if (!reservedSlots[section][day]) reservedSlots[section][day] = new Set();
            reservedSlots[section][day].add(slot.start);
            return;
          }
          teacherBusy.add(`${teacher._id}|${day}|${slot.start}`);
          docs.push({
            day,
            startTime: slot.start,
            endTime: slot.end,
            subject: `${dept.subjects[subjIdx]} Lab`,
            department: dept.name,
            classroom: room._id,
            faculty: teacher._id,
            semester,
            section,
          });
          if (!reservedSlots[section][day]) reservedSlots[section][day] = new Set();
          reservedSlots[section][day].add(slot.start);
        });
      });
    });

    // Lecture rotation: for every remaining slot, walk the subject list
    // starting from a rolling cursor until we find one whose teacher AND a
    // shared lecture room are both free at that exact day+time. With a
    // 12-room shared pool and up to 12 sections across Sem 1/3/5/7
    // potentially wanting the same slot, a slot can legitimately run out of
    // free rooms — when that happens the section just gets a free period
    // there instead, same as it would in a real timetable.
    SECTIONS.forEach((section, sIdx) => {
      let cursor = (sIdx * 2) % dept.subjects.length; // stagger the starting subject so A/B/C don't mirror each other
      for (const [day, slots] of DAY_CONFIGS) {
        for (const slot of slots) {
          if (reservedSlots[section][day]?.has(slot.start)) continue;
          let placedThisSlot = false;
          for (let attempt = 0; attempt < dept.subjects.length; attempt += 1) {
            const subjIdx = (cursor + attempt) % dept.subjects.length;
            const teacher = teachers[subjIdx];
            const key = `${teacher._id}|${day}|${slot.start}`;
            if (teacherBusy.has(key)) continue;
            const room = pickRoom(lectureRooms, day, slot.start);
            if (!room) continue; // this subject's teacher is free, but no shared room is — try the next subject

            teacherBusy.add(key);
            docs.push({
              day,
              startTime: slot.start,
              endTime: slot.end,
              subject: dept.subjects[subjIdx],
              department: dept.name,
              classroom: room._id,
              faculty: teacher._id,
              semester,
              section,
            });
            cursor = (subjIdx + 1) % dept.subjects.length;
            placedThisSlot = true;
            break;
          }
          if (!placedThisSlot) {
            skippedForNoRoom.push(`Sec ${section} — ${day} ${slot.start} (no subject had BOTH a free teacher and a free shared room)`);
          }
        }
      }
    });

    await Timetable.insertMany(docs);

    console.log(`  cleared ${removed.deletedCount} old entries, created ${docs.length} new ones`);
    console.log(`  shared pool: ${lectureRooms.map((r) => r.name).join(', ')} (lecture), ${labRooms.map((r) => r.name).join(', ')} (lab)`);
    if (skippedForNoRoom.length > 0) {
      console.log(`  ${skippedForNoRoom.length} slot(s) left free — every shared room (or that subject's teacher) was already taken at that exact time:`);
      skippedForNoRoom.forEach((s) => console.log(`    - ${s}`));
    }
    teachers.forEach((t, i) => {
      const count = docs.filter((d) => String(d.faculty) === String(t._id)).length;
      console.log(`  ${t.name} <${t.email}> — ${dept.subjects[i]}${LAB_SUBJECT_INDEXES.includes(i) ? ' (+ lab)' : ''} — ${count} periods/week across all 3 sections`);
    });
    SECTIONS.forEach((section) => {
      console.log(`  Section ${section} students:`);
      studentsBySection[section].forEach((st) => console.log(`    ${st.email} / Student@123  (${st.usn})`));
    });
  }
}

module.exports = { seedRealisticSemester };