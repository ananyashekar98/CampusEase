// Run with: node scripts/seedRealisticMultiSemester.js  (from the backend/ folder)
//
// Builds Semester 1, 3, and 5 together for every department, with ONE
// SHARED faculty pool per department instead of three separate,
// semester-only pools. This replaces running seedRealisticSem1.js /
// seedRealisticSem3.js / seedRealisticSem5.js one at a time — those three
// each created their OWN dedicated faculty (emails tagged .sem1/.sem3/.sem5)
// that never left that one semester, which is why a faculty member's
// timetable only ever showed one semester, one handful of subjects.
//
// Concretely, per department this creates ~8 teachers, and distributes the
// 18 subject-slots across Sem 1/3/5 (6 subjects x 3 semesters) round-robin
// across them — so every teacher ends up assigned 2-3 subjects spread across
// 2-3 different semesters, a real faculty member's actual teaching load.
//
// Teacher clash-checking is done with ONE shared "teacherBusy" set per
// department covering ALL THREE semesters at once (not one set per
// semester) — so a teacher can never be double-booked at the same day+time
// even across different semesters/sections, since day+time slots are the
// same physical grid regardless of which semester's class is in them.
//
// Same realistic weekly shape as before, per semester/section:
//   - Mon/Tue/Thu/Fri: full 6-period days. Wednesday: 3-period half day.
//   - No Saturday classes (Saturday stays Booking-only, admin-approved).
//   - 2 lab sessions/week per section, each a genuine 2-hour block.
//
// Students are left exactly as seedRealisticSem1/3/5.js created them (same
// email pattern, same usnYearPrefix) — running this script finds and REUSES
// those existing student accounts, it does not duplicate them. Only the
// TEACHERS are new (tagged .multi in their email, to tell them apart from
// the old single-semester teacher accounts), and only the Timetable entries
// for Sem 1/3/5 Sections A & B get cleared and rebuilt.
//
// NOTE: the OLD seedRealisticSem1/3/5.js teacher accounts (emails tagged
// .sem1/.sem3/.sem5) are NOT deleted by this script — after running this,
// they're just unused logins with no classes on their timetable anymore.
// Safe to ignore, or delete them by hand, or run resetAndSeed.js for a
// fully clean slate. Running seedRealisticSem1.js/Sem3.js/Sem5.js again
// AFTER this script would recreate those old isolated teachers and undo
// this — use this script instead of those three from now on.

require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Classroom = require('../models/Classroom');
const Timetable = require('../models/Timetable');

const SECTIONS = ['A', 'B'];
const SEMESTERS = [1, 3, 5];
const TEACHERS_PER_DEPT = 8;
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
// No Saturday — Saturday stays Booking-only, admin-approved, not a
// recurring Timetable entry.
const DAY_CONFIGS = [
  ['Monday', FULL_DAY_SLOTS],
  ['Tuesday', FULL_DAY_SLOTS],
  ['Wednesday', WED_SLOTS],
  ['Thursday', FULL_DAY_SLOTS],
  ['Friday', FULL_DAY_SLOTS],
];
// Only full days can host a 2-hour lab block (Wednesday ends at 12:00).
const FULL_DAYS = ['Monday', 'Tuesday', 'Thursday', 'Friday'];
// Which 2 of a semester's 6 subjects (by index) get a weekly lab.
const LAB_SUBJECT_INDEXES = [0, 1];

