/**
 * BAETE attainment engine.
 *
 * Replaces the original src/utils/attainment.js. Four things were wrong with
 * that version and each of them changes the reported numbers:
 *
 *   1. CO_THRESHOLD_PCT was a module constant of 0.60. ACC-MAN-02 v3.0 s.5.0
 *      states the criteria carry no quantitative benchmark and that adequacy is
 *      judged qualitatively. The number is the program's to set and defend, so
 *      it comes from ThresholdPolicy and travels with the result.
 *
 *   2. Assessment.weight was being read as an absolute attainment mark
 *      ("stored in weight field"). That made real weighting impossible, because
 *      one column cannot be both a 0-1 weight and a mark out of 100.
 *      attainmentMark is now its own column.
 *
 *   3. PO attainment summed raw marks across every CO mapped to the PO, with
 *      the comment "correlation strength ignored". Two problems. A CO assessed
 *      by a 100-mark final then outweighs a CO assessed by a 10-mark quiz about
 *      ten to one no matter what the mapping says, and the correlation column
 *      the mapping UI collects did nothing at all. Each CO is now normalised to
 *      a percentage before it is combined, and the combination is weighted by
 *      correlation.
 *
 *   4. There was only one tier. A CO could be attained by a student but nothing
 *      recorded whether the course offering delivered it. That second number is
 *      what CQI runs on, so it is computed here as well.
 *
 * Everything returns a plain object. No Prisma calls in this file, so it stays
 * unit-testable without a database.
 */

const CORRELATION_WEIGHT = Object.freeze({
  WEAK: 1,
  MODERATE: 2,
  STRONG: 3,
});

/** Fallback used only when no ThresholdPolicy row exists yet. */
const DEFAULT_POLICY = Object.freeze({
  version: 0,
  coStudentThreshold: 60,
  coCohortThreshold: 60,
  poStudentThreshold: 60,
  poCohortThreshold: 60,
});

function resolvePolicy(policy) {
  return policy ? { ...DEFAULT_POLICY, ...policy } : DEFAULT_POLICY;
}

/**
 * Marks attributable to one CO from one assessment.
 *
 * coMarks is the absolute allocation from the question paper: 12 marks of a
 * 30-mark mid-term. Falls back to the full total when an assessment carries a
 * single CO and nobody bothered to set it.
 *
 * This replaces the old markShare fraction, which multiplied one whole-paper
 * score by a ratio and so credited a student the same percentage on every CO
 * the paper touched. Marks are now recorded per CO, so the real per-section
 * score is used instead of a derived one.
 */
function coSliceOf(assessment, assessmentCO) {
  const possible = assessmentCO?.coMarks > 0 ? assessmentCO.coMarks : assessment.totalMarks;
  const ratio = assessment.totalMarks > 0 ? possible / assessment.totalMarks : 1;
  return {
    possible,
    passMark: assessment.attainmentMark != null ? assessment.attainmentMark * ratio : null,
  };
}

/**
 * TIER 1 — did this student attain this CO?
 *
 * Weighted by Assessment.weight so a final counts for more than a quiz.
 * Absent students are excluded from that assessment rather than scored zero,
 * because an absence is missing evidence, not evidence of non-attainment.
 * Returns null when the student has no usable mark at all; callers should skip
 * those students rather than treating them as failures.
 */
