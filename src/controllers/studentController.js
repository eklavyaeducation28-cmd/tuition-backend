const pool = require('../config/db');

const getMyProfile = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT s.*, u.full_name, u.email, u.phone'
      + ' FROM students s JOIN users u ON s.user_id = u.id WHERE s.user_id = $1',
      [req.user.id]
    );
    res.json(result.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMyMarks = async (req, res) => {
  try {
    const student = await pool.query('SELECT id FROM students WHERE user_id=$1', [req.user.id]);
    if (!student.rows[0]) return res.status(404).json({ error: 'Student profile not found' });

    // Use a subquery for class_avg to avoid window-function row duplication
    const result = await pool.query(
      'SELECT m.id, m.test_id, m.student_id, m.marks_obtained, m.percentage, m.remarks, m.answer_sheet_url,'
      + ' t.test_name, t.test_date, t.total_marks,'
      + ' b.name as batch_name, b.subject,'
      + ' (SELECT ROUND(AVG(m2.percentage)::numeric, 2) FROM marks m2 WHERE m2.test_id = m.test_id) as class_avg'
      + ' FROM marks m'
      + ' JOIN tests t ON m.test_id = t.id'
      + ' JOIN batches b ON t.batch_id = b.id'
      + ' WHERE m.student_id = $1'
      + ' ORDER BY t.test_date ASC',
      [student.rows[0].id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMyAttendance = async (req, res) => {
  try {
    const student = await pool.query('SELECT id FROM students WHERE user_id=$1', [req.user.id]);
    if (!student.rows[0]) return res.status(404).json({ error: 'Student profile not found' });

    const result = await pool.query(
      'SELECT a.*, b.name as batch_name FROM attendance a'
      + ' JOIN batches b ON a.batch_id = b.id'
      + ' WHERE a.student_id = $1 ORDER BY a.date DESC',
      [student.rows[0].id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMyHomework = async (req, res) => {
  try {
    const student = await pool.query('SELECT id FROM students WHERE user_id=$1', [req.user.id]);
    if (!student.rows[0]) return res.status(404).json({ error: 'Student profile not found' });

    const result = await pool.query(
      'SELECT h.*, b.name as batch_name FROM homework h'
      + ' JOIN student_batches sb ON sb.batch_id = h.batch_id'
      + ' JOIN batches b ON h.batch_id = b.id'
      + ' WHERE sb.student_id = $1 ORDER BY h.created_at DESC',
      [student.rows[0].id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getMyProfile, getMyMarks, getMyAttendance, getMyHomework };
