const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const c = require('../controllers/bulk.controller');

router.use(authenticate);

router.post('/students', authorize('ADMIN'), c.uploadMiddleware, c.bulkImportStudents);
router.post('/marks/:assessmentId', authorize('ADMIN', 'FACULTY'), c.uploadMiddleware, c.bulkImportMarks);
router.get('/templates/students', authorize('ADMIN'), c.getStudentTemplate);
router.get('/templates/marks/:assessmentId', authorize('ADMIN', 'FACULTY'), c.getMarksTemplate);

module.exports = router;
