// Run with: node scripts/seed.js  (from the backend/ folder)
// Safe to run more than once — it skips anything that already exists by
// email/name instead of creating duplicates.

require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Classroom = require('../models/Classroom');
const Staffroom = require('../models/Staffroom');
const Timetable = require('../models/Timetable');
const { DEPARTMENTS, DEPT_CODE } = require('../utils/departments');

const DEPARTMENT = 'Information Science & Engineering';

async function findOrCreateUser(data) {
  const existing = await User.findOne({ email: data.email }).select('+password');
  if (existing) {
    // For a demo/test account we want it to exactly match the seed data
    // (e.g. department spelled exactly the same as the seeded timetable
    // entries use) rather than just filling gaps — a near-miss like "ISE"
    // vs "Information Science & Engineering" would silently show 0 classes.
    // Password is force-reset too — these are documented test accounts, so
    // the printed password should always actually work.
    const syncFields = ['department', 'semester', 'section', 'usn', 'designation', 'cabinLocation', 'isAvailable'];
    const changed = [];
    syncFields.forEach((field) => {
      if (data[field] !== undefined && String(existing[field]) !== String(data[field])) {
        changed.push(`${field}: "${existing[field]}" -> "${data[field]}"`);
        existing[field] = data[field];
      }
    });
    if (data.password) {
      existing.password = data.password; // pre-save hook re-hashes since this marks the field modified
      changed.push(`password reset to the documented value (${data.password})`);
    }
    if (changed.length > 0) {
      await existing.save();
      console.log(`  synced ${data.email}:\n    ${changed.join('\n    ')}`);
    } else {
      console.log(`  already exists and matches: ${data.email}`);
    }
    return existing;
  }
  const user = await User.create(data); // goes through the password-hashing hook
  console.log(`  created: ${data.email} / ${data.password}`);
  return user;
}

async function findOrCreateClassroom(data) {
  const existing = await Classroom.findOne({ name: data.name });
  if (existing) return existing;
  const room = await Classroom.create(data);
  console.log(`  created classroom: ${data.name}`);
  return room;
}

async function findOrCreateStaffroom(data) {
  const existing = await Staffroom.findOne({ department: data.department, roomLabel: data.roomLabel });
  if (existing) return existing;
  const room = await Staffroom.create(data);
  console.log(`  created staffroom: ${data.roomLabel}`);
  return room;
}

async function findOrCreateTimetableEntry(data) {
  const existing = await Timetable.findOne({
    classroom: data.classroom,
    day: data.day,
    startTime: data.startTime,
  });
  if (existing) return existing;
  const entry = await Timetable.create(data);
  console.log(`  created entry: ${data.day} ${data.startTime}-${data.endTime} ${data.subject}`);
  return entry;
}

