const express = require('express');
const { createEntry, getTimetable, downloadTimetablePdf, deleteEntry, seedSemester5 } = require('../controllers/timetableController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', protect, getTimetable);
router.get('/pdf', protect, downloadTimetablePdf);
router.post('/seed-sem5', protect, authorize('admin'), seedSemester5);
router.post('/', protect, authorize('admin'), createEntry);
router.delete('/:id', protect, authorize('admin'), deleteEntry);

module.exports = router;
