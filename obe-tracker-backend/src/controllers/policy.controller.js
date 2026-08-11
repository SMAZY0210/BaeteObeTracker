/**
 * Threshold policy endpoints.
 *
 * Replaces getThresholds / upsertThresholds in admin.controller.js. Those two
 * looked functional and were not: getThresholds queried AttainmentThreshold,
 * discarded the row, and returned a hardcoded { attainmentThreshold: 60 }.
 * upsertThresholds returned 60 without writing anything at all. Anyone who
 * changed the number in the admin UI got a success response and no change.
 */

const prisma = require('../prisma');
const {
  getPolicyForProgram,
  createPolicyVersion,
  invalidate,
} = require('../services/policy.service');

/** GET /api/v1/admin/programs/:programId/policy — the one in force now */
const getActivePolicy = async (req, res, next) => {
  try {
    const { programId } = req.params;
    const policy = await getPolicyForProgram(programId);

    res.json({
      status: 'success',
      data: {
        policy,
        approved: !policy.unapproved,
        warning: policy.unapproved
          ? 'No approved threshold policy for this program. Attainment is being computed at 60% across the board and stored with policyVersion 0. BAETE sets no benchmark number (ACC-MAN-02 v3.0 s.5.0), so the program must set and justify its own before any figure here is defensible.'
          : null,
      },
    });
  } catch (err) { next(err); }
};

/** GET /api/v1/admin/programs/:programId/policy/history — the audit trail */
const getPolicyHistory = async (req, res, next) => {
  try {
    const versions = await prisma.thresholdPolicy.findMany({
      where: { programId: req.params.programId },
      orderBy: { version: 'desc' },
    });
    res.json({ status: 'success', data: versions });
  } catch (err) { next(err); }
};

/**
 * POST /api/v1/admin/programs/:programId/policy
 *
 * Creates a new version rather than editing in place, and closes off the
 * previous one with an effectiveTill date. Editing thresholds in place would
 * silently rescore every cohort ever computed, including graduated ones.
 */
const createPolicy = async (req, res, next) => {
  try {
    const { programId } = req.params;
    const {
      label, rationale, approvedBy, effectiveFrom,
      coStudentThreshold, coCohortThreshold,
      poStudentThreshold, poCohortThreshold,
      l3Min, l2Min, l1Min,
    } = req.body;

    const pcts = { coStudentThreshold, coCohortThreshold, poStudentThreshold, poCohortThreshold, l3Min, l2Min, l1Min };
    for (const [k, v] of Object.entries(pcts)) {
      if (v == null) continue;
      if (typeof v !== 'number' || v < 0 || v > 100) {
        return res.status(400).json({ status: 'error', error: `${k} must be a percentage between 0 and 100` });
      }
    }

    if (l1Min != null && l2Min != null && l3Min != null && !(l1Min < l2Min && l2Min < l3Min)) {
      return res.status(400).json({ status: 'error', error: 'Bands must increase: l1Min < l2Min < l3Min' });
    }

    const policy = await createPolicyVersion(
      programId,
      {
        label, rationale, effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : undefined,
        coStudentThreshold, coCohortThreshold, poStudentThreshold, poCohortThreshold,
        l3Min, l2Min, l1Min,
      },
      approvedBy
    );

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'POLICY_CREATE',
        entity: 'ThresholdPolicy',
        entityId: policy.id,
        meta: { programId, version: policy.version },
      },
    });

    res.status(201).json({
      status: 'success',
      data: policy,
      note: 'Existing attainment rows still carry the policy version that produced them. Recompute the courses you want rescored; do not expect old rows to move on their own.',
    });
  } catch (err) {
    if (/rationale/i.test(err.message)) {
      return res.status(400).json({ status: 'error', error: err.message });
    }
    next(err);
  }
};

/** GET /api/v1/admin/framework — what vocabulary is loaded */
const getFramework = async (req, res, next) => {
  try {
    const framework = await prisma.accreditationFramework.findFirst({
      where: { isActive: true },
      include: {
        frameworkOutcomes: {
          orderBy: { code: 'asc' },
          include: { wkLinks: { include: { knowledgeProfile: { select: { code: true } } } } },
        },
        knowledgeProfiles: { orderBy: { code: 'asc' } },
        complexAttributes: { orderBy: { code: 'asc' } },
        programSpecCriteria: true,
      },
    });

    if (!framework) {
      return res.status(404).json({
        status: 'error',
        error: 'No accreditation framework seeded. Run: node prisma/seed-framework.js',
      });
    }

    res.json({ status: 'success', data: framework });
  } catch (err) { next(err); }
};

module.exports = { getActivePolicy, getPolicyHistory, createPolicy, getFramework, invalidate };
