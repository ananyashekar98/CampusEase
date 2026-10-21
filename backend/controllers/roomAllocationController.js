const mongoose = require('mongoose');
const Timetable = require('../models/Timetable');
const Classroom = require('../models/Classroom');
const Booking = require('../models/Booking');
const User = require('../models/User');
const RoomAllocationDraft = require('../models/RoomAllocationDraft');
const RoomOverride = require('../models/RoomOverride');
const { notifyUser, notifyStudentGroup } = require('../utils/notify');
const { getScopeDepartment } = require('../utils/scope');
const R = require('../utils/roomAllocator');
const { withLock } = require('../utils/allocationLock');

// Weekly allocations are checked against approved bookings this many days ahead
// (a recurring class can only clash with bookings that actually exist).
const BOOKING_HORIZON_DAYS = 60;
const MAX_RANGE_DAYS = 120;
const MAX_ITEMS = 6000;

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}
const bad = (msg, extra) => new HttpError(400, msg, extra);

function sendError(res, err, label) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ message: err.message, ...(err.extra || {}) });
  }
  console.error(`${label} error:`, err);
  return res.status(500).json({ message: `Server error: ${label}` });
}

// withLock comes from utils/allocationLock.js and is shared with booking creation/approval
// and timetable edits, so none of them can change room availability while a publish runs.

// Runs fn inside a MongoDB transaction when the deployment supports it (Atlas does);
// on a standalone server without transactions it falls back to the lock + re-check.
// Transactions only exist on replica sets / sharded clusters (MongoDB Atlas is one).
// A standalone server (local dev) has none, so there we just run without a session.
let txSupport = null;
async function supportsTransactions() {
  if (txSupport !== null) return txSupport;
  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    txSupport = !!(hello && (hello.setName || hello.msg === 'isdbgrid'));
  } catch (e) {
    txSupport = false;
  }
  return txSupport;
}

async function withTransaction(fn) {
  if (!(await supportsTransactions())) return fn(null);
  let session = null;
  try {
    session = await mongoose.startSession();
  } catch (e) {
    session = null;
  }
  if (!session) return fn(null);
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    session.endSession();
  }
}

const withSession = (query, session) => (session && query.session ? query.session(session) : query);

const todayISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const addDaysISO = (iso, n) => {
  const d = R.parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

// ---------------------------------------------------------------- config

function parseConfig(raw, user) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const scopeDept = getScopeDepartment(user);

  let department = typeof c.department === 'string' ? c.department.trim() : '';
  if (scopeDept) department = scopeDept; // department admins are locked to their own department
  if (!department) throw bad('Select a department (or "All departments") first.');
  if (department === 'ALL' && scopeDept) throw new HttpError(403, 'You can only allocate within your own department.');

  const semesters = Array.isArray(c.semesters) ? c.semesters.map(Number) : [];
  if (semesters.some((s) => !Number.isInteger(s) || s < 1 || s > 8)) throw bad('Semester must be a whole number from 1 to 8.');

  const sections = Array.isArray(c.sections)
    ? c.sections.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
    : [];
  if (sections.some((s) => !/^[A-Z0-9]{1,3}$/.test(s))) throw bad('Invalid section value.');

  const scope = ['weekly', 'day', 'range'].includes(c.scope) ? c.scope : 'weekly';
  const out = {
    department,
    semesters,
    sections,
    scope,
    roomKind: ['both', 'lecture', 'lab'].includes(c.roomKind) ? c.roomKind : 'both',
    minCapacity: Math.max(0, Number(c.minCapacity) || 0),
    existing: c.existing === 'recalculate' ? 'recalculate' : 'preserve',
    keepSameRoom: c.keepSameRoom !== false,
    capacityMatch: c.capacityMatch !== false,
    balanceUtilization: c.balanceUtilization === true,
  };
  if (!Number.isFinite(out.minCapacity) || out.minCapacity > 1000) throw bad('Minimum capacity is not valid.');

  if (scope === 'day') {
    if (!Timetable.DAYS.includes(c.day)) throw bad('Pick a valid day for Single-Day allocation.');
    out.day = c.day;
  }
  if (scope === 'range') {
    const s = R.parseISODate(c.startDate);
    const e = R.parseISODate(c.endDate);
    if (!s || !e) throw bad('Start and end dates must be valid dates (YYYY-MM-DD).');
    if (e < s) throw bad('End date cannot be before the start date.');
    if (c.endDate < todayISO()) throw bad('The date range is entirely in the past.');
    if (R.expandDates(c.startDate, c.endDate).length > MAX_RANGE_DAYS) {
      throw bad(`Date range is too long — choose at most ${MAX_RANGE_DAYS} days.`);
    }
    out.startDate = c.startDate;
    out.endDate = c.endDate;
  }
  return out;
}

