/**
 * Attainment recompute orchestration.
 *
 * Drop-in replacement for recomputeAttainmentForCourse() in
 * faculty.controller.js (around line 314). Same call signature, so the existing
 * call sites keep working:
 *
 *   const { recomputeAttainmentForCourse } = require('../services/attainment.service');
 *
 * What it does that the original did not:
 *   - reads the threshold from ThresholdPolicy instead of a module constant
 *   - writes the tier-2 CourseCoAttainment rows the original had nowhere to put
 *   - stores `attained` and `policyVersion` alongside percentage and level
 *   - generates CQI candidates from whatever fell short
 */

const prisma = require('../prisma');
const {
  computeStudentCoAttainment,
  computeCourseCoAttainment,
  computeStudentPoAttainment,
  computeCohortPoAttainment,
  deriveCqiFindings,
} = require('../utils/attainment');
const { getPolicyForCourse, getPolicyForBatch } = require('./policy.service');

const BATCH = 50;

async function flush(ops) {
  for (let i = 0; i < ops.length; i += BATCH) {
    await prisma.$transaction(ops.slice(i, i + BATCH));
  }
}

/**
 * Recompute one course offering: both tiers, plus CQI candidates.
 * matrixVersion and institutionId are kept in the signature for compatibility
 * with the existing callers; institutionId is no longer used, since policy now
 * resolves through the program rather than the institution.
 */
async function recomputeAttainmentForCourse(courseId, matrixVersion, _institutionId, opts = {}) {
  const enrolments = await prisma.enrolment.findMany({
    where: { courseId },
    select: { studentId: true },
  });
  if (!enrolments.length) return { skipped: 'no enrolments' };

  const policy = await getPolicyForCourse(courseId);

  if (!matrixVersion) {
    const latest = await prisma.coPoMapping.findFirst({
      where: { courseId },
      orderBy: { version: 'desc' },
    });
    matrixVersion = latest?.version || 1;
  }

  const [cos, assessments, mappings] = await Promise.all([
    prisma.courseOutcome.findMany({ where: { courseId, deletedAt: null } }),
    prisma.assessment.findMany({
      where: { courseId, deletedAt: null, method: 'DIRECT' }, // s.5.2.5: direct only
      // marks now carry courseOutcomeId; the engine matches on it
      include: { assessmentCOs: true, marks: true },
    }),
    prisma.coPoMapping.findMany({ where: { courseId } }),
  ]);

  const poIds = [...new Set(mappings.map((m) => m.programOutcomeId))];
  const coOps = [];
  const poOps = [];

  // studentResults[coId] = array of tier-1 results, nulls kept so tier 2 can
  // tell "unassessed" apart from "assessed and failed"
  const byCo = Object.fromEntries(cos.map((co) => [co.id, []]));

  for (const { studentId } of enrolments) {
    const coResultsById = {};

    for (const co of cos) {
      const result = computeStudentCoAttainment({ studentId, courseOutcome: co, assessments, policy });
      byCo[co.id].push(result);
      if (!result) continue;

      coResultsById[co.id] = result;
      coOps.push(
        prisma.coAttainment.upsert({
          where: { courseOutcomeId_studentId: { courseOutcomeId: co.id, studentId } },
          create: {
            courseOutcomeId: co.id,
            studentId,
            courseId,
            percentage: result.percentage,
            attained: result.attained,
            policyVersion: policy.version,
            matrixVersion,
          },
          update: {
            percentage: result.percentage,
            attained: result.attained,
            policyVersion: policy.version,
            matrixVersion,
            computedAt: new Date(),
          },
        })
      );
    }

    for (const programOutcomeId of poIds) {
      const result = computeStudentPoAttainment({
        studentId,
        programOutcomeId,
        mappings,
        coResultsById,
        policy,
      });
      if (!result) continue;

      poOps.push(
        prisma.poAttainment.upsert({
          where: {
            programOutcomeId_studentId_courseId: { programOutcomeId, studentId, courseId },
          },
          create: {
            programOutcomeId,
            studentId,
            courseId,
            percentage: result.percentage,
            attained: result.attained,
            policyVersion: policy.version,
            matrixVersion,
          },
          update: {
            percentage: result.percentage,
            attained: result.attained,
            policyVersion: policy.version,
            matrixVersion,
            computedAt: new Date(),
          },
        })
      );
    }
  }

  // Tier 2 — did the offering deliver each CO?
  const courseCoResults = cos.map((co) =>
    computeCourseCoAttainment({
      courseId,
      courseOutcomeId: co.id,
      studentResults: byCo[co.id],
      enrolledCount: enrolments.length,
      policy,
    })
  );

  const tier2Ops = courseCoResults.map((r) =>
    prisma.courseCoAttainment.upsert({
      where: { courseId_courseOutcomeId: { courseId, courseOutcomeId: r.courseOutcomeId } },
      create: {
        courseId,
        courseOutcomeId: r.courseOutcomeId,
        enrolledCount: r.enrolledCount,
        assessedCount: r.assessedCount,
        attainedCount: r.attainedCount,
        attainmentPct: r.attainmentPct,
        attained: r.attained,
        policyVersion: policy.version,
      },
      update: {
        enrolledCount: r.enrolledCount,
        assessedCount: r.assessedCount,
        attainedCount: r.attainedCount,
        attainmentPct: r.attainmentPct,
        attained: r.attained,
        policyVersion: policy.version,
        computedAt: new Date(),
      },
    })
  );

  await flush(coOps);
  await flush(poOps);
  await flush(tier2Ops);

  if (opts.generateCqi !== false) {
    await createCqiCandidates({ courseId, courseCoResults, cycleLabel: opts.cycleLabel });
  }

  return {
    students: enrolments.length,
    cos: cos.length,
    policyVersion: policy.version,
    unapprovedPolicy: !!policy.unapproved,
    cosNotAttained: courseCoResults.filter((r) => !r.attained).length,
  };
}

