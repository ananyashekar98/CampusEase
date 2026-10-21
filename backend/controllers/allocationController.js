const Allocation = require('../models/Allocation');
const SubjectRequirement = require('../models/SubjectRequirement');
const Classroom = require('../models/Classroom');
const Timetable = require('../models/Timetable');
const { runAutoAllocator } = require('../utils/autoAllocator');
const { notifyUser, notifyStudentGroup } = require('../utils/notify');
const { getScopeDepartment } = require('../utils/scope');

// The timetable is a recurring weekly grid (Monday-Friday), not tied to a
// calendar date, so "when" a class falls means day-of-week + period time —
// that's what gets read out in notifications below.
const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatTime12h(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

// Turns a set of allocation entries into a readable, line-per-class
// breakdown: "Monday, 8:30 AM-9:30 AM: Data Structures - Room 101 (Sem 5-A)".
// This is what actually goes in the notification body, instead of a bare
// "your timetable changed" message that gives no way to tell what changed.
// Semester+section is included on every line (not just faculty ones) since a
// faculty member can teach several sections and the reader shouldn't have to
// guess which class a line belongs to.
function describeEntries(entries, { includeSubject = true } = {}) {
  const sorted = [...entries].sort((a, b) => {
    const dayDiff = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
    if (dayDiff !== 0) return dayDiff;
    return a.startTime.localeCompare(b.startTime);
  });
  return sorted
    .map((e) => {
      const time = `${formatTime12h(e.startTime)}-${formatTime12h(e.endTime)}`;
      const subjectPart = includeSubject ? `${e.subject} - ` : '';
      return `${e.day}, ${time}: ${subjectPart}${e.classroomName || 'Room TBD'} (Sem ${e.semester}-${e.section})`;
    })
    .join('\n');
}

// An allocation doesn't carry its own single "department" field (a global
// admin's run could technically span several), so ownership is derived from
// its entries — true once every entry belongs to the caller's department.
function isAllocationInScope(allocation, scope, userId) {
  if (!scope) return true; // global admin
  if (allocation.entries.length === 0) return String(allocation.createdBy) === String(userId);
  return allocation.entries.every((e) => e.department === scope);
}

// Unique "department|semester|section|subject" keys touched by a set of
// entries/requirements — this, not the whole semester+section, is the unit
// that gets cleared before new entries for it are written. Clearing the
// whole semester+section would delete every OTHER subject's classes too,
// which is exactly the bug this was rewritten to stop.
function subjectKeysOf(items) {
  return [...new Set(items.map((i) => `${i.department}|${i.semester}|${i.section}|${i.subject}`))];
}

async function deleteSubjectEntries(keys) {
  await Promise.all(
    keys.map((key) => {
      const [department, semester, section, subject] = key.split('|');
      return Timetable.deleteMany({ department, semester: Number(semester), section, subject });
    })
  );
}

function notifyForEntries(entries) {
  const entriesByFaculty = new Map();
  entries.forEach((e) => {
    const facultyId = String(e.faculty);
    if (!entriesByFaculty.has(facultyId)) entriesByFaculty.set(facultyId, []);
    entriesByFaculty.get(facultyId).push(e);
  });
  entriesByFaculty.forEach((facultyEntries, facultyId) => {
    notifyUser(facultyId, {
      title: 'Timetable updated',
      message: `Your new schedule:\n${describeEntries(facultyEntries)}`,
      type: 'timetable',
    });
  });

  const affectedGroups = [...new Set(entries.map((e) => `${e.department}|${e.semester}|${e.section}`))];
  affectedGroups.forEach((group) => {
    const [department, semester, section] = group.split('|');
    const groupEntries = entries.filter(
      (e) => e.department === department && String(e.semester) === semester && e.section === section
    );
    notifyStudentGroup(
      { department, semester: Number(semester), section },
      {
        title: 'Timetable updated',
        message: `Your Sem ${semester} ${section} schedule:\n${describeEntries(groupEntries)}`,
        type: 'timetable',
      }
    );
  });
}

// Writes a set of allocation entries straight into the live Timetable. The
// caller is responsible for having already cleared out whatever these
// entries are meant to replace (see deleteSubjectEntries above) — this
// function only inserts and notifies, it does NOT delete anything itself,
// so it can never wipe classes it wasn't asked to touch.
async function insertEntriesToTimetable(entries) {
  const docs = entries.map((e) => ({
    day: e.day,
    startTime: e.startTime,
    endTime: e.endTime,
    subject: e.subject,
    department: e.department,
    classroom: e.classroom,
    faculty: e.faculty,
    semester: e.semester,
    section: e.section,
  }));
  await Timetable.insertMany(docs);
  notifyForEntries(entries);
}

// @route  POST /api/allocations/run
// @access Private/Admin
// Runs the scheduling algorithm against current SubjectRequirements +
// Classrooms and saves the result as an Allocation.
//
// CRITICAL RULE: a subject requirement is only ever (re)scheduled when
// there's an actual reason to touch it — it's brand new (nothing on the live
// timetable for it yet) or its periodsPerWeek target was deliberately
// changed (edited via "Update Requirement"). If the live timetable already
// has exactly periodsPerWeek sessions for a subject, this run leaves it
// completely alone: not deleted, not recomputed, not reshuffled. It's simply
// treated as permanently-occupied background that the allocator must work
// around — same as any other already-live class.
//
// Without this check, EVERY run reprocessed EVERY requirement that has ever
// been added for the department (the "requirements" list isn't scoped to
// what's new), so adding one new subject and running the allocator would
// silently delete-and-rebuild every other subject too — and if any of their
// stored periodsPerWeek didn't exactly match what was actually seeded, their
// hour-counts would visibly change even though nobody touched them. That was
// the whole bug: hours must only ever change because of an explicit edit or
// a brand-new requirement, never as a side effect of scheduling something
// else.
const runAllocation = async (req, res) => {
  try {
    const scope = getScopeDepartment(req.user);
    const deptFilter = scope ? { department: scope } : {};
    const [requirements, classrooms] = await Promise.all([
      SubjectRequirement.find(deptFilter).populate({ path: 'faculty', select: 'name' }),
      Classroom.find(deptFilter),
    ]);

    if (requirements.length === 0) {
      return res.status(400).json({
        message: 'Add at least one subject requirement before running the allocator',
      });
    }
    if (classrooms.length === 0) {
      return res.status(400).json({ message: 'Add at least one classroom before running the allocator' });
    }

    // populate() turns a requirement's `faculty` into null if that user
    // account no longer exists (e.g. an admin later deleted the faculty
    // member). The allocator assumes every requirement's faculty is a real,
    // populated doc — left unguarded, one stale reference used to crash the
    // ENTIRE run (every department's requirements, not just the broken one)
    // the moment it tried to read req.faculty._id on null. Filter those out
    // up front and report them the same way any other unschedulable
    // requirement is reported, instead of failing the whole request.
    const validRequirements = [];
    const brokenUnscheduled = [];
    requirements.forEach((r) => {
      if (!r.faculty) {
        brokenUnscheduled.push({
          semester: r.semester,
          section: r.section,
          department: r.department,
          subject: r.subject,
          needed: r.periodsPerWeek,
          placed: 0,
          reason: 'Assigned faculty member no longer exists — edit this requirement to pick someone else',
        });
      } else {
        validRequirements.push(r);
      }
    });

    // How many sessions each (department, semester, section, subject) already
    // has live on the Timetable RIGHT NOW, before anything is touched. This
    // is the basis for deciding what actually needs scheduling.
    const allLiveEntries = await Timetable.find(deptFilter).select(
      'department semester section subject faculty classroom day startTime'
    );
    const liveCountByKey = new Map();
    allLiveEntries.forEach((e) => {
      const key = `${e.department}|${e.semester}|${e.section}|${e.subject}`;
      liveCountByKey.set(key, (liveCountByKey.get(key) || 0) + 1);
    });

    // Split into "needs (re)scheduling" vs "already correct, leave alone".
    // A requirement is only scheduled if it's new (zero live entries yet) or
    // its target no longer matches what's live (an explicit edit).
    const toSchedule = [];
    let untouchedCount = 0;
    validRequirements.forEach((r) => {
      const key = `${r.department}|${r.semester}|${r.section}|${r.subject}`;
      const liveCount = liveCountByKey.get(key) || 0;
      if (liveCount === r.periodsPerWeek) {
        untouchedCount += 1;
      } else {
        toSchedule.push(r);
      }
    });

    if (toSchedule.length === 0) {
      return res.status(200).json({
        allocation: null,
        message: `Nothing to do — all ${untouchedCount} subject requirement(s) already match the live timetable.`,
      });
    }

    // NOTHING is deleted yet. The subjects being rescheduled keep their
    // current live classes until we know the new placement actually
    // succeeded — deleting first meant that a run which couldn't place
    // everything (saved as a draft) had already wiped those subjects' live
    // classes with nothing put back, which is how a section's timetable
    // could end up empty.
    //
    // For the allocator's "already busy" picture, use the live timetable
    // MINUS the subjects being rescheduled (their old slots are about to be
    // replaced, so they must not block their own new placement). That's
    // filtered in memory — no database delete needed to compute it.
    const touchedKeys = subjectKeysOf(toSchedule);
    const touchedSet = new Set(touchedKeys);
    const existingEntries = allLiveEntries.filter(
      (e) => !touchedSet.has(`${e.department}|${e.semester}|${e.section}|${e.subject}`)
    );

    const { entries, unscheduled } = runAutoAllocator(toSchedule, classrooms, existingEntries);
    const allUnscheduled = [...brokenUnscheduled, ...unscheduled];
    // Everything placed with nothing left over — there's nothing for an
    // admin to review or decide between, so this goes straight onto the
    // live Timetable instead of sitting as an unapplied draft.
    const cleanRun = entries.length > 0 && allUnscheduled.length === 0;

    const allocation = await Allocation.create({
      name: req.body.name || `Allocation - ${new Date().toLocaleString()}`,
      createdBy: req.user._id,
      status: cleanRun ? 'applied' : 'draft',
      entries,
      unscheduled: allUnscheduled,
    });

    if (cleanRun) {
      // Only now — with a complete, clash-free placement in hand — are the
      // old classes for these subjects replaced by the new ones.
      await deleteSubjectEntries(touchedKeys);
      await insertEntriesToTimetable(entries);
    }
    // A draft leaves the live timetable completely untouched. Applying it
    // later (applyAllocation) replaces only the subjects it covers.

    return res.status(201).json({ allocation, skippedUnchanged: untouchedCount });
  } catch (err) {
    console.error('Run allocation error:', err);
    return res.status(500).json({ message: 'Server error running the auto-allocator' });
  }
};

// @route  GET /api/allocations
// @access Private/Admin
const listAllocations = async (req, res) => {
  try {
    const scope = getScopeDepartment(req.user);
    // Summary only — entries can be large, fetched in full via getAllocation.
    const allocations = await Allocation.find()
      .select('name status createdBy createdAt entries unscheduled')
      .sort({ createdAt: -1 });

    const inScope = allocations.filter((a) => isAllocationInScope(a, scope, req.user._id));

    const summarized = inScope.map((a) => ({
      _id: a._id,
      name: a.name,
      status: a.status,
      createdAt: a.createdAt,
      entryCount: a.entries.length,
      unscheduledCount: a.unscheduled.length,
    }));

    return res.status(200).json({ allocations: summarized });
  } catch (err) {
    console.error('List allocations error:', err);
    return res.status(500).json({ message: 'Server error fetching allocations' });
  }
};

// @route  GET /api/allocations/:id
// @access Private/Admin
const getAllocation = async (req, res) => {
  try {
    const allocation = await Allocation.findById(req.params.id);
    if (!allocation) {
      return res.status(404).json({ message: 'Allocation not found' });
    }
    if (!isAllocationInScope(allocation, getScopeDepartment(req.user), req.user._id)) {
      return res.status(403).json({ message: 'You can only view your own department\'s allocations' });
    }
    return res.status(200).json({ allocation });
  } catch (err) {
    console.error('Get allocation error:', err);
    return res.status(500).json({ message: 'Server error fetching allocation' });
  }
};

// @route  PUT /api/allocations/:id/apply
// @access Private/Admin
// Applies a saved draft allocation — same rule as above: only the
// (department, semester, section, subject) combinations this allocation's
// entries actually cover get cleared and replaced. Everything else on the
// live timetable, including other subjects for the same semester+section,
// is left exactly as it is.
const applyAllocation = async (req, res) => {
  try {
    const allocation = await Allocation.findById(req.params.id);
    if (!allocation) {
      return res.status(404).json({ message: 'Allocation not found' });
    }
    if (!isAllocationInScope(allocation, getScopeDepartment(req.user), req.user._id)) {
      return res.status(403).json({ message: 'You can only apply your own department\'s allocations' });
    }
    if (allocation.entries.length === 0) {
      return res.status(400).json({ message: 'This allocation has no scheduled entries to apply' });
    }

    const touchedKeys = subjectKeysOf(allocation.entries);
    await deleteSubjectEntries(touchedKeys);

    const docs = allocation.entries.map((e) => ({
      day: e.day,
      startTime: e.startTime,
      endTime: e.endTime,
      subject: e.subject,
      department: e.department,
      classroom: e.classroom,
      faculty: e.faculty,
      semester: e.semester,
      section: e.section,
    }));
    await Timetable.insertMany(docs);

    allocation.status = 'applied';
    await allocation.save();

    notifyForEntries(allocation.entries);

    return res.status(200).json({ allocation });
  } catch (err) {
    console.error('Apply allocation error:', err);
    return res.status(500).json({ message: 'Server error applying allocation' });
  }
};

// @route  DELETE /api/allocations/:id
// @access Private/Admin
const deleteAllocation = async (req, res) => {
  try {
    const allocation = await Allocation.findById(req.params.id);
    if (!allocation) {
      return res.status(404).json({ message: 'Allocation not found' });
    }
    if (!isAllocationInScope(allocation, getScopeDepartment(req.user), req.user._id)) {
      return res.status(403).json({ message: 'You can only manage your own department\'s allocations' });
    }
    await allocation.deleteOne();
    return res.status(200).json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete allocation error:', err);
    return res.status(500).json({ message: 'Server error deleting allocation' });
  }
};

module.exports = {
  runAllocation,
  listAllocations,
  getAllocation,
  applyAllocation,
  deleteAllocation,
};