// ---------------------------------------------------------------- context

async function loadContext(config, session = null) {
  const filter = {};
  if (config.department !== 'ALL') filter.department = config.department;
  if (config.semesters.length) filter.semester = { $in: config.semesters };
  if (config.sections.length) filter.section = { $in: config.sections };
  if (config.scope === 'day') filter.day = config.day;

  const entries = await withSession(
    Timetable.find(filter).populate('faculty', 'name').lean(),
    session
  );
  if (entries.length === 0) {
    throw bad('No timetable sessions found for this selection. Check the department, semester, sections and day.');
  }

  const deptNames = [...new Set(entries.map((e) => e.department))];
  const rooms = await withSession(Classroom.find({ department: { $in: deptNames } }).lean(), session);
  const roomIds = rooms.map((r) => r._id);
  const entryIds = entries.map((e) => e._id);

  // Everything else that already occupies these rooms (never touched by this run).
  const foreign = await withSession(
    Timetable.find({ classroom: { $in: roomIds }, _id: { $nin: entryIds } })
      .select('classroom day startTime endTime subject semester section')
      .lean(),
    session
  );

  const mode = config.scope === 'range' ? 'range' : 'weekly';
  const from = mode === 'range' ? config.startDate : todayISO();
  const to = mode === 'range' ? config.endDate : addDaysISO(todayISO(), BOOKING_HORIZON_DAYS);

  // Booking lifecycle in this app: pending / approved / rejected / cancelled.
  // Only APPROVED bookings occupy a room (pending ones are not confirmed yet).
  const bookings = await withSession(
    Booking.find({ classroom: { $in: roomIds }, status: 'approved', date: { $gte: from, $lte: to } })
      .select('classroom date startTime endTime purpose')
      .lean(),
    session
  );
  const allOverrides = await withSession(
    RoomOverride.find({ classroom: { $in: roomIds }, date: { $gte: from, $lte: to } }).lean(),
    session
  );

  const students = await withSession(
    User.find({ role: 'student', department: { $in: deptNames } }).select('department semester section').lean(),
    session
  );
  const strengthMap = new Map();
  students.forEach((s) => {
    const k = `${s.department}|${s.semester}|${s.section}`;
    strengthMap.set(k, (strengthMap.get(k) || 0) + 1);
  });

  const entryIdSet = new Set(entries.map((e) => String(e._id)));
  const overrideByEntryDate = new Map();
  allOverrides.forEach((o) => {
    if (entryIdSet.has(String(o.timetable))) overrideByEntryDate.set(`${o.timetable}|${o.date}`, String(o.classroom));
  });

  return {
    config,
    mode,
    entries,
    entryById: new Map(entries.map((e) => [String(e._id), e])),
    rooms,
    roomById: new Map(rooms.map((r) => [String(r._id), r])),
    foreign,
    bookings,
    // Date overrides that occupy rooms. In date-range mode the run's own overrides ARE the
    // items being allocated, so only other classes' overrides block. In weekly/day mode the
    // run's own overrides are not being changed, so they must block too (a class never blocks
    // itself - the checker skips an override that belongs to the item being placed).
    foreignOverrides: mode === 'range'
      ? allOverrides.filter((o) => !entryIdSet.has(String(o.timetable)))
      : allOverrides,
    strengthOf: (d, s, sec) => strengthMap.get(`${d}|${s}|${sec}`) || 0,
    overrideRoomOf: (entryId, date) => overrideByEntryDate.get(`${entryId}|${date}`) || null,
    dates: mode === 'range' ? R.expandDates(config.startDate, config.endDate) : null,
    bookingsCheckedThrough: to,
  };
}