// --- Subjects per department per semester (same lists as the old
// seedRealisticSem1/3/5.js scripts, combined into one place) ---
const DEPARTMENTS = [
  {
    name: 'Computer Science & Engineering', code: 'cse',
    subjectsBySemester: {
      1: ['Problem Solving with C', 'Engineering Physics', 'Engineering Mathematics I', 'Basic Electrical Engineering', 'Engineering Graphics', 'Communicative English'],
      3: ['Data Structures & Applications', 'Object Oriented Programming with C++', 'Digital Design & Computer Organization', 'Discrete Mathematical Structures', 'Unix & Shell Programming', 'Engineering Mathematics III'],
      5: ['Data Structures', 'Database Management Systems', 'Operating Systems', 'Computer Networks', 'Software Engineering', 'Web Technologies'],
    },
  },
  {
    name: 'Information Science & Engineering', code: 'ise',
    subjectsBySemester: {
      1: ['Problem Solving with C', 'Engineering Physics', 'Engineering Mathematics I', 'Elements of Mechanical Engineering', 'Engineering Graphics', 'Communicative English'],
      3: ['Data Structures & Applications', 'Object Oriented Programming with C++', 'Digital Design & Computer Organization', 'Discrete Mathematical Structures', 'Unix & Shell Programming', 'Engineering Mathematics III'],
      5: ['Data Structures', 'Database Management Systems', 'Compiler Design', 'Software Engineering', 'Computer Networks', 'Cloud Computing'],
    },
  },
  {
    name: 'Electronics & Communication Engineering', code: 'ece',
    subjectsBySemester: {
      1: ['Basic Electrical Engineering', 'Engineering Chemistry', 'Engineering Mathematics I', 'Elements of Civil Engineering & Mechanics', 'Engineering Graphics', 'Communicative English'],
      3: ['Electronic Devices & Circuits', 'Network Analysis', 'Digital System Design', 'Electrical Circuits & Simulation', 'Engineering Mathematics III', 'Innovation & Design Thinking'],
      5: ['Digital Signal Processing', 'Microcontrollers', 'Communication Systems', 'VLSI Design', 'Antenna Theory', 'Control Systems'],
    },
  },
  {
    name: 'Electrical & Electronics Engineering', code: 'eee',
    subjectsBySemester: {
      1: ['Basic Electrical Engineering', 'Engineering Physics', 'Engineering Mathematics I', 'Elements of Civil Engineering & Mechanics', 'Engineering Graphics', 'Communicative English'],
      3: ['Electric Circuit Analysis', 'Electrical Machines I', 'Analog Electronic Circuits', 'Digital System Design', 'Engineering Mathematics III', 'Electromagnetic Field Theory'],
      5: ['Power Systems', 'Power Electronics', 'Electrical Machines', 'Control Systems', 'Renewable Energy', 'Microprocessors'],
    },
  },
  {
    name: 'Mechanical Engineering', code: 'me',
    subjectsBySemester: {
      1: ['Elements of Mechanical Engineering', 'Engineering Chemistry', 'Engineering Mathematics I', 'Elements of Civil Engineering & Mechanics', 'Engineering Graphics', 'Communicative English'],
      3: ['Basic Thermodynamics', 'Material Science', 'Metal Casting & Welding', 'Mechanics of Materials', 'Engineering Mathematics III', 'Metrology & Measurements'],
      5: ['Thermodynamics', 'Machine Design', 'Fluid Mechanics', 'Manufacturing Technology', 'Heat Transfer', 'Automobile Engineering'],
    },
  },
  {
    name: 'Civil Engineering', code: 'civil',
    subjectsBySemester: {
      1: ['Elements of Civil Engineering & Mechanics', 'Engineering Chemistry', 'Engineering Mathematics I', 'Basic Electrical Engineering', 'Engineering Graphics', 'Communicative English'],
      3: ['Mechanics of Materials', 'Basic Surveying', 'Building Materials & Construction', 'Fluid Mechanics', 'Engineering Geology', 'Engineering Mathematics III'],
      5: ['Structural Analysis', 'Transportation Engineering', 'Geotechnical Engineering', 'Environmental Engineering', 'Construction Management', 'Surveying'],
    },
  },
  {
    name: 'Artificial Intelligence & Machine Learning', code: 'aiml',
    subjectsBySemester: {
      1: ['Problem Solving with C', 'Engineering Physics', 'Engineering Mathematics I', 'Basic Electrical Engineering', 'Engineering Graphics', 'Communicative English'],
      3: ['Data Structures & Applications', 'Object Oriented Programming with C++', 'Discrete Mathematical Structures', 'Digital Design & Computer Organization', 'Probability & Statistics', 'Engineering Mathematics III'],
      5: ['Machine Learning', 'Deep Learning', 'Natural Language Processing', 'Computer Vision', 'Data Mining', 'Neural Networks'],
    },
  },
];

const TEACHER_FIRST = ['Nagesh', 'Vidya', 'Chandan', 'Swathi', 'Harish', 'Kavya', 'Umesh', 'Nandini', 'Anitha', 'Ravindra', 'Deepa', 'Suresh', 'Lakshmi', 'Manjunath', 'Pooja', 'Girish'];
const TEACHER_LAST = ['Prabhu', 'Bhandari', 'Kotian', 'Salian', 'Amin', 'Kudva', 'Adiga', 'Shenoy', 'Naik', 'Bhat', 'Shetty', 'Pai', 'Kulkarni', 'Poojary', 'Baliga', 'Nayak'];

