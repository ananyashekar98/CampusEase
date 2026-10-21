// READ-ONLY safety check. It never writes, updates or deletes anything.
//
//   node scripts/preflight.js
//
// Run it (1) before deploying the new files, (2) after running reassignFaculty / publishing
// an allocation. It prints PASS / WARN / FAIL lines and a final verdict. WARN = worth a look,
// FAIL = fix before the open day.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Timetable = require('../models/Timetable');
const Classroom = require('../models/Classroom');
const Booking = require('../models/Booking');
const RoomOverride = require('../models/RoomOverride');
const User = require('../models/User');

const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const overlap = (a, b) => toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime);
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

let fails = 0; let warns = 0;
const pass = (m) => console.log(`PASS  ${m}`);
const warn = (m) => { warns += 1; console.log(`WARN  ${m}`); };
const fail = (m) => { fails += 1; console.log(`FAIL  ${m}`); };
const check = (ok, good, bad, level = 'fail') => (ok ? pass(good) : (level === 'warn' ? warn(bad) : fail(bad)));

// pairs of overlapping entries that share a key (room / faculty / class group) on one day
function clashes(entries, keyOf) {
  const g = new Map();
  entries.forEach((e) => { const k = `${keyOf(e)}|${e.day}`; if (!g.has(k)) g.set(k, []); g.get(k).push(e); });
  const out = [];
  g.forEach((list) => {
    for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) if (overlap(list[i], list[j])) out.push([list[i], list[j]]);
  });
  return out;
}

