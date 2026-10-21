// Run with: node scripts/seedRealisticSem5.js  (from the backend/ folder)
//
// Builds a REALISTIC Semester 5 timetable for every department, via the
// shared scheduler in lib/buildRealisticSemester.js. See seedRealisticSem1.js
// for the full explanation of what "realistic" means here — sections A & B
// with teacher continuity across both, a real weekly shape, labs, zero
// double-booking.
//
// SAFE to run after resetAndSeed.js / seedRealisticSem1.js / seedRealisticSem3.js
// — only touches Semester 5 Sections A & B, uses dedicated classrooms +
// faculty tagged "sem5", zero clash with Sem 1/Sem 3 data or anything else.

require('dotenv').config();
const connectDB = require('../config/db');
const { seedRealisticSemester } = require('./lib/buildRealisticSemester');

// subjects[0] and [1] get a weekly lab.
const DEPARTMENTS = [
  { name: 'Computer Science & Engineering', code: 'cse', subjects: ['Data Structures', 'Database Management Systems', 'Operating Systems', 'Computer Networks', 'Software Engineering', 'Web Technologies'] },
  { name: 'Information Science & Engineering', code: 'ise', subjects: ['Data Structures', 'Database Management Systems', 'Compiler Design', 'Software Engineering', 'Computer Networks', 'Cloud Computing'] },
  { name: 'Electronics & Communication Engineering', code: 'ece', subjects: ['Digital Signal Processing', 'Microcontrollers', 'Communication Systems', 'VLSI Design', 'Antenna Theory', 'Control Systems'] },
  { name: 'Electrical & Electronics Engineering', code: 'eee', subjects: ['Power Systems', 'Power Electronics', 'Electrical Machines', 'Control Systems', 'Renewable Energy', 'Microprocessors'] },
  { name: 'Mechanical Engineering', code: 'me', subjects: ['Thermodynamics', 'Machine Design', 'Fluid Mechanics', 'Manufacturing Technology', 'Heat Transfer', 'Automobile Engineering'] },
  { name: 'Civil Engineering', code: 'civil', subjects: ['Structural Analysis', 'Transportation Engineering', 'Geotechnical Engineering', 'Environmental Engineering', 'Construction Management', 'Surveying'] },
  { name: 'Artificial Intelligence & Machine Learning', code: 'aiml', subjects: ['Machine Learning', 'Deep Learning', 'Natural Language Processing', 'Computer Vision', 'Data Mining', 'Neural Networks'] },
];

const TEACHER_FIRST = ['Sunil', 'Radha', 'Vinay', 'Shalini', 'Prakash', 'Meenakshi', 'Ashok', 'Divya'];
const TEACHER_LAST = ['Achar', 'Kamath', 'Rangan', 'Bhatt', 'Kulkarni', 'Row', 'Bailur', 'Shastri'];
const STUDENT_FIRST = ['Sahana', 'Vishnu', 'Anagha', 'Rakesh', 'Pallavi', 'Kiran', 'Shreya', 'Nitin'];
const STUDENT_LAST = ['Hegde', 'Prabhu', 'Bhandary', 'Kamath', 'Rai', 'Shenoy', 'Adiga', 'Kini'];

async function run() {
  await connectDB();
  await seedRealisticSemester({
    semester: 5,
    emailTag: 'sem5',
    departments: DEPARTMENTS,
    teacherFirst: TEACHER_FIRST,
    teacherLast: TEACHER_LAST,
    studentFirst: STUDENT_FIRST,
    studentLast: STUDENT_LAST,
    studentsPerSection: 5,
    usnYearPrefix: '1GA24',
  });

  console.log('\n=== DONE ===');
  console.log('Every department now has a realistic Sem 5 timetable across Sections A & B:');
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
  console.error('Realistic Sem 5 seed failed:', err);
  process.exit(1);
});