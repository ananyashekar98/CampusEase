const express = require('express');
const {
  runAllocation,
  listAllocations,
  getAllocation,
  applyAllocation,
  deleteAllocation,
} = require('../controllers/allocationController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/run', protect, authorize('admin'), runAllocation);
router.get('/', protect, authorize('admin'), listAllocations);
router.get('/:id', protect, authorize('admin'), getAllocation);
router.put('/:id/apply', protect, authorize('admin'), applyAllocation);
router.delete('/:id', protect, authorize('admin'), deleteAllocation);

module.exports = router;