function computeStudentCoAttainment({ studentId, courseOutcome, assessments, policy }) {
  const p = resolvePolicy(policy);

  const linked = assessments.filter((a) =>
    a.assessmentCOs?.some((aco) => aco.courseOutcomeId === courseOutcome.id)
  );
  if (!linked.length) return null;

  let weightedObtained = 0;
  let weightedPossible = 0;
  let explicitPassWeighted = 0;
  let explicitPassCovers = 0;
  let counted = 0;

  for (const a of linked) {
    // Marks are keyed on (assessment, student, CO). A student absent from the
    // paper has no row at all; a student who sat it but skipped this CO's
    // section has a row with isAbsent set. Both drop out rather than scoring
    // zero, because an absence is missing evidence, not evidence of failure.
    const mark = a.marks?.find(
      (mk) => mk.studentId === studentId && mk.courseOutcomeId === courseOutcome.id
    );
    if (!mark || mark.isAbsent) continue;

    const aco = a.assessmentCOs.find((x) => x.courseOutcomeId === courseOutcome.id);
    const slice = coSliceOf(a, aco);
    if (slice.possible <= 0) continue;

    const w = a.weight > 0 ? a.weight : 1;

    // marksObtained is already this CO's score out of slice.possible. No
    // fraction is applied: that was the bug.
    weightedObtained += mark.marksObtained * w;
    weightedPossible += slice.possible * w;
    counted += 1;

    if (slice.passMark != null) {
      explicitPassWeighted += slice.passMark * w;
      explicitPassCovers += slice.possible * w;
    }
  }

  if (!counted || weightedPossible <= 0) return null;

  const percentage = (weightedObtained / weightedPossible) * 100;

  // If the faculty set an explicit attainment mark on every linked assessment,
  // honour it. Otherwise fall back to the policy percentage. Mixing the two on
  // a partially-configured course would produce a number nobody can explain, so
  // explicit marks only apply when they cover the whole CO.
  const useExplicit =
    explicitPassCovers > 0 && Math.abs(explicitPassCovers - weightedPossible) < 1e-6;

  const attained = useExplicit
    ? weightedObtained >= explicitPassWeighted
    : percentage >= p.coStudentThreshold;

  return {
    courseOutcomeId: courseOutcome.id,
    studentId,
    percentage: round2(percentage),
    attained,
    basis: useExplicit ? 'EXPLICIT_MARK' : 'POLICY_PCT',
    assessmentsCounted: counted,
    policyVersion: p.version,
  };
}

/**
 * TIER 2 — did the course offering deliver this CO?
 *
 * studentResults is the tier-1 output for every enrolled student, nulls included.
 * Nulls drop out of the denominator: a student with no marks is unassessed, not
 * failed. assessedCount versus enrolledCount is itself worth reporting, since a
 * CO attained by 100% of three assessed students out of forty enrolled is not a
 * CO the evaluator will accept.
 */
function computeCourseCoAttainment({ courseId, courseOutcomeId, studentResults, enrolledCount, policy }) {
  const p = resolvePolicy(policy);
  const assessed = studentResults.filter(Boolean);
  const attainedCount = assessed.filter((r) => r.attained).length;

  const attainmentPct = assessed.length ? (attainedCount / assessed.length) * 100 : 0;

  return {
    courseId,
    courseOutcomeId,
    enrolledCount,
    assessedCount: assessed.length,
    attainedCount,
    attainmentPct: round2(attainmentPct),
    attained: assessed.length > 0 && attainmentPct >= p.coCohortThreshold,
    coverageWarning: enrolledCount > 0 && assessed.length / enrolledCount < 0.8,
    policyVersion: p.version,
  };
}

/**
 * Student PO attainment, correlation-weighted across every CO mapped to the PO.
 *
 * Each CO contributes its own percentage, not its raw marks, so a CO carried by
 * a 100-mark final and a CO carried by a 10-mark quiz enter on equal footing and
 * the correlation strength decides the balance. That is the whole point of
 * collecting WEAK/MODERATE/STRONG in the mapping matrix.
 *
 * coResultsById: { [courseOutcomeId]: tier-1 result }
 * mappings: CoPoMapping rows, any course, filtered to this PO by the caller or here.
 */
