#!/usr/bin/env node
// Stage 4 of 5: backfill + merge.
//
// Run this after stages 1-3 (rename, add AcademicSession, add nullable
// columns) and before stage 5 (which locks everything down with NOT NULL,
// foreign keys and unique constraints). Safe to run more than once; every
// step only touches rows it hasn't already filled in.
//
// Everything below runs for real, inside one open transaction, every time -
// including a dry run. The only difference dry run makes is the very last
// step: COMMIT if --apply was passed, ROLLBACK otherwise. This is
// deliberate: the duplicate-course merge preview in step 5 depends on step
// 2 having actually filled in curriculumVersionId first, so a dry run that
// skipped writing and only inspected the current state would report zero
// merges even when one is coming. Running for real and rolling back gives
// an accurate preview without touching the database.
//
// Uses `pg` directly rather than the Prisma client, on purpose: this only
// needs to run once or twice, ever, and doing it this way means it doesn't
// depend on `prisma generate` succeeding or the generated client matching
// whatever half-migrated shape the database happens to be in at the time.
//
//   DATABASE_URL=... node scripts/migrate-course-curriculum.js            # dry run, rolled back
//   DATABASE_URL=... node scripts/migrate-course-curriculum.js --apply    # committed
//
// Use DIRECT_URL / the session-mode connection string here, not the
// pgbouncer pooler, same rule as everywhere else DDL happens in this repo.
//
// What it does, in order:
//   1. Any Batch with no curriculumVersionId gets a "Legacy" CurriculumVersion
//      created per program its courses actually use (Batch itself has no
//      programId column; that only lives on Course).
//   2. Course.curriculumVersionId is filled in: from its batch if the batch
//      already has one that matches the course's own program, otherwise
//      from the legacy version just created.
//   3. One AcademicSession row is created for every (institution, term, year)
//      that any existing Batch's start date implies.
//   4. CourseAssignment / Enrolment / Assessment / CourseCoAttainment all get
//      their academicSessionId filled in from the batch their course
//      originally belonged to (via the not-yet-dropped Course.sessionId).
//   5. Courses that now share the same (curriculumVersionId, code) - this
//      happens when the same course was taught to more than one batch, since
//      each batch used to get its own Course row - get merged into one
//      canonical row. Everything that pointed at the old rows gets
//      repointed.
//
// A genuine, unresolvable collision (the rare case of two batches sharing
// the exact same academic session under the same curriculum) is reported
// and skipped rather than guessed at. Nothing here silently drops data on a
// judgement call it can't make; anything ambiguous stops and asks you to
// look at it by hand.

const crypto = require('crypto');
const { Client } = require('pg');

const APPLY = process.argv.includes('--apply');
const uid = () => crypto.randomUUID();
const log = (...a) => console.log(...a);

