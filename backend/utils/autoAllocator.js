// Greedy clash-free scheduler: places each SubjectRequirement's weekly sessions
// into day/time/room slots such that no classroom, faculty member, or section
// is double-booked at the same time. Randomized slot order means re-running it
// can produce a different (still valid) layout.
//
// There are NO regular Saturday classes (Monday-Friday only). A faculty member
// who needs an extra Saturday session books it as a one-off via the Booking flow.
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// Real college day: 8:30-10:30 classes, 10:30-11:00 tea break, 11:00-1:00
// classes, 1:00-2:00 lunch, 2:00-4:00 classes, day winds up at 4:00.
const SLOTS = [
  { start: '08:30', end: '09:30' },
  { start: '09:30', end: '10:30' },
  { start: '11:00', end: '12:00' },
  { start: '12:00', end: '13:00' },
  { start: '14:00', end: '15:00' },
  { start: '15:00', end: '16:00' },
];

// Half days: no classes at or after this start time on these days.
// (Wednesday is a half day — classes end at 1:00 PM. Remove the entry to
// make Wednesday a full day again.)
const HALF_DAYS = { Wednesday: '13:00' };

const isAllowedSlot = (day, start) => !(HALF_DAYS[day] && start >= HALF_DAYS[day]);

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Cap on periods per faculty per day so gaps/free periods show up naturally.
const MAX_DAILY_PERIODS = 4;

/**
 * @param {Array} requirements - SubjectRequirement docs (faculty populated).
 * @param {Array} classrooms - Classroom docs
 * @param {Array} existingEntries - Timetable docs ALREADY live that this run
 *   must not clash with (department, semester, section, faculty id,
 *   classroom id, day, startTime).
 * @returns {{ entries: Array, unscheduled: Array }}
 */
function runAutoAllocator(requirements, classrooms, existingEntries = []) {
  const isLab = (c) => c.type === 'lab';

  // Busy trackers keyed by "Day|StartTime"
  const roomBusy = new Map();
  const facultyBusy = new Map();
  const sectionBusy = new Map();
  const facultyDayCount = new Map(); // `${facultyId}|${day}` -> periods that day
  const subjectDays = new Map(); // `${sectionKey}|${subject}|${day}` -> count

  const add = (map, key, val) => {
    const set = map.get(key) || new Set();
    set.add(val);
    map.set(key, set);
  };

  existingEntries.forEach((e) => {
    const key = `${e.day}|${e.startTime}`;
    const sectionKey = `${e.department}-${e.semester}-${e.section}`;
    const facultyId = String(e.faculty);
    add(roomBusy, key, String(e.classroom));
    add(facultyBusy, key, facultyId);
    add(sectionBusy, key, sectionKey);
    const dayKey = `${facultyId}|${e.day}`;
    facultyDayCount.set(dayKey, (facultyDayCount.get(dayKey) || 0) + 1);
    if (e.subject) {
      const sk = `${sectionKey}|${e.subject}|${e.day}`;
      subjectDays.set(sk, (subjectDays.get(sk) || 0) + 1);
    }
  });

  const entries = [];
  const unscheduled = [];

  const sortedRequirements = [...requirements].sort((a, b) => b.periodsPerWeek - a.periodsPerWeek);

  const allSlotCombos = [];
  DAYS.forEach((day) => SLOTS.forEach((slot) => {
    if (isAllowedSlot(day, slot.start)) allSlotCombos.push({ day, slot });
  }));

  for (const req of sortedRequirements) {
    // STRICT: a department's classes only ever use that department's own rooms.
    // Never borrow another department's room, even if none are free.
    const wantLab = req.roomType === 'lab';
    const pool = classrooms.filter(
      (c) => (wantLab ? isLab(c) : !isLab(c)) && c.department === req.department
    );
    const sectionKey = `${req.department}-${req.semester}-${req.section}`;
    const facultyId = String(req.faculty._id || req.faculty);
    const facultyName = req.faculty.name || 'Unknown Faculty';

    if (pool.length === 0) {
      unscheduled.push({
        semester: req.semester, section: req.section, department: req.department,
        subject: req.subject, needed: req.periodsPerWeek, placed: 0,
        reason: `No ${req.roomType} classrooms exist for ${req.department}`,
      });
      continue;
    }

    // Prefer a stable "home" room for the section: rooms the section already uses.
    const usedBySection = new Set(
      existingEntries
        .filter((e) => `${e.department}-${e.semester}-${e.section}` === sectionKey)
        .map((e) => String(e.classroom))
    );
    const orderedPool = [...pool].sort(
      (a, b) => Number(usedBySection.has(String(b._id))) - Number(usedBySection.has(String(a._id)))
    );

    let placed = 0;
    const shuffledCombos = shuffle(allSlotCombos);

    // Pass 1: daily cap + at most one session of this subject per day.
    // Pass 2: ignore the cap. Pass 3: also allow repeats on a day.
    // (Later passes only fill what's left, so nothing goes unscheduled needlessly.)
    for (const mode of ['strict', 'nocap', 'any']) {
      if (placed >= req.periodsPerWeek) break;

      for (const { day, slot } of shuffledCombos) {
        if (placed >= req.periodsPerWeek) break;
        const key = `${day}|${slot.start}`;
        const dayKey = `${facultyId}|${day}`;
        const subjKey = `${sectionKey}|${req.subject}|${day}`;

        if ((sectionBusy.get(key) || new Set()).has(sectionKey)) continue;
        if ((facultyBusy.get(key) || new Set()).has(facultyId)) continue;
        if (mode === 'strict' && (facultyDayCount.get(dayKey) || 0) >= MAX_DAILY_PERIODS) continue;
        if (mode !== 'any' && !wantLab && (subjectDays.get(subjKey) || 0) >= 1) continue;

        const roomSet = roomBusy.get(key) || new Set();
        const freeRoom = orderedPool.find((room) => !roomSet.has(String(room._id)));
        if (!freeRoom) continue;

        add(roomBusy, key, String(freeRoom._id));
        add(facultyBusy, key, facultyId);
        add(sectionBusy, key, sectionKey);
        facultyDayCount.set(dayKey, (facultyDayCount.get(dayKey) || 0) + 1);
        subjectDays.set(subjKey, (subjectDays.get(subjKey) || 0) + 1);

        entries.push({
          semester: req.semester,
          section: req.section,
          department: req.department,
          subject: req.subject,
          faculty: req.faculty._id || req.faculty,
          facultyName,
          classroom: freeRoom._id,
          classroomName: freeRoom.name,
          day,
          startTime: slot.start,
          endTime: slot.end,
        });
        placed += 1;
      }
    }

    if (placed < req.periodsPerWeek) {
      unscheduled.push({
        semester: req.semester, section: req.section, department: req.department,
        subject: req.subject, needed: req.periodsPerWeek, placed,
        reason: 'Ran out of clash-free slots — add more classrooms to this department or reduce periods/week',
      });
    }
  }

  return { entries, unscheduled };
}

module.exports = { runAutoAllocator, DAYS, SLOTS };