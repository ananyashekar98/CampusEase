/* eslint-disable no-console */
const Timetable = require('../models/Timetable');
const User = require('../models/User');
const { DEPARTMENTS: DEPT_NAMES, DEPT_CODE } = require('../utils/departments');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
// Real college day: 8:30-10:30 classes, 10:30-11:00 tea break, 11:00-1:00
// classes, 1:00-2:00 lunch, 2:00-4:00 classes, then day winds up at 4:00.
const PERIODS = [
  ['08:30', '09:30'], ['09:30', '10:30'],
  ['11:00', '12:00'], ['12:00', '13:00'],
  ['14:00', '15:00'], ['15:00', '16:00'],
];
// All 8 departments now (was just ISE/CSE/ECE) — every department admin
// gets a full, real timetable to look at, not just the original 3.
const DEPARTMENTS = DEPT_NAMES.map((name) => ({ name, code: DEPT_CODE[name] }));
const SECTIONS = ['A', 'B', 'C'];
const STUDENTS_PER_SECTION = 9; // 8 depts x 3 sections x 9 = 216 students

const SUBJECTS = {
  'Information Science & Engineering': ['DBMS', 'Computer Networks', 'Software Engineering', 'Web Technologies', 'AI Fundamentals', 'Data Analytics', 'DBMS Lab'],
  'Computer Science & Engineering': ['Operating Systems', 'DBMS', 'Computer Networks', 'Software Engineering', 'Compiler Design', 'Cloud Computing', 'Systems Lab'],
  'Electronics & Communication Engineering': ['Digital Communication', 'Microcontrollers', 'VLSI Design', 'Signals and Systems', 'Embedded Systems', 'IoT Fundamentals', 'Embedded Lab'],
  'Electrical & Electronics Engineering': ['Electrical Machines', 'Power Systems', 'Control Systems', 'Power Electronics', 'Electrical Measurements', 'Renewable Energy Systems', 'Electrical Machines Lab'],
  'Mechanical Engineering': ['Thermodynamics', 'Fluid Mechanics', 'Machine Design', 'Manufacturing Processes', 'Heat Transfer', 'CAD/CAM', 'Manufacturing Lab'],
  'Civil Engineering': ['Structural Analysis', 'Concrete Technology', 'Geotechnical Engineering', 'Surveying', 'Transportation Engineering', 'Environmental Engineering', 'Surveying Lab'],
  'Artificial Intelligence & Machine Learning': ['Machine Learning', 'Deep Learning', 'Natural Language Processing', 'Computer Vision', 'Data Mining', 'Neural Networks', 'ML Lab'],
};

const DESIGNATIONS = ['Assistant Professor', 'Associate Professor', 'Professor'];
// Longer, co-prime-ish length lists so full-name repeats are rare even
// across 8 departments x 6 faculty (48 total) and 8 x 3 x 9 (216 students).
const FACULTY_FIRST = ['Sunil', 'Radha', 'Vinay', 'Shalini', 'Prakash', 'Meenakshi', 'Ashok', 'Divya', 'Kiran', 'Lakshmi', 'Manjunath', 'Pallavi', 'Ravi', 'Suma', 'Naveen', 'Anitha', 'Girish', 'Rekha', 'Mahesh', 'Jyothi', 'Srinivas', 'Kavitha', 'Umesh', 'Nagesh', 'Vidya'];
const FACULTY_LAST = ['Achar', 'Kamath', 'Rangan', 'Bhatt', 'Kulkarni', 'Row', 'Bailur', 'Shastri', 'Nayak', 'Shetty', 'Hebbar', 'Pai', 'Bhandari', 'Rao', 'Naik', 'Acharya', 'Prabhu', 'Adiga', 'Kudva', 'Bhandary', 'Kotian', 'Salian'];
const STUDENT_FIRST = ['Sahana', 'Vishnu', 'Anagha', 'Rakesh', 'Pallavi', 'Kiran', 'Shreya', 'Nitin', 'Arjun', 'Bhavya', 'Chetan', 'Deepika', 'Esha', 'Farhan', 'Gowri', 'Harish', 'Ishita', 'Jatin', 'Kavya', 'Manoj', 'Nisha', 'Om', 'Pooja', 'Rahul', 'Sneha', 'Tanvi', 'Uday', 'Varun', 'Yashika', 'Zoya', 'Akash', 'Bindu', 'Chandan', 'Divya', 'Eshwar'];
const STUDENT_LAST = ['Hegde', 'Prabhu', 'Bhandary', 'Kamath', 'Rai', 'Shenoy', 'Adiga', 'Kini', 'Shetty', 'Poojary', 'Bhat', 'Nayak', 'Kulal', 'Salian', 'Baliga', 'Kudva', 'Amin', 'Suvarna', 'Kotian', 'Pai', 'Achar', 'Row', 'Hebbar'];

