const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { generateTempPassword } = require('../utils/helpers');

const getUsers = async (req, res) => {
  const { role } = req.query;
  try {
    let query = 'SELECT id, email, role, full_name, phone, force_password_change, created_at FROM users WHERE 1=1';
    const params = [];
    if (role) {
      params.push(role);
      query += ' AND role = $' + params.length;
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createUser = async (req, res) => {
  const { email, password, role, full_name, phone } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, role, full_name, phone) VALUES ($1,$2,$3,$4,$5) RETURNING id, email, role, full_name',
      [email, hash, role, full_name, phone]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
};

const updateUser = async (req, res) => {
  const { id } = req.params;
  const { full_name, email, phone, role } = req.body;
  try {
    const result = await pool.query(
      `UPDATE users SET full_name=$1, email=$2, phone=$3, role=$4, updated_at=NOW()
       WHERE id=$5 RETURNING id, email, role, full_name, phone`,
      [full_name, email, phone, role, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
};

const deleteUser = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM users WHERE id=$1', [id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const resetPassword = async (req, res) => {
  const { id } = req.params;
  try {
    const tempPass = generateTempPassword();
    const hash = await bcrypt.hash(tempPass, 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1, force_password_change = TRUE, updated_at = NOW() WHERE id = $2 RETURNING email, full_name',
      [hash, id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'Password reset successfully', temp_password: tempPass, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getBatches = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.*, u.full_name as teacher_name,
        (SELECT COUNT(*) FROM student_batches sb WHERE sb.batch_id = b.id) as student_count
      FROM batches b LEFT JOIN users u ON b.teacher_id = u.id ORDER BY b.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createBatch = async (req, res) => {
  const { name, subject, teacher_id, schedule } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO batches (name, subject, teacher_id, schedule) VALUES ($1,$2,$3,$4) RETURNING *',
      [name, subject, teacher_id, JSON.stringify(schedule || {})]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateBatch = async (req, res) => {
  const { id } = req.params;
  const { name, subject, teacher_id, schedule } = req.body;
  try {
    const result = await pool.query(
      'UPDATE batches SET name=$1, subject=$2, teacher_id=$3, schedule=$4 WHERE id=$5 RETURNING *',
      [name, subject, teacher_id, JSON.stringify(schedule || {}), id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteBatch = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM batches WHERE id = $1', [id]);
    res.json({ message: 'Batch deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get student profile for a user
const getStudentProfile = async (req, res) => {
  const { id } = req.params; // user id
  try {
    const result = await pool.query(
      'SELECT * FROM students WHERE user_id=$1',
      [id]
    );
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Upsert student profile
const upsertStudentProfile = async (req, res) => {
  const { id } = req.params; // user id
  const { roll_number, grade, batch_name, date_of_birth, parent_id } = req.body;
  try {
    const existing = await pool.query('SELECT id FROM students WHERE user_id=$1', [id]);
    let result;
    if (existing.rows[0]) {
      result = await pool.query(
        `UPDATE students SET roll_number=$1, grade=$2, batch_name=$3, date_of_birth=$4, parent_id=$5
         WHERE user_id=$6 RETURNING *`,
        [roll_number, grade, batch_name, date_of_birth || null, parent_id || null, id]
      );
    } else {
      result = await pool.query(
        `INSERT INTO students (user_id, roll_number, grade, batch_name, date_of_birth, parent_id, enrollment_date)
         VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE) RETURNING *`,
        [id, roll_number, grade, batch_name, date_of_birth || null, parent_id || null]
      );
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
const getBatchStudents = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT s.*, u.full_name, u.email, u.phone
      FROM students s
      JOIN users u ON s.user_id = u.id
      JOIN student_batches sb ON sb.student_id = s.id
      WHERE sb.batch_id = $1
      ORDER BY u.full_name
    `, [id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add student to batch
const addStudentToBatch = async (req, res) => {
  const { id } = req.params; // batch id
  const { student_id } = req.body;
  try {
    await pool.query(
      'INSERT INTO student_batches (student_id, batch_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [student_id, id]
    );
    res.json({ message: 'Student added to batch' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Remove student from batch
const removeStudentFromBatch = async (req, res) => {
  const { id, student_id } = req.params;
  try {
    await pool.query(
      'DELETE FROM student_batches WHERE batch_id = $1 AND student_id = $2',
      [id, student_id]
    );
    res.json({ message: 'Student removed from batch' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all students not yet in a batch (for enrollment dropdown)
const getStudentsNotInBatch = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(`
      SELECT s.*, u.full_name, u.email
      FROM students s
      JOIN users u ON s.user_id = u.id
      WHERE s.id NOT IN (
        SELECT student_id FROM student_batches WHERE batch_id = $1
      )
      ORDER BY u.full_name
    `, [id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const [users, batches, tests, students] = await Promise.all([
      pool.query('SELECT role, COUNT(*) as count FROM users GROUP BY role'),
      pool.query('SELECT COUNT(*) as count FROM batches'),
      pool.query('SELECT COUNT(*) as count FROM tests'),
      pool.query('SELECT COUNT(*) as count FROM students'),
    ]);
    res.json({
      users: users.rows,
      batches: batches.rows[0].count,
      tests: tests.rows[0].count,
      students: students.rows[0].count,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getUsers, createUser, updateUser, deleteUser,
  updateUserRole: updateUser, // backward compat alias
  resetPassword,
  getBatches, createBatch, updateBatch, deleteBatch,
  getBatchStudents, addStudentToBatch, removeStudentFromBatch, getStudentsNotInBatch,
  getStudentProfile, upsertStudentProfile,
  getDashboardStats,
};
