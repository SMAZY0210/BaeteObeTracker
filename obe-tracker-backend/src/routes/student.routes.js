const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const c = require('../controllers/student.controller');

router.use(authenticate, authorize('STUDENT'));

router.get('/courses', c.getEnrolledCourses);
router.get('/courses/:courseId/marks', c.getMyMarks);
router.get('/courses/:courseId/attainment', c.getMyAttainment);
router.get('/program-attainment', c.getProgramAttainment);

module.exports = router;
