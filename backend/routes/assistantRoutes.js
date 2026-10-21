const express = require('express');
const { parseBookingRequest } = require('../controllers/assistantController');
const { protect, authorize } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/parse-booking', protect, authorize('admin'), parseBookingRequest);

module.exports = router;
