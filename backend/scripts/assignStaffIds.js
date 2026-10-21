// Run with: node scripts/assignStaffIds.js  (from backend/)
//
// Gives every faculty AND admin account a 5-digit staff ID card number —
// the staff equivalent of a student's USN. Only touches accounts that don't
// have a staffId yet, so anyone an admin already set by hand (Accounts >
// User Photos & Staff IDs) keeps that number untouched.
//
// Numbers are assigned sequentially starting at 10001, continuing on from
// the highest existing numeric staffId already in use — so re-running this
// after adding new faculty/admins only fills in the new ones, and never
// reuses or clashes with an ID already handed out.
//
// Safe to re-run: only ever acts on accounts with no staffId.

require('dotenv').config();
const connectDB = require('../config/db');
const User = require('../models/User');

async function run() {
  await connectDB();

  const existing = await User.find({ staffId: { $exists: true, $ne: null } }).select('staffId');
  let nextId = 10001;
  existing.forEach((u) => {
    const n = parseInt(u.staffId, 10);
    if (!Number.isNaN(n) && n >= nextId) nextId = n + 1;
  });

  const needsId = await User.find({
    role: { $in: ['faculty', 'admin'] },
    $or: [{ staffId: null }, { staffId: { $exists: false } }],
  }).sort({ role: 1, department: 1, name: 1 });

  if (needsId.length === 0) {
    console.log('Every faculty and admin account already has a staff ID — nothing to do.');
    process.exit(0);
  }

  console.log(`Assigning staff IDs to ${needsId.length} account(s)...\n`);

  for (const u of needsId) {
    const id = String(nextId).padStart(5, '0');
    nextId += 1;
    u.staffId = id;
    await u.save();
    console.log(`  ${id}  ${u.name} (${u.role}${u.department ? ', ' + u.department : ''}) — ${u.email}`);
  }

  console.log(`\n=== DONE === ${needsId.length} staff ID(s) assigned.`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Assign staff IDs failed:', err);
  process.exit(1);
});