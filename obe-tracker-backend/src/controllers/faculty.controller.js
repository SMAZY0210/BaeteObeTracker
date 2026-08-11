const prisma = require('../prisma');
const { recomputeAttainmentForCourse } = require('../services/attainment.service');
const { getPolicyForCourse } = require('../services/policy.service');

// ── My Courses ───────────────────────────────────────────────
const getMyCourses = async (req, res, next) => {
  try {
    const { userId, role, institutionId } = req.user;
    const where = {
      deletedAt: null,
      program: { department: { institutionId } },
      ...(role !== 'ADMIN' && { assignments: { some: { facultyId: userId } } }),
    };
    const courses = await prisma.course.findMany({
      where,
      include: {
        program: { select: { name: true, code: true } },
        session: { select: { name: true, status: true } },
        assignments: { include: { faculty: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ status: 'success', data: courses });
  } catch (err) { next(err); }
};

// ── Course Outcomes (include PO mappings) ────────────────────
const getCourseOutcomes = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    await assertFacultyOwns(req.user, courseId);
    const items = await prisma.courseOutcome.findMany({
      where: { courseId, deletedAt: null },
      include: {
        mappings: {
          include: { programOutcome: { select: { id: true, code: true, title: true } } },
        },
      },
      orderBy: { code: 'asc' },
    });
    res.json({ status: 'success', data: items });
  } catch (err) { next(err); }
};

const createCourseOutcome = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    await assertFacultyOwns(req.user, courseId);
    const { code, title, description, bloomDomain, bloomLevel, profileType, profileCode } = req.body;
    // Check for duplicate code in this course
    const existing = await prisma.courseOutcome.findFirst({
      where: { courseId, code, deletedAt: null },
    });
    if (existing) {
      return res.status(409).json({ status: 'error', error: `CO code "${code}" already exists in this course.` });
    }
    const item = await prisma.courseOutcome.create({
      data: { courseId, code, title, description, bloomDomain, bloomLevel, profileType, profileCode },
    });
    res.status(201).json({ status: 'success', data: item });
  } catch (err) { next(err); }
};

const updateCourseOutcome = async (req, res, next) => {
  try {
    const { courseId, id } = req.params;
    await assertFacultyOwns(req.user, courseId);
    const { code, title, description, bloomDomain, bloomLevel, profileType, profileCode } = req.body;
    // Check for duplicate code (excluding this CO)
    const existing = await prisma.courseOutcome.findFirst({
      where: { courseId, code, deletedAt: null, NOT: { id } },
    });
    if (existing) {
      return res.status(409).json({ status: 'error', error: `CO code "${code}" already exists in this course.` });
    }
    const item = await prisma.courseOutcome.update({
      where: { id },
      data: { code, title, description, bloomDomain, bloomLevel, profileType, profileCode },
    });
    res.json({ status: 'success', data: item });
  } catch (err) { next(err); }
};

const deleteCourseOutcome = async (req, res, next) => {
  try {
    const { courseId, id } = req.params;
    await assertFacultyOwns(req.user, courseId);
    const hasMapping = await prisma.coPoMapping.findFirst({ where: { courseOutcomeId: id } });
    const hasAssessment = await prisma.assessmentCO.findFirst({ where: { courseOutcomeId: id } });
    if (hasMapping || hasAssessment) {
      return res.status(409).json({ status: 'error', error: 'CO has mappings or assessments. Remove those first.' });
    }
    await prisma.courseOutcome.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    res.json({ status: 'success', data: { message: 'CO removed' } });
  } catch (err) { next(err); }
};

// ── CO-PO Mapping (simple list, no matrix) ───────────────────
const getMapping = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const [cos, pos, mappings] = await Promise.all([
      prisma.courseOutcome.findMany({ where: { courseId, deletedAt: null }, orderBy: { code: 'asc' } }),
      prisma.programOutcome.findMany({
        where: { program: { courses: { some: { id: courseId } } }, deletedAt: null },
        orderBy: { code: 'asc' },
      }),
      prisma.coPoMapping.findMany({ where: { courseId } }),
    ]);
    const numSort = (a, b) => {
      const nA = parseInt(a.code.replace(/\D+/g, ''), 10);
      const nB = parseInt(b.code.replace(/\D+/g, ''), 10);
      return isNaN(nA) || isNaN(nB) ? a.code.localeCompare(b.code) : nA - nB;
    };
    cos.sort(numSort); pos.sort(numSort);
    res.json({ status: 'success', data: { courseOutcomes: cos, programOutcomes: pos, mappings } });
  } catch (err) { next(err); }
};

