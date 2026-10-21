const XLSX = require('xlsx');
const User = require('../models/User');
const { DEPARTMENTS, DEPT_CODE } = require('../utils/departments');

// Main-admin-only bulk account import from an Excel (.xlsx/.xls) or .csv
// file — e.g. the sheet a Google Form exports. Two-step on purpose:
//   POST /api/users/bulk-import/preview  -> reads the file, validates every
//        row, returns what WOULD happen. Writes nothing.
//   POST /api/users/bulk-import          -> same validation, then creates
//        every valid row.
//   GET  /api/users/bulk-import/template -> a ready-made .xlsx to fill in.

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const EMAIL_DOMAIN = 'campusease.edu';
const DEFAULT_PASSWORD = { student: 'Student@123', faculty: 'Faculty@123', admin: 'Admin@123' };
const VALID_ROLES = ['student', 'faculty', 'admin'];
const MAX_ROWS = 2000;

// Column headers are matched loosely so a Google Form export ("Full Name",
// "Email Address", "Sem", "Branch", ...) works without renaming columns.
const ALIASES = {
  name: ['name', 'fullname', 'studentname', 'facultyname', 'username'],
  email: ['email', 'emailaddress', 'emailid', 'mail', 'mailid', 'collegeemail'],
  password: ['password', 'pass', 'pwd', 'initialpassword'],
  role: ['role', 'usertype', 'type', 'accounttype'],
  usn: ['usn', 'universityseatnumber', 'rollno', 'rollnumber', 'regno'],
  semester: ['semester', 'sem'],
  section: ['section', 'sec'],
  department: ['department', 'dept', 'branch'],
  designation: ['designation', 'post', 'position'],
  cabinLocation: ['cabinlocation', 'cabin', 'location'],
};

function normHeader(h) {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mapRow(raw) {
  const byNorm = {};
  Object.keys(raw).forEach((k) => { byNorm[normHeader(k)] = raw[k]; });
  const out = {};
  Object.entries(ALIASES).forEach(([field, names]) => {
    const hit = names.find((n) => byNorm[n] !== undefined && String(byNorm[n]).trim() !== '');
    out[field] = hit ? String(byNorm[hit]).trim() : '';
  });
  return out;
}

function resolveDepartment(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  const exact = DEPARTMENTS.find((d) => d.toLowerCase() === v);
  if (exact) return exact;
  const byCode = Object.entries(DEPT_CODE).find(([, code]) => code === v);
  if (byCode) return byCode[0];
  const extra = { me: 'Mechanical Engineering', ce: 'Civil Engineering', bt: 'Biotechnology', biotech: 'Biotechnology', ai: 'Artificial Intelligence & Machine Learning', aiml: 'Artificial Intelligence & Machine Learning' };
  if (extra[v]) return extra[v];
  const loose = v.replace(/&/g, 'and');
  return DEPARTMENTS.find((d) => d.toLowerCase().replace(/&/g, 'and').includes(loose)) || null;
}

// The columns every file MUST have — i.e. the template's essential columns.
// A file without them is rejected outright (not shown as 100 broken rows).
const REQUIRED_FIELDS = ['name', 'email', 'role', 'department'];
const TEMPLATE_HINT = 'Download the Excel template on this screen and keep its column headings (name, email, password, role, department, semester, section, usn).';

function readRows(fileBase64) {
  const buffer = Buffer.from(fileBase64, 'base64');
  let wb;
  try {
    wb = XLSX.read(buffer, { type: 'buffer' });
  } catch (e) {
    throw new Error(`That file could not be read as Excel or CSV. ${TEMPLATE_HINT}`);
  }
  // The template keeps its data on a sheet called "Accounts"; otherwise use the first sheet.
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === 'accounts') || wb.SheetNames[0];
  if (!sheetName) throw new Error('The file has no sheets');
  const sheet = wb.Sheets[sheetName];

  const headerRow = (XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })[0] || []).map(normHeader).filter(Boolean);
  const missing = REQUIRED_FIELDS.filter((f) => !ALIASES[f].some((a) => headerRow.includes(a)));
  if (missing.length > 0) {
    const err = new Error(`This file does not match the template — missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. ${TEMPLATE_HINT}`);
    err.code = 'TEMPLATE_MISMATCH';
    throw err;
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
  return rows.filter((r) => Object.values(r).some((v) => String(v).trim() !== ''));
}

