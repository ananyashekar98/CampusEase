// Run with: node scripts/resetAndSeed.js --yes-delete-everything
// (from the backend/ folder)
//
// ONE command that rebuilds the whole demo database, start to finish:
//   1. wipes users, classrooms, staffrooms, timetable, bookings,
//      requirements, allocations and notifications
//   2. creates each department's shared room pool (12 lecture rooms + 3 labs)
//   3. creates staffrooms
//   4. creates the admin accounts
//        main admin        admin@campusease.edu
//        department admins <dept>.admin@campusease.edu  (e.g. eee.admin@)
//   5. seeds a realistic timetable + faculty + students for Sem 1, 3, 5 and 7
//        students  firstname.usn@campusease.edu
//        faculty   firstname.dept+staffid@campusease.edu
//   6. writes ALL_LOGINS.md with every login
//
// There is no undo — it deletes everything first.

require('dotenv').config();
const path = require('path');
const { spawnSync } = require('child_process');
const connectDB = require('../config/db');
const User = require('../models/User');
const Classroom = require('../models/Classroom');
const Staffroom = require('../models/Staffroom');
const Timetable = require('../models/Timetable');
const Booking = require('../models/Booking');
const SubjectRequirement = require('../models/SubjectRequirement');
const Allocation = require('../models/Allocation');
const Notification = require('../models/Notification');
const { DEPT_CODE } = require('../utils/departments');

const FLAG = '--yes-delete-everything';

// The departments that get a full seeded timetable (same list the
// seedRealisticSem*.js scripts use).
const SEEDED_DEPARTMENTS = [
  'Computer Science & Engineering',
  'Information Science & Engineering',
  'Electronics & Communication Engineering',
  'Electrical & Electronics Engineering',
  'Mechanical Engineering',
  'Civil Engineering',
  'Artificial Intelligence & Machine Learning',
];

const STEPS = ['seedRealisticSem1.js', 'seedRealisticSem3.js', 'seedRealisticSem5.js', 'seedRealisticSem7.js'];

async function wipe() {
  console.log('--- Wiping all existing data ---');
  await Promise.all([
    User.deleteMany({}),
    Classroom.deleteMany({}),
    Staffroom.deleteMany({}),
    Timetable.deleteMany({}),
    Booking.deleteMany({}),
    SubjectRequirement.deleteMany({}),
    Allocation.deleteMany({}),
    Notification.deleteMany({}),
  ]);
  console.log('  done');
}

function runScript(file) {
  console.log(`\n=== ${file} ===`);
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n${file} failed (exit ${r.status}). Stopping.`);
    process.exit(1);
  }
}

async function run() {
  if (!process.argv.includes(FLAG)) {
    console.log('This DELETES ALL existing data and rebuilds the demo database from scratch.');
    console.log(`To proceed, run: node scripts/resetAndSeed.js ${FLAG}`);
    process.exit(0);
  }

  await connectDB();
  await wipe();

  console.log('\n--- Classrooms ---');
  const { ensureDepartmentClassrooms } = require('./seedClassrooms');
  const { all } = await ensureDepartmentClassrooms();
  console.log(`  ${all.length} rooms created (shared pool per department)`);

  console.log('\n--- Staffrooms ---');
  let staffrooms = 0;
  for (const department of SEEDED_DEPARTMENTS) {
    for (let n = 1; n <= 2; n += 1) {
      await Staffroom.create({ department, roomLabel: `Staffroom ${n}`, building: 'Block A', floor: '2nd Floor' });
      staffrooms += 1;
    }
  }
  console.log(`  ${staffrooms} staffrooms created`);

  console.log('\n--- Admin accounts (password Admin@123) ---');
  await User.create({ name: 'Admin', email: 'admin@campusease.edu', password: 'Admin@123', role: 'admin' });
  console.log('  admin@campusease.edu  (main admin — sees every department)');
  for (const department of SEEDED_DEPARTMENTS) {
    const code = DEPT_CODE[department];
    await User.create({
      name: `${code.toUpperCase()} Admin`,
      email: `${code}.admin@campusease.edu`,
      password: 'Admin@123',
      role: 'admin',
      department,
    });
    console.log(`  ${code}.admin@campusease.edu  (${department})`);
  }

  // Child processes open their own DB connections.
  const mongoose = require('mongoose');
  await mongoose.connection.close();

  STEPS.forEach(runScript);
  runScript('exportAllLogins.js');

  console.log('\n=== ALL DONE ===');
  console.log('Every login is listed in backend/ALL_LOGINS.md');
  console.log('Passwords: Admin@123 / Faculty@123 / Student@123');
  process.exit(0);
}

run().catch((err) => {
  console.error('Reset and seed failed:', err);
  process.exit(1);
});