const path = require('path');
const fs = require('fs');

const generateTempPassword = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

// Store file locally and return a public URL path
const saveFileLocally = (filePath) => {
  const filename = path.basename(filePath);
  const base = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
  return `${base}/uploads/${filename}`;
};

// Keep the same function signature so all callers work unchanged
const uploadToCloudinary = async (filePath, _folder) => {
  const url = saveFileLocally(filePath);
  return url;
};

const calculatePercentage = (obtained, total) => {
  if (!total) return 0;
  return parseFloat(((obtained / total) * 100).toFixed(2));
};

module.exports = { generateTempPassword, uploadToCloudinary, calculatePercentage };