// Validates every row against the file itself AND the database.
async function analyse(fileBase64) {
  const raw = readRows(fileBase64);
  if (raw.length === 0) throw new Error('No data rows found — the sheet is empty or only has a header row');
  if (raw.length > MAX_ROWS) throw new Error(`Too many rows (${raw.length}). Import at most ${MAX_ROWS} at a time.`);

  const mapped = raw.map(mapRow);

  // Pre-compute emails (students can have one generated from name + USN).
  const withEmail = mapped.map((r) => {
    const role = (r.role || 'student').toLowerCase().replace('teacher', 'faculty').replace('staff', 'faculty');
    let email = r.email.toLowerCase();
    let emailGenerated = false;
    if (!email && role === 'student' && r.name && r.usn) {
      const first = r.name.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '');
      if (first) {
        email = `${first}.${r.usn.toLowerCase().replace(/\s+/g, '')}@${EMAIL_DOMAIN}`;
        emailGenerated = true;
      }
    }
    return { ...r, role, email, emailGenerated };
  });

  const emails = withEmail.map((r) => r.email).filter(Boolean);
  const usns = withEmail.map((r) => r.usn.toUpperCase()).filter(Boolean);
  const existing = await User.find({ $or: [{ email: { $in: emails } }, { usn: { $in: usns } }] }).select('email usn');
  const dbEmails = new Set(existing.map((u) => u.email));
  const dbUsns = new Set(existing.filter((u) => u.usn).map((u) => u.usn));

  const seenEmails = new Set();
  const seenUsns = new Set();

  return withEmail.map((r, i) => {
    const row = i + 2; // +1 header, +1 for 1-indexing — matches the sheet's own row numbers
    const out = {
      row,
      name: r.name,
      email: r.email,
      role: r.role,
      department: '',
      semester: r.semester,
      section: r.section.replace(/^section\s*/i, '').toUpperCase(),
      usn: r.usn.toUpperCase(),
      designation: r.designation,
      cabinLocation: r.cabinLocation,
      password: r.password,
      defaultPassword: false,
      status: 'ok',
      reason: '',
    };
    const fail = (reason) => { out.status = 'error'; out.reason = reason; return out; };

    if (!r.name) return fail('Name is missing');
    if (!VALID_ROLES.includes(r.role)) return fail(`Role must be student, faculty or admin (got "${r.role}")`);
    if (!r.email) return fail('Email is missing (students may leave it blank if a USN is given)');
    if (!EMAIL_PATTERN.test(r.email)) return fail('Email format is invalid');

    if (r.department) {
      const dept = resolveDepartment(r.department);
      if (!dept) return fail(`Department "${r.department}" not recognised`);
      out.department = dept;
    }
    if (r.role === 'student') {
      if (!out.department) return fail('Students need a department');
      const sem = Number(r.semester);
      if (!Number.isInteger(sem) || sem < 1 || sem > 8) return fail('Students need a semester between 1 and 8');
      out.semester = sem;
      if (!out.section) return fail('Students need a section (A, B, C...)');
    } else if (r.role === 'faculty') {
      if (!out.department) return fail('Faculty need a department');
      out.semester = '';
      out.section = '';
      out.usn = '';
    } else {
      if (!out.department) return fail('Admin rows need a department (department admin). The main admin account is created separately.');
      out.semester = '';
      out.section = '';
      out.usn = '';
    }

    if (!r.password) {
      out.password = DEFAULT_PASSWORD[r.role];
      out.defaultPassword = true;
    } else if (r.password.length < 6) {
      return fail('Password must be at least 6 characters');
    }

    if (dbEmails.has(out.email)) return fail('An account with this email already exists');
    if (seenEmails.has(out.email)) return fail('Email appears twice in this file');
    if (out.usn && dbUsns.has(out.usn)) return fail('An account with this USN already exists');
    if (out.usn && seenUsns.has(out.usn)) return fail('USN appears twice in this file');
    seenEmails.add(out.email);
    if (out.usn) seenUsns.add(out.usn);

    if (r.emailGenerated) out.reason = 'Email generated from name + USN';
    return out;
  });
}

function summarise(rows) {
  return {
    totalRows: rows.length,
    readyCount: rows.filter((r) => r.status === 'ok').length,
    errorCount: rows.filter((r) => r.status === 'error').length,
  };
}

