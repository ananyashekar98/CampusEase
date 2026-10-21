// Regular weekly classes only ever run Monday-Friday — Saturday is
// deliberately not a teaching day in the generated timetable. Faculty can
// still request an extra Saturday (or any after-hours) session through the
// Booking flow, which already requires admin approval — that's a one-off
// booking, not a recurring Timetable entry, so it's intentionally not part
// of this list.
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export const DAY_SHORT = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri' };

export const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
export const SECTIONS = ['A', 'B', 'C'];

// Alphabetical order on purpose — every department dropdown in the app (any
// role: admin, department admin, faculty, student; any feature: timetable
// lookup, classroom/staffroom pickers, bulk import, registration, etc.)
// maps over this exact array, so sorting it here is what keeps every one of
// them alphabetical at once, without having to fix each screen separately.
export const DEPARTMENTS = [
  'Artificial Intelligence & Machine Learning',
  'Civil Engineering',
  'Computer Science & Engineering',
  'Electrical & Electronics Engineering',
  'Electronics & Communication Engineering',
  'Information Science & Engineering',
  'Mechanical Engineering',
];

// Short codes for compact display (e.g. faculty pickers where the full name
// would be too long to read at a glance). Falls back to the first letters
// of each word if a department isn't in this list (e.g. a custom one an
// admin typed in).
const DEPARTMENT_ABBREVIATIONS = {
  'Artificial Intelligence & Machine Learning': 'AIML',
  'Civil Engineering': 'CE',
  'Computer Science & Engineering': 'CSE',
  'Electrical & Electronics Engineering': 'EEE',
  'Electronics & Communication Engineering': 'ECE',
  'Information Science & Engineering': 'ISE',
  'Mechanical Engineering': 'ME',
};

export function abbreviateDepartment(name) {
  if (!name) return '';
  if (DEPARTMENT_ABBREVIATIONS[name]) return DEPARTMENT_ABBREVIATIONS[name];
  const letters = name.match(/[A-Z]/g);
  return letters ? letters.join('') : name;
}

// A normal college day runs 8:30 AM to 4:30 PM (last period ends 4:00, this
// gives a 30-min buffer for wrap-up). Faculty bookings must stay inside this
// window; only Admin can book outside it (for genuine extra/after-hours
// classes), and those get flagged so everyone can tell at a glance.
export const COLLEGE_START_TIME = '08:30';
export const COLLEGE_END_TIME = '16:30';

export function isOutsideCollegeHours(startTime, endTime) {
  if (!startTime || !endTime) return false;
  return startTime < COLLEGE_START_TIME || endTime > COLLEGE_END_TIME;
}

// Every screen that shows a time stored as 24-hour "HH:MM" (classes,
// bookings, college-hours banners) should display it in 12-hour clock with
// AM/PM — this is the one shared formatter so that's consistent everywhere
// instead of each screen rolling its own.
export function formatTime12h(hhmm) {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return hhmm || '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

// Formats a "HH:MM-HH:MM" or already-separated start/end pair as a single
// 12-hour range, e.g. "2:00 PM - 3:00 PM" — the common case for displaying
// a class or booking's time slot in one line.
export function formatTimeRange12h(startTime, endTime) {
  return `${formatTime12h(startTime)} - ${formatTime12h(endTime)}`;
}

// A starter list so the dropdown isn't empty — admins can still type a subject
// that isn't listed here and it will be used as-is.
export const SUBJECT_PRESETS = [
  'Data Structures',
  'Operating Systems',
  'Database Management Systems',
  'Computer Networks',
  'Object Oriented Programming',
  'Software Engineering',
  'Web Technologies',
  'Artificial Intelligence',
  'Machine Learning',
  'Discrete Mathematics',
  'Design and Analysis of Algorithms',
  'Microprocessors',
  'Cloud Computing',
  'Compiler Design',
];