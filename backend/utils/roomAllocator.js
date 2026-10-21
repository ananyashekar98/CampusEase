// Pure room-allocation engine (no database access) used by the Auto Allocator.
//
// The timetable is the source of truth: this module never creates, removes or
// retimes a class. It only decides WHICH ROOM each existing timetable session
// should use, subject to hard constraints:
//   - the room belongs to the session's own department
//   - the room type fits (lab session -> lab room, otherwise lecture/seminar room)
//   - the room is big enough for the section (when capacity data exists)
//   - no two overlapping sessions share a room
//   - no overlap with an approved booking (or published date override)
// and soft preferences (keep a section in one room, smallest sufficient room,
// balanced use of rooms, stay in the current room).

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const toMin = (t) => {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
};
const overlaps = (a, b) => toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime);

const isoOf = (d) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const parseISODate = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
};
const weekdayOf = (iso) => WEEKDAYS[parseISODate(iso).getUTCDay()];

// Every calendar date from start to end (inclusive).
function expandDates(startISO, endISO) {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO);
  const out = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) out.push(isoOf(d));
  return out;
}

const idOf = (v) => (v && v._id ? String(v._id) : String(v));
const naturalCompare = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const isLabSubject = (s) => /\blab(oratory)?\b/i.test(String(s || ''));

/**
 * Turns timetable entries into allocation items.
 * entries: lean Timetable docs. In weekly/day mode one item per entry; in range
 * mode one item per (entry, date) where the date's weekday equals entry.day.
 */
function buildItems(entries, ctx) {
  const { roomById, strengthOf, dates, overrideRoomOf } = ctx;
  const items = [];
  const push = (e, date) => {
    const current = date && overrideRoomOf ? overrideRoomOf(String(e._id), date) || idOf(e.classroom) : idOf(e.classroom);
    const currentRoom = roomById.get(current);
    // 1) explicit classType on the timetable entry, 2) otherwise guess from the subject
    // name or the room it currently sits in (older entries have no classType yet).
    const requiredType = e.classType === 'lab' ? 'lab'
      : e.classType === 'theory' ? 'lecture'
      : (isLabSubject(e.subject) || (currentRoom && currentRoom.type === 'lab') ? 'lab' : 'lecture');
    const strength = strengthOf(e.department, e.semester, e.section);
    items.push({
      key: date ? `${e._id}|${date}` : String(e._id),
      entryId: String(e._id),
      date: date || null,
      day: e.day,
      startTime: e.startTime,
      endTime: e.endTime,
      department: e.department,
      semester: e.semester,
      section: e.section,
      subject: e.subject,
      faculty: idOf(e.faculty),
      facultyName: e.faculty && e.faculty.name ? e.faculty.name : '',
      currentRoom: current,
      currentRoomName: currentRoom ? currentRoom.name : '(missing room)',
      requiredType,
      strength,
      requiredCapacity: 0, // filled by the caller's min-capacity rule below
      proposedRoom: null,
      proposedRoomName: null,
      proposedCapacity: null,
      status: 'pending',
      reason: '',
    });
  };
  entries.forEach((e) => {
    if (dates) dates.forEach((d) => { if (weekdayOf(d) === e.day) push(e, d); });
    else push(e, null);
  });
  return items;
}

function applyCapacityRule(items, minCapacity) {
  items.forEach((it) => {
    it.requiredCapacity = Math.max(Number(minCapacity) || 0, it.strength || 0);
  });
}

/**
 * Builds the conflict checker for one run.
 * ctx.rooms:   Classroom docs (the allocatable pool)
 * ctx.blockers: timetable entries outside this run that occupy rooms {classroom, day, startTime, endTime, subject, section}
 * ctx.bookings: approved bookings {classroom, date, startTime, endTime, purpose}
 * ctx.overrides: published overrides {classroom, date, startTime, endTime}
 * ctx.mode: 'weekly' (items keyed by weekday) or 'range' (items keyed by date)
 */
