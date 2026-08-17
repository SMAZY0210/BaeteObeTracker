/**
 * Resolves which ThresholdPolicy applies to a computation.
 *
 * Replaces the old admin.controller.js threshold endpoints, which queried
 * AttainmentThreshold and then returned a hardcoded 60 regardless of what came
 * back. upsertThresholds was a no-op that echoed 60. The admin UI appeared to
 * save a threshold and never did.
 *
 * Policy is resolved per program and per date, so a batch closed in 2026 keeps
 * being scored by the 2026 policy even after the department revises it in 2028.
 * That is what makes historical attainment defensible at an evaluation visit.
 */

const prisma = require('../prisma');
const { DEFAULT_POLICY } = require('../utils/attainment');

const cache = new Map();
const TTL_MS = 60_000;

function cacheKey(programId, at) {
  return `${programId}:${at ? at.toISOString().slice(0, 10) : 'now'}`;
}

/**
 * Active policy for a program at a point in time.
 * Falls back to DEFAULT_POLICY (version 0) when nothing is configured. Version 0
 * is a marker meaning "nobody approved this", not a shippable default, and every
 * attainment row it produces carries that 0 so unapproved numbers stay findable.
 */
async function getPolicyForProgram(programId, at = new Date()) {
  const key = cacheKey(programId, at);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.value;

  const policy = await prisma.thresholdPolicy.findFirst({
    where: {
      programId,
      effectiveFrom: { lte: at },
      OR: [{ effectiveTill: null }, { effectiveTill: { gte: at } }],
    },
    orderBy: [{ effectiveFrom: 'desc' }, { version: 'desc' }],
  });

  const value = policy ?? { ...DEFAULT_POLICY, unapproved: true };
  cache.set(key, { value, ts: Date.now() });
  return value;
}

/** Policy for a course, via its program. Courses are what controllers hold. */
async function getPolicyForCourse(courseId, at = new Date()) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { programId: true },
  });
  if (!course) throw new Error(`Course ${courseId} not found`);
  return getPolicyForProgram(course.programId, at);
}

/**
 * A session that has been CLOSED freezes its policy. Reopening history and
 * silently rescoring a graduated cohort is the kind of thing that ends an
 * accreditation conversation badly.
 */
async function getPolicyForSession(sessionId) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true, frozenThresholds: true, departmentId: true, endDate: true },
  });
  if (!session) throw new Error(`Session ${sessionId} not found`);

  if (session.status === 'CLOSED' && session.frozenThresholds) {
    return { ...DEFAULT_POLICY, ...session.frozenThresholds, frozen: true };
  }

  const course = await prisma.course.findFirst({
    where: { sessionId },
    select: { programId: true },
  });
  if (!course) return { ...DEFAULT_POLICY, unapproved: true };

  return getPolicyForProgram(course.programId, session.endDate ?? new Date());
}

function invalidate(programId) {
  for (const k of cache.keys()) if (k.startsWith(`${programId}:`)) cache.delete(k);
}

/**
 * Creating a policy version. rationale is required at the application layer as
 * well as in the schema, because ACC-MAN-02 v3.0 s.5.0 leaves the number to the
 * program and an evaluator will ask who decided it and on what basis.
 */
async function createPolicyVersion(programId, data, approvedBy) {
  if (!data.rationale || data.rationale.trim().length < 20) {
    throw new Error(
      'A threshold policy needs a written rationale. BAETE sets no benchmark number, so the program has to justify its own.'
    );
  }

  const latest = await prisma.thresholdPolicy.findFirst({
    where: { programId },
    orderBy: { version: 'desc' },
  });
  const version = (latest?.version ?? 0) + 1;
  const effectiveFrom = data.effectiveFrom ?? new Date();

  const created = await prisma.$transaction(async (tx) => {
    if (latest && !latest.effectiveTill) {
      await tx.thresholdPolicy.update({
        where: { id: latest.id },
        data: { effectiveTill: effectiveFrom },
      });
    }
    return tx.thresholdPolicy.create({
      data: {
        programId,
        version,
        label: data.label ?? `Policy v${version}`,
        coStudentThreshold: data.coStudentThreshold ?? 60,
        coCohortThreshold: data.coCohortThreshold ?? 60,
        poStudentThreshold: data.poStudentThreshold ?? 60,
        poCohortThreshold: data.poCohortThreshold ?? 60,
        rationale: data.rationale,
        approvedBy: approvedBy ?? null,
        approvedAt: approvedBy ? new Date() : null,
        effectiveFrom,
      },
    });
  });

  invalidate(programId);
  return created;
}

module.exports = {
  getPolicyForProgram,
  getPolicyForCourse,
  getPolicyForSession,
  createPolicyVersion,
  invalidate,
};
