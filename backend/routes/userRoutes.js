const express = require('express');
const {
  getUsersByRole,
  getFacultyDirectory,
  updateMyStatus,
  updateMyProfile,
  updatePushToken,
  searchUsers,
  uploadUserPhoto,
  updateStaffId,
} = require('../controllers/userController');
const {
  previewBulkImport,
  commitBulkImport,
  downloadTemplate,
} = require('../controllers/bulkImportController');
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

const router = express.Router();

router.get('/faculty-directory', protect, getFacultyDirectory);
router.put('/me/status', protect, authorize('faculty'), updateMyStatus);

// This existed in userController.js already (and the Settings screen already
// calls it) but had no route — "Save Changes" there was silently 404ing.
router.put('/me/profile', protect, updateMyProfile);

// Any logged-in role can register a push token for their own device.
router.put('/me/push-token', protect, updatePushToken);

// NOTE: '/search' must stay above any '/:id' route so "search" isn't read as an id.
router.get('/search', protect, authorize('admin'), searchUsers);

// "/:id/reset-password" (admin resetting someone ELSE's password) is gone —
// every role, admin included, can only ever change their OWN password now
// (PUT /api/auth/change-password). There is no "reset another user's
// password" path left anywhere in the API.

// Main-admin-only Excel/CSV bulk import (the controller itself also refuses
// department-scoped admins). Must stay above any '/:id' route.
router.get('/bulk-import/template', protect, authorize('admin'), downloadTemplate);
router.post('/bulk-import/preview', protect, authorize('admin'), previewBulkImport);
router.post('/bulk-import', protect, authorize('admin'), commitBulkImport);

// Profile photo (multipart, field "photo") and staff ID for a user — admin only;
// the controller limits a department admin to their own department's users.
router.put('/:id/photo', protect, authorize('admin'), upload.single('photo'), uploadUserPhoto);
router.put('/:id/staff-id', protect, authorize('admin'), updateStaffId);

router.get('/', protect, authorize('admin'), getUsersByRole);

module.exports = router;