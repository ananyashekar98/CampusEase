// Run with: node scripts/seedRealisticSem3.js  (from the backend/ folder)
//
// Builds a REALISTIC Semester 3 timetable for every department, via the
// shared scheduler in lib/buildRealisticSemester.js. See seedRealisticSem1.js
// for the full explanation of what "realistic" means here — sections A & B
// with teacher continuity across both, a real weekly shape, labs, zero
// double-booking.
//
// SAFE to run after resetAndSeed.js / seedRealisticSem1.js / seedRealisticSem5.js
// — only touches Semester 3 Sections A & B, uses dedicated classrooms +
// faculty tagged "sem3", zero clash with Sem 1/Sem 5 data or anything else.

require('dotenv').config();
const connectDB = require('../config/db');
const { seedRealisticSemester } = require('./lib/buildRealisticSemester');

// 3rd-semester subjects are the earlier, more foundational courses — kept
// deliberately different from the Sem 1/Sem 5 subject lists so semesters
// don't look like copies of each other. subjects[0] and [1] get a weekly lab.
const DEPARTMENTS = [
  { name: 'Computer Science & Engineering', code: 'cse', subjects: ['Data Structures & Applications', 'Object Oriented Programming with C++', 'Digital Design & Computer Organization', 'Discrete Mathematical Structures', 'Unix & Shell Programming', 'Engineering Mathematics III'] },
  { name: 'Information Science & Engineering', code: 'ise', subjects: ['Data Structures & Applications', 'Object Oriented Programming with C++', 'Digital Design & Computer Organization', 'Discrete Mathematical Structures', 'Unix & Shell Programming', 'Engineering Mathematics III'] },
  { name: 'Electronics & Communication Engineering', code: 'ece', subjects: ['Electronic Devices & Circuits', 'Network Analysis', 'Digital System Design', 'Electrical Circuits & Simulation', 'Engineering Mathematics III', 'Innovation & Design Thinking'] },
  { name: 'Electrical & Electronics Engineering', code: 'eee', subjects: ['Electric Circuit Analysis', 'Electrical Machines I', 'Analog Electronic Circuits', 'Digital System Design', 'Engineering Mathematics III', 'Electromagnetic Field Theory'] },
  { name: 'Mechanical Engineering', code: 'me', subjects: ['Basic Thermodynamics', 'Material Science', 'Metal Casting & Welding', 'Mechanics of Materials', 'Engineering Mathematics III', 'Metrology & Measurements'] },
  { name: 'Civil Engineering', code: 'civil', subjects: ['Mechanics of Materials', 'Basic Surveying', 'Building Materials & Construction', 'Fluid Mechanics', 'Engineering Geology', 'Engineering Mathematics III'] },
  { name: 'Artificial Intelligence & Machine Learning', code: 'aiml', subjects: ['Data Structures & Applications', 'Object Oriented Programming with C++', 'Discrete Mathematical Structures', 'Digital Design & Computer Organization', 'Probability & Statistics', 'Engineering Mathematics III'] },
];

const TEACHER_FIRST = ['Anitha', 'Ravindra', 'Deepa', 'Suresh', 'Lakshmi', 'Manjunath', 'Pooja', 'Girish'];
const TEACHER_LAST = ['Naik', 'Bhat', 'Shetty', 'Pai', 'Kulkarni', 'Poojary', 'Baliga', 'Nayak'];
const STUDENT_FIRST = ['Aarav', 'Sneha', 'Rohit', 'Ananya', 'Karthik', 'Divya', 'Sanjay', 'Meghana', 'Yashwanth', 'Nikitha'];
const STUDENT_LAST = ['Reddy', 'Gowda', 'Poojari', 'Shastry', 'Bhandary', 'Salian', 'Kamath', 'Shenoy', 'Rai', 'Hegde'];

async function run() {
  await connectDB();
  await seedRealisticSemester({
    semester: 3,
    emailTag: 'sem3',
    departments: DEPARTMENTS,
    teacherFirst: TEACHER_FIRST,
    teacherLast: TEACHER_LAST,
    studentFirst: STUDENT_FIRST,
    studentLast: STUDENT_LAST,
    studentsPerSection: 5,
    usnYearPrefix: '1GA25',
  });

  console.log('\n=== DONE ===');
  console.log('Every department now has a realistic Sem 3 timetable across Sections A & B:');
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
  console.error('Realistic Sem 3 seed failed:', err);
  process.exit(1);
});