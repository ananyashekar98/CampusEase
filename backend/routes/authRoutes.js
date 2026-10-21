const express = require('express');
const {
  register,
  login,
  getMe,
  forgotPassword,
  resetPassword,
  changePassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);

// These three existed in authController.js already (and ForgotPasswordScreen
// / ChangePasswordScreen already call them) but were never actually wired
// up here — so "forgot password" and "change password" were both silently
// 404ing in the real app. This connects them.
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.put('/change-password', protect, changePassword);

module.exports = router;