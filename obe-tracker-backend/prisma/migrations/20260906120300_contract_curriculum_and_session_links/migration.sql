-- Stage 5 of 5: contract. Locks the new columns down with NOT NULL, foreign
-- keys and the real unique constraints, and drops the columns/constraints
-- the new shape replaces.
--
-- Do NOT run this until scripts/migrate-course-curriculum.js --apply has
-- reported every count at zero. The guard block below checks that itself
-- and refuses to run if anything is still outstanding, so a premature run
-- fails loudly instead of truncating data quietly.

DO $$
DECLARE
  bad_count INTEGER;
BEGIN
  SELECT
    (SELECT count(*) FROM "Course" WHERE "curriculumVersionId" IS NULL) +
    (SELECT count(*) FROM "CourseAssignment" WHERE "academicSessionId" IS NULL) +
    (SELECT count(*) FROM "Enrolment" WHERE "academicSessionId" IS NULL) +
    (SELECT count(*) FROM "Assessment" WHERE "academicSessionId" IS NULL) +
    (SELECT count(*) FROM "CourseCoAttainment" WHERE "academicSessionId" IS NULL) +
    (SELECT count(*) FROM (
       SELECT 1 FROM "Course" WHERE "curriculumVersionId" IS NOT NULL
       GROUP BY "curriculumVersionId", code HAVING count(*) > 1
     ) x)
  INTO bad_count;

  IF bad_count > 0 THEN
    RAISE EXCEPTION 'Stage 5 blocked: % row(s) not yet backfilled or % duplicate course group(s) unresolved. Run scripts/migrate-course-curriculum.js --apply again and confirm all counts are zero first.', bad_count, bad_count;
  END IF;
END $$;

BEGIN;

-- Course: curriculumVersionId becomes the real parent, sessionId goes away
ALTER TABLE "Course" ALTER COLUMN "curriculumVersionId" SET NOT NULL;
ALTER TABLE "Course" ADD CONSTRAINT "Course_curriculumVersionId_fkey"
  FOREIGN KEY ("curriculumVersionId") REFERENCES "CurriculumVersion"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Course_curriculumVersionId_code_key" ON "Course"("curriculumVersionId", "code");
CREATE INDEX "Course_curriculumVersionId_idx" ON "Course"("curriculumVersionId");
DROP INDEX IF EXISTS "Course_sessionId_code_key";
ALTER TABLE "Course" DROP CONSTRAINT IF EXISTS "Course_sessionId_fkey";
ALTER TABLE "Course" DROP COLUMN "sessionId";

-- CourseAssignment: academicSessionId becomes part of the identity
ALTER TABLE "CourseAssignment" ALTER COLUMN "academicSessionId" SET NOT NULL;
ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_academicSessionId_fkey"
  FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX IF EXISTS "CourseAssignment_courseId_facultyId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CourseAssignment_courseId_facultyId_academicSessionId_key"
  ON "CourseAssignment"("courseId", "facultyId", "academicSessionId");
CREATE INDEX "CourseAssignment_academicSessionId_idx" ON "CourseAssignment"("academicSessionId");

-- Enrolment: same idea, a student can retake the same course in a later term
ALTER TABLE "Enrolment" ALTER COLUMN "academicSessionId" SET NOT NULL;
ALTER TABLE "Enrolment" ADD CONSTRAINT "Enrolment_academicSessionId_fkey"
  FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX IF EXISTS "Enrolment_studentId_courseId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Enrolment_studentId_courseId_academicSessionId_key"
  ON "Enrolment"("studentId", "courseId", "academicSessionId");
CREATE INDEX "Enrolment_courseId_academicSessionId_idx" ON "Enrolment"("courseId", "academicSessionId");

-- Assessment: every assessment belongs to one actual sitting of the course
ALTER TABLE "Assessment" ALTER COLUMN "academicSessionId" SET NOT NULL;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_academicSessionId_fkey"
  FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX IF EXISTS "Assessment_courseId_idx";
CREATE INDEX "Assessment_courseId_academicSessionId_idx" ON "Assessment"("courseId", "academicSessionId");

-- CourseCoAttainment: one cohort result per course per term per outcome
ALTER TABLE "CourseCoAttainment" ALTER COLUMN "academicSessionId" SET NOT NULL;
ALTER TABLE "CourseCoAttainment" ADD CONSTRAINT "CourseCoAttainment_academicSessionId_fkey"
  FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'CourseCoAttainment_courseId_courseOutcomeId_key') THEN
    DROP INDEX "CourseCoAttainment_courseId_courseOutcomeId_key";
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "CourseCoAttainment_course_session_outcome_key"
  ON "CourseCoAttainment"("courseId", "academicSessionId", "courseOutcomeId");

-- Report: academicSessionId stays optional, just wire the FK
ALTER TABLE "Report" ADD CONSTRAINT "Report_academicSessionId_fkey"
  FOREIGN KEY ("academicSessionId") REFERENCES "AcademicSession"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;

-- Verify: `npx prisma db push` from here on should report no changes
-- needed, confirming the live database now matches schema.prisma exactly.
