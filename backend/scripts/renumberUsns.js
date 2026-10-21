// Run from backend/:
//   node scripts/renumberUsns.js            (DRY RUN - shows what would change, writes nothing)
//   node scripts/renumberUsns.js --apply    (rewrite USNs AND login emails)
//   node scripts/renumberUsns.js --undo     (put every changed student back exactly as it was)
//
// Gives every student a proper USN:   1GA + batch year (2 digits) + department (2 letters) + number (3 digits)
//   e.g. 1GA23IS016   - NO section letter inside it.
// The batch year is kept from the old USN (23 = joined 2023, 26 = joined 2026 ...).
// Department letters: CS, IS, EC, EE, ME, CV (civil), AI.
// Numbers run 001, 002 ... inside each department + batch (all sections together), ordered by
// section then old USN. Each student's section is still stored separately, so timetables,
// allocation and notifications are NOT affected.
// The login email follows the USN:  firstname.1ga23is016@campusease.edu  (password unchanged).
// Only students whose USN still has the old "digit + section letter" shape are touched.
// A backup of every old USN/email is saved in scripts/.usnBackup.json for --undo.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

const APPLY = process.argv.includes('--apply');
const UNDO = process.argv.includes('--undo');
const BACKUP = path.join(__dirname, '.usnBackup.json');
const DOMAIN = 'campusease.edu';
const OLD = /^1GA(\d{2})([A-Z]{2})\d[A-Z]\d{2}$/;
const DEPT_FIX = { CI: 'CV' };

(async () => {
  await connectDB();
  console.log('Database:', mongoose.connection.name);

  if (UNDO) {
    if (!fs.existsSync(BACKUP)) { console.log('No backup file found, nothing to undo.'); process.exit(0); }
    const b = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    // old and new formats never overlap, so one-by-one updates are safe
    let n = 0;
    for (const [id, v] of Object.entries(b)) {
      await User.updateOne({ _id: id }, { $set: { usn: v.usn, email: v.email } });
      n += 1;
    }
    console.log('Restored', n, 'students to their old USN and email.');
    process.exit(0);
  }

  const students = await User.find({ role: 'student', usn: { $exists: true, $ne: null } }).select('name email usn semester section department');
  const todo = students.filter((s) => OLD.test(s.usn));
  const keep = students.filter((s) => !OLD.test(s.usn));
  console.log(`Students: ${students.length}. To renumber: ${todo.length}. Left alone (already new style or custom): ${keep.length}`);

  const groups = {};
  for (const s of todo) {
    const m = s.usn.match(OLD);
    const dd = DEPT_FIX[m[2]] || m[2];
    (groups[`${m[1]}|${dd}`] = groups[`${m[1]}|${dd}`] || []).push(s);
  }
  const taken = new Set(keep.map((s) => s.usn));
  const takenEmail = new Set((await User.find({ _id: { $nin: todo.map((s) => s._id) } }).select('email')).map((u) => u.email));
  const plan = [];
  for (const [key, list] of Object.entries(groups).sort()) {
    const [yy, dd] = key.split('|');
    list.sort((a, b) => String(a.section).localeCompare(String(b.section)) || a.usn.localeCompare(b.usn));
    let n = 0;
    for (const s of list) {
      let usn;
      do { n += 1; usn = `1GA${yy}${dd}${String(n).padStart(3, '0')}`; } while (taken.has(usn));
      taken.add(usn);
      const first = s.email.split('.')[0];
      const email = `${first}.${usn.toLowerCase()}@${DOMAIN}`;
      if (takenEmail.has(email)) { console.log('SKIP (email already used):', s.name, email); continue; }
      takenEmail.add(email);
      plan.push({ s, usn, email });
    }
  }

  console.log('\nExamples:');
  plan.filter((_, i) => i % 40 === 0).forEach((p) => console.log(`  ${p.s.usn} -> ${p.usn}   ${p.s.email} -> ${p.email}   (Sem ${p.s.semester} ${p.s.section})`));
  console.log(`\nTotal changes planned: ${plan.length}`);

  if (!APPLY) { console.log('\nDRY RUN - nothing written. Run with --apply to do it.'); process.exit(0); }

  const backup = fs.existsSync(BACKUP) ? JSON.parse(fs.readFileSync(BACKUP, 'utf8')) : {};
  plan.forEach((p) => { if (!backup[p.s._id]) backup[p.s._id] = { usn: p.s.usn, email: p.s.email }; });
  fs.writeFileSync(BACKUP, JSON.stringify(backup, null, 1));
  // One student at a time, so a dropped connection never leaves a half-done batch unnoticed
  // (re-running --undo then --apply always gives a clean result).
  for (const p of plan) {
    await User.updateOne({ _id: p.s._id }, { $set: { usn: p.usn, email: p.email } });
  }
  const after = await User.countDocuments({ role: 'student', usn: { $regex: /^1GA\d{2}[A-Z]{2}\d{3}$/ } });
  console.log(`DONE. Updated ${plan.length} students. Students now in the new format: ${after}. Backup saved to scripts/.usnBackup.json`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });