/**
 * Attainment engine tests. Pure logic, no database.
 *
 *   node --test test/attainment.test.js
 *
 * Every case here is a bug the old engine had. If one fails, the old behaviour
 * has crept back in.
 */

const test = require('node:test');
const assert = require('node:assert');

const {
  computeStudentCoAttainment,
  computeCourseCoAttainment,
  computeStudentPoAttainment,
  computeCohortPoAttainment,
  levelFor,
  DEFAULT_POLICY,
} = require('../src/utils/attainment');

const policy = {
  version: 1,
  coStudentThreshold: 60,
  coCohortThreshold: 60,
  poStudentThreshold: 60,
  poCohortThreshold: 60,
  l3Min: 80, l2Min: 70, l1Min: 60,
};

const co1 = { id: 'co1' };
const co2 = { id: 'co2' };

/** CO1 on a 10-mark quiz, CO2 on a 100-mark final. The mark-scale trap. */
function fixture() {
  return [
    {
      id: 'q1', totalMarks: 10, weight: 1, attainmentMark: null,
      assessmentCOs: [{ courseOutcomeId: 'co1', coMarks: 10 }],
      marks: [
        { studentId: 's1', courseOutcomeId: 'co1', marksObtained: 10, isAbsent: false },
        { studentId: 's2', courseOutcomeId: 'co1', marksObtained: 3, isAbsent: false },
        { studentId: 's3', courseOutcomeId: 'co1', marksObtained: 0, isAbsent: true },
      ],
    },
    {
      id: 'f1', totalMarks: 100, weight: 3, attainmentMark: null,
      assessmentCOs: [{ courseOutcomeId: 'co2', coMarks: 100 }],
      marks: [
        { studentId: 's1', courseOutcomeId: 'co2', marksObtained: 40, isAbsent: false },
        { studentId: 's2', courseOutcomeId: 'co2', marksObtained: 85, isAbsent: false },
        { studentId: 's3', courseOutcomeId: 'co2', marksObtained: 70, isAbsent: false },
      ],
    },
  ];
}

test('threshold comes from policy, not a module constant', () => {
  const assessments = fixture();
  const strict = { ...policy, coStudentThreshold: 95 };

  const lenient = computeStudentCoAttainment({ studentId: 's2', courseOutcome: co2, assessments, policy });
  const harsh = computeStudentCoAttainment({ studentId: 's2', courseOutcome: co2, assessments, policy: strict });

  assert.equal(lenient.attained, true, '85% clears a 60% threshold');
  assert.equal(harsh.attained, false, '85% does not clear a 95% threshold');
  assert.equal(harsh.policyVersion, 1, 'result carries the policy that produced it');
});

test('absent is excluded, not scored zero', () => {
  const assessments = fixture();
  const r = computeStudentCoAttainment({ studentId: 's3', courseOutcome: co1, assessments, policy });
  assert.equal(r, null, 's3 was absent from the only assessment carrying co1');

  const tier2 = computeCourseCoAttainment({
    courseId: 'c1', courseOutcomeId: 'co1',
    studentResults: ['s1', 's2', 's3'].map((s) =>
      computeStudentCoAttainment({ studentId: s, courseOutcome: co1, assessments, policy })
    ),
    enrolledCount: 3, policy,
  });
  assert.equal(tier2.assessedCount, 2, 'absent student leaves the denominator');
  assert.equal(tier2.attainedCount, 1);
  assert.equal(tier2.attainmentPct, 50);
});

test('all four attainment levels are reachable', () => {
  assert.equal(levelFor(85, policy), 'L3');
  assert.equal(levelFor(72, policy), 'L2');
  assert.equal(levelFor(63, policy), 'L1');
  assert.equal(levelFor(41, policy), 'L0');
});

test('PO attainment is correlation-weighted, not a raw mark sum', () => {
  const assessments = fixture();
  const mappings = [
    { programOutcomeId: 'po1', courseOutcomeId: 'co1', correlation: 'STRONG' },
    { programOutcomeId: 'po1', courseOutcomeId: 'co2', correlation: 'WEAK' },
  ];

  const build = (sid) => {
    const byId = {};
    for (const co of [co1, co2]) {
      const r = computeStudentCoAttainment({ studentId: sid, courseOutcome: co, assessments, policy });
      if (r) byId[co.id] = r;
    }
    return byId;
  };

  // s1: 100% on the STRONG co1, 40% on the WEAK co2 -> (100*3 + 40*1)/4 = 85
  const s1 = computeStudentPoAttainment({
    studentId: 's1', programOutcomeId: 'po1', mappings, coResultsById: build('s1'), policy,
  });
  assert.equal(s1.percentage, 85);
  assert.equal(s1.attained, true);

  // s2: 30% on the STRONG co1, 85% on the WEAK co2 -> (30*3 + 85*1)/4 = 43.75
  // The old engine summed raw marks, so s2's 85/100 final drowned out the
  // 3/10 quiz and handed them a pass on a weakly-correlated outcome.
  const s2 = computeStudentPoAttainment({
    studentId: 's2', programOutcomeId: 'po1', mappings, coResultsById: build('s2'), policy,
  });
  assert.equal(s2.percentage, 43.75);
  assert.equal(s2.attained, false);

  const rawSum = (40 + 3) / (100 + 10) * 100;
  assert.ok(rawSum > 30, 'sanity: raw-mark sum would have given s2 about 39%');
});

test('mark scale does not decide the PO figure', () => {
  // Same percentages, wildly different mark totals. The PO result must match.
  const small = [{
    id: 'a', totalMarks: 10, weight: 1, attainmentMark: null,
    assessmentCOs: [{ courseOutcomeId: 'co1', coMarks: 10 }],
    marks: [{ studentId: 's', courseOutcomeId: 'co1', marksObtained: 8, isAbsent: false }],
  }];
  const large = [{
    id: 'b', totalMarks: 1000, weight: 1, attainmentMark: null,
    assessmentCOs: [{ courseOutcomeId: 'co1', coMarks: 1000 }],
    marks: [{ studentId: 's', courseOutcomeId: 'co1', marksObtained: 800, isAbsent: false }],
  }];

  const a = computeStudentCoAttainment({ studentId: 's', courseOutcome: co1, assessments: small, policy });
  const b = computeStudentCoAttainment({ studentId: 's', courseOutcome: co1, assessments: large, policy });
  assert.equal(a.percentage, b.percentage, '80% is 80% at any scale');
  assert.equal(a.level, b.level);
});

test('explicit attainmentMark overrides the policy percentage', () => {
  const assessments = [{
    id: 'a', totalMarks: 100, weight: 1, attainmentMark: 40, // faculty set a 40 pass
    assessmentCOs: [{ courseOutcomeId: 'co1', coMarks: 100 }],
    marks: [{ studentId: 's', courseOutcomeId: 'co1', marksObtained: 45, isAbsent: false }],
  }];
  const r = computeStudentCoAttainment({ studentId: 's', courseOutcome: co1, assessments, policy });
  assert.equal(r.basis, 'EXPLICIT_MARK');
  assert.equal(r.attained, true, '45 clears the explicit 40 even though 45% is under the 60% policy');
});

test('partial explicit marks fall back to policy rather than mixing', () => {
  const assessments = [
    {
      id: 'a', totalMarks: 50, weight: 1, attainmentMark: 20,
      assessmentCOs: [{ courseOutcomeId: 'co1', coMarks: 50 }],
      marks: [{ studentId: 's', courseOutcomeId: 'co1', marksObtained: 25, isAbsent: false }],
    },
    {
      id: 'b', totalMarks: 50, weight: 1, attainmentMark: null, // not configured
      assessmentCOs: [{ courseOutcomeId: 'co1', coMarks: 50 }],
      marks: [{ studentId: 's', courseOutcomeId: 'co1', marksObtained: 25, isAbsent: false }],
    },
  ];
  const r = computeStudentCoAttainment({ studentId: 's', courseOutcome: co1, assessments, policy });
  assert.equal(r.basis, 'POLICY_PCT', 'half-configured courses must not produce a hybrid number');
  assert.equal(r.percentage, 50);
  assert.equal(r.attained, false);
});

