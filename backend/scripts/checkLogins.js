// Run from backend/:  node scripts/checkLogins.js            (read-only check)
//                     node scripts/checkLogins.js --fix      (reset wrong passwords to the role default)
// Tells you, for the database your .env points at, whether students/faculty can log in
// with the default passwords, and prints real working emails you can type.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const FIX = process.argv.includes('--fix');
const DEFAULTS = { student: 'Student@123', faculty: 'Faculty@123', admin: 'Admin@123' };

(async () => {
  await connectDB();
  console.log('Database:', mongoose.connection.name);
  const users = await User.find({}).select('+password name email role department usn staffId');
  console.log('Total accounts:', users.length);
  const stats = {}; const bad = []; let noHash = 0; let upper = 0, spaces = 0;
  for (const u of users) {
    const s = (stats[u.role] = stats[u.role] || { total: 0, ok: 0 });
    s.total++;
    if (u.email !== u.email.toLowerCase()) upper++;
    if (u.email !== u.email.trim()) spaces++;
    if (!u.password) { noHash++; bad.push(u); continue; }
    const ok = await bcrypt.compare(DEFAULTS[u.role] || 'x', u.password);
    if (ok) s.ok++; else bad.push(u);
  }
  console.log('\nRole      accounts   default password works');
  for (const [r, s] of Object.entries(stats)) console.log(r.padEnd(9), String(s.total).padEnd(10), s.ok);
  console.log('\nEmails with capital letters:', upper, '| emails with spaces:', spaces, '| accounts with no password:', noHash);
  for (const role of ['student', 'faculty']) {
    const ex = users.filter((u) => u.role === role).slice(0, 3);
    console.log(`\nSample ${role} logins (type these EXACTLY):`);
    ex.forEach((u) => console.log('  ', u.email, '  /  ', DEFAULTS[role], DEFAULTS[role] && bad.includes(u) ? '  <-- default does NOT match' : ''));
  }
  const badNonAdmin = bad.filter((u) => u.role !== 'admin');
  console.log('\nStudent/faculty accounts where the default password does not match:', badNonAdmin.length);
  if (badNonAdmin.length && !FIX) console.log('Run again with --fix to reset them to the default password.');
  if (FIX && badNonAdmin.length) {
    for (const u of badNonAdmin) {
      u.password = DEFAULTS[u.role]; u.passwordChangedAt = undefined;
      await u.save();
    }
    console.log('Reset', badNonAdmin.length, 'passwords to the role default.');
  }
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });