const express = require('express');
const {
  createBooking,
  getMyBookings,
  getAllBookings,
  getApprovedBookings,
  approveBooking,
  rejectBooking,
  cancelBooking,
  checkFacultyAvailability,
} = require('../controllers/bookingController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/', protect, authorize('faculty', 'admin'), createBooking);
router.get('/mine', protect, authorize('faculty', 'admin'), getMyBookings);
router.get('/approved', protect, getApprovedBookings);
// Non-blocking "is this faculty member already busy at this time" check,
// used by the booking screen to show a warning banner before submitting.
router.get('/faculty-availability', protect, authorize('faculty', 'admin'), checkFacultyAvailability);
router.get('/', protect, authorize('admin'), getAllBookings);

router.put('/:id/approve', protect, authorize('admin'), approveBooking);
router.put('/:id/reject', protect, authorize('admin'), rejectBooking);
router.put('/:id/cancel', protect, cancelBooking);

module.exports = router;