// Never send passwords back to the browser — only whether one was supplied.
function publicRow(r) {
  const { password, ...rest } = r;
  return { ...rest, passwordSource: r.defaultPassword ? 'default' : 'from file' };
}

function requireMainAdmin(req, res) {
  if (req.user.department) {
    res.status(403).json({ message: 'Only the main admin can bulk import accounts' });
    return false;
  }
  return true;
}

// @route  POST /api/users/bulk-import/preview
const previewBulkImport = async (req, res) => {
  try {
    if (!requireMainAdmin(req, res)) return undefined;
    const { fileBase64 } = req.body;
    if (!fileBase64) return res.status(400).json({ message: 'No file received' });
    const rows = await analyse(fileBase64);
    return res.status(200).json({ ...summarise(rows), rows: rows.map(publicRow) });
  } catch (err) {
    console.error('Bulk import preview error:', err.message);
    return res.status(400).json({ message: err.message || 'Could not read that file' });
  }
};

// @route  POST /api/users/bulk-import
const commitBulkImport = async (req, res) => {
  try {
    if (!requireMainAdmin(req, res)) return undefined;
    const { fileBase64 } = req.body;
    if (!fileBase64) return res.status(400).json({ message: 'No file received' });
    const rows = await analyse(fileBase64);

    const results = rows.map((r) => ({ ...publicRow(r), added: false }));
    const todo = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.status === 'ok');

    // A few at a time — each create() hashes a password, which is the slow part.
    const CHUNK = 8;
    for (let s = 0; s < todo.length; s += CHUNK) {
      const slice = todo.slice(s, s + CHUNK);
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(slice.map(async ({ r, i }) => {
        try {
          await User.create({
            name: r.name,
            email: r.email,
            password: r.password,
            role: r.role,
            department: r.department,
            usn: r.role === 'student' && r.usn ? r.usn : undefined,
            semester: r.role === 'student' ? Number(r.semester) : undefined,
            section: r.role === 'student' ? r.section : undefined,
            designation: r.role === 'faculty' ? r.designation || undefined : undefined,
            cabinLocation: r.role === 'faculty' ? r.cabinLocation || undefined : undefined,
          });
          results[i].added = true;
        } catch (e) {
          results[i].status = 'error';
          results[i].reason = e.message || 'Could not create account';
        }
      }));
    }

    const addedCount = results.filter((r) => r.added).length;
    return res.status(200).json({
      totalRows: rows.length,
      addedCount,
      skippedCount: rows.length - addedCount,
      rows: results,
    });
  } catch (err) {
    console.error('Bulk import error:', err.message);
    return res.status(400).json({ message: err.message || 'Bulk import failed' });
  }
};

// @route  GET /api/users/bulk-import/template
const downloadTemplate = async (req, res) => {
  try {
    if (!requireMainAdmin(req, res)) return undefined;
    const header = ['name', 'email', 'password', 'role', 'department', 'semester', 'section', 'usn', 'designation', 'cabinLocation'];
    const examples = [
      ['Ananya Shekar', '', '', 'student', 'ISE', 7, 'A', '1GA23IS016', '', ''],
      ['Ravi Kumar', 'ravi.ise10050@campusease.edu', 'Faculty@123', 'faculty', 'ISE', '', '', '', 'Assistant Professor', 'Staffroom 1'],
    ];
    const notes = [
      ['HOW TO FILL THIS SHEET'],
      ['One person per row on the "Accounts" sheet. Delete the two example rows first.'],
      ['role: student / faculty / admin (blank = student). Admin rows are department admins and need a department.'],
      ['department: full name or short code (cse, ise, ece, eee, mech, civil, aiml).'],
      ['Students need department + semester (1-8) + section. USN is recommended.'],
      ['email: leave blank for a student with a USN and it becomes name.usn@campusease.edu.'],
      ['password: leave blank to use the default for the role (Student@123 / Faculty@123 / Admin@123).'],
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...examples]);
    ws['!cols'] = header.map((h) => ({ wch: Math.max(14, h.length + 4) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Accounts');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(notes), 'Instructions');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="campusease-users-template.xlsx"');
    return res.status(200).send(buf);
  } catch (err) {
    console.error('Template error:', err);
    return res.status(500).json({ message: 'Could not create the template' });
  }
};

module.exports = { previewBulkImport, commitBulkImport, downloadTemplate, _analyse: analyse };