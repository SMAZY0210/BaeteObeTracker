-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'FACULTY', 'STUDENT');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('QUIZ', 'ASSIGNMENT', 'MID_TERM', 'FINAL', 'LAB', 'PROJECT', 'PRESENTATION', 'OTHER');

-- CreateEnum
CREATE TYPE "CorrelationValue" AS ENUM ('WEAK', 'MODERATE', 'STRONG');

-- CreateEnum
CREATE TYPE "AttainmentLevel" AS ENUM ('L0', 'L1', 'L2', 'L3');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BloomDomain" AS ENUM ('COGNITIVE', 'AFFECTIVE', 'PSYCHOMOTOR');

-- CreateEnum
CREATE TYPE "ProfileType" AS ENUM ('FUNDAMENTAL', 'SOCIAL', 'THINKING', 'PERSONAL');

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "institutionalId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JwtBlacklist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JwtBlacklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'DRAFT',
    "frozenThresholds" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "creditHours" INTEGER NOT NULL DEFAULT 3,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseAssignment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrolment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enrolment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramOutcome" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProgramOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseOutcome" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "bloomDomain" "BloomDomain",
    "bloomLevel" INTEGER,
    "profileType" "ProfileType",
    "profileCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CourseOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoPoMapping" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "courseOutcomeId" TEXT NOT NULL,
    "programOutcomeId" TEXT NOT NULL,
    "correlation" "CorrelationValue",
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoPoMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assessment" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "type" "AssessmentType" NOT NULL,
    "title" TEXT NOT NULL,
    "totalMarks" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentCO" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "courseOutcomeId" TEXT NOT NULL,

    CONSTRAINT "AssessmentCO_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mark" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "marksObtained" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarkAuditLog" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "beforeValue" DOUBLE PRECISION,
    "afterValue" DOUBLE PRECISION,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarkAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttainmentThreshold" (
    "id" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "l3Min" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "l2Min" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "l1Min" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttainmentThreshold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoAttainment" (
    "id" TEXT NOT NULL,
    "courseOutcomeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "level" "AttainmentLevel" NOT NULL,
    "matrixVersion" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoAttainment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoAttainment" (
    "id" TEXT NOT NULL,
    "programOutcomeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "level" "AttainmentLevel" NOT NULL,
    "matrixVersion" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoAttainment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "courseId" TEXT,
    "generatedById" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Institution_name_key" ON "Institution"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_code_key" ON "Institution"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "OtpToken_userId_idx" ON "OtpToken"("userId");

-- CreateIndex
CREATE INDEX "OtpToken_token_idx" ON "OtpToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "JwtBlacklist_jti_key" ON "JwtBlacklist"("jti");

-- CreateIndex
CREATE INDEX "JwtBlacklist_jti_idx" ON "JwtBlacklist"("jti");

-- CreateIndex
CREATE UNIQUE INDEX "Department_institutionId_code_key" ON "Department"("institutionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Program_departmentId_code_key" ON "Program"("departmentId", "code");

-- CreateIndex
CREATE INDEX "Session_institutionId_idx" ON "Session"("institutionId");

-- CreateIndex
CREATE INDEX "Course_programId_idx" ON "Course"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "Course_sessionId_code_key" ON "Course"("sessionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CourseAssignment_courseId_facultyId_key" ON "CourseAssignment"("courseId", "facultyId");

-- CreateIndex
CREATE INDEX "Enrolment_studentId_idx" ON "Enrolment"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrolment_studentId_courseId_key" ON "Enrolment"("studentId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramOutcome_programId_code_key" ON "ProgramOutcome"("programId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CourseOutcome_courseId_code_key" ON "CourseOutcome"("courseId", "code");

-- CreateIndex
CREATE INDEX "CoPoMapping_courseId_idx" ON "CoPoMapping"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "CoPoMapping_courseId_courseOutcomeId_programOutcomeId_key" ON "CoPoMapping"("courseId", "courseOutcomeId", "programOutcomeId");

-- CreateIndex
CREATE INDEX "Assessment_courseId_idx" ON "Assessment"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentCO_assessmentId_courseOutcomeId_key" ON "AssessmentCO"("assessmentId", "courseOutcomeId");

-- CreateIndex
CREATE INDEX "Mark_studentId_idx" ON "Mark"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Mark_assessmentId_studentId_key" ON "Mark"("assessmentId", "studentId");

-- CreateIndex
CREATE INDEX "MarkAuditLog_assessmentId_studentId_idx" ON "MarkAuditLog"("assessmentId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AttainmentThreshold_institutionId_key" ON "AttainmentThreshold"("institutionId");

-- CreateIndex
CREATE INDEX "CoAttainment_courseId_idx" ON "CoAttainment"("courseId");

-- CreateIndex
CREATE INDEX "CoAttainment_studentId_idx" ON "CoAttainment"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "CoAttainment_courseOutcomeId_studentId_key" ON "CoAttainment"("courseOutcomeId", "studentId");

-- CreateIndex
CREATE INDEX "PoAttainment_courseId_idx" ON "PoAttainment"("courseId");

-- CreateIndex
CREATE INDEX "PoAttainment_studentId_idx" ON "PoAttainment"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "PoAttainment_programOutcomeId_studentId_courseId_key" ON "PoAttainment"("programOutcomeId", "studentId", "courseId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpToken" ADD CONSTRAINT "OtpToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JwtBlacklist" ADD CONSTRAINT "JwtBlacklist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssignment" ADD CONSTRAINT "CourseAssignment_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrolment" ADD CONSTRAINT "Enrolment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrolment" ADD CONSTRAINT "Enrolment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramOutcome" ADD CONSTRAINT "ProgramOutcome_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseOutcome" ADD CONSTRAINT "CourseOutcome_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoPoMapping" ADD CONSTRAINT "CoPoMapping_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoPoMapping" ADD CONSTRAINT "CoPoMapping_courseOutcomeId_fkey" FOREIGN KEY ("courseOutcomeId") REFERENCES "CourseOutcome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoPoMapping" ADD CONSTRAINT "CoPoMapping_programOutcomeId_fkey" FOREIGN KEY ("programOutcomeId") REFERENCES "ProgramOutcome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentCO" ADD CONSTRAINT "AssessmentCO_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentCO" ADD CONSTRAINT "AssessmentCO_courseOutcomeId_fkey" FOREIGN KEY ("courseOutcomeId") REFERENCES "CourseOutcome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttainmentThreshold" ADD CONSTRAINT "AttainmentThreshold_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoAttainment" ADD CONSTRAINT "CoAttainment_courseOutcomeId_fkey" FOREIGN KEY ("courseOutcomeId") REFERENCES "CourseOutcome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoAttainment" ADD CONSTRAINT "PoAttainment_programOutcomeId_fkey" FOREIGN KEY ("programOutcomeId") REFERENCES "ProgramOutcome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
