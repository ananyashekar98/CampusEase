require('dotenv').config();
const connectDB = require('../config/db');
const { seedSemester5Timetable } = require('./seedSemester5Timetable');

(async () => {
  try {
    await connectDB();
    const result = await seedSemester5Timetable({ replace: true });
    console.log(result);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
