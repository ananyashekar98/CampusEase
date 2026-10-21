// Run this to see EXACTLY why a student's timetable differs from what
// admin/faculty see for the "same" group. Usage:
//
//   node scripts/debugStudentTimetable.js student@email.com
//
// It prints the student's raw department/semester/section fields (with
// their JS types), the exact DB filter the backend uses for that student,
// how many Timetable entries that filter matches, which days those
// entries fall on, and — most importantly — every department/section
// spelling that actually exists in the Timetable collection for that
// semester, so a silent mismatch (extra space, different casing, "CSE" vs
// the full department name, etc.) becomes visible instead of invisible.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Timetable = require('../models/Timetable');

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node scripts/debugStudentTimetable.js <student-email>');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB\n');

  const user = await User.findOne({ email });
  if (!user) {
    console.log(`No user found with email "${email}". Check the email is exactly right (copy-paste it).`);
    await mongoose.disconnect();
    return;
  }

  console.log('=== STUDENT RECORD ===');
  console.log(`name: ${user.name}`);
  console.log(`role: ${user.role}`);
  console.log(`department: "${user.department}"  (type: ${typeof user.department}, length: ${user.department?.length})`);
  console.log(`semester: ${JSON.stringify(user.semester)}  (type: ${typeof user.semester})`);
  console.log(`section: "${user.section}"  (type: ${typeof user.section}, length: ${user.section?.length})`);

  if (user.role !== 'student') {
    console.log('\n(Note: this user is not a student — the backend uses a different filter for faculty/admin.)');
  }

  // Exact filter the real backend controller builds for this student.
  const exactFilter = {
    department: user.department,
    semester: user.semester,
    section: user.section,
  };
  console.log('\n=== EXACT FILTER THE APP USES FOR THIS STUDENT ===');
  console.log(JSON.stringify(exactFilter));

  const exactMatches = await Timetable.find(exactFilter).sort({ day: 1, startTime: 1 });
  console.log(`\nMatches found: ${exactMatches.length}`);
  const daysFound = [...new Set(exactMatches.map((e) => e.day))];
  console.log(`Days present in those matches: ${daysFound.join(', ') || '(none)'}`);

  // Now show what's ACTUALLY in the Timetable collection for this semester,
  // so any mismatch in department/section spelling jumps out immediately.
  console.log('\n=== WHAT ACTUALLY EXISTS IN THE TIMETABLE FOR SEMESTER', user.semester, '===');
  const semesterEntries = await Timetable.find({ semester: user.semester });
  const combos = new Map(); // "department|section" -> { count, days:Set }
  semesterEntries.forEach((e) => {
    const key = `${JSON.stringify(e.department)}|${JSON.stringify(e.section)}`;
    if (!combos.has(key)) combos.set(key, { count: 0, days: new Set() });
    const c = combos.get(key);
    c.count += 1;
    c.days.add(e.day);
  });
  if (combos.size === 0) {
    console.log('  (No Timetable entries exist for this semester at all.)');
  } else {
    [...combos.entries()].forEach(([key, info]) => {
      const [dept, sec] = key.split('|');
      console.log(`  department=${dept}  section=${sec}  -> ${info.count} entries, days: ${[...info.days].sort().join(', ')}`);
    });
  }

  console.log('\n=== DIAGNOSIS ===');
  if (exactMatches.length === 0) {
    console.log('This student matched ZERO timetable entries with their own department/semester/section.');
    console.log('Compare the student\'s own fields (printed above, in quotes) character-by-character against');
    console.log('one of the department=/section= lines just above — the difference (extra space, different');
    console.log('capitalization, abbreviation vs full name) is the bug. Fix it by correcting the student\'s');
    console.log('department/section field in the DB to match exactly what the Timetable entries use.');
  } else if (!daysFound.includes('Saturday')) {
    const otherSatCombos = [...combos.entries()].filter(([, info]) => info.days.has('Saturday'));
    if (otherSatCombos.length > 0) {
      console.log('This student\'s exact group has NO Saturday entries, but other department/section combos');
      console.log('in the same semester DO have Saturday entries:');
      otherSatCombos.forEach(([key]) => {
        const [dept, sec] = key.split('|');
        console.log(`  -> department=${dept}  section=${sec}`);
      });
      console.log('\nCompare those to this student\'s own department/section above — that\'s almost certainly');
      console.log('a mismatch (e.g. student.department is slightly different text from the Timetable\'s');
      console.log('department field, even though the room/UI label looks the same).');
    } else {
      console.log('Nobody in this semester has a Saturday entry — Saturday classes genuinely were not');
      console.log('generated for this semester. That would mean the seed script needs to be re-run for');
      console.log('this semester, not a display bug.');
    }
  } else {
    console.log('This student DOES have Saturday entries in the database. If the app still isn\'t showing');
    console.log('them, the bug is purely in the frontend/caching, not the data — restart the frontend dev');
    console.log('server fully and hard-refresh the browser (Ctrl+Shift+R).');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});