function key(day, start) { return `${day}|${start}`; }
function pick(list, i) { return list[i % list.length]; }

async function ensureRooms() {
  // Rooms are department-owned now — use the shared canonical room set
  // (20 lecture + 3 lab rooms per department) instead of a small pool
  // shared across all 3 departments, which would let e.g. a CSE class
  // land in an ISE room.
  const { ensureDepartmentClassrooms } = require('./seedClassrooms');
  const { byDept: allByDept } = await ensureDepartmentClassrooms();
  const byDept = {};
  for (const dept of DEPARTMENTS) {
    byDept[dept.name] = allByDept[dept.name] || [];
  }
  return byDept;
}

async function findOrCreateUser(data) {
  const existing = await User.findOne({ email: data.email });
  if (existing) return { user: existing, created: false };
  const user = await User.create(data);
  return { user, created: true };
}

// Creates a DEDICATED faculty pool per department (own logins, not shared
// with other seed scripts), sized so the 4-periods-a-day cap below always
// has enough real capacity: 6 teachers x 4/day x 5 days = 120 periods/week
// of capacity per department, comfortably above the ~78/week actually needed.
async function ensureFaculty() {
  const byDept = {};
  const all = [];
  let nameIdx = 0;
  for (const dept of DEPARTMENTS) {
    const teachers = [];
    for (let i = 0; i < 6; i += 1) {
      const first = pick(FACULTY_FIRST, nameIdx);
      const last = pick(FACULTY_LAST, nameIdx);
      nameIdx += 1;
      const email = `${first.toLowerCase()}.${last.toLowerCase()}.sem5${dept.code}${i}@campusease.edu`;
      const { user } = await findOrCreateUser({
        name: `${i % 2 === 0 ? 'Prof.' : 'Dr.'} ${first} ${last}`,
        email,
        password: 'Faculty@123',
        role: 'faculty',
        department: dept.name,
        designation: pick(DESIGNATIONS, i),
        cabinLocation: `Staffroom ${(i % 2) + 1}`,
        isAvailable: true,
      });
      teachers.push(user);
      all.push(user);
    }
    byDept[dept.name] = teachers;
  }
  return { all, byDept };
}

// Creates real, enrolled student logins for every section (9 per section),
// not just a single demo account — so the class actually has ~80 students
// worth of real accounts on top of the ~18 faculty accounts above.
async function ensureStudents() {
  const bySection = {};
  let nameIdx = 0;
  let usnCounter = 1;
  for (const dept of DEPARTMENTS) {
    for (const section of SECTIONS) {
      const groupKey = `${dept.code}-${section}`;
      const groupStudents = [];
      for (let i = 0; i < STUDENTS_PER_SECTION; i += 1) {
        const first = pick(STUDENT_FIRST, nameIdx);
        const last = pick(STUDENT_LAST, nameIdx);
        nameIdx += 1;
        const email = `${first.toLowerCase()}.${last.toLowerCase()}.sem5${dept.code}${section.toLowerCase()}${i}@student.campusease.edu`;
        const usn = `1GA23${dept.code.toUpperCase().slice(0, 2)}${String(usnCounter).padStart(3, '0')}`;
        usnCounter += 1;
        const { user } = await findOrCreateUser({
          name: `${first} ${last}`,
          email,
          password: 'Student@123',
          role: 'student',
          department: dept.name,
          usn,
          semester: 5,
          section,
        });
        groupStudents.push(user);
      }
      bySection[groupKey] = groupStudents;
    }
  }
  return bySection;
}