function makeChecker(ctx) {
  const { blockers = [], bookings = [], overrides = [], mode } = ctx;
  const byRoom = (arr) => {
    const m = new Map();
    arr.forEach((x) => {
      const k = idOf(x.classroom);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    });
    return m;
  };
  const blockersByRoom = byRoom(blockers);
  const bookingsByRoom = byRoom(bookings);
  const overridesByRoom = byRoom(overrides);

  // Returns a human reason if (roomId) can't host `item`, ignoring other proposed items.
  function externalConflict(item, roomId) {
    for (const b of blockersByRoom.get(roomId) || []) {
      if (b.day === item.day && overlaps(b, item)) {
        return `Room already used by ${b.subject || 'another class'} (Sem ${b.semester || '?'} ${b.section || ''}) on ${b.day} ${b.startTime}-${b.endTime}`;
      }
    }
    const day = item.date ? weekdayOf(item.date) : item.day;
    for (const bk of bookingsByRoom.get(roomId) || []) {
      const matches = mode === 'range' ? bk.date === item.date : weekdayOf(bk.date) === day;
      if (matches && overlaps(bk, item)) {
        return `Approved booking "${bk.purpose || 'booking'}" on ${bk.date} ${bk.startTime}-${bk.endTime}`;
      }
    }
    for (const ov of overridesByRoom.get(roomId) || []) {
      if (item.entryId && String(ov.timetable) === String(item.entryId)) continue; // an item never blocks itself
      const matches = mode === 'range' ? ov.date === item.date : weekdayOf(ov.date) === day;
      if (matches && overlaps(ov, item)) {
        return `Room reserved by a published date override on ${ov.date}`;
      }
    }
    return null;
  }
  return { externalConflict };
}

const dayKeyOf = (item) => (item.date ? item.date : item.day);

function roomFits(room, item) {
  if (!room) return 'Room does not exist';
  if (room.department !== item.department) return `Room belongs to ${room.department}, not ${item.department}`;
  const isLab = room.type === 'lab';
  if (item.requiredType === 'lab' && !isLab) return 'Session needs a laboratory';
  if (item.requiredType !== 'lab' && isLab) return 'Lecture session cannot use a laboratory';
  if (item.requiredCapacity && room.capacity && room.capacity < item.requiredCapacity) {
    return `Room seats ${room.capacity} but ${item.requiredCapacity} are needed`;
  }
  return null;
}

/**
 * Allocates rooms.
 * @param items  from buildItems (+ applyCapacityRule)
 * @param ctx    { rooms, blockers, bookings, overrides, mode }
 * @param config { existing: 'preserve'|'recalculate', keepSameRoom, capacityMatch, balanceUtilization }
 * @param fixed  Map key -> roomId for assignments that must be kept as-is (re-run of unallocated only)
 */