test('one assessment, per-CO marks: uneven performance is recorded honestly', () => {
  // A 30-mark mid-term: Q1-Q2 test CO1 (12), Q3 tests CO2 (10), Q4 tests CO3 (8).
  // The student aced CO1 and struggled on CO3. Under the old markShare model
  // their single 24/30 was multiplied by each share, crediting 80% on all three.
  const co3 = { id: 'co3' };
  const assessments = [{
    id: 'mid', totalMarks: 30, weight: 1, attainmentMark: null,
    assessmentCOs: [
      { courseOutcomeId: 'co1', coMarks: 12 },
      { courseOutcomeId: 'co2', coMarks: 10 },
      { courseOutcomeId: 'co3', coMarks: 8 },
    ],
    marks: [
      { studentId: 's', courseOutcomeId: 'co1', marksObtained: 12, isAbsent: false },
      { studentId: 's', courseOutcomeId: 'co2', marksObtained: 9,  isAbsent: false },
      { studentId: 's', courseOutcomeId: 'co3', marksObtained: 3,  isAbsent: false },
    ],
  }];

  const a = computeStudentCoAttainment({ studentId: 's', courseOutcome: co1, assessments, policy });
  const b = computeStudentCoAttainment({ studentId: 's', courseOutcome: co2, assessments, policy });
  const c = computeStudentCoAttainment({ studentId: 's', courseOutcome: co3, assessments, policy });

  assert.equal(a.percentage, 100, '12/12 on the CO1 questions');
  assert.equal(b.percentage, 90,  '9/10 on the CO2 questions');
  assert.equal(c.percentage, 37.5,'3/8 on the CO3 questions');

  assert.equal(a.attained, true);
  assert.equal(b.attained, true);
  assert.equal(c.attained, false, 'the weak section fails on its own merits');

  // Total still reconciles to the paper: 12+9+3 = 24 of 30.
  const total = assessments[0].marks.reduce((t, m) => t + m.marksObtained, 0);
  assert.equal(total, 24);
});

test('a CO section skipped within a sat paper is excluded, not zeroed', () => {
  const assessments = [{
    id: 'mid', totalMarks: 20, weight: 1, attainmentMark: null,
    assessmentCOs: [
      { courseOutcomeId: 'co1', coMarks: 10 },
      { courseOutcomeId: 'co2', coMarks: 10 },
    ],
    marks: [
      { studentId: 's', courseOutcomeId: 'co1', marksObtained: 8, isAbsent: false },
      { studentId: 's', courseOutcomeId: 'co2', marksObtained: 0, isAbsent: true },
    ],
  }];
  const a = computeStudentCoAttainment({ studentId: 's', courseOutcome: co1, assessments, policy });
  const b = computeStudentCoAttainment({ studentId: 's', courseOutcome: co2, assessments, policy });
  assert.equal(a.percentage, 80);
  assert.equal(b, null, 'no usable evidence for co2');
});

test('thin coverage is flagged even when the CO passes', () => {
  const results = [
    { attained: true }, { attained: true },
    null, null, null, null, null, null, null, null,
  ];
  const r = computeCourseCoAttainment({
    courseId: 'c', courseOutcomeId: 'co1', studentResults: results, enrolledCount: 10, policy,
  });
  assert.equal(r.attained, true, '2 of 2 assessed students attained');
  assert.equal(r.coverageWarning, true, 'but only 2 of 10 enrolled were assessed');
});

test('cohort attainment carries the direct-methods flag', () => {
  const r = computeCohortPoAttainment({
    programId: 'p', sessionId: 'sess', programOutcomeId: 'po1',
    studentResults: [{ attained: true }, { attained: true }, { attained: false }],
    cohortSize: 4, policy,
  });
  assert.equal(r.assessedCount, 3);
  assert.equal(r.attainmentPct, 66.67);
  assert.equal(r.attained, true);
  assert.equal(r.directOnly, true, 'survey data must never be presented as attainment');
});

test('unconfigured policy is version 0, not a silent default', () => {
  const assessments = fixture();
  const r = computeStudentCoAttainment({ studentId: 's1', courseOutcome: co1, assessments, policy: null });
  assert.equal(r.policyVersion, 0, 'version 0 marks a figure nobody approved');
  assert.equal(DEFAULT_POLICY.coStudentThreshold, 60);
});

test('a PO with no mapped COs returns null rather than zero', () => {
  const r = computeStudentPoAttainment({
    studentId: 's', programOutcomeId: 'po9', mappings: [], coResultsById: {}, policy,
  });
  assert.equal(r, null, 'an unmapped PO is unmeasured, not failed');
});
