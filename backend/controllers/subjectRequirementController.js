const SubjectRequirement = require('../models/SubjectRequirement');
const Timetable = require('../models/Timetable');
const User = require('../models/User');
const { getScopeDepartment, isAllowedDepartment } = require('../utils/scope');

const POPULATE = { path: 'faculty', select: 'name email department' };

// @route  GET /api/subject-requirements
// @access Private/Admin
const listRequirements = async (req, res) => {
  try {
    const scope = getScopeDepartment(req.user);
    const filter = scope ? { department: scope } : {};
    // Grouped, THEN alphabetical: Sem 1 Section A's subjects A-Z, then
    // Sem 1 Section B's A-Z, then Sem 2 Section A, and so on — matches how
    // every other list in the app orders students/faculty/subjects.
    const requirements = await SubjectRequirement.find(filter)
      .populate(POPULATE)
      .sort({ semester: 1, section: 1, subject: 1 });
    return res.status(200).json({ requirements });
  } catch (err) {
    console.error('List requirements error:', err);
    return res.status(500).json({ message: 'Server error fetching subject requirements' });
  }
};

// @route  GET /api/subject-requirements/available-subjects?department=&semester=&section=&roomType=
// @access Private/Admin
// The Subject field in "Add Requirement" used to be a free-typed/preset
// list with no connection to reality. This reads the REAL subjects for
// that department + semester straight off the Timetable (wherever it's
// already been seeded/built), so a Sem 5 ISE admin only ever sees Sem 5
// ISE's actual ~5-6 subjects — never some other semester's or department's.
// roomType=lab narrows it further to just the subjects that actually have
// a lab session (a Timetable entry in a classroom of type "lab") — a
// semester typically has 5-6 lecture subjects but only 2 of them also run
// as a lab. And once section is given, any subject that already has a
// requirement of this same roomType for that exact department+semester+
// section is left out, so the same thing can't be added twice.
const listAvailableSubjects = async (req, res) => {
  try {
    const { department, semester, section, roomType } = req.query;
    if (!department || !semester) {
      return res.status(200).json({ subjects: [] });
    }
    const scope = getScopeDepartment(req.user);
    if (scope && department !== scope) {
      return res.status(403).json({ message: 'You can only view subjects for your own department' });
    }

    const entries = await Timetable.find({ department, semester: Number(semester) })
      .select('subject classroom')
      .populate('classroom', 'type');

    const wantsLab = roomType === 'lab';
    const subjectSet = new Set();
    entries.forEach((entry) => {
      const isLab = entry.classroom?.type === 'lab';
      if (wantsLab ? isLab : !isLab) {
        subjectSet.add(entry.subject);
      }
    });

    let subjects = [...subjectSet].sort((a, b) => a.localeCompare(b));

    if (section) {
      const existing = await SubjectRequirement.find({
        department,
        semester: Number(semester),
        section: section.toUpperCase(),
        roomType: wantsLab ? 'lab' : 'lecture',
      }).select('subject');
      const taken = new Set(existing.map((r) => r.subject));
      subjects = subjects.filter((s) => !taken.has(s));
    }

    return res.status(200).json({ subjects });
  } catch (err) {
    console.error('List available subjects error:', err);
    return res.status(500).json({ message: 'Server error fetching available subjects' });
  }
};

