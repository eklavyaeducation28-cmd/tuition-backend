const pool = require('../config/db');
const { uploadToCloudinary } = require('../utils/helpers');

const createAnnouncement = async (req, res) => {
  const { title, content, target_batch_id } = req.body;
  try {
    let file_url = null;
    if (req.file) file_url = await uploadToCloudinary(req.file.path, 'announcements');
    const result = await pool.query(
      'INSERT INTO announcements (title, content, file_url, target_batch_id, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [title, content, file_url, target_batch_id || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getAnnouncements = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.*, u.full_name as created_by_name, b.name as batch_name
      FROM announcements a LEFT JOIN users u ON a.created_by = u.id LEFT JOIN batches b ON a.target_batch_id = b.id
      ORDER BY a.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const deleteAnnouncement = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM announcements WHERE id=$1', [id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { createAnnouncement, getAnnouncements, deleteAnnouncement };
