const Classroom = require('../models/Classroom');
const { DEPARTMENTS, DEPT_CODE } = require('../utils/departments');

// A real department with 4 semesters x 3 sections = 12 sections doesn't
// have one room per section — it has a shared pool that every section's
// classes rotate through across the week, the same room serving a
// different section at a different hour. 12 lecture rooms + 3 labs is
// enough to comfortably cover every section's weekly schedule across
// Sem 1/3/5/7 without ever leaving a class unplaceable, while still being
// far fewer than 12 rooms-per-slot, so genuine sharing is required — at
// a popular hour, several sections really are competing for the same rooms.
const LECTURE_ROOMS_PER_DEPT = 12;
const LAB_ROOMS_PER_DEPT = 3;

// Single source of truth for classroom data — every other seed script
// should call this instead of creating its own ad-hoc room pool, so the
// whole app always sees the same department-owned rooms. Safe to re-run
// (find-or-create per room name) — existing rooms are kept, only missing
// ones (e.g. AIML-107 through AIML-112 the first time this runs after the
// pool size increased) are created.
async function ensureDepartmentClassrooms() {
  const byDept = {};
  const all = [];

  for (const department of DEPARTMENTS) {
    const code = DEPT_CODE[department].toUpperCase();
    const rooms = [];

    for (let i = 1; i <= LECTURE_ROOMS_PER_DEPT; i += 1) {
      const name = `${code}-${100 + i}`;
      let room = await Classroom.findOne({ name });
      if (!room) {
        room = await Classroom.create({
          name,
          department,
          building: `${code} Block`,
          floor: `${Math.ceil(i / 10)}${['st', 'nd', 'rd'][Math.ceil(i / 10) - 1] || 'th'} Floor`,
          capacity: 65,
          type: 'lecture',
        });
      } else if (room.department !== department) {
        room.department = department;
        await room.save();
      }
      rooms.push(room);
    }

    for (let i = 1; i <= LAB_ROOMS_PER_DEPT; i += 1) {
      const name = `${code}-LAB-${i}`;
      let room = await Classroom.findOne({ name });
      if (!room) {
        room = await Classroom.create({
          name,
          department,
          building: `${code} Block`,
          floor: 'Ground Floor',
          capacity: 40,
          type: 'lab',
        });
      } else if (room.department !== department) {
        room.department = department;
        await room.save();
      }
      rooms.push(room);
    }

    byDept[department] = rooms;
    all.push(...rooms);
  }

  return { all, byDept };
}

module.exports = { ensureDepartmentClassrooms, LECTURE_ROOMS_PER_DEPT, LAB_ROOMS_PER_DEPT };