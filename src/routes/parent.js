const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/parentController');

router.use(authenticate, authorize('parent'));

router.get('/children', ctrl.getChildren);
router.get('/marks', ctrl.getChildMarks);
router.get('/attendance', ctrl.getChildAttendance);
router.get('/homework', ctrl.getChildHomework);
router.get('/tests/:test_id/download', ctrl.downloadTestPaper);
router.get('/answer-sheet', ctrl.getAnswerSheet);
router.get('/report-card', ctrl.getReportCardData);
router.post('/queries', ctrl.postQuery);
router.get('/queries', ctrl.getQueries);
router.get('/announcements', ctrl.getAnnouncements);

module.exports = router;