async function seedSemester5Timetable({ replace = false } = {}) {
  const deptNames = DEPARTMENTS.map((d) => d.name);
  const existingFilter = { semester: 5, department: { $in: deptNames }, day: { $in: DAYS }, section: { $in: SECTIONS } };
  const existingCount = await Timetable.countDocuments(existingFilter);
  if (existingCount && !replace) {
    return { seeded: false, message: 'Semester 5 demo timetable already exists. Use replace=true to regenerate.', created: 0 };
  }
  if (replace) await Timetable.deleteMany(existingFilter);

  const roomsByDept = await ensureRooms();
  const { all, byDept } = await ensureFaculty();
  const studentsBySection = await ensureStudents();

  const facultyBusy = new Set();
  const roomBusy = new Set();
  const facultyDailyCount = new Map(); // `${facultyId}|${day}` -> periods taught that day
  const MAX_DAILY_PERIODS = 4; // real teachers don't teach every period, every day
  const created = [];

  // Each section gets a dense, realistic week — every period is filled
  // (that's what gives students a real morning-to-evening timetable).
  // Two different half-days are used per section. A 2-hour lab block runs
  // 2:00-4:00 on one full day.
  let groupIndex = 0;
  for (const dept of DEPARTMENTS) {
    const department = dept.name;
    const facultyPool = byDept[department].length ? byDept[department] : all;
    const subjects = SUBJECTS[department];
    // Own room pool for this department only — a room in one department
    // can never be booked for another department's classes.
    const rooms = roomsByDept[department];

    for (let s = 0; s < SECTIONS.length; s += 1) {
      const section = SECTIONS[s];
      const halfDays = new Set([DAYS[(groupIndex + 2) % 5], DAYS[(groupIndex + 4) % 5]]);
      const labDay = DAYS[(groupIndex + 1) % 5];
      const sectionSubjectOffset = groupIndex % 6;

      for (let d = 0; d < DAYS.length; d += 1) {
        const day = DAYS[d];
        const activePeriods = halfDays.has(day) ? PERIODS.slice(0, 4) : PERIODS.slice();
        // 2-hour lab block (2:00-4:00), replacing the two afternoon periods.
        const labStarts = day === labDay ? ['14:00', '15:00'] : [];

        for (let p = 0; p < activePeriods.length; p += 1) {
          const [startTime, endTime] = activePeriods[p];
          const slotKey = key(day, startTime);
          const isLab = labStarts.includes(startTime);
          const subject = isLab
            ? subjects[6]
            : subjects[(sectionSubjectOffset + d * 2 + p) % 6];

          // Rotate faculty, but prefer someone free AND under today's realistic
          // period cap — this is what naturally creates gaps/free periods in a
          // real teacher's day instead of back-to-back classes all day long.
          let faculty = null;
          for (let attempt = 0; attempt < Math.max(facultyPool.length, 1); attempt += 1) {
            const candidate = facultyPool[(groupIndex + p + d + attempt) % facultyPool.length];
            const dayKey = `${candidate._id}|${day}`;
            const countToday = facultyDailyCount.get(dayKey) || 0;
            if (!facultyBusy.has(`${candidate._id}|${slotKey}`) && countToday < MAX_DAILY_PERIODS) {
              faculty = candidate;
              break;
            }
          }
          if (!faculty) {
            // Nobody free and under-cap — fall back to anyone free at all
            // (keeps the seed guaranteed clash-free even if it means one
            // teacher goes slightly over the usual daily load that day).
            faculty = facultyPool.find((c) => !facultyBusy.has(`${c._id}|${slotKey}`))
              || all.find((f) => !facultyBusy.has(`${f._id}|${slotKey}`));
          }
          if (!faculty) throw new Error(`Could not find a free faculty member for ${day} ${startTime}`);

          const preferredRoom = isLab ? rooms.filter(r => r.type === 'lab') : rooms.filter(r => r.type === 'lecture');
          let classroom = preferredRoom.find(r => !roomBusy.has(`${r._id}|${slotKey}`));
          if (!classroom) classroom = rooms.find(r => !roomBusy.has(`${r._id}|${slotKey}`));
          if (!classroom) throw new Error(`Could not find a free classroom for ${day} ${startTime}`);

          facultyBusy.add(`${faculty._id}|${slotKey}`);
          roomBusy.add(`${classroom._id}|${slotKey}`);
          facultyDailyCount.set(`${faculty._id}|${day}`, (facultyDailyCount.get(`${faculty._id}|${day}`) || 0) + 1);
          created.push({ classroom: classroom._id, faculty: faculty._id, subject, department, day, startTime, endTime, semester: 5, section });
        }
      }
      groupIndex += 1;
    }
  }

  const docs = await Timetable.insertMany(created);

  const totalFaculty = all.length;
  const totalStudents = Object.values(studentsBySection).reduce((sum, arr) => sum + arr.length, 0);
  const sampleFaculty = all[0];
  const sampleStudent = Object.values(studentsBySection)[0]?.[0];

  return {
    seeded: true,
    created: docs.length,
    departments: deptNames,
    sections: SECTIONS,
    days: DAYS,
    fixedBreaks: [
      { label: 'Tea Break', startTime: '10:30', endTime: '11:00' },
      { label: 'Lunch Break', startTime: '13:00', endTime: '14:00' },
    ],
    maxFacultyPeriodsPerDay: MAX_DAILY_PERIODS,
    logins: {
      faculty: totalFaculty,
      students: totalStudents,
      total: totalFaculty + totalStudents,
      sampleFacultyLogin: sampleFaculty ? `${sampleFaculty.email} / Faculty@123` : null,
      sampleStudentLogin: sampleStudent ? `${sampleStudent.email} / Student@123` : null,
    },
  };
}

module.exports = { seedSemester5Timetable, DEPARTMENTS, SECTIONS, DAYS, PERIODS };
