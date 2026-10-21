// Run from backend/:  node scripts/exportLoginsPdf.js
// READ-ONLY. Reads every account live from the database your .env points at and writes
// backend/ALL_LOGINS.pdf: department-wise Admins, Faculty and Students with name,
// email and password. Each password is CHECKED against the stored hash, so the PDF only
// shows a password that really works ("changed - unknown" if it is not the role default).
// Keep the PDF private: do not commit it to GitHub.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const connectDB = require('../config/db');
const User = require('../models/User');

const DEFAULTS = { admin: 'Admin@123', faculty: 'Faculty@123', student: 'Student@123' };
const NAVY = '#251973';

(async () => {
  await connectDB();
  const users = await User.find({}).select('+password name email role department usn semester section designation').lean();
  console.log('Accounts read:', users.length);

  let unknown = 0;
  for (const u of users) {
    const ok = u.password && (await bcrypt.compare(DEFAULTS[u.role] || '', u.password));
    u.shownPassword = ok ? DEFAULTS[u.role] : '(changed - unknown)';
    if (!ok) unknown++;
  }

  const byName = (a, b) => String(a.name).localeCompare(String(b.name));
  const depts = [...new Set(users.map((u) => u.department).filter(Boolean))].sort();
  const out = path.join(__dirname, '..', 'ALL_LOGINS.pdf');
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true });
  doc.pipe(fs.createWriteStream(out));
  const W = doc.page.width - 72;
  const bottom = () => doc.page.height - 44;

  function heading(text, size = 15, color = NAVY) {
    if (doc.y > bottom() - 60) doc.addPage();
    doc.moveDown(0.4).font('Helvetica-Bold').fontSize(size).fillColor(color).text(text, 36);
    doc.moveDown(0.2);
  }
  function table(cols, rows) {
    // cols: [{ label, w (fraction), get(row) }]
    const widths = cols.map((c) => c.w * W);
    const rowH = 14;
    const drawHead = () => {
      let x = 36; const y = doc.y;
      doc.rect(36, y, W, rowH).fill(NAVY);
      cols.forEach((c, i) => { doc.fillColor('#fff').font('Helvetica-Bold').fontSize(8).text(c.label, x + 3, y + 3, { width: widths[i] - 6, lineBreak: false }); x += widths[i]; });
      doc.y = y + rowH;
    };
    drawHead();
    rows.forEach((r, idx) => {
      if (doc.y > bottom() - rowH) { doc.addPage(); drawHead(); }
      let x = 36; const y = doc.y;
      if (idx % 2) doc.rect(36, y, W, rowH).fill('#F3F4F8');
      cols.forEach((c, i) => { doc.fillColor('#1B1F2E').font('Helvetica').fontSize(8).text(String(c.get(r) ?? ''), x + 3, y + 3, { width: widths[i] - 6, lineBreak: false, ellipsis: true }); x += widths[i]; });
      doc.y = y + rowH;
    });
    doc.moveDown(0.5);
  }

  // Cover
  doc.font('Helvetica-Bold').fontSize(24).fillColor(NAVY).text('CampusEase - All Logins', 36, 60);
  doc.font('Helvetica').fontSize(11).fillColor('#444').text(`Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} - read live from the database "${mongoose.connection.name}" - ${users.length} accounts`);
  doc.moveDown(0.5).text('Passwords are default passwords per role and were verified against the stored hashes. CONFIDENTIAL - for testing only.');
  doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text('Contents');
  doc.font('Helvetica').fontSize(10).fillColor('#1B1F2E');
  depts.forEach((d) => {
    const c = (r) => users.filter((u) => u.department === d && u.role === r).length;
    doc.text(`${d}: ${c('admin')} admin, ${c('faculty')} faculty, ${c('student')} students`);
  });
  const noDept = users.filter((u) => !u.department);
  if (noDept.length) doc.text(`No department: ${noDept.length} (global admin)`);
  if (unknown) doc.moveDown(0.5).fillColor('#B91C1C').text(`${unknown} account(s) have a changed password and are marked "(changed - unknown)".`);

  // Global admin(s)
  const globals = users.filter((u) => u.role === 'admin' && !u.department);
  if (globals.length) {
    doc.addPage(); heading('Main Admin (all departments)');
    table([{ label: 'Name', w: 0.25, get: (r) => r.name }, { label: 'Email', w: 0.4, get: (r) => r.email }, { label: 'Password', w: 0.35, get: (r) => r.shownPassword }], globals);
  }

  for (const d of depts) {
    doc.addPage(); heading(d, 18);
    const admins = users.filter((u) => u.department === d && u.role === 'admin').sort(byName);
    if (admins.length) { heading('Department Admin', 12, '#444'); table([{ label: 'Name', w: 0.25, get: (r) => r.name }, { label: 'Email', w: 0.4, get: (r) => r.email }, { label: 'Password', w: 0.35, get: (r) => r.shownPassword }], admins); }
    const fac = users.filter((u) => u.department === d && u.role === 'faculty').sort(byName);
    heading(`Faculty (${fac.length})`, 12, '#444');
    table([{ label: 'Name', w: 0.26, get: (r) => r.name }, { label: 'Designation', w: 0.19, get: (r) => r.designation }, { label: 'Email', w: 0.35, get: (r) => r.email }, { label: 'Password', w: 0.2, get: (r) => r.shownPassword }], fac);
    const stu = users.filter((u) => u.department === d && u.role === 'student');
    const groups = [...new Set(stu.map((s) => `${s.semester || 0}|${s.section || ''}`))].sort((a, b) => { const [as, ac] = a.split('|'); const [bs, bc] = b.split('|'); return as - bs || ac.localeCompare(bc); });
    heading(`Students (${stu.length})`, 12, '#444');
    for (const g of groups) {
      const [sem, sec] = g.split('|');
      const list = stu.filter((s) => `${s.semester || 0}|${s.section || ''}` === g).sort((a, b) => String(a.usn).localeCompare(String(b.usn)));
      if (doc.y > bottom() - 50) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text(`Semester ${sem} - Section ${sec} (${list.length})`, 36);
      doc.moveDown(0.15);
      table([{ label: 'Name', w: 0.2, get: (r) => r.name }, { label: 'USN', w: 0.14, get: (r) => r.usn }, { label: 'Email', w: 0.4, get: (r) => r.email }, { label: 'Password', w: 0.26, get: (r) => r.shownPassword }], list);
    }
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.font('Helvetica').fontSize(8).fillColor('#888').text(`CampusEase logins - confidential - page ${i + 1} of ${range.count}`, 36, doc.page.height - 28, { lineBreak: false });
  }
  doc.end();
  await new Promise((r) => setTimeout(r, 1500));
  console.log('Written:', out);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });