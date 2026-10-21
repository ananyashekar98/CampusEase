const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { sendPasswordResetEmail } = require('../utils/mailer');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

const hashCode = (code) => crypto.createHash('sha256').update(code).digest('hex');

// @route  POST /api/auth/register
// @access Public
const register = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      usn,
      semester,
      section,
      department,
      designation,
      cabinLocation,
      staffId,
    } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Name, email, password and role are required' });
    }

    // This is a PUBLIC, unauthenticated endpoint — anyone who can reach the
    // API can call it. Allowing role: "admin" here meant anyone could sign
    // themselves up as a full admin (and, since no department is set on
    // registration, a GLOBAL admin — every department, every permission,
    // including resetting other users' passwords and running the allocator
    // app-wide) with nothing but a name, email and password. Admin accounts
    // must be provisioned out-of-band (seeded, or created by an existing
    // admin) — never through self-service signup.
    if (!['student', 'faculty'].includes(role)) {
      return res.status(400).json({ message: 'Role must be student or faculty' });
    }

    if (role === 'faculty' && !/^\d{5}$/.test(String(staffId || '').trim())) {
      return res.status(400).json({ message: 'A 5-digit staff ID card number is required for faculty' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const user = await User.create({
      name,
      email,
      password,
      role,
      usn: role === 'student' ? usn : undefined,
      semester: role === 'student' ? semester : undefined,
      section: role === 'student' ? section : undefined,
      department: role === 'faculty' || role === 'student' ? department : undefined,
      designation: role === 'faculty' ? designation : undefined,
      cabinLocation: role === 'faculty' ? cabinLocation : undefined,
      staffId: role === 'faculty' ? String(staffId).trim() : undefined,
    });

    return res.status(201).json({
      user,
      token: generateToken(user._id),
    });
  } catch (err) {
    // Mongo's own unique-index violation — the plain findOne check above
    // catches the normal case (duplicate email), but USN and staffId are
    // also unique indexes (see User.js), and two near-simultaneous
    // registrations can both pass the findOne check before either has
    // saved. Without this, either case would fall through to a generic 500
    // instead of a message that actually says what collided.
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern || err.keyValue || {})[0];
      const message =
        field === 'usn'
          ? 'An account with this USN already exists'
          : field === 'staffId'
          ? 'An account with this staff ID already exists'
          : 'An account with this email already exists';
      return res.status(409).json({ message });
    }
    if (err.name === 'ValidationError') {
      const message = Object.values(err.errors)
        .map((e) => e.message)
        .join(', ');
      return res.status(400).json({ message });
    }
    console.error('Register error:', err);
    return res.status(500).json({ message: 'Server error during registration' });
  }
};

// @route  POST /api/auth/login
// @access Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    return res.status(200).json({
      user,
      token: generateToken(user._id),
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Server error during login' });
  }
};

// @route  GET /api/auth/me
// @access Private
const getMe = async (req, res) => {
  return res.status(200).json({ user: req.user });
};

// @route  POST /api/auth/forgot-password
// @access Public
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Always respond the same way whether or not the account exists, so this
    // endpoint can't be used to check which emails are registered.
    const genericMessage = 'If an account exists for that email, a reset code has been sent.';
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(200).json({ message: genericMessage });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
    user.resetPasswordCodeHash = hashCode(code);
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    user.resetPasswordAttempts = 0;
    await user.save({ validateBeforeSave: false });

    let previewUrl = null;
    try {
      const result = await sendPasswordResetEmail(user.email, code);
      previewUrl = result.previewUrl;
    } catch (mailErr) {
      // Don't fail the request just because email delivery had an issue —
      // the code is still saved. Log it so local testing isn't blocked even
      // if the mail step breaks for some reason.
      console.error('Password reset email failed to send:', mailErr);
      console.log(`[dev fallback] Password reset code for ${user.email}: ${code}`);
    }

    const payload = { message: genericMessage };
    // Exposed only outside production, and only because this project has no
    // real SMTP configured by default — this is how you actually see the
    // "email" during local testing, without needing a real mailbox.
    if (process.env.NODE_ENV !== 'production') {
      payload.devCode = code;
      payload.devPreviewUrl = previewUrl;
    }
    return res.status(200).json(payload);
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ message: 'Server error requesting password reset' });
  }
};

// @route  POST /api/auth/reset-password
// @access Public
const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
      return res.status(400).json({ message: 'Email, code and new password are all required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+resetPasswordCodeHash +resetPasswordExpires +resetPasswordAttempts');
    if (!user || !user.resetPasswordCodeHash || !user.resetPasswordExpires) {
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }
    if (user.resetPasswordExpires.getTime() < Date.now()) {
      return res.status(400).json({ message: 'This reset code has expired — request a new one' });
    }
    // A 6-digit code has only a million possibilities, so cap wrong guesses —
    // after MAX_RESET_ATTEMPTS the code is thrown away and a new one is needed.
    const MAX_RESET_ATTEMPTS = 5;
    if ((user.resetPasswordAttempts || 0) >= MAX_RESET_ATTEMPTS) {
      user.resetPasswordCodeHash = undefined;
      user.resetPasswordExpires = undefined;
      user.resetPasswordAttempts = 0;
      await user.save({ validateBeforeSave: false });
      return res.status(429).json({ message: 'Too many incorrect attempts — request a new code' });
    }
    if (hashCode(code) !== user.resetPasswordCodeHash) {
      user.resetPasswordAttempts = (user.resetPasswordAttempts || 0) + 1;
      await user.save({ validateBeforeSave: false });
      return res.status(400).json({ message: 'Invalid or expired reset code' });
    }

    user.password = newPassword;
    user.resetPasswordCodeHash = undefined;
    user.resetPasswordExpires = undefined;
    user.resetPasswordAttempts = 0;
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date(); // signs out any older sessions
    await user.save();

    return res.status(200).json({ message: 'Password reset — you can now log in with your new password.' });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Reset password error:', err);
    return res.status(500).json({ message: 'Server error resetting password' });
  }
};

// @route  PUT /api/auth/change-password
// @access Private
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are both required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    user.mustChangePassword = false;
    await user.save();

    return res.status(200).json({ message: 'Password changed successfully.' });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    console.error('Change password error:', err);
    return res.status(500).json({ message: 'Server error changing password' });
  }
};

module.exports = { register, login, getMe, forgotPassword, resetPassword, changePassword };