// Single source of truth for the college's 8 departments, matching the
// frontend's constants.js exactly (same full names, same order). Kept in
// alphabetical order on purpose — every dropdown/list in the app (any role,
// any screen) maps over this array directly, so sorting it here is what
// keeps every one of those dropdowns alphabetical everywhere at once.
const DEPARTMENTS = [
  'Artificial Intelligence & Machine Learning',
  'Civil Engineering',
  'Computer Science & Engineering',
  'Electrical & Electronics Engineering',
  'Electronics & Communication Engineering',
  'Information Science & Engineering',
  'Mechanical Engineering',
];

const DEPT_CODE = {
  'Artificial Intelligence & Machine Learning': 'aiml',
  'Civil Engineering': 'civil',
  'Computer Science & Engineering': 'cse',
  'Electrical & Electronics Engineering': 'eee',
  'Electronics & Communication Engineering': 'ece',
  'Information Science & Engineering': 'ise',
  'Mechanical Engineering': 'mech',
};

module.exports = { DEPARTMENTS, DEPT_CODE };