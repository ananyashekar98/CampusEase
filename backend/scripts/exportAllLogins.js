// Run with: node scripts/exportAllLogins.js  (from the backend/ folder)
//
// READ-ONLY — this never writes to your database, it only reads what's
// already there and writes a summary file. Safe to run anytime.
//
// Every seed script in this project (resetAndSeed.js, seedRealisticSem1/3/5.js)
// always uses the same fixed password per role:
//   admin   -> Admin@123
//   faculty -> Faculty@123
//   student -> Student@123
// Passwords are hashed in the database, so this script can't read the real
// password back out — it just prints the known default for that role. If you
// (or a student/faculty account) ever changed a password through the app, or
// signed up through "Create an account" with a custom password, THAT one
// account's real password won't match what's printed here. Everything else
// (emails, names, departments, semester/section, USN) is read live from the
// database, so it's always accurate.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const connectDB = require('../config/db');
const User = require('../models/User');

const DEFAULT_PASSWORD = { admin: 'Admin@123', faculty: 'Faculty@123', student: 'Student@123' };
const OUTPUT_PATH = path.join(__dirname, '..', 'ALL_LOGINS.md');

function table(headers, rows) {
  const header = `| ${headers.join(' | ')} |`;
  const divider = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return `${header}\n${divider}\n${body}`;
}

async function run() {
  await connectDB();

  const users = await User.find({}).sort({ role: 1, department: 1, semester: 1, section: 1, name: 1 });

  const admins = users.filter((u) => u.role === 'admin');
  const faculty = users.filter((u) => u.role === 'faculty');
  const students = users.filter((u) => u.role === 'student');

  const lines = [];
  lines.push('# CampusEase — All Login Accounts');
  lines.push('');
  lines.push(`Generated ${new Date().toLocaleString()} — read live from the database (${users.length} total accounts).`);
  lines.push('');
  lines.push(
    '**Passwords shown are the project\'s fixed seeded defaults per role** (`Admin@123` / `Faculty@123` / `Student@123`). ' +
      'If a password was ever changed through the app, or an account was made via "Create an account" with a custom ' +
      'password, that one account\'s real password won\'t match what\'s printed below — everything else here is exact.'
  );
  lines.push('');

  // --- Admins ---
  lines.push(`## Admins (${admins.length})`);
  lines.push('');
  lines.push(
    table(
      ['Email', 'Password', 'Scope'],
      admins.map((a) => [a.email, DEFAULT_PASSWORD.admin, a.department ? a.department : '**Global** (sees every department)'])
    )
  );
  lines.push('');

  // --- Faculty, grouped by department ---
  lines.push(`## Faculty (${faculty.length})`);
  const facultyByDept = {};
  faculty.forEach((f) => {
    const dept = f.department || 'Unassigned';
    if (!facultyByDept[dept]) facultyByDept[dept] = [];
    facultyByDept[dept].push(f);
  });
  Object.keys(facultyByDept)
    .sort()
    .forEach((dept) => {
      lines.push('');
      lines.push(`### ${dept} (${facultyByDept[dept].length})`);
      lines.push('');
      lines.push(
        table(
          ['Name', 'Email', 'Password', 'Designation'],
          facultyByDept[dept].map((f) => [f.name, f.email, DEFAULT_PASSWORD.faculty, f.designation || '—'])
        )
      );
    });
  lines.push('');

  // --- Students, grouped by department then semester+section ---
  lines.push(`## Students (${students.length})`);
  const studentsByDept = {};
  students.forEach((s) => {
    const dept = s.department || 'Unassigned';
    if (!studentsByDept[dept]) studentsByDept[dept] = [];
    studentsByDept[dept].push(s);
  });
  Object.keys(studentsByDept)
    .sort()
    .forEach((dept) => {
      lines.push('');
      lines.push(`### ${dept} (${studentsByDept[dept].length})`);
      lines.push('');
      lines.push(
        table(
          ['Name', 'Email', 'Password', 'USN', 'Sem', 'Section'],
          studentsByDept[dept].map((s) => [s.name, s.email, DEFAULT_PASSWORD.student, s.usn || '—', s.semester ?? '—', s.section || '—'])
        )
      );
    });
  lines.push('');

  fs.writeFileSync(OUTPUT_PATH, lines.join('\n'), 'utf8');

  console.log(`\nWrote ${users.length} accounts to: ${OUTPUT_PATH}`);
  console.log(`  ${admins.length} admins, ${faculty.length} faculty, ${students.length} students`);
  console.log('Open ALL_LOGINS.md in VS Code (or any Markdown viewer) to see the full list.');

  process.exit(0);
}

run().catch((err) => {
  console.error('Export logins failed:', err);
  process.exit(1);
});
