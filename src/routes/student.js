const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/studentController');

router.use(authenticate, authorize('student'));

router.get('/profile', ctrl.getMyProfile);
router.get('/marks', ctrl.getMyMarks);
router.get('/attendance', ctrl.getMyAttendance);
router.get('/homework', ctrl.getMyHomework);

module.exports = router;
