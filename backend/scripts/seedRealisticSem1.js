// Run with: node scripts/seedRealisticSem1.js  (from the backend/ folder)
//
// Builds a REALISTIC Semester 1 timetable for every department, via the
// shared scheduler in lib/buildRealisticSemester.js. Concretely, per
// department this creates:
//   - TWO sections, A and B (not just one) — each with its own 6
//     dedicated subject teachers who teach BOTH sections of their subject
//     (a teacher assigned to Sem 1 stays in Sem 1, teaching 1A and 1B, the
//     way a real timetable has continuity instead of scattering teachers
//     across random years)
//   - A full realistic week: Mon/Tue/Thu/Fri are 6-period full days,
//     Wednesday is a 3-period half day, Saturday is a 2-period short day
//   - 2 lab sessions/week per section, each a genuine 2-hour block in a
//     real lab room, taught by that subject's own teacher
//   - 5 student logins per section (10 per department total)
//   - Zero teacher/room double-booking, guaranteed by the scheduler
//
// SAFE to run after resetAndSeed.js / seedRealisticSem3.js / seedRealisticSem5.js
// — only touches Semester 1 Sections A & B (clears old entries for exactly
// that before rebuilding) and uses dedicated classrooms + faculty tagged
// "sem1", so there's zero clash with Sem 3/Sem 5 data or anything else.

require('dotenv').config();
const connectDB = require('../config/db');
const { seedRealisticSemester } = require('./lib/buildRealisticSemester');

// 1st-semester subjects at most Indian engineering colleges are largely
// common across branches (foundational math/science/programming), so these
// overlap more between departments than the Sem 3/Sem 5 lists do — that's
// realistic, not a mistake. subjects[0] and subjects[1] get a weekly lab.
const DEPARTMENTS = [
  { name: 'Computer Science & Engineering', code: 'cse', subjects: ['Problem Solving with C', 'Engineering Physics', 'Engineering Mathematics I', 'Basic Electrical Engineering', 'Engineering Graphics', 'Communicative English'] },
  { name: 'Information Science & Engineering', code: 'ise', subjects: ['Problem Solving with C', 'Engineering Physics', 'Engineering Mathematics I', 'Elements of Mechanical Engineering', 'Engineering Graphics', 'Communicative English'] },
  { name: 'Electronics & Communication Engineering', code: 'ece', subjects: ['Basic Electrical Engineering', 'Engineering Chemistry', 'Engineering Mathematics I', 'Elements of Civil Engineering & Mechanics', 'Engineering Graphics', 'Communicative English'] },
  { name: 'Electrical & Electronics Engineering', code: 'eee', subjects: ['Basic Electrical Engineering', 'Engineering Physics', 'Engineering Mathematics I', 'Elements of Civil Engineering & Mechanics', 'Engineering Graphics', 'Communicative English'] },
  { name: 'Mechanical Engineering', code: 'me', subjects: ['Elements of Mechanical Engineering', 'Engineering Chemistry', 'Engineering Mathematics I', 'Elements of Civil Engineering & Mechanics', 'Engineering Graphics', 'Communicative English'] },
  { name: 'Civil Engineering', code: 'civil', subjects: ['Elements of Civil Engineering & Mechanics', 'Engineering Chemistry', 'Engineering Mathematics I', 'Basic Electrical Engineering', 'Engineering Graphics', 'Communicative English'] },
  { name: 'Artificial Intelligence & Machine Learning', code: 'aiml', subjects: ['Problem Solving with C', 'Engineering Physics', 'Engineering Mathematics I', 'Basic Electrical Engineering', 'Engineering Graphics', 'Communicative English'] },
];

// Kept distinct from the name lists in seedRealisticSem3.js/seedRealisticSem5.js
// on purpose — overlapping lists used to produce the identical teacher name
// for the same department/subject slot across semesters (e.g. two different
// "Dr. Girish Poojary" accounts under AIML). Every semester draws from its
// own separate name pool.
const TEACHER_FIRST = ['Nagesh', 'Vidya', 'Chandan', 'Swathi', 'Harish', 'Kavya', 'Umesh', 'Nandini'];
const TEACHER_LAST = ['Prabhu', 'Bhandari', 'Kotian', 'Salian', 'Amin', 'Kudva', 'Adiga', 'Shenoy'];
const STUDENT_FIRST = ['Aditya', 'Pallavi', 'Vikram', 'Shreya', 'Naveen', 'Ramya', 'Siddharth', 'Anusha', 'Pranav', 'Lavanya'];
const STUDENT_LAST = ['Acharya', 'Kulal', 'Bhandari', 'Prabhu', 'Kotian', 'Nayak', 'Baliga', 'Shanbhag', 'Padukone', 'Amin'];

async function run() {
  await connectDB();
  await seedRealisticSemester({
    semester: 1,
    emailTag: 'sem1',
    departments: DEPARTMENTS,
    teacherFirst: TEACHER_FIRST,
    teacherLast: TEACHER_LAST,
    studentFirst: STUDENT_FIRST,
    studentLast: STUDENT_LAST,
    studentsPerSection: 5,
    usnYearPrefix: '1GA26',
  });

  console.log('\n=== DONE ===');
  console.log('Every department now has a realistic Sem 1 timetable across Sections A & B:');
  console.log('  - Mon/Tue/Thu/Fri: full days, 8:30am-4pm (6 periods)');
  console.log('  - Wednesday: half day, morning only (3 periods)');
  console.log('  - Saturday: short day (2 periods)');
  console.log('  - 6 subjects, each with its own dedicated teacher who teaches BOTH sections');
  console.log('  - 2 lab sessions/week per section, in a real lab room');
  console.log('  - 5 student logins per section (10 per department) — see the full list above');
  console.log('\nLog into any of the printed student/teacher accounts and check My Timetable.');

  process.exit(0);
}

run().catch((err) => {
  console.error('Realistic Sem 1 seed failed:', err);
  process.exit(1);
});