// Same student name pools / email pattern / usnYearPrefix as the old
// seedRealisticSem1/3/5.js scripts, kept semester-specific on purpose — this
// finds and reuses the SAME existing student accounts rather than creating
// duplicates.
const STUDENTS_BY_SEMESTER = {
  1: { first: ['Aditya', 'Pallavi', 'Vikram', 'Shreya', 'Naveen', 'Ramya', 'Siddharth', 'Anusha', 'Pranav', 'Lavanya'], last: ['Acharya', 'Kulal', 'Bhandari', 'Prabhu', 'Kotian', 'Nayak', 'Baliga', 'Shanbhag', 'Padukone', 'Amin'] },
  3: { first: ['Aarav', 'Sneha', 'Rohit', 'Ananya', 'Karthik', 'Divya', 'Sanjay', 'Meghana', 'Yashwanth', 'Nikitha'], last: ['Reddy', 'Gowda', 'Poojari', 'Shastry', 'Bhandary', 'Salian', 'Kamath', 'Shenoy', 'Rai', 'Hegde'] },
  5: { first: ['Sahana', 'Vishnu', 'Anagha', 'Rakesh', 'Pallavi', 'Kiran', 'Shreya', 'Nitin'], last: ['Hegde', 'Prabhu', 'Bhandary', 'Kamath', 'Rai', 'Shenoy', 'Adiga', 'Kini'] },
};
const STUDENTS_PER_SECTION = 5;
const USN_YEAR_PREFIX = '1GA24';

function pick(list, i) {
  return list[((i % list.length) + list.length) % list.length];
}

async function findOrCreateUser(data) {
  const existing = await User.findOne({ email: data.email });
  if (existing) return existing;
  return User.create(data);
}

async function findOrCreateClassroom(name, department, type) {
  let room = await Classroom.findOne({ name });
  if (!room) {
    room = await Classroom.create({
      name,
      department,
      building: `${department.split(' ')[0]} Block`,
      capacity: type === 'lab' ? 40 : 65,
      type,
    });
  }
  return room;
}

// Distributes the semester's 6 subjects round-robin across teacherCount
// teachers, flattening (semester, subjectIndex) pairs in semester order
// first — with 18 slots over 8 teachers, this naturally spreads each
// teacher's 2-3 slots across 2-3 different semesters instead of bunching
// them into one.
function buildSubjectTeacherMap(teachers) {
  const map = {}; // map[semester][subjectIndex] = teacher
  let flatIndex = 0;
  SEMESTERS.forEach((semester) => {
    map[semester] = {};
    for (let subjIdx = 0; subjIdx < 6; subjIdx += 1) {
      const teacher = teachers[flatIndex % teachers.length];
      map[semester][subjIdx] = teacher;
      flatIndex += 1;
    }
  });
  return map;
}

// Finds the first full day (from a per-group rotation, so different
// semester/section groups don't all pile onto the same day) where the given
// teacher is free for both lab slots and this exact semester+section has no
// other lab already there.
//
// `groupKey` is "${semester}|${section}" — NOT just the section letter.
// Section "A" in Sem 1 and section "A" in Sem 5 are different rooms full of
// different students; they only actually clash if a single TEACHER is
// double-booked (teacherBusy already checks that), never just for sharing
// the same letter. Keying this by letter alone used to treat them as
// mutually exclusive, which burned through all 4 usable lab days after just
// two semesters' worth of Section A labs, leaving nothing free for the third.
function findLabDay(teacher, groupKey, teacherBusy, reservedSlots, dayOffset) {
  for (let i = 0; i < FULL_DAYS.length; i += 1) {
    const day = FULL_DAYS[(dayOffset + i) % FULL_DAYS.length];
    const reserved = reservedSlots[groupKey][day] || new Set();
    const free = LAB_SLOT_PAIR.every(
      (slot) => !teacherBusy.has(`${teacher._id}|${day}|${slot.start}`) && !reserved.has(slot.start)
    );
    if (free) return day;
  }
  return null;
}

