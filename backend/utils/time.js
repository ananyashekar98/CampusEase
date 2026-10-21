// Converts "HH:MM" to minutes since midnight for easy comparison.
const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// True if [startA, endA) overlaps [startB, endB)
const timesOverlap = (startA, endA, startB, endB) => {
  const sA = toMinutes(startA);
  const eA = toMinutes(endA);
  const sB = toMinutes(startB);
  const eB = toMinutes(endB);
  return sA < eB && sB < eA;
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Converts a "YYYY-MM-DD" date string to its weekday name, e.g. "Monday".
// Used to check a one-off booking against the recurring weekly Timetable.
const dateToDayName = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00`);
  return DAY_NAMES[d.getDay()];
};

// Right-now weekday name + "HH:MM", used to detect if a faculty member is
// currently mid-class according to the Timetable (India time).
const getNow = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { day: values.weekday, time: `${values.hour}:${values.minute}` };
};

module.exports = { toMinutes, timesOverlap, dateToDayName, getNow };