const saveMapping = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    await assertFacultyOwns(req.user, courseId);
    const { mappings } = req.body;
    const existing = await prisma.coPoMapping.findFirst({ where: { courseId }, orderBy: { version: 'desc' } });
    const nextVersion = (existing?.version || 0) + 1;
    await prisma.$transaction(
      mappings.map(({ courseOutcomeId, programOutcomeId, correlation }) =>
        prisma.coPoMapping.upsert({
          where: { courseId_courseOutcomeId_programOutcomeId: { courseId, courseOutcomeId, programOutcomeId } },
          create: { courseId, courseOutcomeId, programOutcomeId, correlation: correlation || null, version: nextVersion },
          update: { correlation: correlation || null, version: nextVersion },
        })
      )
    );
    await recomputeAttainmentForCourse(courseId, nextVersion, req.user.institutionId);
    res.json({ status: 'success', data: { message: 'Mapping saved', version: nextVersion } });
  } catch (err) { next(err); }
};

// ── Assessments (no weight, just totalMarks and CO links) ─────
const getAssessments = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const items = await prisma.assessment.findMany({
      where: { courseId, deletedAt: null },
      include: {
        assessmentCOs: {
          include: { courseOutcome: { select: { id: true, code: true, title: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ status: 'success', data: { assessments: items } });
  } catch (err) { next(err); }
};

const createAssessment = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    await assertFacultyOwns(req.user, courseId);
    const { type, title, totalMarks, courseOutcomeIds } = req.body;
    const item = await prisma.assessment.create({
      data: {
        courseId, type, title,
        totalMarks: parseFloat(totalMarks),
        weight: 0, // weight removed from UI but field exists in schema
        assessmentCOs: { create: (courseOutcomeIds || []).map(coId => ({ courseOutcomeId: coId })) },
      },
      include: { assessmentCOs: true },
    });
    res.status(201).json({ status: 'success', data: item });
  } catch (err) { next(err); }
};

const deleteAssessment = async (req, res, next) => {
  try {
    const { courseId, id } = req.params;
    await assertFacultyOwns(req.user, courseId);
    const hasMarks = await prisma.mark.findFirst({ where: { assessmentId: id } });
    if (hasMarks) return res.status(409).json({ status: 'error', error: 'Assessment has marks and cannot be deleted.' });
    await prisma.assessment.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    res.json({ status: 'success', data: { message: 'Assessment deleted' } });
  } catch (err) { next(err); }
};

// ── Marks ────────────────────────────────────────────────────
const getMarks = async (req, res, next) => {
  try {
    const { assessmentId } = req.params;
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { courseId: true, totalMarks: true },
    });
    if (!assessment) return res.status(404).json({ status: 'error', error: 'Assessment not found' });

    const enrolments = await prisma.enrolment.findMany({
      where: { courseId: assessment.courseId },
      select: { studentId: true },
    });
    const studentIds = enrolments.map(e => e.studentId);

    const students = await prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, firstName: true, lastName: true, institutionalId: true, section: true },
      orderBy: { institutionalId: 'asc' },
    });

    const existingMarks = await prisma.mark.findMany({ where: { assessmentId } });
    const markMap = Object.fromEntries(existingMarks.map(m => [m.studentId, m.marksObtained]));

    const data = students.map(s => ({
      studentId:       s.id,
      institutionalId: s.institutionalId || '',
      name:            `${s.firstName} ${s.lastName}`,
      marksObtained:   markMap[s.id] ?? null,
    }));

    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

