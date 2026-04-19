require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('./db');

async function seed() {
  try {
    // ── Wipe all data (preserve table structure) ───────────────
    await pool.query('DELETE FROM queries');
    await pool.query('DELETE FROM marks');
    await pool.query('DELETE FROM attendance');
    await pool.query('DELETE FROM homework');
    await pool.query('DELETE FROM announcements');
    await pool.query('DELETE FROM student_batches');
    await pool.query('DELETE FROM students');
    await pool.query('DELETE FROM tests');
    await pool.query('DELETE FROM batches');
    await pool.query('DELETE FROM users');

    console.log('✅ All data cleared.');

    // ── Admin ──────────────────────────────────────────────────
    const admPass = await bcrypt.hash('Admin@123', 10);
    await pool.query(
      `INSERT INTO users (email, password_hash, role, full_name, phone)
       VALUES ('admin@eklavyaedu.com', $1, 'admin', 'Nikunj Parekh', '9574029090')`,
      [admPass]
    );

    // ── Teacher ────────────────────────────────────────────────
    const tchPass = await bcrypt.hash('Teacher@123', 10);
    await pool.query(
      `INSERT INTO users (email, password_hash, role, full_name, phone)
       VALUES ('teacher@tuition.com', $1, 'teacher', 'Umang Sir', '9574029090')`,
      [tchPass]
    );

    console.log('\n✅ Seed completed!\n');
    console.log('Login credentials:');
    console.log('  Admin:   admin@eklavyaedu.com   / Admin@123');
    console.log('  Teacher: teacher@tuition.com    / Teacher@123');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  }
}

seed();
