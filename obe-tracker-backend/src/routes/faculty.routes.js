const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const c = require('../controllers/faculty.controller');

router.use(authenticate, authorize('ADMIN', 'FACULTY'));

router.get('/courses', c.getMyCourses);

router.get('/courses/:courseId/outcomes', c.getCourseOutcomes);
router.post('/courses/:courseId/outcomes', c.createCourseOutcome);
router.put('/courses/:courseId/outcomes/:id', c.updateCourseOutcome);
router.delete('/courses/:courseId/outcomes/:id', c.deleteCourseOutcome);

router.get('/courses/:courseId/mapping', c.getMapping);
router.post('/courses/:courseId/mapping', c.saveMapping);

router.get('/courses/:courseId/assessments', c.getAssessments);
router.post('/courses/:courseId/assessments', c.createAssessment);
router.delete('/courses/:courseId/assessments/:id', c.deleteAssessment);

router.get('/assessments/:assessmentId/marks', c.getMarks);
router.post('/assessments/:assessmentId/marks', c.saveMarks);

router.get('/courses/:courseId/attainment', c.getCourseAttainment);
router.get('/courses/:courseId/students', c.getCourseStudents);
router.get('/courses/:courseId/students/:studentId/attainment', c.getStudentAttainment);
router.put('/courses/:courseId/assessments/:assessmentId/attainment-mark', c.updateAssessmentAttainmentMark);

module.exports = router;
