const Notification = require('../models/Notification');
const User = require('../models/User');

// Fire-and-forget style helpers — a failure to notify should never break the
// action that triggered it, so callers don't need to await these carefully
// or wrap them in extra try/catch.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Expo accepts a batch of up to 100 messages per request. Our groups
// (a section, the admin list) are always far smaller than that, so one
// call per notify*() is enough — no chunking needed.
async function sendExpoPush(messages) {
  if (!messages.length) return;
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    const data = await res.json();
    if (data?.errors) {
      console.error('Expo push service responded with errors:', JSON.stringify(data.errors));
    }
  } catch (err) {
    // A push failure should never break the action that triggered it — the
    // in-app notification row is already saved regardless of this.
    console.error('sendExpoPush failed:', err.message);
  }
}

async function notifyUser(recipientId, { title, message, type = 'general', relatedBooking = null }) {
  try {
    await Notification.create({ recipient: recipientId, title, message, type, relatedBooking });
    const recipient = await User.findById(recipientId).select('pushToken');
    if (recipient?.pushToken) {
      await sendExpoPush([{ to: recipient.pushToken, title, body: message, data: { type } }]);
    }
  } catch (err) {
    console.error('notifyUser failed:', err.message);
  }
}

async function notifyUsers(recipientIds, { title, message, type = 'general', relatedBooking = null }) {
  const uniqueIds = [...new Set(recipientIds.map(String))];
  if (!uniqueIds.length) return;
  try {
    await Notification.insertMany(
      uniqueIds.map((id) => ({ recipient: id, title, message, type, relatedBooking }))
    );
    const recipients = await User.find({ _id: { $in: uniqueIds }, pushToken: { $ne: null } }).select('pushToken');
    const messages = recipients.map((r) => ({ to: r.pushToken, title, body: message, data: { type } }));
    await sendExpoPush(messages);
  } catch (err) {
    console.error('notifyUsers failed:', err.message);
  }
}

async function notifyAdmins(payload) {
  try {
    const admins = await User.find({ role: 'admin' }).select('_id');
    await notifyUsers(admins.map((a) => a._id), payload);
  } catch (err) {
    console.error('notifyAdmins failed:', err.message);
  }
}

// Notifies every student in a given department + semester + section group —
// used when a timetable entry affecting that group changes.
async function notifyStudentGroup({ department, semester, section }, payload) {
  try {
    const students = await User.find({ role: 'student', department, semester, section }).select('_id');
    await notifyUsers(students.map((s) => s._id), payload);
  } catch (err) {
    console.error('notifyStudentGroup failed:', err.message);
  }
}

module.exports = { notifyUser, notifyUsers, notifyAdmins, notifyStudentGroup };