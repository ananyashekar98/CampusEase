// Run with: node scripts/seedBulk.js  (from the backend/ folder)
// Adds a large batch of demo accounts + a full timetable on top of whatever
// seed.js already created. Safe to run more than once — skips any account
// that already exists by email, and only adds classrooms/staffrooms that
// aren't already there.

require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Staffroom = require('../models/Staffroom');
const Timetable = require('../models/Timetable');
const { runAutoAllocator } = require('../utils/autoAllocator');
const { ensureDepartmentClassrooms } = require('./seedClassrooms');
const { DEPARTMENTS, DEPT_CODE } = require('../utils/departments');

const FIRST_NAMES = [
  'Aditya', 'Ananya', 'Arjun', 'Bhavya', 'Chetan', 'Deepika', 'Esha', 'Farhan',
  'Gowri', 'Harish', 'Ishita', 'Jatin', 'Kavya', 'Lakshmi', 'Manoj', 'Nisha',
  'Om', 'Pooja', 'Rahul', 'Sneha', 'Tanvi', 'Uday', 'Varun', 'Yashika',
  'Zoya', 'Aarav', 'Bhavana', 'Chirag', 'Divya', 'Eshwar', 'Firoz', 'Geetha',
  'Hemanth', 'Indira', 'Jyothi', 'Kiran', 'Lavanya', 'Mahesh', 'Nikhil', 'Ojas',
];
const LAST_NAMES = [
  'Sharma', 'Reddy', 'Rao', 'Gupta', 'Iyer', 'Nair', 'Patel', 'Kumar',
  'Singh', 'Verma', 'Menon', 'Pillai', 'Shetty', 'Bhat', 'Joshi',
];
const DESIGNATIONS = ['Assistant Professor', 'Associate Professor', 'Professor'];
const SUBJECT_POOL = [
  'Data Structures', 'Operating Systems', 'Database Management Systems', 'Computer Networks',
  'Object Oriented Programming', 'Software Engineering', 'Web Technologies', 'Artificial Intelligence',
  'Machine Learning', 'Discrete Mathematics', 'Design and Analysis of Algorithms', 'Microprocessors',
  'Cloud Computing', 'Compiler Design',
];
const SECTIONS = ['A', 'B', 'C'];

