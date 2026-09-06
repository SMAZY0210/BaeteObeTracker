-- Stage 2 of 5: add AcademicSession.
--
-- Pure addition. Nothing existing is touched, so nothing existing can break.
-- Safe to run any time, in any order relative to your app being up.

BEGIN;

CREATE TYPE "AcademicTerm" AS ENUM ('JAN_JUN', 'JUL_DEC');

CREATE TABLE "AcademicSession" (
  "id"            TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "term"          "AcademicTerm" NOT NULL,
  "year"          INTEGER NOT NULL,
  "isActive"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AcademicSession_institutionId_term_year_key"
  ON "AcademicSession"("institutionId", "term", "year");

CREATE INDEX "AcademicSession_institutionId_idx"
  ON "AcademicSession"("institutionId");

ALTER TABLE "AcademicSession"
  ADD CONSTRAINT "AcademicSession_institutionId_fkey"
  FOREIGN KEY ("institutionId") REFERENCES "Institution"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;

-- Verify: SELECT * FROM "AcademicSession"; -- empty table, no error
