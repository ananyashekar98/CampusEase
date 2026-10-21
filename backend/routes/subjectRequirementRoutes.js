const express = require('express');
const {
  listRequirements,
  listAvailableSubjects,
  createRequirement,
  updateRequirement,
  deleteRequirement,
} = require('../controllers/subjectRequirementController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', protect, authorize('admin'), listRequirements);
// A static path, so it must be declared before the /:id routes below —
// otherwise Express would try to match "available-subjects" as an :id.
router.get('/available-subjects', protect, authorize('admin'), listAvailableSubjects);
router.post('/', protect, authorize('admin'), createRequirement);
router.put('/:id', protect, authorize('admin'), updateRequirement);
router.delete('/:id', protect, authorize('admin'), deleteRequirement);

module.exports = router;