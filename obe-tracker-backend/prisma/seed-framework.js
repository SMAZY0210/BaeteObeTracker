/**
 * Seeds the BAETE v3.0 framework vocabulary: PO1-PO12, WK1-WK9, WP1-WP7,
 * EA1-EA5, SDG1-SDG17 and the two program-specific criteria sections ICE might
 * be evaluated against.
 *
 * Idempotent. Run it before the institution seed and again after any framework
 * revision. It touches nothing owned by a program, so re-running is safe on a
 * populated database.
 *
 *   node prisma/seed-framework.js
 */

const { PrismaClient } = require('@prisma/client');
const {
  FRAMEWORK,
  PROGRAM_OUTCOMES,
  KNOWLEDGE_PROFILE,
  COMPLEX_PROBLEM_ATTRIBUTES,
  COMPLEX_ACTIVITY_ATTRIBUTES,
  SDGS,
  PROGRAM_SPECIFIC_CRITERIA,
} = require('./baete-v3-framework');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding BAETE framework', FRAMEWORK.version);

  const framework = await prisma.accreditationFramework.upsert({
    where: { code: FRAMEWORK.code },
    update: {
      name: FRAMEWORK.name,
      manualRef: FRAMEWORK.manualRef,
      version: FRAMEWORK.version,
      accord: FRAMEWORK.accord,
      sarTemplateRef: FRAMEWORK.sarTemplateRef,
      effectiveFrom: FRAMEWORK.effectiveFrom,
    },
    create: {
      code: FRAMEWORK.code,
      name: FRAMEWORK.name,
      manualRef: FRAMEWORK.manualRef,
      version: FRAMEWORK.version,
      accord: FRAMEWORK.accord,
      sarTemplateRef: FRAMEWORK.sarTemplateRef,
      effectiveFrom: FRAMEWORK.effectiveFrom,
    },
  });

  // Knowledge profile first, because the PO links point at it.
  const wkByCode = {};
  for (const wk of KNOWLEDGE_PROFILE) {
    const row = await prisma.knowledgeProfile.upsert({
      where: { frameworkId_code: { frameworkId: framework.id, code: wk.code } },
      update: { attribute: wk.attribute, shortName: wk.shortName ?? null },
      create: { frameworkId: framework.id, code: wk.code, shortName: wk.shortName ?? null, attribute: wk.attribute },
    });
    wkByCode[wk.code] = row.id;
  }
  console.log(`  WK1-WK${KNOWLEDGE_PROFILE.length}`);

  for (const po of PROGRAM_OUTCOMES) {
    const row = await prisma.frameworkOutcome.upsert({
      where: { frameworkId_code: { frameworkId: framework.id, code: po.code } },
      update: { title: po.title, statement: po.statement },
      create: {
        frameworkId: framework.id,
        code: po.code,
        title: po.title,
        statement: po.statement,
      },
    });

    for (const wkCode of po.knowledgeProfile) {
      const wkId = wkByCode[wkCode];
      if (!wkId) throw new Error(`${po.code} references unknown ${wkCode}`);
      await prisma.frameworkOutcomeWk.upsert({
        where: {
          frameworkOutcomeId_knowledgeProfileId: {
            frameworkOutcomeId: row.id,
            knowledgeProfileId: wkId,
          },
        },
        update: {},
        create: { frameworkOutcomeId: row.id, knowledgeProfileId: wkId },
      });
    }
  }
  console.log(`  PO1-PO${PROGRAM_OUTCOMES.length} with WK links`);

  const complex = [
    ...COMPLEX_PROBLEM_ATTRIBUTES.map((a) => ({ ...a, kind: 'PROBLEM' })),
    ...COMPLEX_ACTIVITY_ATTRIBUTES.map((a) => ({ ...a, kind: 'ACTIVITY' })),
  ];
  for (const c of complex) {
    await prisma.complexAttribute.upsert({
      where: { frameworkId_code: { frameworkId: framework.id, code: c.code } },
      update: { dimension: c.dimension, attribute: c.attribute, isMandatory: !!c.mandatory },
      create: {
        frameworkId: framework.id,
        code: c.code,
        kind: c.kind,
        dimension: c.dimension,
        attribute: c.attribute,
        isMandatory: !!c.mandatory,
      },
    });
  }
  console.log(`  WP1-WP7, EA1-EA5`);

  for (const psc of PROGRAM_SPECIFIC_CRITERIA) {
    await prisma.programSpecificCriteria.upsert({
      where: { frameworkId_code: { frameworkId: framework.id, code: psc.code } },
      update: { name: psc.name, section: psc.section, requiredTopics: psc.requiredTopics, note: psc.note ?? null },
      create: {
        frameworkId: framework.id,
        code: psc.code,
        section: psc.section,
        name: psc.name,
        requiredTopics: psc.requiredTopics,
        note: psc.note ?? null,
      },
    });
  }
  console.log(`  Program-specific criteria: ${PROGRAM_SPECIFIC_CRITERIA.map((p) => p.code).join(', ')}`);

  for (const sdg of SDGS) {
    await prisma.sdg.upsert({
      where: { code: sdg.code },
      update: { name: sdg.name },
      create: { code: sdg.code, name: sdg.name },
    });
  }
  console.log(`  SDG1-SDG${SDGS.length}`);

  console.log('Framework seeded.');
  console.log(
    '\nNext: attach a program to it, then create a ThresholdPolicy v1 with a written\n' +
      'rationale before computing anything. Attainment numbers produced without a\n' +
      'policy row fall back to 60% across the board and carry policyVersion 0, which\n' +
      'is a marker for "nobody has approved this yet", not a default to ship on.'
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