// Builds items + (optionally) runs the allocator or applies explicit assignments.
function buildRun(ctx, { assignments = null, fixed = null } = {}) {
  const { config } = ctx;
  const all = R.buildItems(ctx.entries, ctx);
  R.applyCapacityRule(all, config.minCapacity);

  const wanted = (it) => config.roomKind === 'both' || it.requiredType === config.roomKind;
  const items = all.filter(wanted);
  if (items.length === 0) {
    throw bad(`No ${config.roomKind} sessions in this selection.`);
  }
  if (items.length > MAX_ITEMS) {
    throw bad(`That selection has ${items.length} sessions — narrow it down (fewer sections, one day, or a shorter range).`);
  }

  // Sessions filtered out by "room kind" still occupy their current rooms.
  const blockers = [...ctx.foreign];
  const seenEntries = new Set();
  all.filter((it) => !wanted(it)).forEach((it) => {
    if (seenEntries.has(it.entryId)) return;
    seenEntries.add(it.entryId);
    const e = ctx.entryById.get(it.entryId);
    blockers.push({
      classroom: e.classroom, day: e.day, startTime: e.startTime, endTime: e.endTime,
      subject: e.subject, semester: e.semester, section: e.section,
    });
  });

  const rctx = { rooms: ctx.rooms, blockers, bookings: ctx.bookings, overrides: ctx.foreignOverrides, mode: ctx.mode };

  const invalidRoom = new Map();
  if (assignments) {
    items.forEach((it) => {
      const room = assignments.get(it.key);
      const r = room ? ctx.roomById.get(String(room)) : null;
      if (room && !r) {
        it.proposedRoom = null;
        it.status = 'unallocated';
        invalidRoom.set(it.key, 'Room does not exist or belongs to another department');
      } else if (r) {
        it.proposedRoom = String(r._id);
        it.proposedRoomName = r.name;
        it.proposedCapacity = r.capacity || null;
        it.status = it.proposedRoom === it.currentRoom ? 'preserved' : 'changed';
      } else {
        it.status = 'unallocated';
        it.reason = 'No room chosen';
      }
    });
  } else {
    R.allocate(items, rctx, config, fixed || new Map());
  }

  const problems = R.validateAssignments(items, rctx);
  invalidRoom.forEach((reason, key) => problems.set(key, reason));
  // which rooms are free for each session (for the "Change room" picker); skipped for very large runs
  if (items.length <= 2500) {
    const free = R.freeRoomsFor(items, rctx);
    items.forEach((it) => { it.freeRooms = free.get(it.key) || []; });
  }
  problems.forEach((reason, key) => {
    const it = items.find((x) => x.key === key);
    if (it) { it.conflict = true; it.reason = reason; }
  });
  return { items, summary: R.summarize(items, problems), problems, rctx };
}

const toAssignmentMap = (arr) => {
  const m = new Map();
  if (Array.isArray(arr)) {
    arr.forEach((a) => {
      if (a && typeof a.key === 'string') m.set(a.key, a.room && mongoose.isValidObjectId(a.room) ? String(a.room) : null);
    });
  } else if (arr && typeof arr === 'object') {
    Object.entries(arr).forEach(([k, v]) => m.set(k, v && mongoose.isValidObjectId(v) ? String(v) : null));
  }
  return m;
};

const clientItems = (items) => items.map((it) => ({ ...it }));

