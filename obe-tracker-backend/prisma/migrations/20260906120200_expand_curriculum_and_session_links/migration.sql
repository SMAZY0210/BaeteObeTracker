-- Stage 3 of 5: expand. Add the new link columns as NULLable, with no
-- foreign key and no uniqueness yet. This cannot fail on existing rows,
-- because nothing is required yet. The backfill script (stage 4) fills
-- these in; stage 5 then locks them down.
--
-- Course.sessionId, CourseAssignment's old shape, Enrolment/Assessment/
-- CourseCoAttainment without a session, are all left exactly as they are
-- for now, so the app keeps working on the old columns until the backfill
-- script has run.

BEGIN;

ALTER TABLE "Course"             ADD COLUMN "curriculumVersionId" TEXT;
ALTER TABLE "CourseAssignment"   ADD COLUMN "academicSessionId"   TEXT;
ALTER TABLE "Enrolment"          ADD COLUMN "academicSessionId"   TEXT;
ALTER TABLE "Assessment"         ADD COLUMN "academicSessionId"   TEXT;
ALTER TABLE "CourseCoAttainment" ADD COLUMN "academicSessionId"   TEXT;
ALTER TABLE "Report"             ADD COLUMN "academicSessionId"   TEXT; -- stays nullable permanently

COMMIT;

-- Verify: all six statements should say ALTER TABLE with no error.
-- Next: run scripts/migrate-course-curriculum.js (dry run first, then --apply)
-- before touching stage 5.
