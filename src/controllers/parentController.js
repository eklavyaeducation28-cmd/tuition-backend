const pool = require('../config/db');

const getChildren = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, u.full_name, u.email, u.phone
      FROM students s JOIN users u ON s.user_id = u.id
      WHERE s.parent_id = $1
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getChildMarks = async (req, res) => {
  const { student_id, batch_id } = req.query;
  try {
    const check = await pool.query('SELECT id FROM students WHERE id=$1 AND parent_id=$2', [student_id, req.user.id]);
    if (!check.rows[0]) return res.status(403).json({ error: 'Access denied' });

    let query = 'SELECT m.id, m.test_id, m.student_id, m.marks_obtained, m.percentage, m.remarks, m.answer_sheet_url,'
      + ' t.test_name, t.test_date, t.total_marks, t.question_paper_url, b.name as batch_name, b.subject,'
      + ' (SELECT ROUND(AVG(m2.percentage)::numeric,2) FROM marks m2 WHERE m2.test_id = m.test_id) as class_avg'
      + ' FROM marks m'
      + ' JOIN tests t ON m.test_id = t.id'
      + ' JOIN batches b ON t.batch_id = b.id'
      + ' WHERE m.student_id = $1';
    const params = [student_id];
    if (batch_id) {
      params.push(batch_id);
      query += ' AND t.batch_id = $' + params.length;
    }
    query += ' ORDER BY t.test_date DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getChildAttendance = async (req, res) => {
  const { student_id } = req.query;
  try {
    const check = await pool.query('SELECT id FROM students WHERE id=$1 AND parent_id=$2', [student_id, req.user.id]);
    if (!check.rows[0]) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(`
      SELECT a.*, b.name as batch_name
      FROM attendance a JOIN batches b ON a.batch_id = b.id
      WHERE a.student_id = $1 ORDER BY a.date DESC
    `, [student_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getChildHomework = async (req, res) => {
  const { student_id } = req.query;
  try {
    const check = await pool.query('SELECT id FROM students WHERE id=$1 AND parent_id=$2', [student_id, req.user.id]);
    if (!check.rows[0]) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(`
      SELECT h.*, b.name as batch_name
      FROM homework h
      JOIN student_batches sb ON sb.batch_id = h.batch_id
      JOIN batches b ON h.batch_id = b.id
      WHERE sb.student_id = $1
      ORDER BY h.created_at DESC
    `, [student_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const downloadTestPaper = async (req, res) => {
  const { test_id } = req.params;
  try {
    const check = await pool.query(`
      SELECT t.question_paper_url FROM tests t
      JOIN student_batches sb ON sb.batch_id = t.batch_id
      JOIN students s ON sb.student_id = s.id
      WHERE t.id = $1 AND s.parent_id = $2
    `, [test_id, req.user.id]);
    if (!check.rows[0]) return res.status(403).json({ error: 'Access denied' });
    res.json({ url: check.rows[0].question_paper_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Parent can view their child's answer sheet for a specific test
const getAnswerSheet = async (req, res) => {
  const { test_id, student_id } = req.query;
  try {
    const check = await pool.query('SELECT id FROM students WHERE id=$1 AND parent_id=$2', [student_id, req.user.id]);
    if (!check.rows[0]) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      'SELECT answer_sheet_url FROM marks WHERE test_id=$1 AND student_id=$2',
      [test_id, student_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'No mark entry found' });
    res.json({ url: result.rows[0].answer_sheet_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getReportCardData = async (req, res) => {
  const { student_id } = req.query;
  try {
    const check = await pool.query('SELECT * FROM students WHERE id=$1 AND parent_id=$2', [student_id, req.user.id]);
    if (!check.rows[0]) return res.status(403).json({ error: 'Access denied' });
    const student = check.rows[0];
    const userResult = await pool.query('SELECT full_name, email FROM users WHERE id=$1', [student.user_id]);
    const marks = await pool.query(`
      SELECT m.*, t.test_name, t.test_date, t.total_marks, b.name as batch_name, b.subject
      FROM marks m JOIN tests t ON m.test_id = t.id JOIN batches b ON t.batch_id = b.id
      WHERE m.student_id = $1 ORDER BY t.test_date
    `, [student_id]);
    const attendance = await pool.query(`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status='late' THEN 1 ELSE 0 END) as late
      FROM attendance WHERE student_id = $1
    `, [student_id]);
    const rankResult = await pool.query(`
      SELECT student_id, RANK() OVER (ORDER BY AVG(percentage) DESC) as rank,
        COUNT(*) OVER () as total_students, AVG(percentage) as avg_pct
      FROM marks GROUP BY student_id
    `);
    const myRank = rankResult.rows.find(r => r.student_id === student_id);
    res.json({
      student: { ...student, ...userResult.rows[0] },
      marks: marks.rows,
      attendance: attendance.rows[0],
      rank: myRank,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const postQuery = async (req, res) => {
  const { test_id, student_id, message } = req.body;
  try {
    const check = await pool.query('SELECT id FROM students WHERE id=$1 AND parent_id=$2', [student_id, req.user.id]);
    if (!check.rows[0]) return res.status(403).json({ error: 'Access denied' });
    const result = await pool.query(
      'INSERT INTO queries (test_id, parent_id, student_id, message) VALUES ($1,$2,$3,$4) RETURNING *',
      [test_id, req.user.id, student_id, message]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getQueries = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT q.*, t.test_name, su.full_name as student_name
      FROM queries q LEFT JOIN tests t ON q.test_id = t.id
      LEFT JOIN students s ON q.student_id = s.id LEFT JOIN users su ON s.user_id = su.id
      WHERE q.parent_id = $1 ORDER BY q.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAnnouncements = async (req, res) => {
  const { student_id } = req.query;
  try {
    let batchIds = [];
    if (student_id) {
      const batches = await pool.query(
        'SELECT batch_id FROM student_batches sb JOIN students s ON sb.student_id = s.id WHERE s.id=$1 AND s.parent_id=$2',
        [student_id, req.user.id]
      );
      batchIds = batches.rows.map(r => r.batch_id);
    }
    const result = await pool.query(
      `SELECT a.*, u.full_name as created_by_name, b.name as batch_name
       FROM announcements a LEFT JOIN users u ON a.created_by = u.id LEFT JOIN batches b ON a.target_batch_id = b.id
       WHERE a.target_batch_id IS NULL ${batchIds.length ? 'OR a.target_batch_id = ANY($1::uuid[])' : ''}
       ORDER BY a.created_at DESC`,
      batchIds.length ? [batchIds] : []
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getChildren, getChildMarks, getChildAttendance, getChildHomework,
  downloadTestPaper, getAnswerSheet, getReportCardData,
  postQuery, getQueries, getAnnouncements,
};