async function run() {
  await connectDB();

  for (const dept of DEPARTMENTS) {
    const deptIdx = DEPARTMENTS.indexOf(dept);
    console.log(`\n=== ${dept.name} ===`);

    // --- Shared faculty pool for this department, spanning all 3 semesters ---
    const teachers = [];
    for (let i = 0; i < TEACHERS_PER_DEPT; i += 1) {
      const first = pick(TEACHER_FIRST, deptIdx * 3 + i);
      const last = pick(TEACHER_LAST, deptIdx * 2 + i);
      const email = `${first.toLowerCase()}.${last.toLowerCase()}.multi${dept.code}${i}@campusease.edu`;
      const teacher = await findOrCreateUser({
        name: `${i % 2 === 0 ? 'Prof.' : 'Dr.'} ${first} ${last}`,
        email,
        password: 'Faculty@123',
        role: 'faculty',
        department: dept.name,
        designation: DESIGNATIONS[i % DESIGNATIONS.length],
        cabinLocation: `Staffroom ${(i % 2) + 1}`,
        isAvailable: true,
      });
      teachers.push(teacher);
    }
    const subjectTeacherMap = buildSubjectTeacherMap(teachers);

    // --- Rooms: one lecture room per semester+section, one lab room per semester ---
    const roomsBySemesterSection = {};
    const labRoomBySemester = {};
    for (const semester of SEMESTERS) {
      roomsBySemesterSection[semester] = {};
      for (const section of SECTIONS) {
        roomsBySemesterSection[semester][section] = await findOrCreateClassroom(
          `Sem${semester}-${dept.code.toUpperCase()}-${section}`,
          dept.name,
          'lecture'
        );
      }
      labRoomBySemester[semester] = await findOrCreateClassroom(
        `Sem${semester}-${dept.code.toUpperCase()}-LAB`,
        dept.name,
        'lab'
      );
    }

    // --- Students: same accounts seedRealisticSem1/3/5.js already created ---
    const studentsBySemesterSection = {};
    for (const semester of SEMESTERS) {
      studentsBySemesterSection[semester] = {};
      const pool = STUDENTS_BY_SEMESTER[semester];
      const emailTag = `sem${semester}`;
      for (const section of SECTIONS) {
        const list = [];
        for (let s = 0; s < STUDENTS_PER_SECTION; s += 1) {
          const sectionOffset = section === 'A' ? 0 : STUDENTS_PER_SECTION;
          const sFirst = pick(pool.first, deptIdx + s + sectionOffset);
          const sLast = pick(pool.last, deptIdx * 3 + s + sectionOffset);
          const email = `${sFirst.toLowerCase()}.${sLast.toLowerCase()}.${emailTag}${dept.code}${section.toLowerCase()}${s}@student.campusease.edu`;
          const student = await findOrCreateUser({
            name: `${sFirst} ${sLast}`,
            email,
            password: 'Student@123',
            role: 'student',
            department: dept.name,
            usn: `${USN_YEAR_PREFIX}${dept.code.toUpperCase().slice(0, 2)}${semester}${section}${String(s + 1).padStart(2, '0')}`,
            semester,
            section,
          });
          list.push(student);
        }
        studentsBySemesterSection[semester][section] = list;
      }
    }

    // --- Clear old entries for all 3 semesters' Sections A & B ---
    const removed = await Timetable.deleteMany({
      department: dept.name,
      semester: { $in: SEMESTERS },
      section: { $in: SECTIONS },
    });

    // --- Schedule: ONE shared teacherBusy set across all 3 semesters, so a
    // teacher can never be double-booked at the same day+time even across
    // different semesters. Labs for every semester/section are placed
    // first (they claim fixed-feeling slots), THEN lecture rotation for
    // every semester/section — so lecture placement always sees the full,
    // final picture of every teacher's lab commitments. ---
    const teacherBusy = new Set(); // `${teacherId}|${day}|${startTime}`
    const docs = [];
    // reservedSlots["${semester}|${section}"][day] = Set(startTime) used by
    // that exact semester+section's labs — see findLabDay's comment above
    // for why this can't be keyed by section letter alone.
    const reservedSlots = {};
    SEMESTERS.forEach((sem) => {
      SECTIONS.forEach((s) => { reservedSlots[`${sem}|${s}`] = {}; });
    });

    let dayOffset = 0;
    for (const semester of SEMESTERS) {
      for (const section of SECTIONS) {
        const groupKey = `${semester}|${section}`;
        for (const subjIdx of LAB_SUBJECT_INDEXES) {
          const teacher = subjectTeacherMap[semester][subjIdx];
          const day = findLabDay(teacher, groupKey, teacherBusy, reservedSlots, dayOffset);
          dayOffset += 1;
          if (!day) {
            throw new Error(
              `${dept.name}: could not find a free day for ${teacher.name}'s Sem ${semester} ${section} lab — ` +
              `increase TEACHERS_PER_DEPT or check for an over-committed teacher.`
            );
          }
          LAB_SLOT_PAIR.forEach((slot) => {
            teacherBusy.add(`${teacher._id}|${day}|${slot.start}`);
            if (!reservedSlots[groupKey][day]) reservedSlots[groupKey][day] = new Set();
            reservedSlots[groupKey][day].add(slot.start);
            docs.push({
              day,
              startTime: slot.start,
              endTime: slot.end,
              subject: `${dept.subjectsBySemester[semester][subjIdx]} Lab`,
              department: dept.name,
              classroom: labRoomBySemester[semester]._id,
              faculty: teacher._id,
              semester,
              section,
            });
          });
        }
      }
    }

    for (const semester of SEMESTERS) {
      for (const section of SECTIONS) {
        const groupKey = `${semester}|${section}`;
        let cursor = section === 'A' ? 0 : 3; // stagger so A/B don't mirror each other
        for (const [day, slots] of DAY_CONFIGS) {
          for (const slot of slots) {
            if (reservedSlots[groupKey][day]?.has(slot.start)) continue;
            let placed = false;
            for (let attempt = 0; attempt < 6; attempt += 1) {
              const subjIdx = (cursor + attempt) % 6;
              const teacher = subjectTeacherMap[semester][subjIdx];
              const key = `${teacher._id}|${day}|${slot.start}`;
              if (!teacherBusy.has(key)) {
                teacherBusy.add(key);
                docs.push({
                  day,
                  startTime: slot.start,
                  endTime: slot.end,
                  subject: dept.subjectsBySemester[semester][subjIdx],
                  department: dept.name,
                  classroom: roomsBySemesterSection[semester][section]._id,
                  faculty: teacher._id,
                  semester,
                  section,
                });
                cursor = (subjIdx + 1) % 6;
                placed = true;
                break;
              }
            }
            if (!placed) {
              throw new Error(
                `${dept.name}: every subject's teacher was busy for Sem ${semester} ${section} on ${day} ${slot.start} — ` +
                `increase TEACHERS_PER_DEPT to give more slack.`
              );
            }
          }
        }
      }
    }

    await Timetable.insertMany(docs);

    console.log(`  cleared ${removed.deletedCount} old entries, created ${docs.length} new ones`);
    console.log(`  ${teachers.length} shared faculty:`);
    teachers.forEach((t) => {
      const mine = docs.filter((d) => String(d.faculty) === String(t._id));
      const bySemester = {};
      mine.forEach((d) => {
        if (!bySemester[d.semester]) bySemester[d.semester] = new Set();
        bySemester[d.semester].add(d.subject.replace(' Lab', ''));
      });
      const semesterCount = Object.keys(bySemester).length;
      const subjectCount = new Set(mine.map((d) => d.subject.replace(' Lab', ''))).size;
      const breakdown = Object.entries(bySemester)
        .map(([sem, subs]) => `Sem ${sem}: ${[...subs].join(', ')}`)
        .join(' | ');
      console.log(`    ${t.name} <${t.email}> — ${subjectCount} subject(s) across ${semesterCount} semester(s) — ${breakdown} — ${mine.length} periods/week`);
    });
    SEMESTERS.forEach((semester) => {
      SECTIONS.forEach((section) => {
        console.log(`  Sem ${semester} Section ${section} students:`);
        studentsBySemesterSection[semester][section].forEach((st) => console.log(`    ${st.email} / Student@123  (${st.usn})`));
      });
    });
  }

  console.log('\n=== DONE ===');
  console.log('Every department now has Sem 1, 3 & 5 built together with SHARED faculty:');
  console.log('  - Each teacher is assigned 2-3 subjects spread across 2-3 different semesters');
  console.log('  - No teacher is ever double-booked at the same day+time, even across semesters');
  console.log('  - Mon/Tue/Thu/Fri: full days (6 periods). Wednesday: half day (3 periods). No Saturday.');
  console.log('  - 2 lab sessions/week per section, in a real lab room');
  console.log('\nLog into any of the printed faculty accounts and check My Timetable — it will now');
  console.log('show classes across multiple semesters and multiple subjects.');

  process.exit(0);
}

run().catch((err) => {
  console.error('Multi-semester realistic seed failed:', err);
  process.exit(1);
});