(async () => {
  await connectDB();
  console.log('--- CampusEase preflight (read-only) ---');

  // 1. database
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  const tx = !!(hello.setName || hello.msg === 'isdbgrid');
  console.log(`Database host: ${mongoose.connection.host}`);
  check(tx, 'Database supports transactions (publish is all-or-nothing)', 'No transactions on this database - publish falls back to the lock + re-check only', 'warn');

  const [entries, rooms, users, overrides] = await Promise.all([
    Timetable.find().lean(), Classroom.find().lean(), User.find().select('role department').lean(), RoomOverride.find().lean(),
  ]);
  const byRole = users.reduce((m, u) => ({ ...m, [u.role]: (m[u.role] || 0) + 1 }), {});
  console.log(`Counts: ${entries.length} timetable classes, ${rooms.length} rooms, ${overrides.length} date overrides, users ${JSON.stringify(byRole)}`);
  check(entries.length > 0, 'Timetable has classes', 'Timetable is EMPTY');
  const roomById = new Map(rooms.map((r) => [String(r._id), r]));

  // 2. timetable integrity
  const missingRoom = entries.filter((e) => !roomById.has(String(e.classroom)));
  check(missingRoom.length === 0, 'Every class points to an existing room', `${missingRoom.length} class(es) point to a room that does not exist`);
  const crossDept = entries.filter((e) => roomById.has(String(e.classroom)) && roomById.get(String(e.classroom)).department !== e.department);
  check(crossDept.length === 0, 'No class uses another department\'s room', `${crossDept.length} class(es) are in another department's room`);
  const roomClash = clashes(entries, (e) => String(e.classroom));
  check(roomClash.length === 0, 'No room is double-booked', `${roomClash.length} room double-booking(s), e.g. ${roomClash[0] && `${roomClash[0][0].subject} vs ${roomClash[0][1].subject} on ${roomClash[0][0].day}`}`);
  const facClash = clashes(entries, (e) => String(e.faculty));
  check(facClash.length === 0, 'No faculty member is teaching two classes at once', `${facClash.length} faculty clash(es)`);
  const grpClash = clashes(entries, (e) => `${e.department}|${e.semester}|${e.section}`);
  check(grpClash.length === 0, 'No class group (dept/sem/section) has two classes at once', `${grpClash.length} class-group clash(es)`);
  const labMismatch = entries.filter((e) => {
    const r = roomById.get(String(e.classroom)); if (!r) return false;
    const wantsLab = e.classType ? e.classType === 'lab' : /\blab(oratory)?\b/i.test(e.subject);
    return wantsLab !== (r.type === 'lab');
  });
  check(labMismatch.length === 0, 'Every lab is in a lab room and every lecture in a lecture room', `${labMismatch.length} class(es) have the wrong room type (e.g. "${labMismatch[0] && labMismatch[0].subject}")`, 'warn');
  const noType = entries.filter((e) => !e.classType).length;
  check(noType === 0, 'Every class has an explicit classType', `${noType} class(es) have no classType yet - run: node scripts/backfillClassType.js --apply`, 'warn');

  // 3. faculty
  const facById = new Map(users.filter((u) => u.role === 'faculty').map((u) => [String(u._id), u]));
  const otherDept = entries.filter((e) => facById.has(String(e.faculty)) && facById.get(String(e.faculty)).department !== e.department);
  check(otherDept.length === 0, 'Every class is taught by faculty of its own department', `${otherDept.length} class(es) have a teacher from another department`, 'warn');
  const noFac = entries.filter((e) => !facById.has(String(e.faculty)));
  check(noFac.length === 0, 'Every class has an existing faculty member', `${noFac.length} class(es) point to a missing faculty account`);
  const perSem = new Map();
  entries.forEach((e) => {
    const k = `${e.faculty}|${e.semester}`; if (!perSem.has(k)) perSem.set(k, new Set()); perSem.get(k).add(`${e.department}|${e.section}`);
  });
  const multi = [...perSem.values()].filter((s) => s.size > 1).length;
  check(multi === 0, 'Every teacher has only ONE section per semester', `${multi} teacher/semester pair(s) still teach 2+ sections - run: node scripts/reassignFaculty.js`, 'warn');

  // 4. overrides
  const entryIds = new Set(entries.map((e) => String(e._id)));
  const orphan = overrides.filter((o) => !entryIds.has(String(o.timetable)) || !roomById.has(String(o.classroom)));
  check(orphan.length === 0, 'Every date override points to a real class and room', `${orphan.length} orphan override(s)`, 'warn');
  const seen = new Set(); let dup = 0;
  overrides.forEach((o) => { const k = `${o.timetable}|${o.date}`; if (seen.has(k)) dup += 1; seen.add(k); });
  check(dup === 0, 'No duplicate date overrides', `${dup} duplicate override(s)`);
  const ovByRoomDate = new Map();
  overrides.forEach((o) => { const k = `${o.classroom}|${o.date}`; if (!ovByRoomDate.has(k)) ovByRoomDate.set(k, []); ovByRoomDate.get(k).push({ ...o, day: 'x' }); });
  let ovClash = 0;
  ovByRoomDate.forEach((l) => { for (let i = 0; i < l.length; i += 1) for (let j = i + 1; j < l.length; j += 1) if (overlap(l[i], l[j])) ovClash += 1; });
  check(ovClash === 0, 'No two overrides share a room at the same time', `${ovClash} override clash(es)`);
  const idx = await RoomOverride.collection.indexes();
  check(idx.some((i) => i.unique && i.key && i.key.timetable === 1 && i.key.date === 1), 'Unique index (class + date) exists on room overrides', 'Unique override index is missing - restart the backend once so it is created', 'warn');

  // 5. approved bookings vs classes (next 60 days)
  const today = new Date(); const from = isoOf(today);
  const to = isoOf(new Date(today.getTime() + 60 * 86400000));
  const bookings = await Booking.find({ status: 'approved', date: { $gte: from, $lte: to } }).select('classroom date startTime endTime purpose').lean();
  const overridden = new Set(overrides.map((o) => `${o.timetable}|${o.date}`));
  const byRoomDay = new Map();
  entries.forEach((e) => { const k = `${e.classroom}|${e.day}`; if (!byRoomDay.has(k)) byRoomDay.set(k, []); byRoomDay.get(k).push(e); });
  let bkClash = 0; let sample = null;
  bookings.forEach((b) => {
    const day = WD[new Date(`${b.date}T00:00:00Z`).getUTCDay()];
    (byRoomDay.get(`${b.classroom}|${day}`) || []).forEach((e) => {
      if (!overridden.has(`${e._id}|${b.date}`) && overlap(b, e)) { bkClash += 1; sample = sample || `"${b.purpose}" on ${b.date} vs ${e.subject}`; }
    });
  });
  check(bkClash === 0, `No approved booking (next 60 days, ${bookings.length} found) overlaps a class`, `${bkClash} approved booking(s) overlap a class, e.g. ${sample}`);

  console.log('---');
  console.log(fails ? `RESULT: ${fails} FAIL, ${warns} WARN - fix the FAIL lines before the open day.` : warns ? `RESULT: no failures, ${warns} warning(s) - read the WARN lines.` : 'RESULT: all checks passed.');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('preflight crashed:', e.message); process.exit(2); });