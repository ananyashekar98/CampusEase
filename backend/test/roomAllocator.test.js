const test = require('node:test');
const assert = require('node:assert');
const R = require('../utils/roomAllocator');

const room = (id, dept, type = 'lecture', capacity = 60) => ({ _id: id, name: id, department: dept, type, capacity });
const entry = (id, o) => ({ _id: id, department: 'CSE', semester: 3, section: 'A', subject: 'DS', faculty: 'f1', day: 'Monday', startTime: '09:00', endTime: '10:00', classroom: 'CSE-1', ...o });

function run(entries, rooms, { blockers = [], bookings = [], overrides = [], mode = 'weekly', dates = null, strength = 40, config = {}, fixed } = {}) {
  const roomById = new Map(rooms.map((r) => [r._id, r]));
  const items = R.buildItems(entries, { roomById, strengthOf: () => strength, dates, overrideRoomOf: null });
  R.applyCapacityRule(items, 0);
  R.allocate(items, { rooms, blockers, bookings, overrides, mode }, config, fixed);
  return items;
}
const noOverlap = (items) => {
  const p = R.validateAssignments(items, { rooms: [], mode: 'weekly' });
  return p;
};

test('keeps valid existing allocation (preserve) and does not duplicate on re-run', () => {
  const rooms = [room('CSE-1', 'CSE'), room('CSE-2', 'CSE')];
  const entries = [entry('e1', {}), entry('e2', { day: 'Tuesday' })];
  const a = run(entries, rooms);
  assert.deepStrictEqual(a.map((i) => i.status), ['preserved', 'preserved']);
  const b = run(entries, rooms);
  assert.strictEqual(b.length, 2);
  assert.deepStrictEqual(b.map((i) => i.proposedRoom), a.map((i) => i.proposedRoom));
});

test('overlapping classes never share a room, even with different start/end times', () => {
  const rooms = [room('CSE-1', 'CSE'), room('CSE-2', 'CSE')];
  const entries = [
    entry('e1', { section: 'A', startTime: '09:00', endTime: '10:30', classroom: 'CSE-1' }),
    entry('e2', { section: 'B', startTime: '10:00', endTime: '11:00', classroom: 'CSE-1' }), // overlaps e1, same room
  ];
  const items = run(entries, rooms);
  assert.notStrictEqual(items[0].proposedRoom, items[1].proposedRoom);
  assert.strictEqual(items.filter((i) => i.status === 'unallocated').length, 0);
});

test('back-to-back classes (end == start) may share a room', () => {
  const rooms = [room('CSE-1', 'CSE')];
  const entries = [
    entry('e1', { startTime: '09:00', endTime: '10:00' }),
    entry('e2', { section: 'B', startTime: '10:00', endTime: '11:00' }),
  ];
  const items = run(entries, rooms);
  assert.deepStrictEqual(items.map((i) => i.proposedRoom), ['CSE-1', 'CSE-1']);
});

test('more sections than rooms: honest unallocated with reason', () => {
  const rooms = [room('CSE-1', 'CSE'), room('CSE-2', 'CSE')];
  const entries = ['A', 'B', 'C'].map((s, i) => entry(`e${i}`, { section: s, classroom: 'CSE-1' }));
  const items = run(entries, rooms);
  assert.strictEqual(items.filter((i) => i.status === 'unallocated').length, 1);
  const un = items.find((i) => i.status === 'unallocated');
  assert.match(un.reason, /busy/);
  assert.strictEqual(un.proposedRoom, null);
});

test('never uses another department\'s rooms', () => {
  const rooms = [room('CSE-1', 'CSE'), room('AIML-1', 'AIML')];
  const entries = [entry('e1', { classroom: 'CSE-1' }), entry('e2', { section: 'B', classroom: 'CSE-1' })];
  const items = run(entries, rooms);
  assert.ok(items.some((i) => i.status === 'unallocated'));
  assert.ok(items.every((i) => !i.proposedRoom || i.proposedRoom.startsWith('CSE')));
});

test('lab sessions only get labs, lectures never get labs', () => {
  const rooms = [room('CSE-1', 'CSE'), room('CSE-LAB-1', 'CSE', 'lab', 40)];
  const entries = [
    entry('e1', { subject: 'DS Lab', classroom: 'CSE-LAB-1' }),
    entry('e2', { subject: 'DS', day: 'Tuesday', classroom: 'CSE-1' }),
  ];
  const items = run(entries, rooms);
  assert.strictEqual(items[0].proposedRoom, 'CSE-LAB-1');
  assert.strictEqual(items[1].proposedRoom, 'CSE-1');
  // broken current: lecture sitting in a lab gets moved
  const bad = run([entry('e3', { classroom: 'CSE-LAB-1' })], rooms);
  assert.strictEqual(bad[0].requiredType, 'lab'); // current room is a lab so treated as lab session
});

