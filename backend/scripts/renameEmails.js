// Run with: node scripts/renameEmails.js  (from backend/)
//
// Gives every account a clean, predictable login email, all on
// @campusease.edu:
//
//   Main admin        admin@campusease.edu
//   Department admin  <dept>.admin@campusease.edu
//                       e.g. eee.admin@campusease.edu, cse.admin@campusease.edu
//   Students          firstname.usn@campusease.edu
//                       e.g. ananya.1ga23is016@campusease.edu
//                       (USN is unique per student, so two students can
//                       never end up with the same email.)
//   Faculty           firstname.deptcode+staffid@campusease.edu
//                       e.g. lakshmi.eee16151@campusease.edu
//                       (unchanged scheme; the 5-digit staff ID is unique, so
//                       two faculty with the same first name never clash.)
//
// <dept> is the same short code the rest of the app uses for room names
// (cse, ise, ece, eee, mech, civil, aiml).
//
// Only the EMAIL changes. Passwords, roles, departments, timetables, USNs
// and staff IDs stay exactly as they are. Everyone needs to be told their
// new login email, since the old one stops working.
//
// Safe to re-run: an account already on its new email is left alone, and a
// would-be clash is skipped and logged rather than overwriting someone
// else's email.

require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const { DEPT_CODE } = require('../utils/departments');

const DOMAIN = 'campusease.edu';

// Fallback for a department that isn't in DEPT_CODE: first letter of every
// real word, "&"/"and" dropped.
function deptAbbrev(deptName) {
  if (!deptName) return 'gen';
  const letters = deptName
    .split(/\s+/)
    .map((w) => w.replace(/[&,]/g, ''))
    .filter((w) => w && w.toLowerCase() !== 'and')
    .map((w) => w[0]);
  return letters.join('').toLowerCase() || 'gen';
}

function deptCode(deptName) {
  return String((deptName && DEPT_CODE[deptName]) || deptAbbrev(deptName)).toLowerCase();
}

function firstNameOf(fullName) {
  return fullName
    .replace(/^(Prof\.|Dr\.)\s*/i, '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

// Renames one account unless it's already correct or the target is taken.
// Returns 'renamed' | 'same' | 'skipped'.
async function applyEmail(user, newEmail) {
  if (user.email === newEmail) return 'same';
  const clash = await User.findOne({ email: newEmail, _id: { $ne: user._id } });
  if (clash) {
    console.log(`  SKIP: ${user.name} <${user.email}> -> ${newEmail} (already used by ${clash.name})`);
    return 'skipped';
  }
  console.log(`  ${user.email}  ->  ${newEmail}`);
  user.email = newEmail;
  await user.save();
  return 'renamed';
}

function tally() {
  return { renamed: 0, same: 0, skipped: 0 };
}

async function run() {
  await connectDB();

  // --- Admins ---
  const admins = await User.find({ role: 'admin' }).sort({ createdAt: 1 });
  const adminTally = tally();
  console.log('--- Admins ---');
  for (const a of admins) {
    const newEmail = a.department
      ? `${deptCode(a.department)}.admin@${DOMAIN}`
      : `admin@${DOMAIN}`;
    adminTally[await applyEmail(a, newEmail)] += 1;
  }
  console.log(`Admins: ${adminTally.renamed} renamed, ${adminTally.skipped} skipped, ${adminTally.same} already correct.\n`);

  // --- Students ---
  const allStudents = await User.find({ role: 'student' });
  // A student with no USN can't get a USN-based email, so they're left as they are.
  const students = allStudents.filter((s) => s.usn && s.usn.trim());
  const noUsn = allStudents.length - students.length;
  console.log('--- Students ---');
  if (noUsn > 0) console.log(`  (${noUsn} student(s) have no USN, their emails are left unchanged)`);
  const studentTally = tally();
  for (const s of students) {
    const newEmail = `${firstNameOf(s.name)}.${s.usn.toLowerCase()}@${DOMAIN}`;
    studentTally[await applyEmail(s, newEmail)] += 1;
  }
  console.log(`Students: ${studentTally.renamed} renamed, ${studentTally.skipped} skipped, ${studentTally.same} already correct.\n`);

  // --- Faculty ---
  const faculty = await User.find({ role: 'faculty' }).sort({ createdAt: 1 });

  // Anyone still missing a staffId gets the next free number, continuing
  // on from the highest one in use anywhere (faculty or admin).
  const withIds = await User.find({ staffId: { $exists: true, $ne: null } }).select('staffId');
  let nextStaffId = 10000;
  withIds.forEach((u) => {
    const n = parseInt(u.staffId, 10);
    if (!Number.isNaN(n) && n > nextStaffId) nextStaffId = n;
  });

  console.log('--- Faculty ---');
  const facultyTally = tally();
  let staffIdsAssigned = 0;
  for (const f of faculty) {
    if (!f.staffId) {
      nextStaffId += 1;
      f.staffId = String(nextStaffId).padStart(5, '0');
      staffIdsAssigned += 1;
      await f.save(); // persist the new staff ID even if the email is already right
    }
    const newEmail = `${firstNameOf(f.name)}.${deptCode(f.department)}${f.staffId}@${DOMAIN}`;
    facultyTally[await applyEmail(f, newEmail)] += 1;
  }
  console.log(`Faculty: ${facultyTally.renamed} renamed, ${facultyTally.skipped} skipped, ${facultyTally.same} already correct, ${staffIdsAssigned} staff ID(s) freshly assigned.\n`);

  console.log('=== DONE ===');
  console.log('Passwords are unchanged. Only login emails changed.');
  const skipped = adminTally.skipped + studentTally.skipped + facultyTally.skipped;
  if (skipped > 0) console.log(`${skipped} account(s) were skipped because the new email was already taken. See the SKIP lines above.`);

  process.exit(0);
}

run().catch((err) => {
  console.error('Rename emails failed:', err);
  process.exit(1);
});