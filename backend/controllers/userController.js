const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const Timetable = require('../models/Timetable');
const { toMinutes, getNow } = require('../utils/time');
const { getScopeDepartment, isAllowedDepartment } = require('../utils/scope');

// @route  GET /api/users?role=faculty
// @access Private/Admin
// Used to populate faculty pickers in admin forms (timetable, allocator).
// A department-scoped admin only ever sees their own department's people;
// a global admin (no department on their own account) sees everyone.
const getUsersByRole = async (req, res) => {
  try {
    const { role } = req.query;
    const filter = {};
    if (role) {
      if (!['student', 'faculty', 'admin'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role filter' });
      }
      filter.role = role;
    }
    const scope = getScopeDepartment(req.user);
    if (scope) filter.department = scope;

    // Grouped, THEN alphabetical within each group — not one flat A-Z list.
    // Students: Sem 1 Section A (A-Z), then Sem 1 Section B (A-Z), then
    // Sem 2 Section A, and so on. Faculty/admin: department (A-Z), then
    // name (A-Z) within that department.
    const sortSpec = role === 'student' ? { semester: 1, section: 1, name: 1 } : { department: 1, name: 1 };
    const users = await User.find(filter)
      .select('name email role department cabinLocation isAvailable usn semester section')
      .sort(sortSpec);
    return res.status(200).json({ users });
  } catch (err) {
    console.error('Get users error:', err);
    return res.status(500).json({ message: 'Server error fetching users' });
  }
};

// @route  GET /api/users/faculty-directory
// @access Private (any logged-in role)
// The Faculty Locator directory. Everyone — student, faculty, and a
// department-scoped admin — only sees their own department's faculty. Only
// a global admin (no department on their own account) sees every department.
const getFacultyDirectory = async (req, res) => {
  try {
    const query = { role: 'faculty' };
    const scope = getScopeDepartment(req.user);
    if (scope) query.department = scope;
    // Department (A-Z), then name (A-Z) within that department — e.g. every
    // AIML faculty member A-Z, then every Civil faculty member A-Z, and so on.
    const faculty = await User.find(query)
      .select('name department designation cabinLocation isAvailable')
      .sort({ department: 1, name: 1 });

    // Cross-check today's live timetable to see who is mid-class right now.
    const { day, time } = getNow();
    const todaysEntries = await Timetable.find({ day }).select('faculty startTime endTime subject');
    const nowMinutes = toMinutes(time);
    const inClassFacultyIds = new Set(
      todaysEntries
        .filter((e) => nowMinutes >= toMinutes(e.startTime) && nowMinutes < toMinutes(e.endTime))
        .map((e) => String(e.faculty))
    );

    const withStatus = faculty.map((f) => {
      const inClass = inClassFacultyIds.has(String(f._id));
      return {
        ...f.toObject(),
        status: inClass ? 'in_class' : f.isAvailable ? 'available' : 'away',
      };
    });

    return res.status(200).json({ faculty: withStatus });
  } catch (err) {
    console.error('Get faculty directory error:', err);
    return res.status(500).json({ message: 'Server error fetching faculty directory' });
  }
};

// @route  PUT /api/users/me/status
// @access Private/Faculty
// Lets a faculty member update their own live availability + cabin location.
const updateMyStatus = async (req, res) => {
  try {
    const { isAvailable, cabinLocation } = req.body;

    if (typeof isAvailable === 'boolean') {
      req.user.isAvailable = isAvailable;
    }
    if (typeof cabinLocation === 'string') {
      req.user.cabinLocation = cabinLocation.trim();
    }
    await req.user.save();

    return res.status(200).json({ user: req.user });
  } catch (err) {
    console.error('Update status error:', err);
    return res.status(500).json({ message: 'Server error updating status' });
  }
};


const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @route  GET /api/users/search?q=&role=
// @access Private/Admin
// General account lookup (e.g. picking someone to notify, or any other
// admin flow that needs to find a specific user). A department-scoped admin
// only ever finds students/faculty in their own department; the global admin
// finds anyone. Never includes the caller themselves. Capped at 30 results.
const searchUsers = async (req, res) => {
  try {
    const { q, role } = req.query;
    const scope = getScopeDepartment(req.user);

    const filter = { _id: { $ne: req.user._id } };
    if (scope) {
      filter.department = scope;
      filter.role = { $in: ['student', 'faculty'] };
    }
    if (role) {
      if (!['student', 'faculty', 'admin'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role filter' });
      }
      if (scope && role === 'admin') {
        return res.status(200).json({ users: [], total: 0 });
      }
      filter.role = role;
    }
    const term = typeof q === 'string' ? q.trim() : '';
    if (term) {
      const rx = new RegExp(escapeRegex(term), 'i');
      filter.$or = [{ name: rx }, { email: rx }, { usn: rx }, { staffId: rx }];
    }

    // Grouped, THEN alphabetical — same shape as the rest of the app:
    // a single role filtered to just students groups by semester/section
    // first (Sem 1 A A-Z, then Sem 1 B A-Z, ...); a single role of faculty
    // or admin groups by department first; a mixed-role result (no role
    // filter, or a department-scoped admin's student+faculty search) falls
    // back to role then department, so it's never one flat shuffled list.
    const sortSpec =
      filter.role === 'student'
        ? { semester: 1, section: 1, name: 1 }
        : filter.role === 'faculty' || filter.role === 'admin'
        ? { department: 1, name: 1 }
        : { role: 1, department: 1, name: 1 };
    const [users, total] = await Promise.all([
      User.find(filter).select('name email role department usn staffId semester section photoUrl').sort(sortSpec).limit(30),
      User.countDocuments(filter),
    ]);
    return res.status(200).json({ users, total });
  } catch (err) {
    console.error('Search users error:', err);
    return res.status(500).json({ message: 'Server error searching users' });
  }
};

// @route  PUT /api/users/me/profile
// @access Private (any logged-in role)
// Self-service profile edit: email and phone number. Everything tied to
// records elsewhere (name, department, USN, semester/section) stays read-only
// here. Changing the email — it's the login, and where reset codes go —
// requires the current password, so an unattended open session can't be used
// to quietly take over the account.
const PHONE_DIGITS_MIN = 7;
const PHONE_DIGITS_MAX = 15;

const updateMyProfile = async (req, res) => {
  try {
    const { name, email, phone, currentPassword } = req.body;
    const wantsName = typeof name === 'string';
    const wantsEmail = typeof email === 'string';
    const wantsPhone = typeof phone === 'string';
    if (!wantsName && !wantsEmail && !wantsPhone) {
      return res.status(400).json({ message: 'Nothing to update' });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (wantsName) {
      const cleanedName = name.trim();
      if (!cleanedName) {
        return res.status(400).json({ message: 'Name cannot be empty' });
      }
      user.name = cleanedName;
    }

    if (wantsPhone) {
      const cleaned = phone.trim();
      if (cleaned === '') {
        user.phone = undefined; // clearing it is allowed
      } else {
        const digits = cleaned.replace(/\D/g, '');
        const shapeOk = /^\+?[0-9][0-9\s\-()]*$/.test(cleaned);
        if (!shapeOk || digits.length < PHONE_DIGITS_MIN || digits.length > PHONE_DIGITS_MAX) {
          return res.status(400).json({ message: 'Enter a valid phone number (7–15 digits, e.g. +91 98765 43210)' });
        }
        user.phone = cleaned;
      }
    }

    if (wantsEmail) {
      const nextEmail = email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(nextEmail)) {
        return res.status(400).json({ message: 'Please enter a valid email' });
      }
      if (nextEmail !== user.email) {
        if (!currentPassword) {
          return res.status(400).json({ message: 'Enter your current password to change your email' });
        }
        const ok = await user.matchPassword(currentPassword);
        if (!ok) {
          return res.status(401).json({ message: 'Current password is incorrect' });
        }
        const taken = await User.findOne({ email: nextEmail, _id: { $ne: user._id } });
        if (taken) {
          return res.status(409).json({ message: 'That email is already used by another account' });
        }
        user.email = nextEmail;
      }
    }

    await user.save();
    return res.status(200).json({ user });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'That email is already used by another account' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(', ') });
    }
    console.error('Update profile error:', err);
    return res.status(500).json({ message: 'Server error updating profile' });
  }
};

