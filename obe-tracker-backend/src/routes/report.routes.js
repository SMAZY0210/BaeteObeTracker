const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const c = require('../controllers/report.controller');

router.use(authenticate);

router.post('/course/:courseId', authorize('ADMIN', 'FACULTY'), c.generateCourseReport);
router.post('/transcript', authorize('STUDENT'), c.generateStudentTranscript);
router.get('/:reportId/download', c.downloadReport);

module.exports = router;
