// One shared in-process lock for everything that can change which rooms are free:
// publishing a room allocation, creating/approving a booking, adding/deleting a
// timetable entry. While one of them runs, the others wait their turn, so a publish
// can never validate against data that another admin is changing at the same moment.
//
// (This protects a single backend process, which is how CampusEase runs. If you ever
// run several copies of the server, move this lock into the database.)
let tail = Promise.resolve();

function withLock(fn) {
  const run = tail.then(() => fn());
  tail = run.catch(() => {});
  return run;
}

// Wraps an Express handler so it runs inside the lock.
const locked = (handler) => (req, res, next) => withLock(() => handler(req, res, next));

module.exports = { withLock, locked };