const describeConfig = (config) => ({
  scope: config.scope,
  department: config.department,
  semesters: config.semesters,
  sections: config.sections,
  day: config.day || null,
  startDate: config.startDate || null,
  endDate: config.endDate || null,
});

// ---------------------------------------------------------------- endpoints

// GET /api/room-allocation/options
const getOptions = async (req, res) => {
  try {
    const scopeDept = getScopeDepartment(req.user);
    const dFilter = scopeDept ? { department: scopeDept } : {};
    const [entries, students, rooms] = await Promise.all([
      Timetable.find(dFilter).select('department semester section day').lean(),
      User.find({ role: 'student', ...dFilter }).select('department semester section').lean(),
      Classroom.find(dFilter).select('name department type capacity').lean(),
    ]);

    const tree = new Map();
    const ensure = (d, s, sec) => {
      if (!tree.has(d)) tree.set(d, new Map());
      const sm = tree.get(d);
      if (!sm.has(s)) sm.set(s, new Map());
      const secm = sm.get(s);
      if (!secm.has(sec)) secm.set(sec, { section: sec, sessions: 0, students: 0 });
      return secm.get(sec);
    };
    entries.forEach((e) => { ensure(e.department, e.semester, e.section).sessions += 1; });
    students.forEach((s) => { if (s.semester && s.section) ensure(s.department, s.semester, s.section).students += 1; });

    const departments = [...tree.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, sm]) => ({
        name,
        semesters: [...sm.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([semester, secm]) => ({
            semester,
            sections: [...secm.values()].sort((a, b) => a.section.localeCompare(b.section)),
          })),
      }));

    const days = Timetable.DAYS.filter((d) => entries.some((e) => e.day === d));
    return res.status(200).json({
      departments,
      days,
      rooms: rooms.map((r) => ({ _id: String(r._id), name: r.name, department: r.department, type: r.type, capacity: r.capacity || null })),
      scopedDepartment: scopeDept,
      limits: { bookingHorizonDays: BOOKING_HORIZON_DAYS, maxRangeDays: MAX_RANGE_DAYS },
      holidayCalendar: false, // this app has no holiday/non-teaching-day data; weekends are skipped
    });
  } catch (err) {
    return sendError(res, err, 'loading allocator options');
  }
};

// POST /api/room-allocation/preview   { config, fixed? }   (nothing is saved)
const preview = async (req, res) => {
  try {
    const config = parseConfig(req.body.config, req.user);
    const ctx = await loadContext(config);
    const fixed = req.body.fixed ? toAssignmentMap(req.body.fixed) : null;
    const { items, summary } = buildRun(ctx, { fixed });
    return res.status(200).json({
      items: clientItems(items),
      summary,
      meta: { ...describeConfig(config), bookingsCheckedThrough: ctx.bookingsCheckedThrough, config },
    });
  } catch (err) {
    return sendError(res, err, 'running the allocation');
  }
};

// POST /api/room-allocation/validate-change   { config, assignments, key, roomId }
const validateChange = async (req, res) => {
  try {
    const config = parseConfig(req.body.config, req.user);
    const { key, roomId } = req.body;
    if (typeof key !== 'string') throw bad('Missing session key.');
    if (!roomId || !mongoose.isValidObjectId(roomId)) throw bad('Pick a valid room.');
    const ctx = await loadContext(config);
    const assignments = toAssignmentMap(req.body.assignments);
    assignments.set(key, String(roomId));
    const { items, summary, problems } = buildRun(ctx, { assignments });
    const target = items.find((i) => i.key === key);
    if (!target) throw bad('That session is not part of the selected scope.');
    if (problems.has(key)) {
      return res.status(200).json({ ok: false, reason: problems.get(key) });
    }
    return res.status(200).json({ ok: true, items: clientItems(items), summary });
  } catch (err) {
    return sendError(res, err, 'checking the room change');
  }
};

