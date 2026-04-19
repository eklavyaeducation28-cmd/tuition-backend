const pool = require('../config/db');
const xlsx = require('xlsx');
const { uploadToCloudinary, calculatePercentage } = require('../utils/helpers');

const getMyBatches = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.*,
        (SELECT COUNT(*) FROM student_batches sb WHERE sb.batch_id = b.id) as student_count
      FROM batches b WHERE b.teacher_id = $1 ORDER BY b.created_at DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getBatchStudents = async (req, res) => {
  const { batch_id } = req.params;
  try {
    const result = await pool.query(`
      SELECT s.*, u.full_name, u.email, u.phone
      FROM students s
      JOIN users u ON s.user_id = u.id
      JOIN student_batches sb ON sb.student_id = s.id
      WHERE sb.batch_id = $1
      ORDER BY u.full_name
    `, [batch_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteTest = async (req, res) => {
  const { test_id } = req.params;
  try {
    const check = await pool.query(
      'SELECT t.id FROM tests t JOIN batches b ON t.batch_id = b.id WHERE t.id=$1 AND b.teacher_id=$2',
      [test_id, req.user.id]
    );
    if (!check.rows[0]) return res.status(403).json({ error: 'Not allowed' });
    // Delete dependents that don't have ON DELETE CASCADE
    await pool.query('DELETE FROM queries WHERE test_id=$1', [test_id]);
    await pool.query('DELETE FROM tests WHERE id=$1', [test_id]);
    res.json({ message: 'Test deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateTest = async (req, res) => {
  const { test_id } = req.params;
  const { test_name, test_date, total_marks, description } = req.body;
  try {
    // Verify teacher owns this test
    const check = await pool.query(
      'SELECT t.id FROM tests t JOIN batches b ON t.batch_id = b.id WHERE t.id=$1 AND b.teacher_id=$2',
      [test_id, req.user.id]
    );
    if (!check.rows[0]) return res.status(403).json({ error: 'Not allowed' });

    let question_paper_url;
    if (req.file) {
      question_paper_url = await uploadToCloudinary(req.file.path, 'question-papers');
    }

    const fields = [];
    const vals = [];
    let i = 1;
    if (test_name)        { fields.push(`test_name=$${i++}`);        vals.push(test_name); }
    if (test_date)        { fields.push(`test_date=$${i++}`);        vals.push(test_date); }
    if (total_marks)      { fields.push(`total_marks=$${i++}`);      vals.push(total_marks); }
    if (description !== undefined) { fields.push(`description=$${i++}`); vals.push(description); }
    if (question_paper_url) { fields.push(`question_paper_url=$${i++}`); vals.push(question_paper_url); }

    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    vals.push(test_id);
    const result = await pool.query(
      `UPDATE tests SET ${fields.join(', ')} WHERE id=$${i} RETURNING *`,
      vals
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createTest = async (req, res) => {
  const { batch_id, test_name, test_date, total_marks, description } = req.body;
  try {
    let question_paper_url = null;
    if (req.file) question_paper_url = await uploadToCloudinary(req.file.path, 'question-papers');
    const result = await pool.query(
      'INSERT INTO tests (batch_id, test_name, test_date, total_marks, description, question_paper_url, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [batch_id, test_name, test_date, total_marks, description, question_paper_url, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getTests = async (req, res) => {
  const { batch_id } = req.query;
  try {
    // Build query without template literal interpolation to avoid $ stripping
    const params = [req.user.id];
    let query = 'SELECT t.*, b.name as batch_name, b.id as batch_id, u.full_name as uploaded_by_name,'
      + ' (SELECT COUNT(*) FROM marks m WHERE m.test_id = t.id) as marks_entered'
      + ' FROM tests t JOIN batches b ON t.batch_id = b.id LEFT JOIN users u ON t.uploaded_by = u.id'
      + ' WHERE b.teacher_id = $1';
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

const uploadMarksManual = async (req, res) => {
  const { test_id, marks_data } = req.body;
  try {
    const test = await pool.query('SELECT * FROM tests WHERE id = $1', [test_id]);
    if (!test.rows[0]) return res.status(404).json({ error: 'Test not found' });
    const results = [];
    for (const entry of marks_data) {
      const pct = calculatePercentage(entry.marks_obtained, test.rows[0].total_marks);
      const r = await pool.query(
        'INSERT INTO marks (test_id, student_id, marks_obtained, percentage, remarks)'
        + ' VALUES ($1,$2,$3,$4,$5)'
        + ' ON CONFLICT (test_id, student_id) DO UPDATE SET marks_obtained=$3, percentage=$4, remarks=$5'
        + ' RETURNING *',
        [test_id, entry.student_id, entry.marks_obtained, pct, entry.remarks || null]
      );
      results.push(r.rows[0]);
    }
    res.json({ message: 'Marks saved', count: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const uploadMarksBulk = async (req, res) => {
  const { test_id } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const test = await pool.query('SELECT * FROM tests WHERE id = $1', [test_id]);
    if (!test.rows[0]) return res.status(404).json({ error: 'Test not found' });
    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);
    const results = [];
    for (const row of data) {
      const studentResult = await pool.query('SELECT id FROM students WHERE roll_number = $1', [String(row.roll_number)]);
      if (!studentResult.rows[0]) continue;
      const pct = calculatePercentage(row.marks_obtained, test.rows[0].total_marks);
      const r = await pool.query(
        'INSERT INTO marks (test_id, student_id, marks_obtained, percentage, remarks)'
        + ' VALUES ($1,$2,$3,$4,$5)'
        + ' ON CONFLICT (test_id, student_id) DO UPDATE SET marks_obtained=$3, percentage=$4, remarks=$5'
        + ' RETURNING *',
        [test_id, studentResult.rows[0].id, row.marks_obtained, pct, row.remarks || null]
      );
      results.push(r.rows[0]);
    }
    const fs = require('fs');
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.json({ message: 'Bulk upload complete', count: results.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const uploadMarksImage = async (req, res) => {
  const { test_id } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  try {
    const imageUrl = await uploadToCloudinary(req.file.path, 'marks-register');
    res.json({ message: 'Image uploaded successfully', image_url: imageUrl, test_id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getMarksBulkTemplate = async (req, res) => {
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.aoa_to_sheet([['roll_number', 'marks_obtained', 'remarks']]);
  xlsx.utils.book_append_sheet(wb, ws, 'Marks');
  const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename=marks_template.xlsx');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
};

const uploadAnswerSheet = async (req, res) => {
  const { test_id, student_id } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const url = await uploadToCloudinary(req.file.path, 'answer-sheets');
    const result = await pool.query(
      'UPDATE marks SET answer_sheet_url = $1 WHERE test_id = $2 AND student_id = $3 RETURNING *',
      [url, test_id, student_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Mark entry not found. Upload marks first.' });
    res.json({ message: 'Answer sheet uploaded', url, mark: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get marks for a test (with student info) — used for editing & answer sheets
const getTestMarks = async (req, res) => {
  const { test_id } = req.params;
  try {
    const result = await pool.query(
      'SELECT m.*, u.full_name, s.roll_number'
      + ' FROM marks m'
      + ' JOIN students s ON m.student_id = s.id'
      + ' JOIN users u ON s.user_id = u.id'
      + ' WHERE m.test_id = $1'
      + ' ORDER BY u.full_name',
      [test_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const markAttendance = async (req, res) => {
  const { batch_id, date, attendance_data } = req.body;
  try {
    for (const entry of attendance_data) {
      await pool.query(
        'INSERT INTO attendance (batch_id, student_id, date, status)'
        + ' VALUES ($1,$2,$3,$4)'
        + ' ON CONFLICT (batch_id, student_id, date) DO UPDATE SET status=$4',
        [batch_id, entry.student_id, date, entry.status]
      );
    }
    res.json({ message: 'Attendance marked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAttendance = async (req, res) => {
  const { batch_id, date } = req.query;
  try {
    const params = [batch_id];
    let cond = '';
    if (date) { params.push(date); cond = ' AND a.date = $' + params.length; }
    const result = await pool.query(
      'SELECT a.*, s.roll_number, u.full_name'
      + ' FROM attendance a'
      + ' JOIN students s ON a.student_id = s.id'
      + ' JOIN users u ON s.user_id = u.id'
      + ' WHERE a.batch_id = $1' + cond
      + ' ORDER BY u.full_name',
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const createHomework = async (req, res) => {
  const { batch_id, title, description, due_date } = req.body;
  try {
    let file_url = null;
    if (req.file) file_url = await uploadToCloudinary(req.file.path, 'homework');
    const result = await pool.query(
      'INSERT INTO homework (batch_id, title, description, file_url, due_date, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [batch_id, title, description, file_url, due_date || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getHomework = async (req, res) => {
  const { batch_id } = req.query;
  try {
    const params = [req.user.id];
    let extra = '';
    if (batch_id) { params.push(batch_id); extra = ' AND h.batch_id = $' + params.length; }
    const result = await pool.query(
      'SELECT h.*, b.name as batch_name, u.full_name as created_by_name'
      + ' FROM homework h JOIN batches b ON h.batch_id = b.id LEFT JOIN users u ON h.created_by = u.id'
      + ' WHERE b.teacher_id = $1' + extra
      + ' ORDER BY h.created_at DESC',
      params
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getQueries = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT q.*, t.test_name, u.full_name as parent_name, s.roll_number, su.full_name as student_name'
      + ' FROM queries q'
      + ' JOIN tests t ON q.test_id = t.id'
      + ' JOIN batches b ON t.batch_id = b.id'
      + ' LEFT JOIN users u ON q.parent_id = u.id'
      + ' LEFT JOIN students s ON q.student_id = s.id'
      + ' LEFT JOIN users su ON s.user_id = su.id'
      + ' WHERE b.teacher_id = $1'
      + ' ORDER BY q.created_at DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const replyQuery = async (req, res) => {
  const { id } = req.params;
  const { reply } = req.body;
  try {
    const result = await pool.query(
      "UPDATE queries SET reply=$1, status='replied', replied_at=NOW() WHERE id=$2 RETURNING *",
      [reply, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAIInsights = async (req, res) => {
  try {
    const alerts = [];
    const dropResult = await pool.query(
      'WITH ranked AS ('
      + ' SELECT m.student_id, t.test_name, m.percentage, t.test_date,'
      + ' ROW_NUMBER() OVER (PARTITION BY m.student_id ORDER BY t.test_date DESC) as rn'
      + ' FROM marks m JOIN tests t ON m.test_id = t.id'
      + ' JOIN batches b ON t.batch_id = b.id WHERE b.teacher_id = $1'
      + '),'
      + ' last3 AS (SELECT * FROM ranked WHERE rn <= 3),'
      + ' analysis AS ('
      + ' SELECT student_id,'
      + ' MAX(CASE WHEN rn=3 THEN percentage END) as oldest,'
      + ' MAX(CASE WHEN rn=1 THEN percentage END) as latest'
      + ' FROM last3 GROUP BY student_id HAVING COUNT(*) = 3'
      + ')'
      + ' SELECT a.student_id, u.full_name, a.oldest, a.latest, (a.oldest - a.latest) as drop_pct'
      + ' FROM analysis a JOIN students s ON a.student_id = s.id JOIN users u ON s.user_id = u.id'
      + ' WHERE (a.oldest - a.latest) > 20',
      [req.user.id]
    );
    alerts.push(...dropResult.rows.map(r => ({ type: 'drop', ...r })));

    const attendResult = await pool.query(
      'SELECT s.id as student_id, u.full_name,'
      + ' ROUND(100.0 * SUM(CASE WHEN a.status=\'present\' THEN 1 ELSE 0 END) / COUNT(*), 2) as attendance_pct'
      + ' FROM attendance a JOIN students s ON a.student_id = s.id JOIN users u ON s.user_id = u.id'
      + ' JOIN batches b ON a.batch_id = b.id WHERE b.teacher_id = $1'
      + ' GROUP BY s.id, u.full_name HAVING COUNT(*) > 0'
      + ' AND ROUND(100.0 * SUM(CASE WHEN a.status=\'present\' THEN 1 ELSE 0 END) / COUNT(*), 2) < 75',
      [req.user.id]
    );
    alerts.push(...attendResult.rows.map(r => ({ type: 'attendance', ...r })));

    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getMyBatches, getBatchStudents, createTest, updateTest, deleteTest, getTests, getTestMarks,
  uploadMarksManual, uploadMarksBulk, uploadMarksImage, getMarksBulkTemplate,
  uploadAnswerSheet,
  markAttendance, getAttendance, createHomework, getHomework,
  getQueries, replyQuery, getAIInsights,
};
