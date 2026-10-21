// Run with: node scripts/mergeDuplicateFaculty.js  (from backend/)
//
// WHAT THIS FIXES: the Sem 1/3/5 seed scripts used to tag each teacher's
// email with the semester (lakshmi.naik.sem1me0@..., lakshmi.naik.sem3me0@...),
// so a name that was independently generated for more than one semester
// ended up with TWO (or more) separate logins — one that only ever showed
// that person's Sem 1 classes, another that only showed their Sem 3
// classes, neither matching what students in either semester actually see.
//
// This finds every group of faculty accounts sharing the exact same name,
// keeps the OLDEST one as the single real login, moves every Timetable
// entry and Booking reference from the newer duplicate(s) onto that kept
// account, then deletes the duplicate account(s). After this, that person
// has exactly one login — and it shows every class they teach, across
// every semester, in one place.
//
// buildRealisticSemester.js has also been fixed so this can't happen again
// on a future re-run (teacher emails no longer carry a semester tag), so
// this script is a one-time cleanup — safe to re-run, but after the first
// run it should report nothing left to merge.

require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');
const Timetable = require('../models/Timetable');
const Booking = require('../models/Booking');

async function run() {
  await connectDB();

  const faculty = await User.find({ role: 'faculty' }).sort({ createdAt: 1 });
  const byName = new Map();
  faculty.forEach((f) => {
    const key = f.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(f);
  });

  const duplicateGroups = [...byName.values()].filter((group) => group.length > 1);

  if (duplicateGroups.length === 0) {
    console.log('No duplicate faculty names found — nothing to merge.');
    process.exit(0);
  }

  console.log(`Found ${duplicateGroups.length} name(s) with duplicate logins. Merging...\n`);

  let mergedAccounts = 0;
  let movedTimetable = 0;
  let movedBookings = 0;

  for (const group of duplicateGroups) {
    // Oldest account (first created) is the one that survives.
    const [keep, ...duplicates] = group;
    console.log(`"${keep.name}" — keeping ${keep.email}, merging ${duplicates.length} duplicate(s):`);

    for (const dup of duplicates) {
      const [ttResult, bkReqResult, bkForResult] = await Promise.all([
        Timetable.updateMany({ faculty: dup._id }, { $set: { faculty: keep._id } }),
        Booking.updateMany({ requestedBy: dup._id }, { $set: { requestedBy: keep._id } }),
        Booking.updateMany({ forFaculty: dup._id }, { $set: { forFaculty: keep._id } }),
      ]);
      movedTimetable += ttResult.modifiedCount;
      movedBookings += bkReqResult.modifiedCount + bkForResult.modifiedCount;

      console.log(`    merged ${dup.email} — moved ${ttResult.modifiedCount} timetable entr${ttResult.modifiedCount === 1 ? 'y' : 'ies'}, ${bkReqResult.modifiedCount + bkForResult.modifiedCount} booking reference(s)`);

      await dup.deleteOne();
      mergedAccounts += 1;
    }
  }

  console.log(`\n=== DONE === ${mergedAccounts} duplicate login(s) removed across ${duplicateGroups.length} name(s).`);
  console.log(`Moved ${movedTimetable} timetable entries and ${movedBookings} booking references onto the surviving accounts.`);
  console.log('Every faculty member now has exactly one login that shows everything they teach.');

  process.exit(0);
}

run().catch((err) => {
  console.error('Merge duplicate faculty failed:', err);
  process.exit(1);
});