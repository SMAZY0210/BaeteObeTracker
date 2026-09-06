const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const c = require('../controllers/admin.controller');
const pol = require('../controllers/policy.controller');

router.use(authenticate, authorize('ADMIN'));

// Dashboard
router.get('/dashboard', c.getDashboard);

// Faculties
router.get('/faculties', c.getFaculties);
router.post('/faculties', c.createFaculty);
router.put('/faculties/:id', c.updateFaculty);
router.delete('/faculties/:id', c.deleteFaculty);

// Departments
router.get('/departments', c.getDepartments);
router.post('/departments', c.createDepartment);
router.put('/departments/:id', c.updateDepartment);
router.delete('/departments/:id', c.deleteDepartment);

// Programs
router.get('/programs', c.getPrograms);
router.post('/programs', c.createProgram);
router.put('/programs/:id', c.updateProgram);
router.delete('/programs/:id', c.deleteProgram);

// Program Outcomes
router.get('/programs/:programId/outcomes', c.getProgramOutcomes);
router.post('/programs/:programId/outcomes', c.createProgramOutcome);
router.put('/outcomes/:id', c.updateProgramOutcome);
router.delete('/outcomes/:id', c.deleteProgramOutcome);

// Batches
router.get('/batches', c.getBatches);
router.post('/batches', c.createBatch);
router.put('/batches/:id', c.updateBatch);
router.delete('/batches/:id', c.deleteBatch);

// Academic Sessions (Jan-Jun / Jul-Dec + year)
router.get('/academic-sessions', c.getAcademicSessions);
router.post('/academic-sessions', c.createAcademicSession);
router.put('/academic-sessions/:id', c.updateAcademicSession);
router.delete('/academic-sessions/:id', c.deleteAcademicSession);

// Courses (catalog: belongs to a curriculum version, filterable by it)
router.get('/courses', c.getCourses);
router.post('/courses', c.createCourse);
router.put('/courses/:id', c.updateCourse);
router.delete('/courses/:id', c.deleteCourse);

// Course Assignment (assign an existing course to a faculty for a session)
router.get('/course-assignments', c.getCourseAssignments);
router.post('/course-assignments', c.createCourseAssignment);
router.delete('/course-assignments/:id', c.deleteCourseAssignment);

// Users
router.get('/users', c.getUsers);
router.post('/users', c.createUser);
router.put('/users/:id', c.updateUser);

router.get('/attainment-report', c.getAttainmentReport);
router.post('/users/bulk', c.bulkCreateUsers);
router.get('/students/:studentId/attainment', c.getStudentAttainmentAdmin);

// Curriculum versions. POs belong to a version, so a revision is a new version
// rather than an edit to outcomes a graduated cohort was assessed against.
router.get('/programs/:programId/curriculum-versions', c.getCurriculumVersions);
router.post('/programs/:programId/curriculum-versions', c.createCurriculumVersion);
router.put('/curriculum-versions/:id', c.updateCurriculumVersion);
router.delete('/curriculum-versions/:id', c.deleteCurriculumVersion);

// Accreditation framework (read-only; seeded by prisma/seed-framework.js)
router.get('/framework', pol.getFramework);

// Threshold policy. Replaces GET/PUT /thresholds, which never wrote anything.
// Versioned per program: POST creates a new version and closes the previous one
// rather than editing in place, because editing in place would silently rescore
// every cohort already computed, graduated ones included.
router.get('/programs/:programId/policy', pol.getActivePolicy);
router.get('/programs/:programId/policy/history', pol.getPolicyHistory);
router.post('/programs/:programId/policy', pol.createPolicy);

// Enrolments
router.get('/enrolments', c.getEnrolments);
router.post('/enrolments', c.enrolStudents);
router.delete('/enrolments/:id', c.removeEnrolment);

module.exports = router;
