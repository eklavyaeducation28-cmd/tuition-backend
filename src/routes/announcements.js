const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const ctrl = require('../controllers/announcementController');

router.get('/', authenticate, ctrl.getAnnouncements);
router.post('/', authenticate, authorize('admin', 'teacher'), upload.single('file'), ctrl.createAnnouncement);
router.delete('/:id', authenticate, authorize('admin'), ctrl.deleteAnnouncement);

module.exports = router;