/**
 * Cohort rollup for a graduating batch. s.5.2.5 wants attainment demonstrated
 * by graduation, which is a claim about a batch and not about a course.
 * Run this when a batch closes.
 *
 * A batch no longer owns a fixed set of courses (courses now live at the
 * curriculum level and get reused across many batches and terms), so the
 * courses this batch took are whatever its students' own PoAttainment rows
 * say, not a course list read off the batch itself. PoAttainment is already
 * student-scoped, so filtering by studentId is sufficient on its own.
 */
async function recomputeCohortAttainment(batchId) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: { students: { select: { id: true } } },
  });
  if (!batch || !batch.students.length) return { skipped: 'no students' };

  const studentIds = batch.students.map((s) => s.id);

  // program comes from any enrolment these students have, same derivation
  // getPolicyForBatch uses, since Batch itself carries no programId.
  const anyEnrolment = await prisma.enrolment.findFirst({
    where: { studentId: { in: studentIds } },
    select: { programId: true },
  });
  if (!anyEnrolment) return { skipped: 'no enrolments' };
  const programId = anyEnrolment.programId;

  const policy = await getPolicyForBatch(batchId);

  const pos = await prisma.programOutcome.findMany({
    where: { programId, deletedAt: null },
    select: { id: true },
  });

  const rows = await prisma.poAttainment.findMany({
    where: { studentId: { in: studentIds } },
    select: { programOutcomeId: true, studentId: true, percentage: true, attained: true },
  });

  const results = [];
  for (const po of pos) {
    // A student's PO figure across the batch is the mean of their per-course
    // figures for that PO. Every course that carried the PO gets a say.
    const perStudent = studentIds.map((sid) => {
      const mine = rows.filter((r) => r.programOutcomeId === po.id && r.studentId === sid);
      if (!mine.length) return null;
      const pct = mine.reduce((a, r) => a + r.percentage, 0) / mine.length;
      return { studentId: sid, percentage: pct, attained: pct >= policy.poStudentThreshold };
    });

    const result = computeCohortPoAttainment({
      programId,
      batchId,
      programOutcomeId: po.id,
      studentResults: perStudent,
      cohortSize: studentIds.length,
      policy,
      directOnly: true,
    });
    results.push(result);
  }

  await flush(
    results.map((r) =>
      prisma.cohortPoAttainment.upsert({
        where: { batchId_programOutcomeId: { batchId, programOutcomeId: r.programOutcomeId } },
        create: { ...r, policyVersion: policy.version },
        update: { ...r, policyVersion: policy.version, computedAt: new Date() },
      })
    )
  );

  await createCqiCandidates({ programId, cohortPoResults: results, cycleLabel: batch.name });

  return { pos: results.length, notAttained: results.filter((r) => !r.attained).length };
}

/**
 * Turns shortfalls into OPEN CqiAction rows. s.5.5 wants findings used
 * regularly to refine the program, so the findings are generated rather than
 * left to somebody noticing. Existing OPEN rows for the same cycle and outcome
 * are not duplicated.
 */
async function createCqiCandidates({ courseId, programId, courseCoResults = [], cohortPoResults = [], cycleLabel }) {
  let pid = programId;
  if (!pid && courseId) {
    const c = await prisma.course.findUnique({ where: { id: courseId }, select: { programId: true } });
    pid = c?.programId;
  }
  if (!pid) return [];

  const label = cycleLabel ?? new Date().getFullYear().toString();
  const findings = deriveCqiFindings({ courseCoResults, cohortPoResults, cycleLabel: label });
  if (!findings.length) return [];

  const head = await prisma.user.findFirst({
    where: { role: { in: ['PROGRAM_HEAD', 'ADMIN'] }, isActive: true },
    select: { id: true },
  });
  if (!head) return [];

  const created = [];
  for (const f of findings) {
    const existing = await prisma.cqiAction.findFirst({
      where: {
        programId: pid,
        cycleLabel: label,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        courseOutcomeId: f.courseOutcomeId ?? undefined,
        programOutcomeId: f.programOutcomeId ?? undefined,
      },
    });
    if (existing) continue;

    created.push(
      await prisma.cqiAction.create({
        data: {
          programId: pid,
          source: f.source,
          cycleLabel: label,
          courseOutcomeId: f.courseOutcomeId ?? null,
          programOutcomeId: f.programOutcomeId ?? null,
          finding: f.finding,
          action: '', // the program head fills this in; empty is the signal it needs attention
          ownerId: head.id,
          status: 'OPEN',
        },
      })
    );
  }
  return created;
}

module.exports = {
  recomputeAttainmentForCourse,
  recomputeCohortAttainment,
  createCqiCandidates,
};