async function seed() {
  await connectDB();

  console.log('\n--- Users ---');
  const ramesh = await findOrCreateUser({
    name: 'Dr. Ramesh Kumar',
    email: 'ramesh.kumar@ise.edu',
    password: 'Faculty@123',
    role: 'faculty',
    department: DEPARTMENT,
    designation: 'Professor',
    cabinLocation: 'Staffroom 1',
    isAvailable: true,
  });
  const sunitha = await findOrCreateUser({
    name: 'Prof. Sunitha Rao',
    email: 'sunitha.rao@ise.edu',
    password: 'Faculty@123',
    role: 'faculty',
    department: DEPARTMENT,
    designation: 'Assistant Professor',
    cabinLocation: 'Staffroom 2',
    isAvailable: true,
  });
  const arjun = await findOrCreateUser({
    name: 'Dr. Arjun Mehta',
    email: 'arjun.mehta@ise.edu',
    password: 'Faculty@123',
    role: 'faculty',
    department: DEPARTMENT,
    designation: 'Associate Professor',
    cabinLocation: 'Staffroom 1',
    isAvailable: false, // seeded as "Away" so you can see that state too
  });

  await findOrCreateUser({
    name: 'Chiru',
    email: 'chiru@ise.edu',
    password: 'Student@123',
    role: 'student',
    department: DEPARTMENT,
    usn: '1GA22IS007',
    semester: 7,
    section: 'A',
  });

  await findOrCreateUser({
    name: 'Admin User',
    email: 'admin@campusease.edu',
    password: 'Admin@123',
    role: 'admin',
  });

  console.log('\n--- Department admins ---');
  for (const dept of DEPARTMENTS) {
    const code = DEPT_CODE[dept];
    await findOrCreateUser({
      name: `${code.toUpperCase()} Admin`,
      email: `admin.${code}@campusease.edu`,
      password: 'Admin@123',
      role: 'admin',
      department: dept,
    });
  }

  console.log('\n--- Classrooms ---');
  const r201 = await findOrCreateClassroom({ name: '201', department: DEPARTMENT, building: 'Main Block', capacity: 60, type: 'lecture' });
  const r202 = await findOrCreateClassroom({ name: '202', department: DEPARTMENT, building: 'Main Block', capacity: 60, type: 'lecture' });
  const r203 = await findOrCreateClassroom({ name: '203', department: DEPARTMENT, building: 'Main Block', capacity: 40, type: 'lab' });

  console.log('\n--- Department classrooms (20 lecture + 3 lab rooms per department) ---');
  const { ensureDepartmentClassrooms } = require('./seedClassrooms');
  const { all: deptClassrooms } = await ensureDepartmentClassrooms();
  console.log(`  ${deptClassrooms.length} classrooms ready across ${DEPARTMENTS.length} departments`);

  console.log('\n--- Staffrooms ---');
  await findOrCreateStaffroom({ department: DEPARTMENT, roomLabel: 'Staffroom 1', building: 'Block A', floor: '2nd Floor' });
  await findOrCreateStaffroom({ department: DEPARTMENT, roomLabel: 'Staffroom 2', building: 'Block A', floor: '2nd Floor' });

  console.log('\n--- Timetable: Dr. Ramesh Kumar (Sem 7, Section A) ---');
  const rameshEntries = [
    { day: 'Monday', startTime: '09:00', endTime: '10:00', subject: 'Data Structures', classroom: r201._id },
    { day: 'Monday', startTime: '11:00', endTime: '12:00', subject: 'Compiler Design', classroom: r201._id },
    { day: 'Tuesday', startTime: '10:00', endTime: '11:00', subject: 'Data Structures', classroom: r202._id },
    { day: 'Wednesday', startTime: '09:00', endTime: '10:00', subject: 'Compiler Design', classroom: r201._id },
    { day: 'Thursday', startTime: '14:00', endTime: '15:00', subject: 'Data Structures', classroom: r203._id },
    { day: 'Friday', startTime: '11:00', endTime: '12:00', subject: 'Compiler Design', classroom: r202._id },
  ];
  for (const e of rameshEntries) {
    await findOrCreateTimetableEntry({
      ...e,
      faculty: ramesh._id,
      department: DEPARTMENT,
      semester: 7,
      section: 'A',
    });
  }

  console.log('\n--- Timetable: Prof. Sunitha Rao (Sem 5, Section B) ---');
  const sunithaEntries = [
    { day: 'Monday', startTime: '10:00', endTime: '11:00', subject: 'Web Technologies', classroom: r202._id },
    { day: 'Wednesday', startTime: '11:00', endTime: '12:00', subject: 'Web Technologies', classroom: r203._id },
    { day: 'Friday', startTime: '09:00', endTime: '10:00', subject: 'Database Management Systems', classroom: r201._id },
  ];
  for (const e of sunithaEntries) {
    await findOrCreateTimetableEntry({
      ...e,
      faculty: sunitha._id,
      department: DEPARTMENT,
      semester: 5,
      section: 'B',
    });
  }

  console.log('\n--- Timetable: Dr. Arjun Mehta (Sem 3, Section A) ---');
  const arjunEntries = [
    { day: 'Tuesday', startTime: '09:00', endTime: '10:00', subject: 'Discrete Mathematics', classroom: r201._id },
    { day: 'Thursday', startTime: '10:00', endTime: '11:00', subject: 'Discrete Mathematics', classroom: r202._id },
  ];
  for (const e of arjunEntries) {
    await findOrCreateTimetableEntry({
      ...e,
      faculty: arjun._id,
      department: DEPARTMENT,
      semester: 3,
      section: 'A',
    });
  }

  console.log('\nDone. Login with any of these (password shown only on first creation, see above):');
  console.log('  Faculty : ramesh.kumar@ise.edu / Faculty@123  (has 6 classes this week, and is "Available")');
  console.log('  Faculty : sunitha.rao@ise.edu   / Faculty@123');
  console.log('  Faculty : arjun.mehta@ise.edu   / Faculty@123  (seeded as "Away")');
  console.log('  Student : chiru@ise.edu         / Student@123  (Sem 7, Section A — matches Ramesh\'s timetable)');
  console.log('  Admin   : admin@campusease.edu  / Admin@123  (Bulk Import lives under Admin now)');
  console.log('  Dept Admin: admin.<code>@campusease.edu / Admin@123 (e.g. admin.cse@campusease.edu, admin.ise@campusease.edu — one per department, each scoped to just their own department)');

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
