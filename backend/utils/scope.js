// Every account (student, faculty, and now admin) can optionally belong to
// one department. If it does, it only ever sees/manages that department's
// data — classrooms, faculty, students, timetable, bookings, staffrooms,
// subject requirements. An admin with NO department set (the original
// admin@campusease.edu) is the one "global" account that sees everything
// across every department.
function getScopeDepartment(user) {
  if (!user) return null;
  return user.department || null;
}

// Throws-style helper for routes that create/modify something tied to a
// department: a scoped user may only act within their own department; a
// global admin (no department) may act on any department.
function isAllowedDepartment(user, targetDepartment) {
  const scope = getScopeDepartment(user);
  if (!scope) return true; // global admin
  return scope === targetDepartment;
}

module.exports = { getScopeDepartment, isAllowedDepartment };
