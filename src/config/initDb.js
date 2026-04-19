require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./db');

async function initDb() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Database initialized successfully');
    process.exit(0);
  } catch (err) {
    console.error('DB init error:', err.message);
    process.exit(1);
  }
}

initDb();