function termYearOf(date) {
  const d = new Date(date);
  const month = d.getUTCMonth() + 1; // 1-12
  return { term: month <= 6 ? 'JAN_JUN' : 'JUL_DEC', year: d.getUTCFullYear() };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Point it at the session-mode connection string.');
    process.exit(1);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const q = (sql, params = []) => client.query(sql, params).then(r => r.rows);
  const x = (sql, params = []) => client.query(sql, params);

  log(APPLY ? '=== APPLY MODE: this will be committed ===' : '=== DRY RUN: runs for real, then rolls back, nothing is kept ===');
  log('');

  try {
    await client.query('BEGIN');

    // ── 1 & 2. legacy curriculum version + Course.curriculumVersionId ──────
    const orphanCourseProgramRows = await q(`
      SELECT c."sessionId" AS batch_id, b.name AS batch_name, b."startDate" AS batch_start, c."programId"
      FROM "Course" c
      JOIN "Batch" b ON b.id = c."sessionId"
      WHERE b."curriculumVersionId" IS NULL
      GROUP BY c."sessionId", b.name, b."startDate", c."programId"
    `);
    const programsByBatch = {};
    for (const r of orphanCourseProgramRows) (programsByBatch[r.batch_id] ||= new Set()).add(r.programId);
    const distinctPrograms = [...new Set(orphanCourseProgramRows.map(r => r.programId))];

    log(`Batches with no curriculum version: ${Object.keys(programsByBatch).length}, spanning ${distinctPrograms.length} program(s)`);

    const legacyVersionIdByProgram = {};
    for (const programId of distinctPrograms) {
      const existing = await q(`SELECT id FROM "CurriculumVersion" WHERE "programId" = $1 AND label = 'Legacy (pre-migration)' LIMIT 1`, [programId]);
      let legacyId = existing[0]?.id;
      const rowsForProgram = orphanCourseProgramRows.filter(r => r.programId === programId);
      const earliest = rowsForProgram.reduce((min, r) => (r.batch_start < min ? r.batch_start : min), rowsForProgram[0].batch_start);
      if (!legacyId) {
        legacyId = uid();
        log(`  program ${programId}: creating legacy curriculum version (used by batches: ${[...new Set(rowsForProgram.map(r => r.batch_name))].join(', ')})`);
        const nextVer = await q(`SELECT COALESCE(MAX(version), 0) + 1 AS next FROM "CurriculumVersion" WHERE "programId" = $1`, [programId]);
        await x(
          `INSERT INTO "CurriculumVersion" (id, "programId", version, label, description, "effectiveFrom", "isCurrent", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 'Legacy (pre-migration)', 'Auto-created by the Batch/AcademicSession migration for courses whose batch had no curriculum version set.', $4, false, now(), now())`,
          [legacyId, programId, nextVer[0].next, earliest]
        );
      } else {
        log(`  program ${programId}: reusing existing legacy curriculum version ${legacyId}`);
      }
      legacyVersionIdByProgram[programId] = legacyId;
    }

    for (const [batchId, programSet] of Object.entries(programsByBatch)) {
      if (programSet.size === 1) {
        const [programId] = programSet;
        await x(`UPDATE "Batch" SET "curriculumVersionId" = $1 WHERE id = $2`, [legacyVersionIdByProgram[programId], batchId]);
      } else {
        log(`  MANUAL REVIEW: batch ${batchId} has courses across ${programSet.size} programs, its own curriculumVersionId was left null. Each course still got the right legacy version.`);
      }
    }

    const coursesToFix = await q(`
      SELECT c.id, c."programId", b."curriculumVersionId" AS batch_cv
      FROM "Course" c JOIN "Batch" b ON b.id = c."sessionId"
      WHERE c."curriculumVersionId" IS NULL
    `);
    log(`Courses needing curriculumVersionId: ${coursesToFix.length}`);
    for (const c of coursesToFix) {
      let cvId = c.batch_cv;
      if (cvId) {
        const cv = await q(`SELECT "programId" FROM "CurriculumVersion" WHERE id = $1`, [cvId]);
        if (!cv.length || cv[0].programId !== c.programId) cvId = null;
      }
      if (!cvId) cvId = legacyVersionIdByProgram[c.programId];
      await x(`UPDATE "Course" SET "curriculumVersionId" = $1 WHERE id = $2`, [cvId, c.id]);
    }
    log('');

    // ── 3. AcademicSession rows for every (institution, term, year) implied
    //      by an existing batch's start date ──────────────────────────────
    const batches = await q(`SELECT "institutionId", "startDate" FROM "Batch"`);
    const needed = new Map();
    for (const b of batches) {
      const { term, year } = termYearOf(b.startDate);
      needed.set(`${b.institutionId}|${term}|${year}`, { institutionId: b.institutionId, term, year });
    }
    let createdSessions = 0;
    for (const v of needed.values()) {
      const existing = await q(`SELECT id FROM "AcademicSession" WHERE "institutionId" = $1 AND term = $2::"AcademicTerm" AND year = $3`, [v.institutionId, v.term, v.year]);
      if (existing.length) continue;
      createdSessions++;
      await x(
        `INSERT INTO "AcademicSession" (id, "institutionId", term, year, "isActive", "createdAt", "updatedAt")
         VALUES ($1, $2, $3::"AcademicTerm", $4, true, now(), now())`,
        [uid(), v.institutionId, v.term, v.year]
      );
    }
    log(`Academic sessions implied by existing batches: ${needed.size}, new to create: ${createdSessions}`);
    log('');

    // ── 4. academicSessionId on CourseAssignment / Enrolment / Assessment /
    //      CourseCoAttainment, derived through Course.sessionId -> Batch ───
    const targets = ['CourseAssignment', 'Enrolment', 'Assessment', 'CourseCoAttainment'];
    for (const table of targets) {
      const need = await q(`
        SELECT count(*)::int AS n FROM "${table}" t
        JOIN "Course" c ON c.id = t."courseId"
        JOIN "Batch" b ON b.id = c."sessionId"
        WHERE t."academicSessionId" IS NULL
      `);
      log(`${table} rows needing academicSessionId: ${need[0].n}`);
      await x(`
        UPDATE "${table}" t
        SET "academicSessionId" = asn.id
        FROM "Course" c
        JOIN "Batch" b ON b.id = c."sessionId"
        JOIN "AcademicSession" asn
          ON asn."institutionId" = b."institutionId"
         AND asn.term = (CASE WHEN EXTRACT(MONTH FROM b."startDate") <= 6 THEN 'JAN_JUN' ELSE 'JUL_DEC' END)::"AcademicTerm"
         AND asn.year = EXTRACT(YEAR FROM b."startDate")::INTEGER
        WHERE t."courseId" = c.id AND t."academicSessionId" IS NULL
      `);
    }
    log('');

    // ── 4.5. swap the three unique constraints that need academicSessionId
    //      in them, now that every row has one. This has to happen before
    //      the merge below: the OLD constraints (courseId, facultyId) etc.
    //      are still live at this point and would block a perfectly valid
    //      cross-term merge that only looks safe against the NEW shape.
    //      Guarded so this is safe to run again if stage 5 already did it,
    //      or if this script is re-run after a partial previous run.
    const constraintSwaps = [
      { table: 'CourseAssignment', oldName: 'CourseAssignment_courseId_facultyId_key', newName: 'CourseAssignment_courseId_facultyId_academicSessionId_key', cols: '"courseId", "facultyId", "academicSessionId"' },
      { table: 'Enrolment', oldName: 'Enrolment_studentId_courseId_key', newName: 'Enrolment_studentId_courseId_academicSessionId_key', cols: '"studentId", "courseId", "academicSessionId"' },
      { table: 'CourseCoAttainment', oldName: 'CourseCoAttainment_courseId_courseOutcomeId_key', newName: 'CourseCoAttainment_course_session_outcome_key', cols: '"courseId", "academicSessionId", "courseOutcomeId"' },
    ];
    for (const { table, oldName, newName, cols } of constraintSwaps) {
      await x(`DROP INDEX IF EXISTS "${oldName}"`);
      await x(`CREATE UNIQUE INDEX IF NOT EXISTS "${newName}" ON "${table}"(${cols})`);
    }
    log('Swapped CourseAssignment / Enrolment / CourseCoAttainment unique constraints to include academicSessionId.');
    log('');
    const groups = await q(`
      SELECT "curriculumVersionId", code, array_agg(id ORDER BY "createdAt") AS ids, count(*)::int AS n
      FROM "Course" WHERE "curriculumVersionId" IS NOT NULL
      GROUP BY "curriculumVersionId", code HAVING count(*) > 1
    `);
    log(`Duplicate (curriculumVersion, code) course groups: ${groups.length}`);
    for (const g of groups) {
      await mergeGroup(client, q, x, g.ids);
    }

    log('');
    log('=== summary ===');
    const remaining = (await q(`
      SELECT
        (SELECT count(*)::int FROM "Course" WHERE "curriculumVersionId" IS NULL) AS courses_missing_cv,
        (SELECT count(*)::int FROM "CourseAssignment" WHERE "academicSessionId" IS NULL) AS assignments_missing_session,
        (SELECT count(*)::int FROM "Enrolment" WHERE "academicSessionId" IS NULL) AS enrolments_missing_session,
        (SELECT count(*)::int FROM "Assessment" WHERE "academicSessionId" IS NULL) AS assessments_missing_session,
        (SELECT count(*)::int FROM "CourseCoAttainment" WHERE "academicSessionId" IS NULL) AS course_co_attainment_missing_session,
        (SELECT count(*)::int FROM (
           SELECT 1 FROM "Course" WHERE "curriculumVersionId" IS NOT NULL
           GROUP BY "curriculumVersionId", code HAVING count(*) > 1
         ) g2) AS remaining_duplicate_groups
    `))[0];
    console.table([remaining]);

    if (APPLY) {
      await client.query('COMMIT');
      const clean = Object.values(remaining).every(v => Number(v) === 0);
      log(clean
        ? 'Committed. All clear, stage 5 (the contract migration) can run now.'
        : 'Committed, but not clean. Do not run stage 5 until every count above is zero. See the MANUAL REVIEW notes above.');
    } else {
      await client.query('ROLLBACK');
      log('Dry run complete and rolled back. Nothing was kept. Re-run with --apply to commit these changes.');
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

// Merge one group of duplicate course ids (same curriculumVersionId + code)
// into a single canonical row. Canonical = most CourseOutcomes, tie-break
// earliest createdAt.
async function mergeGroup(client, q, x, ids) {
  const courses = await q(`
    SELECT c.id, c."createdAt",
      (SELECT count(*)::int FROM "CourseOutcome" co WHERE co."courseId" = c.id) AS co_count
    FROM "Course" c WHERE c.id = ANY($1)
  `, [ids]);
  courses.sort((a, b) => b.co_count - a.co_count || (new Date(a.createdAt) < new Date(b.createdAt) ? -1 : 1));
  const canonicalId = courses[0].id;
  const loserIds = courses.slice(1).map(c => c.id);
  log(`  group ${ids.join(',')}: canonical = ${canonicalId} (${courses[0].co_count} outcomes), merging ${loserIds.length} loser(s)`);

  for (const loserId of loserIds) {
    await mergeOneLoser(client, q, x, canonicalId, loserId);
  }
}

async function mergeOneLoser(client, q, x, canonicalId, loserId) {
  const canonicalCOs = await q(`SELECT id, code FROM "CourseOutcome" WHERE "courseId" = $1`, [canonicalId]);
  const canonicalByCode = Object.fromEntries(canonicalCOs.map(c => [c.code, c.id]));
  const loserCOs = await q(`SELECT id, code FROM "CourseOutcome" WHERE "courseId" = $1`, [loserId]);

  for (const lco of loserCOs) {
    const matchId = canonicalByCode[lco.code];
    if (matchId) {
      log(`    CO ${lco.code}: loser ${lco.id} -> canonical ${matchId}`);
      await repointCourseOutcome(client, q, x, lco.id, matchId, canonicalId);
    } else {
      log(`    CO ${lco.code}: no match on canonical, keeping it, repointing to canonical course`);
      await x(`UPDATE "CourseOutcome" SET "courseId" = $1 WHERE id = $2`, [canonicalId, lco.id]);
    }
  }

  // CoAttainment carries its own denormalized courseId alongside
  // courseOutcomeId. Resync it to wherever that outcome's course ended up.
  await x(`
    UPDATE "CoAttainment" ca SET "courseId" = co."courseId"
    FROM "CourseOutcome" co WHERE co.id = ca."courseOutcomeId" AND ca."courseId" != co."courseId"
  `);

  // course-scoped tables with a unique constraint that could collide.
  // a colliding row is left under the old course id and reported, never
  // silently dropped or overwritten.
  const perRowTables = [
    { table: 'CourseAssignment', uniqueCols: ['facultyId', 'academicSessionId'] },
    { table: 'Enrolment', uniqueCols: ['studentId', 'academicSessionId'] },
    { table: 'CourseCoAttainment', uniqueCols: ['academicSessionId', 'courseOutcomeId'] },
    { table: 'PoAttainment', uniqueCols: ['programOutcomeId', 'studentId'] },
  ];
  for (const { table, uniqueCols } of perRowTables) {
    const rows = await q(`SELECT * FROM "${table}" WHERE "courseId" = $1`, [loserId]);
    for (const row of rows) {
      const whereParts = uniqueCols.map((c, i) => `"${c}" = $${i + 2}`).join(' AND ');
      const params = [canonicalId, ...uniqueCols.map(c => row[c])];
      const clash = await q(
        `SELECT id FROM "${table}" WHERE "courseId" = $1 AND ${whereParts} AND id != $${params.length + 1}`,
        [...params, row.id]
      );
      if (clash.length) {
        log(`    MANUAL REVIEW: ${table} row ${row.id} collides with ${clash[0].id} on the canonical course, left under the old course id (${loserId}) untouched.`);
        continue;
      }
      await x(`UPDATE "${table}" SET "courseId" = $1 WHERE id = $2`, [canonicalId, row.id]);
    }
  }

  // tables with no per-row collision risk at all
  for (const table of ['Assessment', 'Evidence', 'Report']) {
    await x(`UPDATE "${table}" SET "courseId" = $1 WHERE "courseId" = $2`, [canonicalId, loserId]);
  }

  // composite-key tag tables (course + attribute/SDG, an optional freeform
  // note): copy the tag across if canonical doesn't already have it. If both
  // sides had a differing note, canonical's is kept and it is logged, not
  // silently dropped.
  const tagTables = [
    { table: 'CourseComplexAttr', otherCol: 'complexAttributeId', noteCol: 'justification' },
    { table: 'CourseSdg', otherCol: 'sdgId', noteCol: 'howAddressed' },
  ];
  for (const { table, otherCol, noteCol } of tagTables) {
    const rows = await q(`SELECT "${otherCol}" AS other_id, "${noteCol}" AS note FROM "${table}" WHERE "courseId" = $1`, [loserId]);
    for (const row of rows) {
      const clash = await q(`SELECT "${noteCol}" AS note FROM "${table}" WHERE "courseId" = $1 AND "${otherCol}" = $2`, [canonicalId, row.other_id]);
      if (clash.length) {
        if (row.note && clash[0].note && row.note !== clash[0].note) {
          log(`    MANUAL REVIEW: ${table} note differs for ${otherCol}=${row.other_id}, canonical's note kept: "${clash[0].note}" (loser had: "${row.note}")`);
        }
      } else {
        await x(`INSERT INTO "${table}" ("courseId", "${otherCol}", "${noteCol}") VALUES ($1, $2, $3)`, [canonicalId, row.other_id, row.note]);
      }
    }
  }

  // CoPoMapping: repoint, dropping any row that would duplicate one the
  // canonical course already has for the same (courseOutcome, programOutcome)
  const mappings = await q(`SELECT * FROM "CoPoMapping" WHERE "courseId" = $1`, [loserId]);
  for (const m of mappings) {
    const clash = await q(
      `SELECT id, correlation FROM "CoPoMapping" WHERE "courseId" = $1 AND "courseOutcomeId" = $2 AND "programOutcomeId" = $3`,
      [canonicalId, m.courseOutcomeId, m.programOutcomeId]
    );
    if (clash.length) {
      if (clash[0].correlation !== m.correlation) {
        log(`    MANUAL REVIEW: CoPoMapping correlation differs (canonical=${clash[0].correlation}, loser=${m.correlation}) for CO ${m.courseOutcomeId} / PO ${m.programOutcomeId}. Canonical's value kept; check it by hand.`);
      }
      await x(`DELETE FROM "CoPoMapping" WHERE id = $1`, [m.id]);
    } else {
      await x(`UPDATE "CoPoMapping" SET "courseId" = $1 WHERE id = $2`, [canonicalId, m.id]);
    }
  }

  // Never delete a loser course that still has live references left behind
  // by a skipped collision above. A stray row pointing at a deleted course
  // is worse than an incomplete merge; leave the course in place, flag it,
  // and let the operator resolve the collision by hand before re-running.
  const stillReferenced = [];
  for (const table of ['CourseAssignment', 'Enrolment', 'CourseCoAttainment', 'PoAttainment']) {
    const left = await q(`SELECT count(*)::int AS n FROM "${table}" WHERE "courseId" = $1`, [loserId]);
    if (left[0].n > 0) stillReferenced.push(`${table} (${left[0].n})`);
  }
  if (stillReferenced.length) {
    log(`    NOT DELETING course ${loserId}: still referenced by ${stillReferenced.join(', ')}. Resolve the MANUAL REVIEW item(s) above, then re-run this script.`);
    return;
  }

  await x(`DELETE FROM "Course" WHERE id = $1`, [loserId]);
}

// Repoint everything that referenced a loser CourseOutcome to the matching
// canonical one, then delete the loser CourseOutcome.
async function repointCourseOutcome(client, q, x, loserCoId, canonicalCoId, canonicalCourseId) {
  await x(`UPDATE "CoAttainment" SET "courseOutcomeId" = $1 WHERE "courseOutcomeId" = $2`, [canonicalCoId, loserCoId]);
  await x(`UPDATE "AssessmentCO" SET "courseOutcomeId" = $1 WHERE "courseOutcomeId" = $2`, [canonicalCoId, loserCoId]);
  await x(`UPDATE "CourseOutcomeWk" SET "courseOutcomeId" = $1 WHERE "courseOutcomeId" = $2`, [canonicalCoId, loserCoId]);
  await x(`UPDATE "CourseOutcomeComplexAttr" SET "courseOutcomeId" = $1 WHERE "courseOutcomeId" = $2`, [canonicalCoId, loserCoId]);
  await x(`UPDATE "CqiAction" SET "courseOutcomeId" = $1 WHERE "courseOutcomeId" = $2`, [canonicalCoId, loserCoId]);

  await x(
    `UPDATE "CourseCoAttainment" SET "courseOutcomeId" = $1, "courseId" = $2 WHERE "courseOutcomeId" = $3`,
    [canonicalCoId, canonicalCourseId, loserCoId]
  );

  const mappings = await q(`SELECT * FROM "CoPoMapping" WHERE "courseOutcomeId" = $1`, [loserCoId]);
  for (const m of mappings) {
    const clash = await q(
      `SELECT id, correlation FROM "CoPoMapping" WHERE "courseId" = $1 AND "courseOutcomeId" = $2 AND "programOutcomeId" = $3`,
      [canonicalCourseId, canonicalCoId, m.programOutcomeId]
    );
    if (clash.length) {
      if (clash[0].correlation !== m.correlation) {
        log(`    MANUAL REVIEW: CoPoMapping correlation differs (canonical=${clash[0].correlation}, loser=${m.correlation}) for CO ${canonicalCoId} / PO ${m.programOutcomeId}. Canonical's value kept; check it by hand.`);
      }
      await x(`DELETE FROM "CoPoMapping" WHERE id = $1`, [m.id]);
    } else {
      await x(`UPDATE "CoPoMapping" SET "courseId" = $1, "courseOutcomeId" = $2 WHERE id = $3`, [canonicalCourseId, canonicalCoId, m.id]);
    }
  }

  await x(`DELETE FROM "CourseOutcome" WHERE id = $1`, [loserCoId]);
}

main().catch((e) => { console.error(e); process.exit(1); });