// @route  POST /api/subject-requirements
// @access Private/Admin
const createRequirement = async (req, res) => {
  try {
    const { subject, faculty, semester, section, roomType, periodsPerWeek } = req.body;
    let { department } = req.body;

    const scope = getScopeDepartment(req.user);
    if (scope) department = scope; // department-scoped admin can only add for their own department

    if (!subject || !faculty || !semester || !section || !department || !periodsPerWeek) {
      return res.status(400).json({
        message: 'subject, faculty, semester, section, department and periodsPerWeek are all required',
      });
    }
    if (!isAllowedDepartment(req.user, department)) {
      return res.status(403).json({ message: 'You can only add requirements for your own department' });
    }

    // timetableController.js's createEntry already checks that a faculty
    // member picked for a class actually exists and belongs to an allowed
    // department — this endpoint never did, so a department-scoped admin
    // could assign a requirement to a faculty member from a completely
    // different department (or a nonexistent/mistyped id), silently
    // creating cross-department data that would also crash the allocator
    // later if the id didn't resolve to a real user.
    const facultyDoc = await User.findOne({ _id: faculty, role: 'faculty' });
    if (!facultyDoc) {
      return res.status(404).json({ message: 'Faculty member not found' });
    }
    if (!isAllowedDepartment(req.user, facultyDoc.department)) {
      return res.status(403).json({ message: 'That faculty member belongs to a different department' });
    }

    const requirement = await SubjectRequirement.create({
      subject,
      faculty,
      semester,
      section,
      department,
      roomType: roomType === 'lab' ? 'lab' : 'lecture',
      periodsPerWeek,
    });

    const populated = await requirement.populate(POPULATE);
    return res.status(201).json({ requirement: populated });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Create requirement error:', err);
    return res.status(500).json({ message: 'Server error creating subject requirement' });
  }
};

// @route  DELETE /api/subject-requirements/:id
// @access Private/Admin
const deleteRequirement = async (req, res) => {
  try {
    const requirement = await SubjectRequirement.findById(req.params.id);
    if (!requirement) {
      return res.status(404).json({ message: 'Subject requirement not found' });
    }
    if (!isAllowedDepartment(req.user, requirement.department)) {
      return res.status(403).json({ message: 'You can only manage your own department\'s requirements' });
    }
    await requirement.deleteOne();
    return res.status(200).json({ message: 'Deleted' });
  } catch (err) {
    console.error('Delete requirement error:', err);
    return res.status(500).json({ message: 'Server error deleting subject requirement' });
  }
};

// @route  PUT /api/subject-requirements/:id
// @access Private/Admin
const updateRequirement = async (req, res) => {
  try {
    const requirement = await SubjectRequirement.findById(req.params.id);
    if (!requirement) {
      return res.status(404).json({ message: 'Subject requirement not found' });
    }
    if (!isAllowedDepartment(req.user, requirement.department)) {
      return res.status(403).json({ message: 'You can only manage your own department\'s requirements' });
    }

    const { subject, faculty, semester, section, roomType, periodsPerWeek } = req.body;
    let { department } = req.body;

    const scope = getScopeDepartment(req.user);
    if (scope) department = scope; // department-scoped admin can't move a requirement to another department

    if (!subject || !faculty || !semester || !section || !department || !periodsPerWeek) {
      return res.status(400).json({
        message: 'subject, faculty, semester, section, department and periodsPerWeek are all required',
      });
    }
    if (!isAllowedDepartment(req.user, department)) {
      return res.status(403).json({ message: 'You can only move requirements within your own department' });
    }

    const facultyDoc = await User.findOne({ _id: faculty, role: 'faculty' });
    if (!facultyDoc) {
      return res.status(404).json({ message: 'Faculty member not found' });
    }
    if (!isAllowedDepartment(req.user, facultyDoc.department)) {
      return res.status(403).json({ message: 'That faculty member belongs to a different department' });
    }

    requirement.subject = subject;
    requirement.faculty = faculty;
    requirement.semester = semester;
    requirement.section = section;
    requirement.department = department;
    requirement.roomType = roomType === 'lab' ? 'lab' : 'lecture';
    requirement.periodsPerWeek = periodsPerWeek;
    await requirement.save();

    const populated = await requirement.populate(POPULATE);
    return res.status(200).json({ requirement: populated });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Update requirement error:', err);
    return res.status(500).json({ message: 'Server error updating subject requirement' });
  }
};

module.exports = { listRequirements, listAvailableSubjects, createRequirement, updateRequirement, deleteRequirement };