// POST /api/room-allocation/drafts   { name, config, assignments }
const saveDraft = async (req, res) => {
  try {
    const config = parseConfig(req.body.config, req.user);
    const ctx = await loadContext(config);
    const assignments = toAssignmentMap(req.body.assignments);
    const { items, summary } = buildRun(ctx, { assignments });
    const name = String(req.body.name || '').trim() || `Allocation - ${new Date().toLocaleString()}`;
    const draft = await RoomAllocationDraft.create({
      name,
      createdBy: req.user._id,
      config,
      assignments: items.map((i) => ({ key: i.key, room: i.proposedRoom || null })),
      summary,
      status: 'draft',
    });
    return res.status(201).json({ draft: { _id: draft._id, name: draft.name, status: draft.status, summary } });
  } catch (err) {
    return sendError(res, err, 'saving the draft');
  }
};

const draftInScope = (draft, user) => {
  const scope = getScopeDepartment(user);
  if (!scope) return true;
  return draft.config && draft.config.department === scope;
};

const listDrafts = async (req, res) => {
  try {
    const drafts = await RoomAllocationDraft.find().sort({ createdAt: -1 }).limit(100).lean();
    const out = drafts.filter((d) => draftInScope(d, req.user)).map((d) => ({
      _id: d._id,
      name: d.name,
      status: d.status,
      createdAt: d.createdAt,
      publishedAt: d.publishedAt || null,
      summary: d.summary || null,
      config: d.config,
    }));
    return res.status(200).json({ drafts: out });
  } catch (err) {
    return sendError(res, err, 'loading drafts');
  }
};

const getDraft = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw bad('Invalid draft id.');
    const draft = await RoomAllocationDraft.findById(req.params.id).lean();
    if (!draft) throw new HttpError(404, 'Draft not found.');
    if (!draftInScope(draft, req.user)) throw new HttpError(403, 'You can only open your own department\'s drafts.');
    const config = parseConfig(draft.config, req.user);
    const ctx = await loadContext(config);
    const { items, summary } = buildRun(ctx, { assignments: toAssignmentMap(draft.assignments.map((a) => ({ key: a.key, room: a.room && String(a.room) }))) });
    return res.status(200).json({
      draft: { _id: draft._id, name: draft.name, status: draft.status },
      items: clientItems(items),
      summary,
      meta: { ...describeConfig(config), bookingsCheckedThrough: ctx.bookingsCheckedThrough, config },
    });
  } catch (err) {
    return sendError(res, err, 'opening the draft');
  }
};

const deleteDraft = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw bad('Invalid draft id.');
    const draft = await RoomAllocationDraft.findById(req.params.id);
    if (!draft) throw new HttpError(404, 'Draft not found.');
    if (!draftInScope(draft, req.user)) throw new HttpError(403, 'You can only delete your own department\'s drafts.');
    await draft.deleteOne();
    return res.status(200).json({ message: 'Deleted' });
  } catch (err) {
    return sendError(res, err, 'deleting the draft');
  }
};

const fmt = (it) =>
  `${it.date ? `${it.date} (${it.day})` : it.day} ${it.startTime}-${it.endTime}: ${it.subject} (Sem ${it.semester}-${it.section}) ${it.currentRoomName} → ${it.proposedRoomName}`;

