const express = require('express');
const { listStaffrooms, createStaffroom, updateStaffroom, deleteStaffroom } = require('../controllers/staffroomController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', protect, listStaffrooms);
router.post('/', protect, authorize('admin'), createStaffroom);
router.put('/:id', protect, authorize('admin'), updateStaffroom);
router.delete('/:id', protect, authorize('admin'), deleteStaffroom);

module.exports = router;