function computeStudentPoAttainment({ studentId, programOutcomeId, mappings, coResultsById, policy }) {
  const p = resolvePolicy(policy);

  const relevant = mappings.filter(
    (m) => m.programOutcomeId === programOutcomeId && m.correlation
  );
  if (!relevant.length) return null;

  let weightedSum = 0;
  let weightTotal = 0;
  const contributing = [];

  for (const m of relevant) {
    const co = coResultsById[m.courseOutcomeId];
    if (!co) continue; // student never sat anything for this CO

    const w = CORRELATION_WEIGHT[m.correlation] ?? 1;
    weightedSum += co.percentage * w;
    weightTotal += w;
    contributing.push({
      courseOutcomeId: m.courseOutcomeId,
      percentage: co.percentage,
      correlation: m.correlation,
      weight: w,
    });
  }

  if (!weightTotal) return null;

  const percentage = weightedSum / weightTotal;

  return {
    programOutcomeId,
    studentId,
    percentage: round2(percentage),
    attained: percentage >= p.poStudentThreshold,
    contributingCos: contributing.length,
    breakdown: contributing,
    policyVersion: p.version,
  };
}

/**
 * Cohort PO attainment for a graduating batch.
 *
 * ACC-MAN-02 v3.0 s.5.2.5: the program must demonstrate, using direct methods,
 * that students attain all POs by graduation. That is a claim about a cohort at
 * a point in time. directOnly stays true unless a caller deliberately folds in
 * indirect evidence, and the flag rides along with the result so a report can
 * never silently present survey data as attainment.
 */
function computeCohortPoAttainment({ programId, sessionId, programOutcomeId, studentResults, cohortSize, policy, directOnly = true }) {
  const p = resolvePolicy(policy);
  const assessed = studentResults.filter(Boolean);
  const attainedCount = assessed.filter((r) => r.attained).length;
  const attainmentPct = assessed.length ? (attainedCount / assessed.length) * 100 : 0;

  return {
    programId,
    sessionId,
    programOutcomeId,
    cohortSize,
    assessedCount: assessed.length,
    attainedCount,
    attainmentPct: round2(attainmentPct),
    attained: assessed.length > 0 && attainmentPct >= p.poCohortThreshold,
    directOnly,
    policyVersion: p.version,
  };
}

/**
 * Anything that falls short becomes a CQI candidate. s.5.5 wants findings used
 * regularly to refine the program, and an open action with no closure note is
 * visible evidence of a loop that never closed, so generating the candidates
 * automatically is safer than trusting anyone to notice.
 */
function deriveCqiFindings({ courseCoResults = [], cohortPoResults = [], cycleLabel }) {
  const findings = [];

  for (const r of courseCoResults) {
    if (!r.attained) {
      findings.push({
        source: 'CO_SHORTFALL',
        cycleLabel,
        courseOutcomeId: r.courseOutcomeId,
        finding: `CO attained by ${r.attainedCount} of ${r.assessedCount} assessed students (${r.attainmentPct}%), below the ${resolvePolicy(null).coCohortThreshold}% cohort threshold in policy v${r.policyVersion}.`,
      });
    } else if (r.coverageWarning) {
      findings.push({
        source: 'CO_SHORTFALL',
        cycleLabel,
        courseOutcomeId: r.courseOutcomeId,
        finding: `CO met the threshold but only ${r.assessedCount} of ${r.enrolledCount} enrolled students were assessed against it. Coverage this thin will not survive an evaluation visit.`,
      });
    }
  }

  for (const r of cohortPoResults) {
    if (!r.attained) {
      findings.push({
        source: 'PO_SHORTFALL',
        cycleLabel,
        programOutcomeId: r.programOutcomeId,
        finding: `Cohort PO attainment ${r.attainmentPct}% across ${r.assessedCount} assessed students of ${r.cohortSize}. Below threshold under policy v${r.policyVersion}.`,
      });
    }
  }

  return findings;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = {
  CORRELATION_WEIGHT,
  DEFAULT_POLICY,
  resolvePolicy,
  computeStudentCoAttainment,
  computeCourseCoAttainment,
  computeStudentPoAttainment,
  computeCohortPoAttainment,
  deriveCqiFindings,
};
