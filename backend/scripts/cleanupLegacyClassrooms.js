// Run with: node scripts/cleanupLegacyClassrooms.js  (from backend/)
//
// WHAT THIS CLEANS UP: the old version of buildRealisticSemester.js created
// its own one-off classrooms named like "Sem1-AIML-A", "Sem3-ME-LAB", even
// bare "Sem3-ME" — a completely separate, nonsense-named set of rooms that
// had nothing to do with the real numbered pool (AIML-101, ME-102,
// ME-LAB-1, ...). That script has since been fixed to use the real pool
// instead, but fixing the script doesn't erase rooms it already created —
// they just sit in the database as dead clutter, which is why they were
// still showing up in the Book Classroom room picker.
//
// This deletes every classroom whose name matches that old "SemN-..."
// pattern — but ONLY if nothing in the Timetable still points to it, as a
// safety check. If you still see some left behind after running this, it
// means a Timetable entry is still using one — re-run seedRealisticSem1.js /
// Sem3.js / Sem5.js first (they rebuild every entry onto the real numbered
// rooms), then run this again.
//
// Safe to re-run: once the junk is gone, running it again does nothing.

require('dotenv').config();
const connectDB = require('../config/db');
const Classroom = require('../models/Classroom');
const Timetable = require('../models/Timetable');
const Booking = require('../models/Booking');

const LEGACY_NAME_PATTERN = /^Sem\d+-/i;

async function run() {
  await connectDB();

  const legacyRooms = await Classroom.find({ name: LEGACY_NAME_PATTERN });
  if (legacyRooms.length === 0) {
    console.log('No legacy "SemN-..." classrooms found — nothing to clean up.');
    process.exit(0);
  }

  console.log(`Found ${legacyRooms.length} legacy classroom(s). Checking for references before deleting...\n`);

  let deleted = 0;
  let skipped = 0;

  for (const room of legacyRooms) {
    const [timetableCount, bookingCount] = await Promise.all([
      Timetable.countDocuments({ classroom: room._id }),
      Booking.countDocuments({ classroom: room._id }),
    ]);

    if (timetableCount > 0 || bookingCount > 0) {
      console.log(`  SKIPPED ${room.name} — still used by ${timetableCount} timetable entr${timetableCount === 1 ? 'y' : 'ies'} and ${bookingCount} booking(s). Re-run the Sem 1/3/5 seed scripts first, then run this again.`);
      skipped += 1;
      continue;
    }

    await room.deleteOne();
    console.log(`  Deleted ${room.name}`);
    deleted += 1;
  }

  console.log(`\n=== DONE === ${deleted} legacy classroom(s) deleted, ${skipped} skipped (still in use).`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Cleanup legacy classrooms failed:', err);
  process.exit(1);
});