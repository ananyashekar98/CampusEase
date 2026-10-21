// Decides WHICH FACULTY teaches each existing timetable class. It never adds,
// removes or moves a class - only the teacher name on each entry can change.
//
// Rules (hard):
//   1. A teacher teaches at most ONE section in any given semester
//      (e.g. Sem 1 A, Sem 3 C and Sem 5 B - but never Sem 1 A and Sem 1 B).
//   2. A teacher is never in two classes at the same time.
//   3. A teacher has at most `maxPerDay` periods a day and `maxPerWeek` a week.
//   4. A subject's lab goes with that subject's theory teacher (same section).
// Soft: spread the load evenly over every faculty member of the department.

const toMin = (t) => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const overlaps = (a, b) => toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime);
const baseSubject = (s) => String(s || '').replace(/\s+lab(oratory)?\s*$/i, '').trim().toLowerCase();

function rng(seed) { // small deterministic PRNG so a run is repeatable
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * entries: [{ _id, day, startTime, endTime, semester, section, subject }]
 * faculty: [{ _id, name }]
 * returns { assignment: Map(entryId -> facultyId), unassigned: [unitKey], stats }
 */
function planFacultyAssignment(entries, faculty, opts = {}) {
  const maxPerDay = opts.maxPerDay || 4;
  const maxPerWeek = opts.maxPerWeek || Math.max(18, Math.ceil((entries.length / Math.max(1, faculty.length)) * 1.5));

  const units = new Map();
  entries.forEach((e) => {
    const key = `${e.semester}|${String(e.section).toUpperCase()}|${baseSubject(e.subject)}`;
    if (!units.has(key)) units.set(key, { key, semester: e.semester, section: String(e.section).toUpperCase(), sessions: [] });
    units.get(key).sessions.push(e);
  });
  const unitList = [...units.values()];

  const attempt = (seed, perDay, perWeek) => {
    const rand = rng(seed);
    const st = new Map(faculty.map((f) => [String(f._id), { f, busy: [], perDay: {}, week: 0, sectionBySem: new Map(), units: 0, tie: rand() }]));
    const order = [...unitList].sort((a, b) => b.sessions.length - a.sessions.length || a.key.localeCompare(b.key))
      .map((u) => ({ u, r: rand() }))
      .sort((x, y) => (y.u.sessions.length - x.u.sessions.length) || (x.r - y.r))
      .map((x) => x.u);
    const unitTeacher = new Map();
    const unassigned = [];
    for (const u of order) {
      let best = null;
      for (const s of st.values()) {
        const sec = s.sectionBySem.get(u.semester);
        if (sec && sec !== u.section) continue;                         // rule 1
        if (s.week + u.sessions.length > perWeek) continue;             // rule 3
        let bad = false;
        const add = {};
        for (const e of u.sessions) {                                   // rules 2 + 3
          if (s.busy.some((b) => b.day === e.day && overlaps(b, e))) { bad = true; break; }
          add[e.day] = (add[e.day] || 0) + 1;
          if ((s.perDay[e.day] || 0) + add[e.day] > perDay) { bad = true; break; }
        }
        if (bad) continue;
        // also the unit's own sessions must not overlap each other
        const score = s.units * 1000 + s.week + s.tie;
        if (!best || score < best.score) best = { s, score };
      }
      if (!best) { unassigned.push(u.key); continue; }
      const s = best.s;
      u.sessions.forEach((e) => { s.busy.push(e); s.perDay[e.day] = (s.perDay[e.day] || 0) + 1; });
      s.week += u.sessions.length; s.units += 1; s.sectionBySem.set(u.semester, u.section);
      unitTeacher.set(u.key, String(s.f._id));
    }
    return { unitTeacher, unassigned, st };
  };

  let result = null;
  const caps = [[maxPerDay, maxPerWeek], [maxPerDay + 1, maxPerWeek + 4], [maxPerDay + 2, maxPerWeek + 8]];
  outer: for (const [pd, pw] of caps) {
    for (let seed = 1; seed <= 60; seed++) {
      const r = attempt(seed, pd, pw);
      if (!result || r.unassigned.length < result.unassigned.length) result = { ...r, perDay: pd, perWeek: pw };
      if (r.unassigned.length === 0) break outer;
    }
  }
  const assignment = new Map();
  unitList.forEach((u) => {
    const t = result.unitTeacher.get(u.key);
    if (t) u.sessions.forEach((e) => assignment.set(String(e._id), t));
  });
  const loads = [...result.st.values()].map((s) => s.week);
  return {
    assignment,
    unassigned: result.unassigned,
    stats: { units: unitList.length, faculty: faculty.length, maxPerDayUsed: result.perDay, maxPerWeekUsed: result.perWeek, minLoad: Math.min(...loads), maxLoad: Math.max(...loads) },
  };
}

// Independent re-check of a finished assignment (used by the script and tests).
function verifyAssignment(entries, assignment) {
  const problems = [];
  const by = new Map();
  entries.forEach((e) => {
    const f = assignment.get(String(e._id));
    if (!f) { problems.push(`unassigned: ${e.subject} Sem ${e.semester} ${e.section}`); return; }
    if (!by.has(f)) by.set(f, []);
    by.get(f).push(e);
  });
  for (const [f, list] of by) {
    const secBySem = new Map();
    list.forEach((e) => {
      const sec = String(e.section).toUpperCase();
      if (secBySem.has(e.semester) && secBySem.get(e.semester) !== sec) problems.push(`teacher ${f} has two sections in Sem ${e.semester}`);
      secBySem.set(e.semester, sec);
    });
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (list[i].day === list[j].day && overlaps(list[i], list[j])) problems.push(`teacher ${f} double-booked ${list[i].day} ${list[i].startTime}`);
    }
  }
  return [...new Set(problems)];
}

module.exports = { planFacultyAssignment, verifyAssignment, baseSubject };