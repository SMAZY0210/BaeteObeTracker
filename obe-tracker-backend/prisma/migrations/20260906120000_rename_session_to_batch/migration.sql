-- Stage 1 of 5: rename Session -> Batch.
--
-- Pure renames only. Every row, every column value, stays exactly as it was;
-- only the names change. Safe to run on a database with live data.
--
-- Run with: psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f this_file.sql
-- (DIRECT_URL, not DATABASE_URL: DDL cannot go through the pgbouncer pooler,
-- same rule your own scripts/db-sync.sh already enforces.)

BEGIN;

-- the enum
ALTER TYPE "SessionStatus" RENAME TO "BatchStatus";

-- the table
ALTER TABLE "Session" RENAME TO "Batch";

-- columns on other tables that pointed at it
ALTER TABLE "User" RENAME COLUMN "sessionId" TO "batchId";
ALTER TABLE "CohortPoAttainment" RENAME COLUMN "sessionId" TO "batchId";

COMMIT;

-- ── cosmetic: bring constraint and index names in line with the new table
-- name, so a later `prisma db push` sees zero drift and doesn't try to
-- recreate them. Each one is guarded: if a name doesn't match what's
-- actually in the database, that single rename is skipped rather than
-- failing the whole migration. None of this touches data.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Session_pkey') THEN
    ALTER INDEX "Session_pkey" RENAME TO "Batch_pkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'Session_institutionId_idx') THEN
    ALTER INDEX "Session_institutionId_idx" RENAME TO "Batch_institutionId_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'Session_departmentId_idx') THEN
    ALTER INDEX "Session_departmentId_idx" RENAME TO "Batch_departmentId_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Session_institutionId_fkey') THEN
    ALTER TABLE "Batch" RENAME CONSTRAINT "Session_institutionId_fkey" TO "Batch_institutionId_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Session_departmentId_fkey') THEN
    ALTER TABLE "Batch" RENAME CONSTRAINT "Session_departmentId_fkey" TO "Batch_departmentId_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Session_curriculumVersionId_fkey') THEN
    ALTER TABLE "Batch" RENAME CONSTRAINT "Session_curriculumVersionId_fkey" TO "Batch_curriculumVersionId_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_sessionId_fkey') THEN
    ALTER TABLE "User" RENAME CONSTRAINT "User_sessionId_fkey" TO "User_batchId_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CohortPoAttainment_sessionId_fkey') THEN
    ALTER TABLE "CohortPoAttainment" RENAME CONSTRAINT "CohortPoAttainment_sessionId_fkey" TO "CohortPoAttainment_batchId_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'CohortPoAttainment_sessionId_programOutcomeId_key') THEN
    ALTER INDEX "CohortPoAttainment_sessionId_programOutcomeId_key" RENAME TO "CohortPoAttainment_batchId_programOutcomeId_key";
  END IF;
END $$;

COMMIT;

-- Verify before moving to stage 2:
--   SELECT count(*) FROM "Batch";                      -- should equal old Session count
--   SELECT count(*) FROM "User" WHERE "batchId" IS NOT NULL;
--   SELECT count(*) FROM "CohortPoAttainment";
-- All three should match what you had before this ran.