function allocate(items, ctx, config = {}, fixed = new Map()) {
  const {
    existing = 'preserve',
    keepSameRoom = true,
    capacityMatch = true,
    balanceUtilization = false,
  } = config;
  const checker = makeChecker(ctx);
  const roomById = new Map(ctx.rooms.map((r) => [String(r._id), r]));

  // assigned: roomId -> [{ key, dayKey, startTime, endTime, locked }]
  const assigned = new Map();
  const usage = new Map();
  const sectionRooms = new Map(); // `${dept}|${sem}|${sec}|${type}` -> Map(roomId -> count)

  const sectionKeyOf = (it) => `${it.department}|${it.semester}|${it.section}|${it.requiredType}`;
  const place = (it, roomId, status, locked) => {
    if (!assigned.has(roomId)) assigned.set(roomId, []);
    assigned.get(roomId).push({ key: it.key, dayKey: dayKeyOf(it), startTime: it.startTime, endTime: it.endTime, locked });
    usage.set(roomId, (usage.get(roomId) || 0) + 1);
    const sk = sectionKeyOf(it);
    if (!sectionRooms.has(sk)) sectionRooms.set(sk, new Map());
    const m = sectionRooms.get(sk);
    m.set(roomId, (m.get(roomId) || 0) + 1);
    const room = roomById.get(roomId);
    it.proposedRoom = roomId;
    it.proposedRoomName = room.name;
    it.proposedCapacity = room.capacity || null;
    it.status = status;
    it.reason = '';
  };
  const unplace = (it) => {
    const list = assigned.get(it.proposedRoom) || [];
    assigned.set(it.proposedRoom, list.filter((a) => a.key !== it.key));
    usage.set(it.proposedRoom, (usage.get(it.proposedRoom) || 1) - 1);
    const m = sectionRooms.get(sectionKeyOf(it));
    if (m) m.set(it.proposedRoom, Math.max(0, (m.get(it.proposedRoom) || 1) - 1));
    it.proposedRoom = null;
    it.proposedRoomName = null;
    it.proposedCapacity = null;
    it.status = 'pending';
  };

  const internalConflict = (it, roomId, ignoreKey) =>
    (assigned.get(roomId) || []).find(
      (a) => a.key !== ignoreKey && a.dayKey === dayKeyOf(it) && overlaps(a, it)
    );

  const hardReason = (it, roomId) => {
    const room = roomById.get(roomId);
    return roomFits(room, it) || checker.externalConflict(it, roomId);
  };
  const isFree = (it, roomId) => !hardReason(it, roomId) && !internalConflict(it, roomId);

  const eligibleRooms = (it) => ctx.rooms.filter((r) => !roomFits(r, it));

  // Seed: sticky room for each section = the room most of its current sessions use.
  const currentCounts = new Map();
  items.forEach((it) => {
    const sk = sectionKeyOf(it);
    if (!currentCounts.has(sk)) currentCounts.set(sk, new Map());
    const m = currentCounts.get(sk);
    m.set(it.currentRoom, (m.get(it.currentRoom) || 0) + 1);
  });
  const stickyRoom = (it) => {
    const live = sectionRooms.get(sectionKeyOf(it));
    const pickTop = (m) => {
      let best = null;
      let bestN = 0;
      (m ? [...m.entries()] : []).forEach(([rid, n]) => { if (n > bestN) { best = rid; bestN = n; } });
      return best;
    };
    return pickTop(live) || pickTop(currentCounts.get(sectionKeyOf(it)));
  };

  // Phase 0: fixed assignments (re-run of unallocated only)
  const pending = [];
  items.forEach((it) => {
    const fixedRoom = fixed.get(it.key);
    if (fixedRoom && roomById.has(fixedRoom) && isFree(it, fixedRoom)) {
      place(it, fixedRoom, fixedRoom === it.currentRoom ? 'preserved' : 'changed', true);
    } else {
      pending.push(it);
    }
  });

  // Phase 1: keep existing valid allocations
  const needAlloc = [];
  const hadInvalidCurrent = new Set();
  pending.forEach((it) => {
    if (existing === 'preserve') {
      const why = hardReason(it, it.currentRoom);
      if (!why && !internalConflict(it, it.currentRoom)) {
        place(it, it.currentRoom, 'preserved', false);
        return;
      }
      hadInvalidCurrent.add(it.key);
    }
    needAlloc.push(it);
  });

  // Phase 2: most constrained first (fewest eligible rooms, then biggest need, labs first)
  const counts = new Map(needAlloc.map((it) => [it.key, eligibleRooms(it).length]));
  needAlloc.sort(
    (a, b) =>
      counts.get(a.key) - counts.get(b.key) ||
      b.requiredCapacity - a.requiredCapacity ||
      (a.requiredType === 'lab' ? -1 : 0) - (b.requiredType === 'lab' ? -1 : 0) ||
      naturalCompare(a.key, b.key)
  );

  // Sessions still waiting for a room sit in their current room until moved — avoid
  // taking that room from them when another room works just as well.
  const waitingByRoom = new Map();
  needAlloc.forEach((w) => {
    if (!waitingByRoom.has(w.currentRoom)) waitingByRoom.set(w.currentRoom, []);
    waitingByRoom.get(w.currentRoom).push(w);
  });
  const takesWaitersRoom = (it, rid) =>
    (waitingByRoom.get(rid) || []).some((w) => w.key !== it.key && !w.proposedRoom && dayKeyOf(w) === dayKeyOf(it) && overlaps(w, it));

  const score = (it, room) => {
    let s = 0;
    const rid = String(room._id);
    if (takesWaitersRoom(it, rid)) s += 500;
    if (keepSameRoom && stickyRoom(it) === rid) s -= 1000;
    if (rid === it.currentRoom) s -= 50;
    if (capacityMatch) s += (room.capacity || 0) - (it.requiredCapacity || 0);
    if (balanceUtilization) s += (usage.get(rid) || 0) * 10;
    return s;
  };

  const bestFree = (it, excludeRoom) => {
    const options = eligibleRooms(it).filter((r) => String(r._id) !== excludeRoom && isFree(it, String(r._id)));
    options.sort((a, b) => score(it, a) - score(it, b) || naturalCompare(a.name, b.name));
    return options[0] || null;
  };

  const explain = (it) => {
    const elig = eligibleRooms(it);
    const deptRooms = ctx.rooms.filter((r) => r.department === it.department);
    if (deptRooms.length === 0) return `${it.department} has no classrooms`;
    if (elig.length === 0) {
      const maxCap = Math.max(0, ...deptRooms.filter((r) => (r.type === 'lab') === (it.requiredType === 'lab')).map((r) => r.capacity || 0));
      const typed = deptRooms.filter((r) => (r.type === 'lab') === (it.requiredType === 'lab'));
      if (typed.length === 0) return `${it.department} has no ${it.requiredType === 'lab' ? 'laboratory' : 'lecture'} rooms`;
      return `No ${it.requiredType} room seats ${it.requiredCapacity} students (largest is ${maxCap})`;
    }
    let tt = 0;
    let bk = 0;
    let prop = 0;
    elig.forEach((r) => {
      const rid = String(r._id);
      if (internalConflict(it, rid)) prop += 1;
      else if (checker.externalConflict(it, rid)) {
        const why = checker.externalConflict(it, rid);
        if (why.startsWith('Room already used')) tt += 1;
        else bk += 1;
      }
    });
    return `All ${elig.length} suitable ${it.requiredType} room(s) are busy at ${it.date || it.day} ${it.startTime}-${it.endTime} (${tt} timetable, ${bk} bookings/overrides, ${prop} other proposed)`;
  };

  needAlloc.forEach((it) => {
    let room = bestFree(it, null);
    if (!room) {
      // One-step repair: move an already-placed, unlocked session elsewhere to free a suitable room.
      for (const r of eligibleRooms(it).sort((a, b) => score(it, a) - score(it, b))) {
        const rid = String(r._id);
        if (hardReason(it, rid)) continue; // blocked externally; moving others won't help
        const holders = (assigned.get(rid) || []).filter((a) => a.dayKey === dayKeyOf(it) && overlaps(a, it));
        if (holders.length !== 1 || holders[0].locked) continue;
        const holder = items.find((x) => x.key === holders[0].key);
        if (!holder || holder.status === 'preserved') continue;
        unplace(holder);
        const alt = bestFree(holder, rid);
        if (alt) {
          place(holder, String(alt._id), String(alt._id) === holder.currentRoom ? 'preserved' : 'changed', false);
          room = r;
          break;
        }
        place(holder, rid, rid === holder.currentRoom ? 'preserved' : 'changed', false); // restore
      }
    }
    if (room) {
      const rid = String(room._id);
      place(it, rid, rid === it.currentRoom ? 'preserved' : 'changed', false);
    } else {
      it.status = 'unallocated';
      it.reason = explain(it);
    }
  });

  // Final safety pass. A session left unallocated stays in its current room, so a session
  // that was MOVED into that room at an overlapping time would clash. Re-home such moves
  // (or, if nothing else fits, leave them where they were) until nothing clashes.
  for (let round = 0; round < 6; round += 1) {
    const stayIndex = new Map();
    items.forEach((x) => {
      if (x.proposedRoom) return;
      const k = `${x.currentRoom}|${dayKeyOf(x)}`;
      if (!stayIndex.has(k)) stayIndex.set(k, []);
      stayIndex.get(k).push(x);
    });
    const stayBlocked = (it, rid) =>
      (stayIndex.get(`${rid}|${dayKeyOf(it)}`) || []).some((x) => x.key !== it.key && overlaps(x, it));
    let changedAny = false;
    items.forEach((it) => {
      if (!it.proposedRoom || it.proposedRoom === it.currentRoom || it.status === 'preserved') return;
      const locked = (assigned.get(it.proposedRoom) || []).find((a) => a.key === it.key && a.locked);
      if (locked || !stayBlocked(it, it.proposedRoom)) return;
      unplace(it);
      const alt = eligibleRooms(it)
        .filter((r) => isFree(it, String(r._id)) && !stayBlocked(it, String(r._id)))
        .sort((a, b) => score(it, a) - score(it, b) || naturalCompare(a.name, b.name))[0];
      if (alt) {
        place(it, String(alt._id), String(alt._id) === it.currentRoom ? 'preserved' : 'changed', false);
      } else {
        it.status = 'unallocated';
        it.reason = `${explain(it)}; the only free rooms are still occupied by sessions that could not be moved`;
      }
      changedAny = true;
    });
    if (!changedAny) break;
  }

  items.forEach((it) => {
    it.hadInvalidCurrent = hadInvalidCurrent.has(it.key);
  });
  return items;
}

