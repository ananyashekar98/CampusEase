const Booking = require('../models/Booking');
const Classroom = require('../models/Classroom');
const User = require('../models/User');
const { DEPARTMENTS } = require('../utils/departments');

// Creates one booking of each status (pending, approved, rejected, cancelled)
// per department that has at least one classroom + one faculty member, so
// every department admin has real data to check the All Bookings /
// Booking Requests screens against. Safe to re-run — it only skips a
// department if it can't find what it needs, it never deletes anything.
//
// Run with: node scripts/seedBookings.js   (from the backend/ folder)

const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

function futureDate(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function seedDemoBookings() {
  const created = [];
  const skipped = [];

  for (const department of DEPARTMENTS) {
    const [rooms, faculty, admin] = await Promise.all([
      Classroom.find({ department }).limit(2),
      User.findOne({ role: 'faculty', department }),
      User.findOne({ role: 'admin', department }),
    ]);

    if (rooms.length === 0 || !faculty) {
      skipped.push(department);
      continue;
    }
    const reviewer = admin || (await User.findOne({ role: 'admin', department: { $exists: false } }));

    for (let i = 0; i < STATUSES.length; i += 1) {
      const status = STATUSES[i];
      const room = rooms[i % rooms.length];
      const date = futureDate(3 + i * 2);
      const startHour = 9 + i * 2;
      const startTime = `${String(startHour).padStart(2, '0')}:00`;
      const endTime = `${String(startHour + 1).padStart(2, '0')}:00`;

      const doc = {
        classroom: room._id,
        date,
        startTime,
        endTime,
        purpose: `Demo ${status} booking — seeded for testing`,
        requestedBy: faculty._id,
        department,
        status,
      };
      if (status !== 'pending' && reviewer) {
        doc.reviewedBy = reviewer._id;
      }
      if (status === 'rejected') {
        doc.reviewNote = 'Seeded demo rejection';
      }

      const booking = await Booking.create(doc);
      created.push(booking);
    }
  }

  return { created: created.length, skippedDepartments: skipped };
}

module.exports = { seedDemoBookings };

if (require.main === module) {
  require('dotenv').config();
  const connectDB = require('../config/db');
  (async () => {
    try {
      await connectDB();
      const result = await seedDemoBookings();
      console.log(`Created ${result.created} demo bookings across ${DEPARTMENTS.length - result.skippedDepartments.length} departments.`);
      if (result.skippedDepartments.length > 0) {
        console.log(`Skipped (no classroom/faculty found yet): ${result.skippedDepartments.join(', ')}`);
      }
      process.exit(0);
    } catch (err) {
      console.error('Seed bookings failed:', err);
      process.exit(1);
    }
  })();
}
