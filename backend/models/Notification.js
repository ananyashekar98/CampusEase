const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      // 'extra-class' is its own category (not just 'booking') so a
      // student's Notifications screen can tell "an extra class/guest
      // lecture was added or cancelled for my section" apart from admin-
      // facing booking approve/reject/request chatter, which stays 'booking'.
      enum: ['booking', 'extra-class', 'timetable', 'general'],
      default: 'general',
    },
    read: {
      type: Boolean,
      default: false,
    },
    // Only set for "new booking request" notifications sent to admins — lets
    // the notification itself carry Approve/Reject buttons straight through
    // to the booking it's about, instead of just linking to a screen.
    relatedBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);