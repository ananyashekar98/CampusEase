const express = require('express');
const {
  createClassroom,
  getClassrooms,
  deleteClassroom,
  getClassroomOccupancy,
  getAvailableClassrooms,
} = require('../controllers/classroomController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', protect, getClassrooms);
router.get('/occupancy', protect, getClassroomOccupancy);
// Static path — must stay above any future '/:id' route so "available"
// isn't read as an id.
router.get('/available', protect, getAvailableClassrooms);
router.post('/', protect, authorize('admin'), createClassroom);
router.delete('/:id', protect, authorize('admin'), deleteClassroom);

module.exports = router;