test('capacity is enforced', () => {
  const rooms = [room('CSE-1', 'CSE', 'lecture', 30), room('CSE-2', 'CSE', 'lecture', 70)];
  const items = run([entry('e1', { classroom: 'CSE-1' })], rooms, { strength: 60 });
  assert.strictEqual(items[0].proposedRoom, 'CSE-2');
  assert.strictEqual(items[0].status, 'changed');
  const none = run([entry('e1', { classroom: 'CSE-1' })], [room('CSE-1', 'CSE', 'lecture', 30)], { strength: 60 });
  assert.strictEqual(none[0].status, 'unallocated');
  assert.match(none[0].reason, /seats 60/);
});

test('approved bookings block rooms (weekly: weekday match; range: exact date)', () => {
  const rooms = [room('CSE-1', 'CSE'), room('CSE-2', 'CSE')];
  const e = [entry('e1', { classroom: 'CSE-1' })];
  // 2026-10-19 is a Monday
  const bk = [{ classroom: 'CSE-1', date: '2026-10-19', startTime: '09:30', endTime: '10:30', purpose: 'Seminar' }];
  const weekly = run(e, rooms, { bookings: bk });
  assert.strictEqual(weekly[0].proposedRoom, 'CSE-2');
  const dates = R.expandDates('2026-10-19', '2026-10-25');
  const ranged = run(e, rooms, { bookings: bk, mode: 'range', dates });
  assert.strictEqual(ranged.length, 1);
  assert.strictEqual(ranged[0].date, '2026-10-19');
  assert.strictEqual(ranged[0].proposedRoom, 'CSE-2');
  // booking on a different date does not affect the range
  const other = run(e, rooms, { bookings: [{ ...bk[0], date: '2026-10-26' }], mode: 'range', dates });
  assert.strictEqual(other[0].proposedRoom, 'CSE-1');
});

test('out-of-scope timetable classes block rooms', () => {
  const rooms = [room('CSE-1', 'CSE'), room('CSE-2', 'CSE')];
  const blockers = [{ classroom: 'CSE-1', day: 'Monday', startTime: '09:00', endTime: '10:00', subject: 'Other', semester: 5, section: 'C' }];
  const items = run([entry('e1', { classroom: 'CSE-1' })], rooms, { blockers });
  assert.strictEqual(items[0].proposedRoom, 'CSE-2');
});

test('range mode: weekday expansion has no duplicates and skips weekends', () => {
  const dates = R.expandDates('2026-10-17', '2026-10-31'); // Sat..Sat
  const rooms = [room('CSE-1', 'CSE')];
  const items = run([entry('e1', {}), entry('e2', { day: 'Friday' })], rooms, { mode: 'range', dates });
  const mondays = ['2026-10-19', '2026-10-26'];
  assert.deepStrictEqual(items.filter((i) => i.entryId === 'e1').map((i) => i.date), mondays);
  assert.strictEqual(new Set(items.map((i) => i.key)).size, items.length);
});

test('recalculate fixes an invalid current allocation, preserve mode flags it', () => {
  const rooms = [room('CSE-1', 'CSE', 'lecture', 30), room('CSE-2', 'CSE', 'lecture', 70)];
  const e = [entry('e1', { classroom: 'CSE-1' })];
  const p = run(e, rooms, { strength: 60, config: { existing: 'preserve' } });
  assert.strictEqual(p[0].hadInvalidCurrent, true);
  assert.strictEqual(p[0].proposedRoom, 'CSE-2');
});

test('keep-same-room preference keeps a section in one room when it must reallocate', () => {
  const rooms = [room('CSE-1', 'CSE'), room('CSE-2', 'CSE'), room('CSE-3', 'CSE')];
  const entries = [
    entry('e1', { day: 'Monday', classroom: 'CSE-1' }),
    entry('e2', { day: 'Tuesday', classroom: 'CSE-1' }),
    entry('e3', { day: 'Wednesday', classroom: 'CSE-1' }),
  ];
  const items = run(entries, rooms, { config: { existing: 'recalculate', keepSameRoom: true } });
  assert.strictEqual(new Set(items.map((i) => i.proposedRoom)).size, 1);
});

