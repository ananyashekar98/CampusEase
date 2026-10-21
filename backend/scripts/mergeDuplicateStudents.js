// One-time cleanup for a specific generator bug: for every department, the
// Sem3 Section A roster was generated TWICE by two different code paths
// (one email pattern like "name.sem3aiml4@...", another like
// "name.sem3aimla4@...") — same person, same semester, same section, same
// USN prefix, just two separate logins. Confirmed by exporting all logins
// and seeing it repeat in every department (AIML, Civil, CSE, EEE, ECE,
// ISE, ME), always Sem 3 Section A.
//
// This is NOT the same as "a name happens to repeat in Sem1 and Sem3" —
// that's normal (different people, different USNs, different accounts) and
// must be left alone. The real bug signature is name + department +
// semester + section ALL matching exactly, which only happens when the
// same student was created twice by mistake.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Booking = require('../models/Booking');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected. Scanning for true duplicate student accounts (same name + department + semester + section)...\n');

  const students = await User.find({ role: 'student' }).sort({ createdAt: 1 });

  const groups = new Map(); // "name|department|semester|section" -> [students]
  students.forEach((s) => {
    const name = (s.name || '').trim().toLowerCase();
    const dept = (s.department || '').trim().toLowerCase();
    const sem = s.semester ?? '';
    const section = (s.section || '').trim().toLowerCase();
    if (!name || !dept || !section) return; // incomplete record — skip, don't guess
    const key = `${name}|${dept}|${sem}|${section}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  });

  let mergedGroups = 0;
  let deletedCount = 0;

  for (const [key, group] of groups.entries()) {
    if (group.length < 2) continue;
    mergedGroups += 1;

    const [keep, ...duplicates] = group; // oldest first, since we sorted by createdAt asc
    console.log(`"${keep.name}" — ${keep.department}, Sem ${keep.semester}, Sec ${keep.section}: ${group.length} accounts found, keeping ${keep.email} (USN ${keep.usn})`);

    for (const dup of duplicates) {
      const bookingsMoved = await Booking.updateMany(
        { requestedBy: dup._id },
        { $set: { requestedBy: keep._id } }
      );
      if (bookingsMoved.modifiedCount > 0) {
        console.log(`    moved ${bookingsMoved.modifiedCount} booking(s) from ${dup.email}`);
      }
      console.log(`    deleting duplicate: ${dup.email} (USN ${dup.usn})`);
      await dup.deleteOne();
      deletedCount += 1;
    }
  }

  console.log(`\nDone. ${mergedGroups} true duplicate group(s) merged, ${deletedCount} duplicate account(s) removed.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Merge duplicate students failed:', err);
  process.exit(1);
});