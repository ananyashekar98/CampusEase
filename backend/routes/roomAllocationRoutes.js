const express = require('express');
const c = require('../controllers/roomAllocationController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

// Every operation is admin-only; department admins are further restricted to
// their own department inside the controller.
router.use(protect, authorize('admin'));

router.get('/options', c.getOptions);
router.post('/preview', c.preview);
router.post('/validate-change', c.validateChange);
router.post('/publish', c.publish);
router.get('/drafts', c.listDrafts);
router.post('/drafts', c.saveDraft);
router.get('/drafts/:id', c.getDraft);
router.delete('/drafts/:id', c.deleteDraft);

module.exports = router;