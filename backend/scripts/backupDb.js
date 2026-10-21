// READ-ONLY backup. Saves every collection of the connected database as JSON files in
// backend/backups/<date-time>/ . It never changes the database.
//
//   node scripts/backupDb.js
//
// The files use MongoDB "extended JSON", so ids and dates survive. You can import them back with
// MongoDB Compass (Import Data -> JSON) if you ever need to recover.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const { EJSON } = mongoose.mongo.BSON;

(async () => {
  await connectDB();
  const db = mongoose.connection.db;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(__dirname, '..', 'backups', stamp);
  fs.mkdirSync(dir, { recursive: true });
  const cols = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.')).sort();
  let total = 0;
  const lines = [];
  for (const name of cols) {
    const docs = await db.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(dir, `${name}.json`), EJSON.stringify(docs, { relaxed: false }, 2));
    total += docs.length;
    lines.push(`  ${name.padEnd(24)} ${String(docs.length).padStart(6)} documents`);
  }
  // verify what was written
  let bad = 0;
  for (const name of cols) {
    const back = EJSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));
    if (back.length !== (await db.collection(name).countDocuments())) bad += 1;
  }
  console.log(`Database: ${db.databaseName}`);
  console.log(lines.join('\n'));
  console.log(`\nSaved ${total} documents from ${cols.length} collections to:\n  ${dir}`);
  console.log(bad ? `\nWARNING: ${bad} file(s) did not match the database. Do NOT rely on this backup.` : '\nVerified: every file re-read correctly and matches the database count.');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('Backup failed:', e.message); process.exit(1); });