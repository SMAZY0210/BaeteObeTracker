#!/usr/bin/env node
/**
 * BAETE readiness audit.
 *
 *   node scripts/verify-baete.js
 *   node scripts/verify-baete.js --program <programId>
 *
 * Checks the database against ACC-MAN-02 v3.0. Three outcomes per check:
 *   PASS  fine
 *   WARN  works, but an evaluator would ask about it
 *   FAIL  broken, or would sink a Self-assessment Report
 *
 * Exit code 1 if anything FAILs, so CI can gate on it.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const results = [];
const pass = (area, msg) => results.push({ level: 'PASS', area, msg });
const warn = (area, msg) => results.push({ level: 'WARN', area, msg });
const fail = (area, msg) => results.push({ level: 'FAIL', area, msg });

// ── 1. Framework vocabulary ──────────────────────────────────────────
async function checkFramework() {
  const fw = await prisma.accreditationFramework.findUnique({
    where: { code: 'BAETE_V3' },
    include: {
      frameworkOutcomes: true,
      knowledgeProfiles: true,
      complexAttributes: true,
    },
  });

  if (!fw) {
    fail('framework', 'BAETE_V3 not seeded. Run: node prisma/seed-framework.js');
    return null;
  }

  const counts = {
    PO: fw.frameworkOutcomes.length,
    WK: fw.knowledgeProfiles.length,
    WP: fw.complexAttributes.filter((c) => c.kind === 'PROBLEM').length,
    EA: fw.complexAttributes.filter((c) => c.kind === 'ACTIVITY').length,
  };
  const expected = { PO: 12, WK: 9, WP: 7, EA: 5 };
  for (const [k, v] of Object.entries(expected)) {
    if (counts[k] !== v) fail('framework', `expected ${v} ${k}, found ${counts[k]}`);
  }
  if (Object.entries(expected).every(([k, v]) => counts[k] === v)) {
    pass('framework', `${fw.code} ${fw.version}: PO12 WK9 WP7 EA5`);
  }

  const sdgs = await prisma.sdg.count();
  if (sdgs !== 17) warn('framework', `expected 17 SDGs, found ${sdgs}`);
  else pass('framework', 'SDG1-SDG17 present');

  // The accord check. Dublin wording is the regression that matters most:
  // it means the POs describe an engineering technician, not a graduate.
  const dublin = fw.frameworkOutcomes.filter((o) =>
    /well-defined|broadly-defined|codified method|assist with the design/i.test(o.statement)
  );
  if (dublin.length) {
    fail('accord', `${dublin.length} PO(s) use Dublin/Sydney wording (${dublin.map((d) => d.code).join(', ')}). BAETE accredits under the Washington Accord; these describe a technician-level programme.`);
  } else {
    const complexCount = fw.frameworkOutcomes.filter((o) => /complex engineering/i.test(o.statement)).length;
    if (complexCount < 6) warn('accord', `only ${complexCount} POs mention complex engineering problems; expected most of PO1-PO6`);
    else pass('accord', 'PO statements use Washington Accord (complex problems) wording');
  }

  const po12 = fw.frameworkOutcomes.find((o) => o.code === 'PO12');
  if (po12 && !/business|entrepreneur/i.test(po12.statement)) {
    fail('accord', 'PO12 is not Entrepreneurship. That means the PO ordering predates GAPC v4 and every mapping above PO6 means something different than intended.');
  }

  return fw;
}

// ── 2. Program wiring and threshold policy ───────────────────────────
async function checkPrograms(targetId) {
  const programs = await prisma.program.findMany({
    where: targetId ? { id: targetId } : { isActive: true },
    include: {
      framework: true,
      specificCriteria: true,
      thresholdPolicies: { orderBy: { version: 'desc' } },
      peos: true,
      programOutcomes: true,
    },
  });

  if (!programs.length) {
    fail('program', 'no active programs found');
    return [];
  }

  for (const p of programs) {
    const tag = p.code || p.id.slice(0, 8);

    if (!p.frameworkId) {
      warn('program', `${tag}: no framework attached (fine if this program is not pursuing accreditation)`);
      continue;
    }

    if (!p.programSpecificCriteriaId) {
      warn('program', `${tag}: no program-specific criteria chosen. ACC-MAN-03 s.6.12 requires an unlisted program be evaluated against the closest listed criteria; pick s.6.5 (CSE) or s.6.6 (EEE/ECE).`);
    } else {
      pass('program', `${tag}: mapped to ${p.specificCriteria.name} (s.${p.specificCriteria.section})`);
    }

    // PO linkage
    const unlinked = p.programOutcomes.filter((o) => !o.frameworkOutcomeId);
    if (p.programOutcomes.length === 0) {
      fail('program', `${tag}: no ProgramOutcome rows`);
    } else if (unlinked.length) {
      warn('program', `${tag}: ${unlinked.length} PO(s) not linked to a framework outcome (${unlinked.map((u) => u.code).join(', ')}). Fine for program-defined extras, wrong for PO1-PO12.`);
    } else {
      pass('program', `${tag}: ${p.programOutcomes.length} POs linked to framework`);
    }

    // Threshold policy
    const active = p.thresholdPolicies[0];
    if (!active) {
      fail('policy', `${tag}: no ThresholdPolicy. Attainment is running at 60% unapproved.`);
    } else if (/PLACEHOLDER/i.test(active.rationale)) {
      warn('policy', `${tag}: policy v${active.version} rationale is still a PLACEHOLDER. Not defensible until the academic committee records the decision.`);
    } else if (!active.approvedAt) {
      warn('policy', `${tag}: policy v${active.version} has a rationale but no approval record (approvedBy/approvedAt null).`);
    } else {
      pass('policy', `${tag}: policy v${active.version} approved ${active.approvedAt.toISOString().slice(0, 10)}`);
    }

    // PEOs — criterion 5.1
    if (!p.peos.length) {
      fail('peo', `${tag}: no PEOs. Criterion 5.1 cannot be answered and a SAR cannot be written.`);
    } else {
      const unpublished = p.peos.filter((x) => !x.publishedUrl);
      const mapped = await prisma.peoPoMap.count({ where: { peoId: { in: p.peos.map((x) => x.id) } } });
      if (unpublished.length) warn('peo', `${tag}: ${unpublished.length} PEO(s) have no published URL (s.5.1.1 requires PEOs be published)`);
      if (!mapped) fail('peo', `${tag}: PEOs exist but none are mapped to POs`);
      else pass('peo', `${tag}: ${p.peos.length} PEOs, ${mapped} PEO-PO mappings`);
    }
  }
  return programs;
}

// ── 3. Curriculum mapping coverage — criterion 5.3.6 ─────────────────
async function checkMappingCoverage(fw) {
  if (!fw) return;

  // Every WK attribute must be demonstrably addressed somewhere
  const wkUsed = await prisma.courseOutcomeWk.groupBy({
    by: ['knowledgeProfileId'],
    _count: true,
  });
  const usedIds = new Set(wkUsed.map((r) => r.knowledgeProfileId));
  const missingWk = fw.knowledgeProfiles.filter((w) => !usedIds.has(w.id));

  if (!wkUsed.length) {
    fail('mapping', 'no CO is mapped to any WK attribute. s.5.3.6 requires the curriculum demonstrate how each of WK1-WK9 is addressed.');
  } else if (missingWk.length) {
    fail('mapping', `WK attributes with no CO mapped: ${missingWk.map((w) => w.code).join(', ')}`);
  } else {
    pass('mapping', 'all WK1-WK9 addressed by at least one CO');
  }

  // WP/EA at assessment level
  const wpUsed = await prisma.assessmentComplexAttr.groupBy({ by: ['complexAttributeId'], _count: true });
  const wpIds = new Set(wpUsed.map((r) => r.complexAttributeId));
  const wp1 = fw.complexAttributes.find((c) => c.code === 'WP1');

  if (!wpUsed.length) {
    fail('mapping', 'no assessment carries a WP or EA tag. An evaluator asks which specific coursework carries WP3; a course-level tag cannot answer that.');
  } else {
    if (wp1 && !wpIds.has(wp1.id)) {
      fail('mapping', 'WP1 is tagged nowhere. WP1 is mandatory: a problem without it is not a complex engineering problem.');
    }
    const missing = fw.complexAttributes.filter((c) => !wpIds.has(c.id));
    if (missing.length) warn('mapping', `not incorporated anywhere: ${missing.map((c) => c.code).join(', ')}`);
    else pass('mapping', 'all WP1-WP7 and EA1-EA5 incorporated');
  }

  // SDGs — new in v3
  const sdgCourse = await prisma.courseSdg.count();
  const sdgAssess = await prisma.assessmentSdg.count();
  if (!sdgCourse && !sdgAssess) {
    fail('mapping', 'no SDG mapping anywhere. New requirement in v3 (s.5.3.6): show how SDGs are considered in teaching, learning and assessment.');
  } else {
    pass('mapping', `SDG links: ${sdgCourse} course, ${sdgAssess} assessment`);
  }

  // CO-PO matrix
  const nullCorr = await prisma.coPoMapping.count({ where: { correlation: undefined } }).catch(() => 0);
  const total = await prisma.coPoMapping.count();
  if (!total) fail('mapping', 'no CO-PO mappings at all');
  else pass('mapping', `${total} CO-PO mappings`);
  if (nullCorr) fail('mapping', `${nullCorr} mappings without a correlation strength`);
}

// ── 4. Attainment integrity ──────────────────────────────────────────
async function checkAttainment() {
  const unapproved = await prisma.coAttainment.count({ where: { policyVersion: 0 } });
  if (unapproved) {
    warn('attainment', `${unapproved} CoAttainment rows computed under policy version 0, meaning no committee approved the threshold that produced them.`);
  } else {
    pass('attainment', 'no attainment rows carry an unapproved policy version');
  }

  const tier1 = await prisma.coAttainment.count();
  const tier2 = await prisma.courseCoAttainment.count();
  if (tier1 && !tier2) {
    fail('attainment', 'per-student CO attainment exists but no CourseCoAttainment rows. Tier 2 is the number CQI runs on; recompute has not been run since the upgrade.');
  } else if (tier2) {
    pass('attainment', `tier 1: ${tier1} rows, tier 2: ${tier2} rows`);
  }

  const thin = await prisma.courseCoAttainment.findMany({
    where: { assessedCount: { lt: 5 } },
    select: { courseId: true, courseOutcomeId: true, assessedCount: true, enrolledCount: true },
    take: 5,
  });
  if (thin.length) {
    warn('attainment', `${thin.length}+ CO(s) computed from fewer than 5 assessed students. Thin coverage does not survive a visit.`);
  }

  const cohort = await prisma.cohortPoAttainment.count();
  if (!cohort) {
    warn('attainment', 'no CohortPoAttainment rows. s.5.2.5 asks for PO attainment by graduation, which is a cohort claim. Run recomputeCohortAttainment(sessionId) when a session closes.');
  } else {
    const indirect = await prisma.cohortPoAttainment.count({ where: { directOnly: false } });
    if (indirect) fail('attainment', `${indirect} cohort rows include indirect evidence. s.5.2.5 requires direct methods.`);
    else pass('attainment', `${cohort} cohort PO rows, all direct-methods only`);
  }
}

// ── 5. CQI loop — criterion 5.5 ──────────────────────────────────────
async function checkCqi() {
  const total = await prisma.cqiAction.count();
  if (!total) {
    warn('cqi', 'no CQI actions recorded. s.5.5 wants findings used regularly to refine the program.');
    return;
  }

  const empty = await prisma.cqiAction.count({ where: { action: '', status: { in: ['OPEN', 'IN_PROGRESS'] } } });
  const stale = await prisma.cqiAction.count({
    where: { status: 'OPEN', createdAt: { lt: new Date(Date.now() - 180 * 864e5) } },
  });
  const closedNoNote = await prisma.cqiAction.count({ where: { status: 'CLOSED', closureNote: null } });

  if (empty) warn('cqi', `${empty} open action(s) with no action text written yet`);
  if (stale) fail('cqi', `${stale} action(s) open for over 6 months. An unclosed loop is visible evidence the loop does not close.`);
  if (closedNoNote) fail('cqi', `${closedNoNote} action(s) closed with no closure note`);
  if (!empty && !stale && !closedNoNote) pass('cqi', `${total} CQI actions, none stale or undocumented`);
}

// ── 6. Evidence and integrity ────────────────────────────────────────
async function checkEvidenceAndIntegrity() {
  const ev = await prisma.evidence.count();
  if (!ev) {
    fail('evidence', 'no evidence files. s.5.2.3 requires lecture plans, grading policy and samples of student work to be available.');
  } else {
    const scripts = await prisma.evidence.count({ where: { kind: { in: ['SCRIPT_BEST', 'SCRIPT_AVERAGE', 'SCRIPT_WEAKEST'] } } });
    const noRetention = await prisma.evidence.count({ where: { studentId: { not: null }, retainUntil: null } });
    pass('evidence', `${ev} files, ${scripts} script samples`);
    if (noRetention) warn('evidence', `${noRetention} student-linked file(s) with no retainUntil. Scripts are personal data; "keep forever" is not a retention policy.`);
  }

  const [orphanMarks, orphanEnrol] = await Promise.all([
    prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM "Mark" m LEFT JOIN "User" u ON u.id = m."studentId" WHERE u.id IS NULL`,
    prisma.$queryRaw`SELECT COUNT(*)::int AS n FROM "Enrolment" e LEFT JOIN "User" u ON u.id = e."studentId" WHERE u.id IS NULL`,
  ]);
  const om = orphanMarks[0]?.n ?? 0;
  const oe = orphanEnrol[0]?.n ?? 0;
  if (om || oe) fail('integrity', `orphan rows: ${om} Mark, ${oe} Enrolment. The foreign keys should make this impossible; investigate.`);
  else pass('integrity', 'no orphaned marks or enrolments');

  const weakPw = await prisma.user.count({ where: { mustChangePassword: true, lastLoginAt: { not: null } } });
  if (weakPw) warn('security', `${weakPw} user(s) have logged in but never changed their seeded password`);
}

// ── main ─────────────────────────────────────────────────────────────
async function main() {
  const idx = process.argv.indexOf('--program');
  const targetId = idx > -1 ? process.argv[idx + 1] : null;

  const fw = await checkFramework();
  await checkPrograms(targetId);
  await checkMappingCoverage(fw);
  await checkAttainment();
  await checkCqi();
  await checkEvidenceAndIntegrity();

  const width = Math.max(...results.map((r) => r.area.length));
  const colour = { PASS: '\x1b[32m', WARN: '\x1b[33m', FAIL: '\x1b[31m' };
  const reset = '\x1b[0m';

  console.log('\nBAETE readiness audit (ACC-MAN-02 v3.0)\n' + '─'.repeat(72));
  for (const level of ['FAIL', 'WARN', 'PASS']) {
    for (const r of results.filter((x) => x.level === level)) {
      console.log(`${colour[level]}${level}${reset}  ${r.area.padEnd(width)}  ${r.msg}`);
    }
  }

  const f = results.filter((r) => r.level === 'FAIL').length;
  const w = results.filter((r) => r.level === 'WARN').length;
  const p = results.filter((r) => r.level === 'PASS').length;
  console.log('─'.repeat(72));
  console.log(`${p} pass · ${w} warn · ${f} fail`);
  if (f) console.log('\nFAILs are things that would sink a Self-assessment Report. Fix those first.');

  process.exitCode = f ? 1 : 0;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