const saveMarks = async (req, res, next) => {
  try {
    const { assessmentId } = req.params;
    const { marks } = req.body;
    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) return res.status(404).json({ status: 'error', error: 'Assessment not found' });

    const invalid = marks.filter(m => m.marksObtained < 0 || m.marksObtained > assessment.totalMarks);
    if (invalid.length) {
      return res.status(400).json({ status: 'error', error: `Marks out of range [0, ${assessment.totalMarks}]` });
    }

    const prevMarks = await prisma.mark.findMany({ where: { assessmentId } });
    const prevMap = Object.fromEntries(prevMarks.map(m => [m.studentId, m.marksObtained]));

    await prisma.$transaction([
      ...marks.map(({ studentId, marksObtained }) =>
        prisma.mark.upsert({
          where: { assessmentId_studentId: { assessmentId, studentId } },
          create: { assessmentId, studentId, marksObtained },
          update: { marksObtained },
        })
      ),
      ...marks
        .filter(m => prevMap[m.studentId] !== m.marksObtained)
        .map(m => prisma.markAuditLog.create({
          data: {
            assessmentId, studentId: m.studentId,
            changedById: req.user.userId,
            beforeValue: prevMap[m.studentId] ?? null,
            afterValue: m.marksObtained,
          },
        })),
    ]);

    await recomputeAttainmentForCourse(assessment.courseId, null, req.user.institutionId);
    res.json({ status: 'success', data: { message: `${marks.length} marks saved` } });
  } catch (err) { next(err); }
};

// ── Attainment (% of students who attained each CO/PO) ───────
const getCourseAttainment = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    await assertFacultyOwns(req.user, courseId);

    const coRaw = await prisma.coAttainment.findMany({
      where: { courseId },
      include: { courseOutcome: { select: { code: true, title: true } } },
    });
    const poRaw = await prisma.poAttainment.findMany({
      where: { courseId },
      include: { programOutcome: { select: { code: true, title: true } } },
    });

    // Group by CO/PO and compute % of students who attained
    const coMap = {};
    coRaw.forEach(r => {
      if (!coMap[r.courseOutcomeId]) coMap[r.courseOutcomeId] = { co: r.courseOutcome, attained: 0, total: 0 };
      coMap[r.courseOutcomeId].total++;
      if (r.level === 'L3') coMap[r.courseOutcomeId].attained++;
    });
    const poMap = {};
    poRaw.forEach(r => {
      if (!poMap[r.programOutcomeId]) poMap[r.programOutcomeId] = { po: r.programOutcome, attained: 0, total: 0 };
      poMap[r.programOutcomeId].total++;
      if (r.level === 'L3') poMap[r.programOutcomeId].attained++;
    });

    const coSummary = Object.values(coMap).map(({ co, attained, total }) => ({
      code: co.code, title: co.title,
      attainedCount: attained, totalStudents: total,
      attainmentRate: total ? (attained / total * 100) : 0,
    }));
    const poSummary = Object.values(poMap).map(({ po, attained, total }) => ({
      code: po.code, title: po.title,
      attainedCount: attained, totalStudents: total,
      attainmentRate: total ? (attained / total * 100) : 0,
    }));

    // Sort numerically
    const numSort = (a, b) => {
      const nA = parseInt(a.code.replace(/\D+/g, ''), 10);
      const nB = parseInt(b.code.replace(/\D+/g, ''), 10);
      return isNaN(nA) || isNaN(nB) ? a.code.localeCompare(b.code) : nA - nB;
    };
    coSummary.sort(numSort); poSummary.sort(numSort);

    res.json({ status: 'success', data: { coSummary, poSummary } });
  } catch (err) { next(err); }
};

// ── Recompute ────────────────────────────────────────────────
// The local recomputeAttainmentForCourse() used to live here. It has moved to
// src/services/attainment.service.js, which keeps the same signature but also
// writes the tier-2 CourseCoAttainment rows and generates CQI candidates.
// Imported at the top of this file; call sites are unchanged.

async function assertFacultyOwns(user, courseId) {
  if (user.role === 'ADMIN') return;
  const a = await prisma.courseAssignment.findFirst({ where: { courseId, facultyId: user.userId } });
  if (!a) { const e = new Error('Not assigned to this course'); e.status = 403; throw e; }
}

const getCourseStudents = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const enrolments = await prisma.enrolment.findMany({
      where: { courseId },
      select: { studentId: true },
    });
    const studentIds = enrolments.map(e => e.studentId);
    const students = await prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true, firstName: true, lastName: true,
        institutionalId: true, section: true,
      },
      orderBy: { institutionalId: 'asc' },
    });
    res.json({ status: 'success', data: students });
  } catch (err) { next(err); }
};

const getStudentAttainment = async (req, res, next) => {
  try {
    const { courseId, studentId } = req.params;
    await assertFacultyOwns(req.user, courseId);

    const [student, coAttainments, poAttainments, assessments] = await Promise.all([
      prisma.user.findUnique({
        where: { id: studentId },
        select: { id: true, firstName: true, lastName: true, institutionalId: true, section: true },
      }),
      prisma.coAttainment.findMany({
        where: { courseId, studentId },
        include: { courseOutcome: { select: { code: true, title: true } } },
      }),
      prisma.poAttainment.findMany({
        where: { courseId, studentId },
        include: { programOutcome: { select: { code: true, title: true } } },
      }),
      prisma.assessment.findMany({
        where: { courseId, deletedAt: null },
        include: {
          assessmentCOs: { include: { courseOutcome: { select: { id: true, code: true } } } },
          marks: { where: { studentId } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!student) return res.status(404).json({ status: 'error', error: 'Student not found' });

    const policy = await getPolicyForCourse(courseId);

    const assessmentDetail = assessments.map(a => {
      const mark = a.marks[0];
      // weight is a weight again. The pass mark is either set explicitly on the
      // assessment or derived from the program's approved threshold policy.
      const attainmentMark =
        a.attainmentMark ?? (a.totalMarks * policy.coStudentThreshold) / 100;
      return {
        id: a.id, title: a.title, type: a.type,
        totalMarks: a.totalMarks, attainmentMark,
        marksObtained: mark ? mark.marksObtained : null,
        passed: mark ? mark.marksObtained >= attainmentMark : null,
        coCodes: a.assessmentCOs.map(ac => ac.courseOutcome.code),
      };
    });

    const numSort = (a, b) => {
      const nA = parseInt((a.code || '').replace(/[^0-9]+/g, ''), 10);
      const nB = parseInt((b.code || '').replace(/[^0-9]+/g, ''), 10);
      return isNaN(nA) || isNaN(nB) ? 0 : nA - nB;
    };
    coAttainments.sort((a, b) => numSort(a.courseOutcome, b.courseOutcome));
    poAttainments.sort((a, b) => numSort(a.programOutcome, b.programOutcome));

    res.json({ status: 'success', data: { student, coAttainments, poAttainments, assessmentDetail } });
  } catch (err) { next(err); }
};

const updateAssessmentAttainmentMark = async (req, res, next) => {
  try {
    const { courseId, assessmentId } = req.params;
    await assertFacultyOwns(req.user, courseId);
    const { attainmentMark } = req.body;
    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) return res.status(404).json({ status: 'error', error: 'Not found' });
    if (parseFloat(attainmentMark) > assessment.totalMarks) {
      return res.status(400).json({ status: 'error', error: 'Attainment mark cannot exceed total marks' });
    }
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { weight: parseFloat(attainmentMark) },
    });
    await recomputeAttainmentForCourse(courseId, null, req.user.institutionId);
    res.json({ status: 'success', data: { message: 'Attainment mark updated' } });
  } catch (err) { next(err); }
};

module.exports = {
  getMyCourses,
  getCourseOutcomes, createCourseOutcome, updateCourseOutcome, deleteCourseOutcome,
  getMapping, saveMapping,
  getAssessments, createAssessment, deleteAssessment,
  getMarks, saveMarks,
  getCourseAttainment,
  getCourseStudents,
  getStudentAttainment,
  updateAssessmentAttainmentMark,
  recomputeAttainmentForCourse,
};