// @route  PUT /api/users/me/push-token
// @access Private (any logged-in role)
// Saves this device's Expo push token so notify.js (backend/utils/notify.js)
// can deliver a real push notification, not just an in-app one. Called again
// on every login — whichever device registered most recently is the one
// that gets pushes, so logging into a new device "moves" them there.
const updatePushToken = async (req, res) => {
  try {
    const { pushToken } = req.body;
    if (pushToken !== null && typeof pushToken !== 'string') {
      return res.status(400).json({ message: 'pushToken must be a string or null' });
    }
    await User.findByIdAndUpdate(req.user._id, { pushToken: pushToken || null });
    return res.status(200).json({ message: 'Push token saved' });
  } catch (err) {
    console.error('Update push token error:', err);
    return res.status(500).json({ message: 'Server error saving push token' });
  }
};

// @route  PUT /api/users/:id/photo
// @access Private/Admin
// multipart/form-data, field name "photo". A department-scoped admin can
// only upload a photo for a user in their own department; a global admin
// (no department on their own account) can do any user.
const uploadUserPhoto = async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (!isAllowedDepartment(req.user, target.department)) {
      return res.status(403).json({ message: "You can only manage your own department's users" });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No photo uploaded' });
    }

    // Best-effort cleanup of the previous photo file so uploads/photos
    // doesn't grow forever with orphaned images every time someone's
    // picture is changed. Never let a cleanup failure block the response.
    if (target.photoUrl) {
      const oldPath = path.join(__dirname, '..', target.photoUrl.replace(/^\//, ''));
      fs.unlink(oldPath, () => {});
    }

    target.photoUrl = `/uploads/photos/${req.file.filename}`;
    await target.save();
    return res.status(200).json({ user: target });
  } catch (err) {
    console.error('Upload user photo error:', err);
    return res.status(500).json({ message: 'Server error uploading photo' });
  }
};

// @route  PUT /api/users/:id/staff-id
// @access Private/Admin
// Sets a faculty/admin member's staff ID number — the staff equivalent of a
// student's USN. Same department scoping as the photo upload above.
const updateStaffId = async (req, res) => {
  try {
    const { staffId } = req.body;
    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (!isAllowedDepartment(req.user, target.department)) {
      return res.status(403).json({ message: "You can only manage your own department's users" });
    }
    if (target.role === 'student') {
      return res.status(400).json({ message: 'Students use a USN, not a staff ID' });
    }
    target.staffId = typeof staffId === 'string' && staffId.trim() ? staffId.trim() : undefined;
    await target.save();
    return res.status(200).json({ user: target });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'That staff ID is already used by another account' });
    }
    console.error('Update staff ID error:', err);
    return res.status(500).json({ message: 'Server error updating staff ID' });
  }
};

module.exports = {
  getUsersByRole,
  getFacultyDirectory,
  updateMyStatus,
  updateMyProfile,
  updatePushToken,
  searchUsers,
  uploadUserPhoto,
  updateStaffId,
};