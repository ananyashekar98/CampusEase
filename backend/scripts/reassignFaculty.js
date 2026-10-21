// One teacher = one section per semester.
//
// Re-assigns WHO teaches each existing timetable class, in every department, so
// that a faculty member teaches only ONE section of each semester they are in
// (for example Sem 1 A, Sem 3 C and Sem 5 B) instead of the same subject to
// A, B and C. Classes, days, times, rooms and sections are NOT touched - only
// the faculty on each class changes.
//
//   node scripts/reassignFaculty.js                    -> DRY RUN: shows what it would do, changes nothing
//   node scripts/reassignFaculty.js --apply            -> saves it (a backup of the old teachers is written first)
//   node scripts/reassignFaculty.js --undo             -> puts every class back to its old teacher
//   node scripts/reassignFaculty.js --apply --dept cse -> only one department (code from utils/departments.js)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const connectDB = require('../config/db');
const Timetable = require('../models/Timetable');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { DEPARTMENTS, DEPT_CODE } = require('../utils/departments');
const { planFacultyAssignment, verifyAssignment } = require('../utils/facultyAssigner');

const BACKUP = path.join(__dirname, '.facultyBackup.json');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const UNDO = args.includes('--undo');
const deptArg = args.includes('--dept') ? args[args.indexOf('--dept') + 1] : null;

(async () => {
  await connectDB();

  if (UNDO) {
    if (!fs.existsSync(BACKUP)) { console.log('Nothing to undo (no backup file found).'); process.exit(0); }
    const old = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    const ops = Object.entries(old).map(([id, faculty]) => ({ updateOne: { filter: { _id: id }, update: { $set: { faculty } } } }));
    for (let i = 0; i < ops.length; i += 20) await Timetable.bulkWrite(ops.slice(i, i + 20));
    fs.unlinkSync(BACKUP);
    console.log(`Restored the old teacher on ${ops.length} classes.`);
    process.exit(0);
  }

  const depts = DEPARTMENTS.filter((d) => !deptArg || DEPT_CODE[d] === deptArg);
  if (depts.length === 0) { console.log('Unknown department code:', deptArg); process.exit(1); }

  const backup = fs.existsSync(BACKUP) ? JSON.parse(fs.readFileSync(BACKUP, 'utf8')) : {};
  const allOps = [];
  const changedFaculty = new Set();
  let failures = 0;

  for (const dept of depts) {
    const faculty = await User.find({ role: 'faculty', department: dept }).select('name staffId').sort({ name: 1 }).lean();
    const entries = await Timetable.find({ department: dept }).lean();
    if (!entries.length || !faculty.length) { console.log(`\n${dept}: nothing to do (${entries.length} classes, ${faculty.length} faculty)`); continue; }

    const plan = planFacultyAssignment(entries, faculty);
    const problems = verifyAssignment(entries.filter((e) => plan.assignment.has(String(e._id))), plan.assignment);
    console.log(`\n${dept}`);
    console.log(`  ${entries.length} classes, ${plan.stats.units} class groups, ${faculty.length} faculty - each teaches ${plan.stats.minLoad}-${plan.stats.maxLoad} periods/week`);
    if (plan.unassigned.length) { console.log(`  ! ${plan.unassigned.length} class group(s) could not be given a free teacher and keep their old teacher:`, plan.unassigned.slice(0, 5).join(', ')); }
    if (problems.length) { failures++; console.log('  ! RULE CHECK FAILED:', problems.slice(0, 3)); continue; }
    console.log('  rule check passed: one section per semester per teacher, nobody double-booked');

    // show 3 sample teachers
    const byF = new Map();
    entries.forEach((e) => { const f = plan.assignment.get(String(e._id)); if (!f) return; if (!byF.has(f)) byF.set(f, new Map()); const k = `Sem ${e.semester} ${e.section}`; byF.get(f).set(k, (byF.get(f).get(k) || new Set()).add(e.subject)); });
    faculty.slice(0, 3).forEach((f) => { const m = byF.get(String(f._id)); if (m) console.log(`   ${f.name}: ` + [...m.entries()].map(([k, v]) => `${k} (${[...v].join(', ')})`).join(' | ')); });

    entries.forEach((e) => {
      const nf = plan.assignment.get(String(e._id));
      if (nf && nf !== String(e.faculty)) {
        if (!(String(e._id) in backup)) backup[String(e._id)] = String(e.faculty);
        allOps.push({ updateOne: { filter: { _id: e._id }, update: { $set: { faculty: nf } } } });
        changedFaculty.add(nf); changedFaculty.add(String(e.faculty));
      }
    });
  }

  console.log(`\n${allOps.length} class(es) would get a different teacher.`);
  if (failures) { console.log('Some departments failed the rule check - nothing was saved.'); process.exit(1); }
  if (!APPLY) { console.log('DRY RUN - nothing was changed. Run again with --apply to save.'); process.exit(0); }

  fs.writeFileSync(BACKUP, JSON.stringify(backup));
  for (let i = 0; i < allOps.length; i += 20) await Timetable.bulkWrite(allOps.slice(i, i + 20));
  console.log(`Saved. (Old teachers backed up in scripts/.facultyBackup.json - run with --undo to restore.)`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });