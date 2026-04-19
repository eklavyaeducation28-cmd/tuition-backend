const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/adminController');

router.use(authenticate, authorize('admin'));

router.get('/dashboard', ctrl.getDashboardStats);
router.get('/users', ctrl.getUsers);
router.post('/users', ctrl.createUser);
router.put('/users/:id', ctrl.updateUser);
router.delete('/users/:id', ctrl.deleteUser);
router.put('/users/:id/role', ctrl.updateUser);
router.post('/reset-password/:id', ctrl.resetPassword);

// Student profile (for student users)
router.get('/users/:id/student-profile', ctrl.getStudentProfile);
router.put('/users/:id/student-profile', ctrl.upsertStudentProfile);

// Batches
router.get('/batches', ctrl.getBatches);
router.post('/batches', ctrl.createBatch);
router.put('/batches/:id', ctrl.updateBatch);
router.delete('/batches/:id', ctrl.deleteBatch);
router.get('/batches/:id/students', ctrl.getBatchStudents);
router.get('/batches/:id/students/available', ctrl.getStudentsNotInBatch);
router.post('/batches/:id/students', ctrl.addStudentToBatch);
router.delete('/batches/:id/students/:student_id', ctrl.removeStudentFromBatch);

module.exports = router;
