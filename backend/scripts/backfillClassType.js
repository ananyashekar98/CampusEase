// Fills the new `classType` ('theory' | 'lab') on existing timetable classes so the
// Auto Allocator no longer has to guess from the subject name.
//
//   node scripts/backfillClassType.js           -> DRY RUN: shows what it would set, changes nothing
//   node scripts/backfillClassType.js --apply   -> saves it (only classes that have no classType yet)
//
// A class is set to 'lab' when its subject says Lab/Laboratory OR it sits in a lab room.
// Classes where those two disagree are listed as "CHECK THESE" so you can fix them by hand.
require('dotenv').config();
const connectDB = require('../config/db');
const Timetable = require('../models/Timetable');
const Classroom = require('../models/Classroom');

const APPLY = process.argv.includes('--apply');
const nameLab = (s) => /\blab(oratory)?\b/i.test(String(s || ''));

(async () => {
  await connectDB();
  const rooms = new Map((await Classroom.find().select('type').lean()).map((r) => [String(r._id), r.type]));
  const entries = await Timetable.find({ classType: { $exists: false } }).select('subject classroom department semester section').lean();
  const lab = [];
  const theory = [];
  const check = [];
  entries.forEach((e) => {
    const inLabRoom = rooms.get(String(e.classroom)) === 'lab';
    const byName = nameLab(e.subject);
    if (byName !== inLabRoom) check.push({ e, byName, inLabRoom });
    (byName || inLabRoom ? lab : theory).push(e._id);
  });
  console.log(`Classes without classType: ${entries.length}  ->  lab: ${lab.length}, theory: ${theory.length}`);
  if (check.length) {
    console.log(`\nCHECK THESE (${check.length}) - subject name and room type disagree:`);
    check.slice(0, 40).forEach(({ e, byName, inLabRoom }) =>
      console.log(`  ${e.department} Sem ${e.semester}-${e.section}  "${e.subject}"  name says ${byName ? 'LAB' : 'theory'}, room is ${inLabRoom ? 'a LAB' : 'a lecture room'}`));
  }
  if (!APPLY) {
    console.log('\nDry run only. Run again with --apply to save.');
    process.exit(0);
  }
  for (const [type, ids] of [['lab', lab], ['theory', theory]]) {
    for (let i = 0; i < ids.length; i += 20) {
      await Timetable.updateMany({ _id: { $in: ids.slice(i, i + 20) } }, { $set: { classType: type } });
    }
  }
  console.log('\nSaved.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });