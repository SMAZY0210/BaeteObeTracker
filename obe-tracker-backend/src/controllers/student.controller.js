const prisma = require('../prisma');

const getEnrolledCourses = async (req, res, next) => {
  try {
    const studentId = req.user.userId;
    const enrolments = await prisma.enrolment.findMany({
      where: { studentId },
      include: {
        course: {
          include: {
            program: { select: { name: true, code: true } },
            session: { select: { name: true, status: true } },
          },
        },
      },
    });
    res.json({ status: 'success', data: enrolments.map(e => e.course) });
  } catch (err) { next(err); }
};

const getMyMarks = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const studentId = req.user.userId;
    await assertEnrolled(studentId, courseId);

    const assessments = await prisma.assessment.findMany({
      where: { courseId, deletedAt: null },
      include: {
        assessmentCOs: { include: { courseOutcome: { select: { code: true, title: true } } } },
        marks: { where: { studentId } },
      },
    });

    res.json({ status: 'success', data: assessments });
  } catch (err) { next(err); }
};

const getMyAttainment = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const studentId = req.user.userId;
    await assertEnrolled(studentId, courseId);

    const [coAttainments, poAttainments] = await Promise.all([
      prisma.coAttainment.findMany({
        where: { courseId, studentId },
        include: { courseOutcome: { select: { code: true, title: true, bloomDomain: true, bloomLevel: true, profileType: true, profileCode: true } } },
      }),
      prisma.poAttainment.findMany({
        where: { courseId, studentId },
        include: { programOutcome: { select: { code: true, title: true } } },
      }),
    ]);

    res.json({ status: 'success', data: { coAttainments, poAttainments } });
  } catch (err) { next(err); }
};

const getProgramAttainment = async (req, res, next) => {
  try {
    const studentId = req.user.userId;
    // Aggregate PO attainment across all courses
    const poAttainments = await prisma.poAttainment.findMany({
      where: { studentId },
      include: {
        programOutcome: { select: { code: true, title: true, programId: true } },
      },
      orderBy: { programOutcome: { code: 'asc' } },
    });

    // Average per PO across courses
    const poMap = {};
    for (const att of poAttainments) {
      const key = att.programOutcomeId;
      if (!poMap[key]) poMap[key] = { ...att.programOutcome, percentages: [], level: att.level };
      poMap[key].percentages.push(att.percentage);
    }

    const summary = Object.values(poMap).map(po => ({
      ...po,
      averagePercentage: po.percentages.reduce((s, p) => s + p, 0) / po.percentages.length,
    }));

    res.json({ status: 'success', data: summary });
  } catch (err) { next(err); }
};

async function assertEnrolled(studentId, courseId) {
  const enrolment = await prisma.enrolment.findFirst({ where: { studentId, courseId } });
  if (!enrolment) {
    const err = new Error('You are not enrolled in this course');
    err.status = 403;
    throw err;
  }
}

module.exports = { getEnrolledCourses, getMyMarks, getMyAttainment, getProgramAttainment };