/**
 * Re-checks a complete proposal (client-supplied choices included) against the hard rules.
 * Returns Map key -> reason for every item whose proposed room is not valid.
 */
function validateAssignments(items, ctx) {
  const checker = makeChecker(ctx);
  const roomById = new Map(ctx.rooms.map((r) => [String(r._id), r]));
  const problems = new Map();
  const perRoom = new Map();
  items.forEach((it) => {
    if (!it.proposedRoom) {
      // A session left unallocated is NOT published, so it physically stays in its
      // current room. Track it as an occupant so nothing else is moved on top of it.
      const rid = it.currentRoom;
      if (!perRoom.has(rid)) perRoom.set(rid, []);
      perRoom.get(rid).push({ ...it, stay: true });
      return;
    }
    const rid = it.proposedRoom;
    const why = roomFits(roomById.get(rid), it) || checker.externalConflict(it, rid);
    if (why) problems.set(it.key, why);
    if (!perRoom.has(rid)) perRoom.set(rid, []);
    perRoom.get(rid).push(it);
  });
  perRoom.forEach((list) => {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        if (dayKeyOf(a) === dayKeyOf(b) && overlaps(a, b)) {
          // two sessions that both just stay where they already are is an existing clash,
          // reported elsewhere (existingIssues) — only NEW placements are blocked here
          if (a.stay && b.stay) continue;
          const msg = (o) => (o.stay
            ? `Room is still occupied by ${o.subject} (Sem ${o.semester} ${o.section}) at ${o.startTime}-${o.endTime}, which is not being moved`
            : `Same room is also proposed for ${o.subject} (Sem ${o.semester} ${o.section}) at ${o.startTime}-${o.endTime}`);
          // a session that is merely staying put next to a stay-in-place one is an existing
          // clash (not caused by this run); only sessions being MOVED there are blocked
          const blame = (x, other) => !x.stay && !(other.stay && x.proposedRoom === x.currentRoom);
          if (blame(a, b) && !problems.has(a.key)) problems.set(a.key, msg(b));
          if (blame(b, a) && !problems.has(b.key)) problems.set(b.key, msg(a));
        }
      }
    }
  });
  return problems;
}