function notifyChanges(changes) {
  const byFaculty = new Map();
  changes.forEach((it) => {
    if (!byFaculty.has(it.faculty)) byFaculty.set(it.faculty, []);
    byFaculty.get(it.faculty).push(it);
  });
  byFaculty.forEach((list, facultyId) => {
    notifyUser(facultyId, { title: 'Classroom changed', message: list.map(fmt).join('\n'), type: 'timetable' });
  });
  const groups = new Map();
  changes.forEach((it) => {
    const g = `${it.department}|${it.semester}|${it.section}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(it);
  });
  groups.forEach((list, g) => {
    const [department, semester, section] = g.split('|');
    notifyStudentGroup(
      { department, semester: Number(semester), section },
      { title: 'Classroom changed', message: `Your Sem ${semester} ${section} classes:\n${list.map(fmt).join('\n')}`, type: 'timetable' }
    );
  });
}

// Independent post-write check. It does not reuse the allocator: it re-reads the rows that were
// just saved and looks for any room used by two overlapping classes (and, in date-range mode,
// for an override that overlaps an approved booking). Only clashes that involve a class this
// publish touched are reported; clashes that already existed elsewhere are not this run's fault.
async function auditSavedState(ctx, publishable, session) {
  const touched = new Set(publishable.map((i) => i.entryId));
  const opts = session ? { session } : {};
  const clash = (a, b) => R.toMin(a.startTime) < R.toMin(b.endTime) && R.toMin(b.startTime) < R.toMin(a.endTime);
  const fail = (msg) => { throw new HttpError(409, `${msg} Nothing was saved - please re-run the allocation.`); };

  if (ctx.mode === 'weekly') {
    const roomIds = [...new Set(publishable.map((i) => i.proposedRoom))];
    if (!roomIds.length) return;
    const rows = await withSession(Timetable.find({ classroom: { $in: roomIds } }).select('classroom day startTime endTime subject section').lean(), session);
    const byKey = new Map();
    rows.forEach((r) => {
      const k = `${r.classroom}|${r.day}`;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(r);
    });
    byKey.forEach((list) => {
      for (let a = 0; a < list.length; a += 1) {
        for (let b = a + 1; b < list.length; b += 1) {
          if ((touched.has(String(list[a]._id)) || touched.has(String(list[b]._id))) && clash(list[a], list[b])) {
            fail(`Final check failed: ${list[a].subject} and ${list[b].subject} would be in the same room on ${list[a].day}.`);
          }
        }
      }
    });
    return;
  }

  // date-range mode
  const dates = [...new Set(publishable.map((i) => i.date))];
  const roomIds = [...new Set(publishable.map((i) => i.proposedRoom))];
  if (!dates.length || !roomIds.length) return;
  const overrides = await withSession(RoomOverride.find({ classroom: { $in: roomIds }, date: { $in: dates } }).lean(), session);
  const bookings = await withSession(Booking.find({ classroom: { $in: roomIds }, status: 'approved', date: { $in: dates } }).select('classroom date startTime endTime purpose').lean(), session);
  const byKey = new Map();
  overrides.forEach((o) => {
    const k = `${o.classroom}|${o.date}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(o);
  });
  byKey.forEach((list) => {
    for (let a = 0; a < list.length; a += 1) {
      for (let b = a + 1; b < list.length; b += 1) {
        if ((touched.has(String(list[a].timetable)) || touched.has(String(list[b].timetable))) && clash(list[a], list[b])) {
          fail(`Final check failed: two classes would share a room on ${list[a].date}.`);
        }
      }
    }
    list.forEach((o) => {
      if (!touched.has(String(o.timetable))) return;
      bookings.forEach((bk) => {
        if (String(bk.classroom) === String(o.classroom) && bk.date === o.date && clash(bk, o)) {
          fail(`Final check failed: a class overlaps the approved booking "${bk.purpose || 'booking'}" on ${o.date}.`);
        }
      });
    });
  });
}

