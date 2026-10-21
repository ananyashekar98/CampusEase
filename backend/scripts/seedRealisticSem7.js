// Run with: node scripts/seedRealisticSem7.js  (from the backend/ folder)
//
// Builds a REALISTIC Semester 7 timetable for every department, via the
// shared scheduler in lib/buildRealisticSemester.js. See seedRealisticSem1.js
// for the full explanation of what "realistic" means here — sections
// A/B/C with teacher continuity across all three, a real weekly shape,
// labs, zero double-booking (including zero lab-teacher double-booking
// across sections — see the big comment at the top of
// lib/buildRealisticSemester.js).
//
// SAFE to run after resetAndSeed.js / seedRealisticSem1.js /
// seedRealisticSem3.js / seedRealisticSem5.js — only touches Semester 7
// Sections A/B/C, shares the department's existing classroom pool and
// avoids every class already on the live timetable, zero clash with
// Sem 1/3/5 data or anything else.

require('dotenv').config();
const connectDB = require('../config/db');
const { seedRealisticSemester } = require('./lib/buildRealisticSemester');

// subjects[0] and [1] get a weekly lab. 7th-semester subjects lean toward
// final-year electives/specializations rather than core fundamentals.
const DEPARTMENTS = [
  { name: 'Computer Science & Engineering', code: 'cse', subjects: ['Machine Learning', 'Big Data Analytics', 'Information Security', 'Distributed Systems', 'Mobile App Development', 'Project Management'] },
  { name: 'Information Science & Engineering', code: 'ise', subjects: ['Machine Learning', 'Information Retrieval', 'Blockchain Technology', 'DevOps', 'Human Computer Interaction', 'Project Management'] },
  { name: 'Electronics & Communication Engineering', code: 'ece', subjects: ['Wireless Communication', 'Embedded Systems', 'Optical Communication', 'Robotics', 'IoT Systems', 'Project Management'] },
  { name: 'Electrical & Electronics Engineering', code: 'eee', subjects: ['Smart Grid Technology', 'Electric Vehicles', 'Industrial Automation', 'Power Quality', 'Energy Management', 'Project Management'] },
  { name: 'Mechanical Engineering', code: 'me', subjects: ['Robotics & Automation', 'CAD/CAM', 'Mechatronics', 'Industrial Engineering', 'Composite Materials', 'Project Management'] },
  { name: 'Civil Engineering', code: 'civil', subjects: ['Earthquake Engineering', 'Urban Planning', 'Bridge Engineering', 'Water Resources Engineering', 'Green Building Design', 'Project Management'] },
  { name: 'Artificial Intelligence & Machine Learning', code: 'aiml', subjects: ['Reinforcement Learning', 'Generative AI', 'MLOps', 'AI Ethics', 'Speech Processing', 'Project Management'] },
];

const TEACHER_FIRST = ['Girish', 'Lavanya', 'Suresh', 'Deepa', 'Mahesh', 'Rekha', 'Chandan', 'Pavithra'];
const TEACHER_LAST = ['Pai', 'Nayak', 'Bhat', 'Shetty', 'Hegde', 'Rao', 'Kamath', 'Bhandari'];
const STUDENT_FIRST = ['Varun', 'Anjali', 'Rohan', 'Meghana', 'Siddharth', 'Ramya', 'Akash', 'Tanvi'];
const STUDENT_LAST = ['Shetty', 'Pai', 'Nair', 'Gowda', 'Kumar', 'Shenoy', 'Bhat', 'Reddy'];

async function run() {
  await connectDB();
  await seedRealisticSemester({
    semester: 7,
    departments: DEPARTMENTS,
    teacherFirst: TEACHER_FIRST,
    teacherLast: TEACHER_LAST,
    studentFirst: STUDENT_FIRST,
    studentLast: STUDENT_LAST,
    studentsPerSection: 5,
    usnYearPrefix: '1GA23',
  });

  console.log('\n=== DONE ===');
  console.log('Every department now has a realistic Sem 7 timetable across Sections A/B/C:');
  console.log('  - Mon/Tue/Thu/Fri: full days, 8:30am-4pm (6 periods)');
  console.log('  - Wednesday: half day, morning only (3 periods)');
  console.log('  - Saturday: no classes');
  console.log('  - 6 subjects, each with its own dedicated teacher who teaches ALL 3 sections');
  console.log('  - 2 lab sessions/week per section, in a shared lab room, zero teacher double-booking across sections');
  console.log('  - 5 student logins per section (15 per department) — see the full list above');
  console.log('\nLog into any of the printed student/teacher accounts and check My Timetable.');

  process.exit(0);
}

run().catch((err) => {
  console.error('Realistic Sem 7 seed failed:', err);
  process.exit(1);
});