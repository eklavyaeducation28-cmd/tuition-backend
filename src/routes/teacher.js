const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const ctrl = require('../controllers/teacherController');

router.use(authenticate, authorize('teacher', 'admin'));

router.get('/batches', ctrl.getMyBatches);
router.get('/batches/:batch_id/students', ctrl.getBatchStudents);
router.get('/tests', ctrl.getTests);
router.post('/tests', upload.single('question_paper'), ctrl.createTest);
router.put('/tests/:test_id', upload.single('question_paper'), ctrl.updateTest);
router.delete('/tests/:test_id', ctrl.deleteTest);
router.get('/tests/:test_id/marks', ctrl.getTestMarks);
router.post('/marks/manual', ctrl.uploadMarksManual);
router.post('/marks/bulk', upload.single('file'), ctrl.uploadMarksBulk);
router.post('/marks/image', upload.single('image'), ctrl.uploadMarksImage);
router.get('/marks/template', ctrl.getMarksBulkTemplate);
router.post('/marks/answer-sheet', upload.single('file'), ctrl.uploadAnswerSheet);
router.post('/attendance', ctrl.markAttendance);
router.get('/attendance', ctrl.getAttendance);
router.get('/homework', ctrl.getHomework);
router.post('/homework', upload.single('file'), ctrl.createHomework);
router.get('/queries', ctrl.getQueries);
router.put('/queries/:id/reply', ctrl.replyQuery);
router.get('/insights', ctrl.getAIInsights);

module.exports = router;