/**
 * For every item, which suitable rooms are FREE at its time slot given the whole proposal
 * (other proposed sessions, sessions that stay put, outside timetable classes, bookings).
 * Used so the admin can see which rooms they may switch to. Rooms the item itself holds
 * count as free for that item.
 */
function freeRoomsFor(items, ctx) {
  const checker = makeChecker(ctx);
  const occupancy = new Map(); // `${room}|${dayKey}` -> [{ key, startTime, endTime }]
  items.forEach((it) => {
    const rid = it.proposedRoom || it.currentRoom;
    const k = `${rid}|${dayKeyOf(it)}`;
    if (!occupancy.has(k)) occupancy.set(k, []);
    occupancy.get(k).push(it);
  });
  const out = new Map();
  items.forEach((it) => {
    const free = [];
    ctx.rooms.forEach((room) => {
      if (roomFits(room, it)) return;
      const rid = String(room._id);
      const busyHere = (occupancy.get(`${rid}|${dayKeyOf(it)}`) || []).some((o) => o.key !== it.key && overlaps(o, it));
      if (busyHere) return;
      if (checker.externalConflict(it, rid)) return;
      free.push(rid);
    });
    out.set(it.key, free);
  });
  return out;
}

function summarize(items, problems = new Map()) {
  const s = {
    totalSessions: items.length,
    allocated: 0,
    preserved: 0,
    changed: 0,
    unallocated: 0,
    existingIssues: 0,
    conflicts: problems.size,
    manualIntervention: 0,
  };
  items.forEach((it) => {
    if (it.status === 'unallocated' || !it.proposedRoom) s.unallocated += 1;
    else {
      s.allocated += 1;
      if (it.proposedRoom === it.currentRoom) s.preserved += 1;
      else s.changed += 1;
    }
    if (it.hadInvalidCurrent) s.existingIssues += 1;
  });
  s.manualIntervention = s.unallocated + s.conflicts;
  return s;
}

module.exports = {
  WEEKDAYS,
  toMin,
  overlaps,
  parseISODate,
  weekdayOf,
  expandDates,
  buildItems,
  applyCapacityRule,
  allocate,
  validateAssignments,
  freeRoomsFor,
  summarize,
  roomFits,
  isLabSubject,
  makeChecker,
};