// POST /api/room-allocation/publish   { config, assignments, draftId?, confirmChanges }
// Re-reads everything from the database, re-validates the WHOLE proposal against
// the live timetable + bookings, and only then writes — all inside one lock and
// (where supported) one transaction, so a failure leaves nothing half-saved.
const publish = async (req, res) => {
  try {
    const config = parseConfig(req.body.config, req.user);
    const requested = toAssignmentMap(req.body.assignments);
    if (requested.size === 0) throw bad('Nothing to publish — run the allocator first.');
    let draftId = null;
    if (req.body.draftId) {
      if (!mongoose.isValidObjectId(req.body.draftId)) throw bad('Invalid draft id.');
      draftId = req.body.draftId;
    }

    const result = await withLock(() =>
      withTransaction(async (session) => {
        const ctx = await loadContext(config, session);
        const { items, problems } = buildRun(ctx, { assignments: requested });

        if (problems.size > 0) {
          throw new HttpError(409, `${problems.size} session(s) no longer have a valid room (something changed since you ran the allocator). Re-run the allocation.`, {
            problems: [...problems.entries()].slice(0, 50).map(([key, reason]) => {
              const it = items.find((x) => x.key === key);
              return { key, subject: it && it.subject, section: it && it.section, reason };
            }),
          });
        }

        const publishable = items.filter((i) => i.proposedRoom);
        const skipped = items.length - publishable.length;
        const changes = publishable.filter((i) => i.proposedRoom !== i.currentRoom);
        if (changes.length > 0 && req.body.confirmChanges !== true) {
          throw bad(`This will change the room for ${changes.length} existing session(s). Confirm to continue.`, { needsConfirmation: true, changeCount: changes.length });
        }

        if (ctx.mode === 'weekly') {
          if (changes.length > 0) {
            const ops = changes.map((i) => ({
              updateOne: {
                // matching the current room makes this an optimistic check: if the entry was
                // edited meanwhile, it won't match and the whole publish is aborted
                filter: {
                  _id: i.entryId,
                  classroom: i.currentRoom,
                  day: i.day,
                  startTime: i.startTime,
                  endTime: i.endTime,
                },
                update: { $set: { classroom: i.proposedRoom } },
              },
            }));
            const r = await Timetable.bulkWrite(ops, session ? { session } : {});
            const matched = r.matchedCount !== undefined ? r.matchedCount : r.nMatched;
            if (matched !== ops.length) {
              throw new HttpError(409, 'The timetable changed while publishing. Nothing was saved — please re-run the allocation.');
            }
          }
        } else {
          const ops = [];
          publishable.forEach((i) => {
            const base = String(ctx.entryById.get(i.entryId).classroom);
            if (i.proposedRoom === base) {
              ops.push({ deleteOne: { filter: { timetable: i.entryId, date: i.date } } });
            } else {
              ops.push({
                updateOne: {
                  filter: { timetable: i.entryId, date: i.date },
                  update: {
                    $set: {
                      classroom: i.proposedRoom, department: i.department,
                      startTime: i.startTime, endTime: i.endTime, publishedBy: req.user._id,
                    },
                  },
                  upsert: true,
                },
              });
            }
          });
          if (ops.length) await RoomOverride.bulkWrite(ops, session ? { session } : {});
        }

        // Last line of defence: re-read what was just written (inside the same transaction)
        // and make sure it is clash-free. Throwing here rolls the whole publish back.
        await auditSavedState(ctx, publishable, session);

        if (draftId) {
          await RoomAllocationDraft.updateOne(
            { _id: draftId },
            { $set: { status: 'published', publishedBy: req.user._id, publishedAt: new Date() } },
            session ? { session } : {}
          );
        }
        return { changes, skipped, total: items.length, published: publishable.length, mode: ctx.mode };
      })
    );

    // The data is already saved and committed at this point. A notification problem must
    // never make the admin think the publish failed, so it is isolated and only logged.
    try {
      notifyChanges(result.changes);
    } catch (notifyErr) {
      console.error('Room-change notifications failed (the allocation itself was saved):', notifyErr.message);
    }
    return res.status(200).json({
      message: result.mode === 'range'
        ? 'Date-specific room assignments saved.'
        : 'Room allocation published to the timetable.',
      published: result.published,
      changed: result.changes.length,
      skippedUnallocated: result.skipped,
      total: result.total,
      mode: result.mode,
    });
  } catch (err) {
    return sendError(res, err, 'publishing the allocation');
  }
};

module.exports = {
  getOptions,
  preview,
  validateChange,
  saveDraft,
  listDrafts,
  getDraft,
  deleteDraft,
  publish,
  _internals: { parseConfig, loadContext, buildRun },
};