function pick(arr, i) {
  return arr[i % arr.length];
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function findOrCreateUser(data) {
  const existing = await User.findOne({ email: data.email });
  if (existing) return { user: existing, created: false };
  const user = await User.create(data);
  return { user, created: true };
}

async function findOrCreateStaffroom(data) {
  const existing = await Staffroom.findOne({ department: data.department, roomLabel: data.roomLabel });
  if (existing) return existing;
  return Staffroom.create(data);
}

async function seedBulk() {
  await connectDB();

  console.log('\n--- Classrooms (20 lecture + 3 lab rooms per department — shared source) ---');
  const { all: allClassrooms, byDept: classroomsByDept } = await ensureDepartmentClassrooms();
  console.log(`  ${allClassrooms.length} classrooms ready across ${DEPARTMENTS.length} departments`);

  console.log('\n--- Faculty (2 per department) ---');
  const faculty = [];
  let createdFaculty = 0;
  let fNameIdx = 0;
  for (const dept of DEPARTMENTS) {
    const code = DEPT_CODE[dept];
    for (let n = 0; n < 2; n += 1) {
      const first = pick(FIRST_NAMES, fNameIdx);
      const last = pick(LAST_NAMES, fNameIdx);
      fNameIdx += 1;
      const email = `${first.toLowerCase()}.${last.toLowerCase()}.${code}${n}@campusease.edu`;
      const { user, created } = await findOrCreateUser({
        name: `${n === 1 ? 'Dr.' : 'Prof.'} ${first} ${last}`,
        email,
        password: 'Faculty@123',
        role: 'faculty',
        department: dept,
        designation: pick(DESIGNATIONS, n),
        cabinLocation: `Staffroom ${n + 1}`,
        isAvailable: true,
      });
      faculty.push(user);
      if (created) createdFaculty += 1;
    }
  }
  console.log(`  ${createdFaculty} new faculty created (${faculty.length} total across all departments)`);

  console.log('\n--- Staffrooms (2 per department) ---');
  let createdStaffrooms = 0;
  for (const dept of DEPARTMENTS) {
    for (let n = 1; n <= 2; n += 1) {
      const existing = await Staffroom.findOne({ department: dept, roomLabel: `Staffroom ${n}` });
      if (!existing) {
        await findOrCreateStaffroom({ department: dept, roomLabel: `Staffroom ${n}`, building: 'Block A', floor: '2nd Floor' });
        createdStaffrooms += 1;
      }
    }
  }
  console.log(`  ${createdStaffrooms} new staffrooms created`);

  console.log('\n--- Students (spread across departments, Sem 1-8, Sections A-C) ---');
  const students = [];
  let createdStudents = 0;
  let sNameIdx = 0;
  let usnCounter = 1;
  for (const dept of DEPARTMENTS) {
    const code = DEPT_CODE[dept];
    for (let n = 0; n < 5; n += 1) {
      const first = pick(FIRST_NAMES, sNameIdx + 20);
      const last = pick(LAST_NAMES, sNameIdx + 3);
      sNameIdx += 1;
      const semester = ((n * 2) % 8) + 1;
      const section = pick(SECTIONS, n);
      const email = `${first.toLowerCase()}.${last.toLowerCase()}.${code}${n}@student.campusease.edu`;
      const usn = `1GA23${code.toUpperCase().slice(0, 2)}${String(usnCounter).padStart(3, '0')}`;
      usnCounter += 1;
      const { user, created } = await findOrCreateUser({
        name: `${first} ${last}`,
        email,
        password: 'Student@123',
        role: 'student',
        department: dept,
        usn,
        semester,
        section,
      });
      students.push(user);
      if (created) createdStudents += 1;
    }
  }
  console.log(`  ${createdStudents} new students created (${students.length} total across all departments)`);

  console.log('\n--- Timetable (generated via the real Auto-Allocator algorithm, so it is guaranteed clash-free) ---');
  // Run the allocator ONCE PER DEPARTMENT, using only that department's own
  // rooms. Running it once globally across every department's requirements
  // with a shared room pool would let e.g. a CSE class land in an ISE room —
  // rooms are department-owned now, so scheduling must respect that too.
  let createdEntries = 0;
  let totalUnscheduled = 0;
  for (const dept of DEPARTMENTS) {
    const deptFaculty = faculty.filter((f) => f.department === dept);
    const requirements = deptFaculty.map((f, i) => ({
      subject: pick(SUBJECT_POOL, i),
      faculty: { _id: f._id, name: f.name },
      department: f.department,
      semester: ((i * 2) % 8) + 1,
      section: pick(SECTIONS, i),
      roomType: i % 5 === 0 ? 'lab' : 'lecture',
      periodsPerWeek: 3,
    }));
    if (requirements.length === 0) continue;

    const { entries, unscheduled } = runAutoAllocator(requirements, classroomsByDept[dept]);
    totalUnscheduled += unscheduled.length;

    for (const e of entries) {
      const existing = await Timetable.findOne({ classroom: e.classroom, day: e.day, startTime: e.startTime });
      if (existing) continue;
      await Timetable.create({
        day: e.day,
        startTime: e.startTime,
        endTime: e.endTime,
        subject: e.subject,
        department: e.department,
        classroom: e.classroom,
        faculty: e.faculty,
        semester: e.semester,
        section: e.section,
      });
      createdEntries += 1;
    }
  }
  console.log(`  ${createdEntries} new timetable entries created`);
  if (totalUnscheduled > 0) {
    console.log(`  ${totalUnscheduled} sessions could not be placed (not enough clash-free slots/rooms) — this is fine, most of the timetable still got filled.`);
  }

  console.log('\n=== Done ===');
  console.log(`Total new logins created this run: ${createdFaculty} faculty + ${createdStudents} students`);
  console.log('All faculty passwords: Faculty@123');
  console.log('All student passwords: Student@123');
  console.log('\nSample logins to try:');
  console.log(`  Faculty: ${faculty[0]?.email}`);
  console.log(`  Student: ${students[0]?.email}`);
  console.log('\n(Every account\'s email follows the pattern firstname.lastname.deptcode@[student.]campusease.edu — check your database/Compass, or the createdFaculty/createdStudents counts above, for the full list.)');

  process.exit(0);
}

seedBulk().catch((err) => {
  console.error('Bulk seed failed:', err);
  process.exit(1);
});