test('repair step: a constrained session displaces a flexible one', () => {
  // 2 rooms; session X (any room) is placed first-ish; session Y needs big room only.
  const rooms = [room('CSE-1', 'CSE', 'lecture', 30), room('CSE-2', 'CSE', 'lecture', 80)];
  const entries = [entry('x', { section: 'A', classroom: 'CSE-2' }), entry('y', { section: 'B', classroom: 'CSE-2' })];
  const roomById = new Map(rooms.map((r) => [r._id, r]));
  const strengthOf = (d, s, sec) => (sec === 'B' ? 70 : 20);
  const items = R.buildItems(entries, { roomById, strengthOf, dates: null });
  R.applyCapacityRule(items, 0);
  R.allocate(items, { rooms, mode: 'weekly' }, { existing: 'recalculate' });
  assert.strictEqual(items.find((i) => i.key === 'y').proposedRoom, 'CSE-2');
  assert.strictEqual(items.find((i) => i.key === 'x').proposedRoom, 'CSE-1');
});

test('fixed assignments are kept when re-running only unallocated', () => {
  const rooms = [room('CSE-1', 'CSE'), room('CSE-2', 'CSE')];
  const entries = ['A', 'B'].map((s, i) => entry(`e${i}`, { section: s, classroom: 'CSE-1' }));
  const fixed = new Map([['e0', 'CSE-2']]);
  const items = run(entries, rooms, { fixed });
  assert.strictEqual(items[0].proposedRoom, 'CSE-2');
  assert.strictEqual(items[1].proposedRoom, 'CSE-1');
});

test('validateAssignments catches client-tampered double booking and wrong dept', () => {
  const rooms = [room('CSE-1', 'CSE'), room('AIML-1', 'AIML')];
  const roomById = new Map(rooms.map((r) => [r._id, r]));
  const items = R.buildItems([entry('a', { section: 'A' }), entry('b', { section: 'B' })], { roomById, strengthOf: () => 10, dates: null });
  R.applyCapacityRule(items, 0);
  items[0].proposedRoom = 'CSE-1';
  items[1].proposedRoom = 'CSE-1';
  let p = R.validateAssignments(items, { rooms, mode: 'weekly' });
  assert.strictEqual(p.size, 2);
  items[1].proposedRoom = 'AIML-1';
  p = R.validateAssignments(items, { rooms, mode: 'weekly' });
  assert.match(p.get('b'), /belongs to AIML/);
});

test('date range validation', () => {
  assert.strictEqual(R.parseISODate('2026-02-30'), null);
  assert.strictEqual(R.expandDates('2026-10-19', '2026-10-19').length, 1);
});

test('property test: random timetables never yield overlaps, wrong-dept/type rooms, or conflicts', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const days = ['Monday', 'Tuesday'];
  const slots = [['08:30', '09:30'], ['09:30', '10:30'], ['09:00', '10:00'], ['11:00', '12:00']];
  for (let iter = 0; iter < 300; iter += 1) {
    const depts = ['CSE', 'ISE'];
    const rooms = [];
    depts.forEach((d) => {
      const nl = 1 + Math.floor(rnd() * 4);
      for (let i = 0; i < nl; i += 1) rooms.push(room(`${d}-${i}`, d, 'lecture', 30 + Math.floor(rnd() * 50)));
      rooms.push(room(`${d}-LAB`, d, 'lab', 40));
    });
    const entries = [];
    const n = 3 + Math.floor(rnd() * 14);
    for (let i = 0; i < n; i += 1) {
      const d = depts[Math.floor(rnd() * 2)];
      const [s, e] = slots[Math.floor(rnd() * slots.length)];
      const lab = rnd() < 0.2;
      entries.push(entry(`e${i}`, {
        department: d, section: 'ABCDEF'[Math.floor(rnd() * 6)], subject: lab ? 'X Lab' : 'X',
        day: days[Math.floor(rnd() * 2)], startTime: s, endTime: e, classroom: lab ? `${d}-LAB` : `${d}-0`,
      }));
    }
    const roomById = new Map(rooms.map((r) => [r._id, r]));
    const items = R.buildItems(entries, { roomById, strengthOf: () => 20 + Math.floor(rnd() * 40), dates: null });
    R.applyCapacityRule(items, 0);
    const ctx = { rooms, mode: 'weekly' };
    R.allocate(items, ctx, { existing: rnd() < 0.5 ? 'preserve' : 'recalculate', keepSameRoom: rnd() < 0.5, balanceUtilization: rnd() < 0.5 });
    const problems = R.validateAssignments(items, ctx);
    assert.strictEqual(problems.size, 0, `iteration ${iter}: ${JSON.stringify([...problems])}`);
    items.forEach((it) => {
      if (!it.proposedRoom) return;
      const r = roomById.get(it.proposedRoom);
      assert.strictEqual(r.department, it.department);
      assert.strictEqual(r.type === 'lab', it.requiredType === 'lab');
    });
  }
});