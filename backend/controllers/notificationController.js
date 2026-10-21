const Notification = require('../models/Notification');

// @route  GET /api/notifications
// @access Private
const listMyNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      // Just enough to decide whether Approve/Reject buttons still make
      // sense on a "new booking request" notification — if the booking's
      // already been approved/rejected (by this admin elsewhere, or by
      // another admin), the buttons shouldn't show as if it were still
      // pending.
      .populate('relatedBooking', 'status');
    return res.status(200).json({ notifications });
  } catch (err) {
    console.error('List notifications error:', err);
    return res.status(500).json({ message: 'Server error fetching notifications' });
  }
};

// @route  GET /api/notifications/unread-count
// @access Private
const getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({ recipient: req.user._id, read: false });
    return res.status(200).json({ count });
  } catch (err) {
    console.error('Unread count error:', err);
    return res.status(500).json({ message: 'Server error fetching unread count' });
  }
};

// @route  PUT /api/notifications/:id/read
// @access Private
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOne({ _id: req.params.id, recipient: req.user._id });
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    notification.read = true;
    await notification.save();
    return res.status(200).json({ notification });
  } catch (err) {
    console.error('Mark as read error:', err);
    return res.status(500).json({ message: 'Server error updating notification' });
  }
};

// @route  PUT /api/notifications/read-all
// @access Private
const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, read: false }, { read: true });
    return res.status(200).json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark all as read error:', err);
    return res.status(500).json({ message: 'Server error updating notifications' });
  }
};

module.exports = { listMyNotifications, getUnreadCount, markAsRead, markAllAsRead };