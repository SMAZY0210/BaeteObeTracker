const bcrypt = require('bcrypt');
const prisma = require('../prisma');
const { getPolicyForProgram, getPolicyForCourse } = require('../services/policy.service');
const { computeStudentPoAttainment } = require('../utils/attainment');

// ── Faculties ────────────────────────────────────────────────
const getFaculties = async (req, res, next) => {
  try {
    const items = await prisma.faculty.findMany({
      where: { institutionId: req.user.institutionId, deletedAt: null },
      // Filtered count. A bare `departments: true` counts soft-deleted rows too,
      // so a faculty whose only department was deleted still reported 1 and the
      // UI refused to delete it.
      include: { _count: { select: { departments: { where: { deletedAt: null } } } } },
    });
    res.json({ status: 'success', data: items });
  } catch (err) { next(err); }
};

const createFaculty = async (req, res, next) => {
  try {
    const { name, code } = req.body;
    const item = await prisma.faculty.create({
      data: { name, code: code.toUpperCase(), institutionId: req.user.institutionId },
    });
    res.status(201).json({ status: 'success', data: item });
  } catch (err) { next(err); }
};

const updateFaculty = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code } = req.body;
    const item = await prisma.faculty.update({ where: { id }, data: { name, code: code?.toUpperCase() } });
    res.json({ status: 'success', data: item });
  } catch (err) { next(err); }
};

// Soft delete: deletedAt is stamped and isActive goes false, the row stays.
// Attainment data has to be answerable years later, and a hard delete of a
// faculty would orphan every department, course and mark underneath it.
const deleteFaculty = async (req, res, next) => {
  try {
    const { id } = req.params;

    const faculty = await prisma.faculty.findFirst({
      where: { id, institutionId: req.user.institutionId, deletedAt: null },
      include: {
        departments: {
          where: { deletedAt: null },
          select: { id: true, code: true, name: true },
        },
      },
    });

    if (!faculty) {
      return res.status(404).json({ status: 'error', error: 'Faculty not found' });
    }

    if (faculty.departments.length) {
      return res.status(409).json({
        status: 'error',
        error: `Cannot delete "${faculty.name}": ${faculty.departments.length} department(s) still belong to it.`,
        blockers: { departments: faculty.departments },
        hint: 'Move these departments to another faculty, or delete them first.',
      });
    }

    // One transaction: the soft delete and its audit row land together or not
    // at all. Run separately, a failing audit write left the faculty deleted
    // while the response said it had failed.
    await prisma.$transaction([
      prisma.faculty.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      }),
      prisma.auditLog.create({
        data: {
          // The JWT payload calls this userId, not id. req.user is the raw
          // payload, so req.user.id is undefined and the create throws.
          userId: req.user.userId,
          action: 'FACULTY_DELETE',
          entity: 'Faculty',
          entityId: id,
          meta: { code: faculty.code, name: faculty.name },
        },
      }),
    ]);

    res.json({ status: 'success', data: { message: `Faculty "${faculty.name}" deleted` } });
  } catch (err) { next(err); }
};

// ── Departments ──────────────────────────────────────────────
const getDepartments = async (req, res, next) => {
  try {
    const items = await prisma.department.findMany({
      where: { institutionId: req.user.institutionId, deletedAt: null },
      include: {
        faculty: { select: { id: true, name: true, code: true } },
        _count: {
          select: {
            programs: { where: { deletedAt: null } },
            sessions: true, // Session has no deletedAt, only status
          },
        },
      },
    });

    // Students and teachers hang off a department indirectly, so _count cannot
    // reach them: a student is a User whose Session belongs to the department,
    // and a teacher is a User assigned to a Course in one of its Programs.
    const withCounts = await Promise.all(
      items.map(async (d) => {
        const [students, teacherRows] = await Promise.all([
          prisma.user.count({
            where: { role: 'STUDENT', deletedAt: null, session: { departmentId: d.id } },
          }),
          prisma.courseAssignment.findMany({
            where: { course: { deletedAt: null, program: { departmentId: d.id } } },
            select: { facultyId: true },
            distinct: ['facultyId'],
          }),
        ]);
        return { ...d, _count: { ...d._count, students, teachers: teacherRows.length } };
      })
    );

    res.json({ status: 'success', data: withCounts });
  } catch (err) { next(err); }
};

const createDepartment = async (req, res, next) => {
  try {
    const { name, code, facultyId } = req.body;
    const item = await prisma.department.create({
      data: { name, code: code.toUpperCase(), facultyId: facultyId || null, institutionId: req.user.institutionId },
    });
    res.status(201).json({ status: 'success', data: item });
  } catch (err) { next(err); }
};

const updateDepartment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, facultyId } = req.body;
    const item = await prisma.department.update({
      where: { id },
      data: { name, code: code?.toUpperCase(), ...(facultyId !== undefined && { facultyId: facultyId || null }) },
    });
    res.json({ status: 'success', data: item });
  } catch (err) { next(err); }
};

const deleteDepartment = async (req, res, next) => {
  try {
    const { id } = req.params;

    const dept = await prisma.department.findFirst({
      where: { id, institutionId: req.user.institutionId, deletedAt: null },
    });

    if (!dept) {
      return res.status(404).json({ status: 'error', error: 'Department not found' });
    }

    const [programs, sessions, students, courses, teacherRows] = await Promise.all([
      prisma.program.findMany({
        where: { departmentId: id, deletedAt: null },
        select: { id: true, code: true, name: true },
      }),
      // Session has no deletedAt; it uses status. An ARCHIVED batch still holds
      // the attainment record for a graduated cohort, so it counts as a blocker.
      prisma.session.findMany({
        where: { departmentId: id },
        select: { id: true, name: true, status: true },
      }),
      prisma.user.count({
        where: { role: 'STUDENT', deletedAt: null, session: { departmentId: id } },
      }),
      prisma.course.count({
        where: { deletedAt: null, program: { departmentId: id } },
      }),
      prisma.courseAssignment.findMany({
        where: { course: { deletedAt: null, program: { departmentId: id } } },
        select: { facultyId: true },
        distinct: ['facultyId'],
      }),
    ]);

    const blockers = [];
    if (programs.length)    blockers.push(`${programs.length} program(s)`);
    if (courses)            blockers.push(`${courses} course(s)`);
    if (students)           blockers.push(`${students} student(s)`);
    if (teacherRows.length) blockers.push(`${teacherRows.length} assigned teacher(s)`);
    if (sessions.length)    blockers.push(`${sessions.length} batch(es)`);

    if (blockers.length) {
      return res.status(409).json({
        status: 'error',
        error: `Cannot delete "${dept.name}": ${blockers.join(', ')} still attached.`,
        blockers: {
          programs,
          sessions,
          studentCount: students,
          courseCount: courses,
          teacherCount: teacherRows.length,
        },
        hint: 'Reassign or remove these first. Deleting a department with live courses would strand their marks and CO-PO mappings.',
      });
    }

    await prisma.$transaction([
      prisma.department.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      }),
      prisma.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'DEPARTMENT_DELETE',
          entity: 'Department',
          entityId: id,
          meta: { code: dept.code, name: dept.name },
        },
      }),
    ]);

    res.json({ status: 'success', data: { message: `Department "${dept.name}" deleted` } });
  } catch (err) { next(err); }
};

// ── Programs ─────────────────────────────────────────────────
const getPrograms = async (req, res, next) => {
  try {
    const items = await prisma.program.findMany({
      where: { department: { institutionId: req.user.institutionId }, deletedAt: null },
      include: { department: { select: { name: true, code: true } }, _count: { select: { courses: true } } },
    });
    res.json({ status: 'success', data: items });
  } catch (err) { next(err); }
};

const createProgram = async (req, res, next) => {
  try {
    const { departmentId, name, code } = req.body;
    const item = await prisma.program.create({ data: { departmentId, name, code: code.toUpperCase() } });
    res.status(201).json({ status: 'success', data: item });
  } catch (err) { next(err); }
};

const updateProgram = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code } = req.body;
    const item = await prisma.program.update({ where: { id }, data: { name, code: code?.toUpperCase() } });
    res.json({ status: 'success', data: item });
  } catch (err) { next(err); }
};

const deleteProgram = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.program.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    res.json({ status: 'success', data: { message: 'Program deactivated' } });
  } catch (err) { next(err); }
};

// ── Sessions ─────────────────────────────────────────────────
const getSessions = async (req, res, next) => {
  try {
    const items = await prisma.session.findMany({
      where: { institutionId: req.user.institutionId },
      orderBy: { startDate: 'desc' },
      include: {
        department: { select: { id: true, name: true, code: true } },
        _count: { select: { students: true } },
      },
    });
    res.json({ status: 'success', data: items });
  } catch (err) { next(err); }
};

const createSession = async (req, res, next) => {
  try {
    const { name, startDate, endDate, departmentId } = req.body;
    const item = await prisma.session.create({
      data: {
        name,
        departmentId: departmentId || null,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        institutionId: req.user.institutionId,
      },
    });
    res.status(201).json({ status: 'success', data: item });
  } catch (err) { next(err); }
};

const updateSession = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, startDate, endDate, status, departmentId } = req.body;
    const session = await prisma.session.findUnique({ where: { id } });

    let frozenThresholds = session.frozenThresholds;
    // Freeze the whole threshold policy on close, not just the display bands.
    // A reopened session has to be rescorable exactly as it was originally
    // scored, and the l1/l2/l3 bands alone cannot do that: the attainment
    // decision runs off the co/po student and cohort thresholds.
    if (status === 'CLOSED' && session.status !== 'CLOSED') {
      const anyCourse = await prisma.course.findFirst({
        where: { sessionId: id },
        select: { programId: true },
      });
      if (anyCourse) {
        const p = await getPolicyForProgram(anyCourse.programId);
        frozenThresholds = {
          version: p.version,
          coStudentThreshold: p.coStudentThreshold,
          coCohortThreshold: p.coCohortThreshold,
          poStudentThreshold: p.poStudentThreshold,
          poCohortThreshold: p.poCohortThreshold,
          l3Min: p.l3Min, l2Min: p.l2Min, l1Min: p.l1Min,
          frozenAt: new Date().toISOString(),
        };
      }
    }

    const item = await prisma.session.update({
      where: { id },
      data: {
        name, status,
        ...(departmentId !== undefined && { departmentId: departmentId || null }),
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        frozenThresholds,
      },
    });
    res.json({ status: 'success', data: item });
  } catch (err) { next(err); }
};

const deleteSession = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Guard: a batch with students attached cannot be deleted.
    const count = await prisma.user.count({ where: { sessionId: id, deletedAt: null } });
    if (count > 0) {
      return res.status(409).json({ status: 'error', error: `Cannot delete: ${count} student(s) still in this batch. Move or remove them first.` });
    }
    await prisma.session.delete({ where: { id } });
    res.json({ status: 'success', data: { message: 'Session deleted' } });
  } catch (err) { next(err); }
};

// ── Courses ──────────────────────────────────────────────────
const getCourses = async (req, res, next) => {
  try {
    const { sessionId, programId } = req.query;
    const items = await prisma.course.findMany({
      where: {
        deletedAt: null,
        ...(sessionId && { sessionId }),
        ...(programId && { programId }),
        program: { department: { institutionId: req.user.institutionId } },
      },
      include: {
        program: { select: { name: true, code: true } },
        session: { select: { name: true } },
        assignments: { include: { faculty: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      },
    });
    res.json({ status: 'success', data: items });
  } catch (err) { next(err); }
};

const createCourse = async (req, res, next) => {
  try {
    const { programId, sessionId, name, code, creditHours } = req.body;
    const item = await prisma.course.create({
      data: { programId, sessionId, name, code: code.toUpperCase(), creditHours: creditHours || 3 },
    });
    res.status(201).json({ status: 'success', data: item });
  } catch (err) { next(err); }
};

const updateCourse = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, code, creditHours } = req.body;
    const item = await prisma.course.update({ where: { id }, data: { name, code: code?.toUpperCase(), creditHours } });
    res.json({ status: 'success', data: item });
  } catch (err) { next(err); }
};

const deleteCourse = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.course.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    res.json({ status: 'success', data: { message: 'Course deactivated' } });
  } catch (err) { next(err); }
};

const assignFaculty = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { facultyIds } = req.body; // array of user IDs
    // Replace all assignments
    await prisma.courseAssignment.deleteMany({ where: { courseId: id } });
    if (facultyIds?.length) {
      await prisma.courseAssignment.createMany({
        data: facultyIds.map(facultyId => ({ courseId: id, facultyId })),
        skipDuplicates: true,
      });
    }
    res.json({ status: 'success', data: { message: 'Faculty assigned' } });
  } catch (err) { next(err); }
};

// ── User Management ──────────────────────────────────────────
const getUsers = async (req, res, next) => {
  try {
    const { role, isActive, search, sessionId, batchYear, section, departmentId } = req.query;

    // Student lookup needs two filters, not one.
    //
    // A department alone spans every batch, so "ICT" returns five years of
    // students and the roll numbers overlap enough that picking the wrong
    // person is easy. Requiring department AND batch (or a direct search on a
    // roll number or email) narrows it to a group the admin can actually scan.
    // Any one filter narrows the list. Requiring two meant a department could
    // not be browsed on its own, which is the first thing anyone tries.
    // Unfiltered is still refused, because returning every student in the
    // institution is slow and useless rather than helpful.
    if (role === 'STUDENT' && !search) {
      const filters = [departmentId, sessionId, batchYear, section].filter(Boolean).length;
      if (filters < 1) {
        return res.status(400).json({
          status: 'error',
          error: 'Pick a department, a batch or a section, or search by roll number or email.',
          accepts: ['departmentId', 'sessionId', 'batchYear', 'section', 'search'],
        });
      }
    }

    const users = await prisma.user.findMany({
      where: {
        institutionId: req.user.institutionId,
        deletedAt: null,
        ...(role && { role }),
        // Department reaches students through their batch.
        ...(departmentId && { session: { departmentId } }),
        ...(isActive !== undefined && { isActive: isActive === 'true' }),
        // Filter students by their batch (session). sessionId is the new,
        // department-safe key. batchYear is kept only as a legacy fallback.
        ...(sessionId
          ? { sessionId }
          : batchYear
            ? { institutionalId: { startsWith: batchYear.toString().slice(-2) } }
            : {}),
        ...(section && { section }),
        ...(search && {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { institutionalId: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      select: {
        id: true, email: true, role: true, firstName: true, lastName: true,
        institutionalId: true, section: true, isActive: true, lastLoginAt: true, createdAt: true,
        sessionId: true,
        session: { select: { id: true, name: true, departmentId: true } },
      },
      orderBy: { institutionalId: 'asc' },
    });
    res.json({ status: 'success', data: users });
  } catch (err) { next(err); }
};

const createUser = async (req, res, next) => {
  try {
    const { email, role, firstName, lastName, institutionalId, section, sessionId, password } = req.body;
    if (!email || !role || !firstName || !lastName) {
      return res.status(400).json({ status: 'error', error: 'email, role, firstName and lastName are required' });
    }
    // Check for duplicate email before attempting insert
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ status: 'error', error: `A user with email ${email} already exists` });
    }
    const tempPassword = password || Math.random().toString(36).slice(-10) + 'A1';
    const passwordHash = await bcrypt.hash(tempPassword, Number(process.env.BCRYPT_COST) || 10);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(), role, firstName, lastName,
        institutionalId: institutionalId || null,
        section: section || null,
        sessionId: sessionId || null,
        passwordHash, institutionId: req.user.institutionId,
      },
      select: { id: true, email: true, role: true, firstName: true, lastName: true },
    });
    res.status(201).json({ status: 'success', data: { user, tempPassword } });
  } catch (err) { next(err); }
};

const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, institutionalId, section, sessionId, isActive, password } = req.body;
    const data = {};
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName  !== undefined) data.lastName  = lastName;
    if (email     !== undefined) data.email      = email;
    if (institutionalId !== undefined) data.institutionalId = institutionalId;
    if (section   !== undefined) data.section    = section;
    if (sessionId !== undefined) data.sessionId  = sessionId || null;
    if (isActive  !== undefined) data.isActive   = isActive;
    if (password) {
      const bcrypt = require('bcrypt');
      data.passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_COST) || 10);
    }
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, role: true, firstName: true, lastName: true, isActive: true, institutionalId: true, section: true },
    });
    res.json({ status: 'success', data: user });
  } catch (err) { next(err); }
};

// ── Thresholds ───────────────────────────────────────────────
// getThresholds and upsertThresholds lived here and were not real. The getter
// queried AttainmentThreshold, threw the row away and returned a hardcoded 60.
// The setter returned 60 without writing anything, so the admin form reported
// success and changed nothing. Both are replaced by policy.controller.js, where
// thresholds are versioned per program and require a written rationale.

// ── Curriculum Versions ──────────────────────────────────────
// A version is a frozen outcome set. Batches point at one and keep it, so a
// 2027 curriculum revision does not silently rewrite what the 2023 cohort was
// assessed against. That link is what makes historical attainment defensible.

const getCurriculumVersions = async (req, res, next) => {
  try {
    const { programId } = req.params;
    const versions = await prisma.curriculumVersion.findMany({
      where: { programId },
      include: {
        _count: { select: { programOutcomes: { where: { deletedAt: null } }, sessions: true } },
      },
      orderBy: { version: 'desc' },
    });

    // A version is locked once a CLOSED or ARCHIVED batch has attainment against
    // it. Active and draft batches are still in flux, so their outcomes stay
    // editable and edits just trigger a recompute.
    const withLock = await Promise.all(
      versions.map(async (v) => {
        const locked = await prisma.cohortPoAttainment.findFirst({
          where: {
            session: { curriculumVersionId: v.id, status: { in: ['CLOSED', 'ARCHIVED'] } },
          },
          select: { id: true },
        });
        return { ...v, locked: !!locked };
      })
    );

    res.json({ status: 'success', data: withLock });
  } catch (err) { next(err); }
};

/**
 * Create a version. With copyFromVersionId, the source version's outcomes are
 * duplicated as a starting point, which is what "revise" means in practice:
 * you rarely rewrite all twelve, you change two and keep the rest.
 */
const createCurriculumVersion = async (req, res, next) => {
  try {
    const { programId } = req.params;
    const { label, description, effectiveFrom, copyFromVersionId, makeCurrent } = req.body;

    if (!label) return res.status(400).json({ status: 'error', error: 'label is required' });

    const program = await prisma.program.findFirst({
      where: { id: programId, deletedAt: null },
      include: { department: { select: { institutionId: true } } },
    });
    if (!program || program.department.institutionId !== req.user.institutionId) {
      return res.status(404).json({ status: 'error', error: 'Program not found' });
    }

    const latest = await prisma.curriculumVersion.findFirst({
      where: { programId },
      orderBy: { version: 'desc' },
    });
    const version = (latest?.version ?? 0) + 1;
    const from = effectiveFrom ? new Date(effectiveFrom) : new Date();

    let sourceOutcomes = [];
    if (copyFromVersionId) {
      sourceOutcomes = await prisma.programOutcome.findMany({
        where: { curriculumVersionId: copyFromVersionId, deletedAt: null },
        orderBy: { code: 'asc' },
      });
      if (!sourceOutcomes.length) {
        return res.status(400).json({ status: 'error', error: 'The version being copied has no outcomes' });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      if (latest && !latest.effectiveTill) {
        await tx.curriculumVersion.update({ where: { id: latest.id }, data: { effectiveTill: from } });
      }
      if (makeCurrent !== false) {
        await tx.curriculumVersion.updateMany({ where: { programId }, data: { isCurrent: false } });
      }

      const cv = await tx.curriculumVersion.create({
        data: {
          programId,
          version,
          label,
          description: description ?? null,
          effectiveFrom: from,
          isCurrent: makeCurrent !== false,
        },
      });

      if (sourceOutcomes.length) {
        await tx.programOutcome.createMany({
          data: sourceOutcomes.map((o) => ({
            programId,
            curriculumVersionId: cv.id,
            frameworkOutcomeId: o.frameworkOutcomeId,
            code: o.code,
            title: o.title,
            description: o.description,
          })),
        });
      }

      await tx.auditLog.create({
        data: {
          userId: req.user.userId,
          action: 'CURRICULUM_VERSION_CREATE',
          entity: 'CurriculumVersion',
          entityId: cv.id,
          meta: { programId, version, label, copiedFrom: copyFromVersionId ?? null },
        },
      });

      return cv;
    });

    res.status(201).json({
      status: 'success',
      data: created,
      note: sourceOutcomes.length
        ? `${sourceOutcomes.length} outcome(s) copied. Existing batches keep their old version; assign new batches to this one.`
        : 'Empty version created. Add outcomes before assigning a batch to it.',
    });
  } catch (err) { next(err); }
};

const updateCurriculumVersion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { label, description, isCurrent } = req.body;

    const cv = await prisma.curriculumVersion.findUnique({ where: { id } });
    if (!cv) return res.status(404).json({ status: 'error', error: 'Version not found' });

    if (isCurrent === true) {
      await prisma.curriculumVersion.updateMany({
        where: { programId: cv.programId },
        data: { isCurrent: false },
      });
    }

    const updated = await prisma.curriculumVersion.update({
      where: { id },
      data: {
        ...(label != null ? { label } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(isCurrent != null ? { isCurrent } : {}),
      },
    });

    res.json({ status: 'success', data: updated });
  } catch (err) { next(err); }
};

const deleteCurriculumVersion = async (req, res, next) => {
  try {
    const { id } = req.params;
    const sessions = await prisma.session.findMany({
      where: { curriculumVersionId: id },
      select: { id: true, name: true },
    });
    if (sessions.length) {
      return res.status(409).json({
        status: 'error',
        error: `Cannot delete: ${sessions.length} batch(es) are assessed against this version.`,
        blockers: { sessions },
      });
    }
    // Hard delete, unlike departments. A version with no batch attached has no
    // attainment history worth preserving, and its outcomes cascade away.
    await prisma.curriculumVersion.delete({ where: { id } });
    res.json({ status: 'success', data: { message: 'Version deleted' } });
  } catch (err) { next(err); }
};

/** Is this version's outcome set locked against edits? */
async function assertVersionEditable(curriculumVersionId) {
  const locked = await prisma.cohortPoAttainment.findFirst({
    where: { session: { curriculumVersionId, status: { in: ['CLOSED', 'ARCHIVED'] } } },
    select: { id: true, session: { select: { name: true } } },
  });
  if (locked) {
    return `This curriculum version has been used to assess a closed batch (${locked.session?.name ?? 'unknown'}). Editing its outcomes now would change what that cohort was measured against. Create a new version instead.`;
  }
  return null;
}

// ── Program Outcomes (Admin defines POs) ─────────────────────
const getProgramOutcomes = async (req, res, next) => {
  try {
    const { programId } = req.params;
    // ?curriculumVersionId=... to read a specific version; defaults to current.
    let { curriculumVersionId } = req.query;

    if (!curriculumVersionId) {
      const current = await prisma.curriculumVersion.findFirst({
        where: { programId, isCurrent: true },
        select: { id: true },
      });
      curriculumVersionId = current?.id;
    }

    if (!curriculumVersionId) {
      return res.json({
        status: 'success',
        data: [],
        warning: 'This program has no curriculum version. Create one before defining outcomes.',
      });
    }

    const items = await prisma.programOutcome.findMany({
      where: { curriculumVersionId, deletedAt: null },
    });
    // Sort numerically: PO1, PO2, ..., PO10, PO11, PO12
    items.sort((a, b) => {
      const numA = parseInt(a.code.replace(/\D+/g, ''), 10);
      const numB = parseInt(b.code.replace(/\D+/g, ''), 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.code.localeCompare(b.code);
    });

    const lockReason = await assertVersionEditable(curriculumVersionId);
    res.json({
      status: 'success',
      data: items,
      curriculumVersionId,
      editable: !lockReason,
      lockReason,
    });
  } catch (err) { next(err); }
};

const createProgramOutcome = async (req, res, next) => {
  try {
    const { programId } = req.params;
    const { code, title, description, frameworkOutcomeId } = req.body;
    let { curriculumVersionId } = req.body;

    if (!curriculumVersionId) {
      const current = await prisma.curriculumVersion.findFirst({
        where: { programId, isCurrent: true },
        select: { id: true },
      });
      curriculumVersionId = current?.id;
    }
    if (!curriculumVersionId) {
      return res.status(400).json({
        status: 'error',
        error: 'No curriculum version. Create one before adding outcomes.',
      });
    }

    const lockReason = await assertVersionEditable(curriculumVersionId);
    if (lockReason) return res.status(409).json({ status: 'error', error: lockReason });

    const item = await prisma.programOutcome.create({
      data: { programId, curriculumVersionId, code, title, description, frameworkOutcomeId: frameworkOutcomeId ?? null },
    });
    res.status(201).json({ status: 'success', data: item });
  } catch (err) { next(err); }
};

/**
 * Edit an outcome.
 *
 * Allowed while the version has not been used to assess a closed batch, because
 * a typo caught before anyone graduates is just a fix. Refused afterwards: the
 * same edit once a cohort has been assessed rewrites what they were measured
 * against, and the answer then is a new version, not an edit.
 */
const updateProgramOutcome = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { code, title, description } = req.body;

    const existing = await prisma.programOutcome.findUnique({
      where: { id },
      select: { curriculumVersionId: true, code: true },
    });
    if (!existing) return res.status(404).json({ status: 'error', error: 'Outcome not found' });

    const lockReason = await assertVersionEditable(existing.curriculumVersionId);
    if (lockReason) {
      return res.status(409).json({
        status: 'error',
        error: lockReason,
        hint: 'POST /admin/programs/:programId/curriculum-versions with copyFromVersionId to branch from this one.',
      });
    }

    const item = await prisma.programOutcome.update({ where: { id }, data: { code, title, description } });

    await prisma.auditLog.create({
      data: {
        userId: req.user.userId,
        action: 'PO_UPDATE',
        entity: 'ProgramOutcome',
        entityId: id,
        meta: { from: existing.code, to: code },
      },
    });

    res.json({
      status: 'success',
      data: item,
      note: 'Attainment already computed against this outcome is not recalculated. Re-run the course recompute if the change affects how it is assessed.',
    });
  } catch (err) { next(err); }
};

const deleteProgramOutcome = async (req, res, next) => {
  try {
    const { id } = req.params;
    const hasMapping = await prisma.coPoMapping.findFirst({ where: { programOutcomeId: id } });
    if (hasMapping) return res.status(409).json({ status: 'error', error: 'PO is referenced by a mapping. Remove mappings first.' });
    await prisma.programOutcome.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    res.json({ status: 'success', data: { message: 'PO deactivated' } });
  } catch (err) { next(err); }
};

// ── Institution-wide Dashboard ────────────────────────────────
const getDashboard = async (req, res, next) => {
  try {
    const institutionId = req.user.institutionId;
    const [deptCount, programCount, courseCount, userCount] = await Promise.all([
      prisma.department.count({ where: { institutionId, deletedAt: null } }),
      prisma.program.count({ where: { department: { institutionId }, deletedAt: null } }),
      prisma.course.count({ where: { program: { department: { institutionId } }, deletedAt: null } }),
      prisma.user.count({ where: { institutionId, isActive: true, deletedAt: null } }),
    ]);
    res.json({ status: 'success', data: { deptCount, programCount, courseCount, userCount } });
  } catch (err) { next(err); }
};

const getAttainmentReport = async (req, res, next) => {
  try {
    const { sessionId, departmentId, studentId } = req.query;
    const institutionId = req.user.institutionId;

    const courseWhere = {
      deletedAt: null,
      program: { department: { institutionId } },
      ...(sessionId && { sessionId }),
      ...(departmentId && { program: { departmentId } }),
    };

    const courses = await prisma.course.findMany({
      where: courseWhere,
      include: {
        program: { select: { code: true, name: true } },
        session: { select: { name: true } },
      },
    });
    const courseIds = courses.map(c => c.id);
    if (!courseIds.length) {
      return res.json({ status: 'success', data: { courses: [], coSummary: [], poSummary: [] } });
    }

    // CoAttainment has no course relation — join via courseId lookup separately
    const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));

    const coRaw = await prisma.coAttainment.findMany({
      where: {
        courseId: { in: courseIds },
        ...(studentId && { studentId }),
      },
      include: {
        courseOutcome: { select: { code: true, title: true } },
      },
    });

    const poRaw = await prisma.poAttainment.findMany({
      where: {
        courseId: { in: courseIds },
        ...(studentId && { studentId }),
      },
      include: {
        programOutcome: { select: { code: true, title: true } },
      },
    });

    // Fetch CO-PO mappings to link COs to POs
    const mappings = await prisma.coPoMapping.findMany({
      // correlation is non-nullable now; a mapping without a strength is not a
      // mapping. Prisma rejects `{ not: null }` on a required enum.
      where: { courseId: { in: courseIds } },
      select: { courseOutcomeId: true, programOutcomeId: true },
    });
    // Build map: courseOutcomeId -> [programOutcomeId]
    const coToPOs = {};
    mappings.forEach(m => {
      if (!coToPOs[m.courseOutcomeId]) coToPOs[m.courseOutcomeId] = [];
      coToPOs[m.courseOutcomeId].push(m.programOutcomeId);
    });

    const coMap = {};
    coRaw.forEach(r => {
      const course = courseMap[r.courseId] || {};
      const key = r.courseId + '_' + r.courseOutcomeId;
      if (!coMap[key]) coMap[key] = {
        courseCode: course.code || '', courseName: course.name || '',
        coCode: r.courseOutcome.code, coTitle: r.courseOutcome.title,
        courseOutcomeId: r.courseOutcomeId,
        mappedPoIds: coToPOs[r.courseOutcomeId] || [],
        attained: 0, total: 0,
      };
      coMap[key].total++;
      // `attained` is the stored threshold decision. `level` is a display band
      // where L3 starts at 80 percent, so counting L3 as "attained" reported
      // every student between the 60 percent threshold and 80 percent as a
      // failure. A student at 70 percent showed as not attained on this report
      // while their individual report showed the outcome met.
      if (r.attained != null ? r.attained : r.level === 'L3') coMap[key].attained++;
    });

    const poMap = {};
    poRaw.forEach(r => {
      const key = r.programOutcomeId;
      if (!poMap[key]) poMap[key] = {
        poCode: r.programOutcome.code, poTitle: r.programOutcome.title,
        programOutcomeId: r.programOutcomeId,
        attained: 0, total: 0,
      };
      poMap[key].total++;
      if (r.attained != null ? r.attained : r.level === 'L3') poMap[key].attained++;
    });

    const coSummary = Object.values(coMap).map(v => ({
      ...v,
      attainmentRate: v.total ? +(v.attained / v.total * 100).toFixed(1) : 0,
    }));
    const poSummary = Object.values(poMap).map(v => ({
      ...v,
      attainmentRate: v.total ? +(v.attained / v.total * 100).toFixed(1) : 0,
    }));

    const numSort = (a, b) => {
      const nA = parseInt((a.coCode || a.poCode || '').replace(/\D+/g, ''), 10);
      const nB = parseInt((b.coCode || b.poCode || '').replace(/\D+/g, ''), 10);
      return isNaN(nA) || isNaN(nB) ? 0 : nA - nB;
    };
    coSummary.sort(numSort);
    poSummary.sort(numSort);

    res.json({ status: 'success', data: { courses, coSummary, poSummary } });
  } catch (err) { next(err); }
};

const bulkCreateUsers = async (req, res, next) => {
  try {
    const { users, sessionId } = req.body; // sessionId = the batch the whole file joins (students)
    if (!Array.isArray(users) || !users.length) {
      return res.status(400).json({ status: 'error', error: 'No users provided' });
    }
    const bcrypt = require('bcrypt');
    const results = { created: 0, updated: 0, skipped: 0, errors: [] };

    for (const u of users) {
      try {
        if (!u.firstName || !u.lastName || !u.email || !u.role) {
          results.errors.push({ row: u.email || '?', error: 'Missing required fields' });
          continue;
        }
        // Default password = institutionalId if student, else random
        const defaultPw = u.institutionalId || Math.random().toString(36).slice(-8);
        const passwordHash = await bcrypt.hash(defaultPw, 10);
        const existing = await prisma.user.findFirst({
          where: { email: { equals: u.email.trim(), mode: 'insensitive' } },
        });
        const isStudent = u.role.toUpperCase() === 'STUDENT';

        if (existing) {
          // Update rather than skip. Re-uploading a corrected sheet used to do
          // nothing at all, so a section fixed in the file never reached the
          // system and had to be set by hand for every student.
          //
          // Password and role are never touched. A re-upload should not reset
          // someone's password to their roll number, and it should not silently
          // promote or demote anyone.
          await prisma.user.update({
            where: { id: existing.id },
            data: {
              firstName: u.firstName.trim(),
              lastName: u.lastName.trim(),
              institutionalId: u.institutionalId?.trim() || existing.institutionalId,
              section: u.section?.trim() || existing.section,
              ...(isStudent && sessionId ? { sessionId } : {}),
            },
          });
          results.updated = (results.updated || 0) + 1;
          continue;
        }

        await prisma.user.create({
          data: {
            institutionId: req.user.institutionId,
            email: u.email.trim().toLowerCase(),
            passwordHash,
            role: u.role.toUpperCase(),
            firstName: u.firstName.trim(),
            lastName: u.lastName.trim(),
            institutionalId: u.institutionalId?.trim() || null,
            section: u.section?.trim() || null,
            sessionId: isStudent ? (sessionId || null) : null,
          },
        });
        results.created++;
      } catch(e) {
        results.errors.push({ row: u.email || '?', error: e.message });
      }
    }
    res.json({ status: 'success', data: results });
  } catch (err) { next(err); }
};

const getStudentAttainmentAdmin = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { courseId } = req.query;

    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, firstName: true, lastName: true, institutionalId: true, email: true, section: true },
    });
    if (!student) return res.status(404).json({ status: 'error', error: 'Student not found' });

    const coWhere = { studentId, ...(courseId && { courseId }) };
    const poWhere = { studentId, ...(courseId && { courseId }) };

    const [coAttainments, poRows, enrolments] = await Promise.all([
      prisma.coAttainment.findMany({
        where: coWhere,
        include: {
          courseOutcome: {
            select: { code: true, title: true, course: { select: { id: true, code: true } } },
          },
        },
      }),
      prisma.poAttainment.findMany({
        where: poWhere,
        include: {
          programOutcome: { select: { id: true, code: true, title: true, description: true } },
          // courseId is on the row itself; the course name comes from here
        },
      }),
      prisma.enrolment.findMany({
        where: { studentId },
        include: { course: { select: { id: true, code: true, name: true } } },
      }),
    ]);

    const courseMap = {};
    for (const e of enrolments) courseMap[e.course.id] = e.course;

    // Every PO in the student's curriculum version, not just the ones that
    // happen to have an attainment row.
    //
    // s.5.2(v) asks the programme to demonstrate that students attain ALL POs
    // by graduation. A report that lists only the outcomes with data quietly
    // drops the ones nothing has been mapped to, which is precisely the gap an
    // evaluator is looking for. Showing them as unassessed states the gap
    // instead of hiding it.
    const studentRec = await prisma.user.findUnique({
      where: { id: studentId },
      select: { session: { select: { curriculumVersionId: true } } },
    });

    let allPos = [];
    const cvId = studentRec?.session?.curriculumVersionId;
    if (cvId) {
      allPos = await prisma.programOutcome.findMany({
        where: { curriculumVersionId: cvId, deletedAt: null },
        select: { id: true, code: true, title: true, description: true },
      });
    } else if (enrolments.length) {
      // No curriculum version on the batch: fall back to the programme of any
      // course the student is enrolled in.
      const c = await prisma.course.findUnique({
        where: { id: enrolments[0].courseId },
        select: { programId: true },
      });
      if (c) {
        allPos = await prisma.programOutcome.findMany({
          where: { programId: c.programId, deletedAt: null },
          select: { id: true, code: true, title: true, description: true },
        });
      }
    }

    // ── Aggregate PO rows across courses ────────────────────────────
    //
    // PoAttainment is unique on (programOutcomeId, studentId, courseId), so a
    // student taking two courses that both map to PO1 has two PO1 rows. Listing
    // them raw showed PO1 twice with different figures and no way to tell which
    // course each came from.
    //
    // The overall figure is recomputed through the same engine used everywhere
    // else, across every CO mapped to the PO in any of the student's courses,
    // rather than averaging the per-course percentages. Averaging would give a
    // course with one weakly-correlated CO the same say as a course with four
    // strongly-correlated ones.
    // Union: every PO in the curriculum, plus any with stored rows that somehow
    // sit outside it (a PO deleted after attainment was computed, say).
    const poIds = [...new Set([...allPos.map((p) => p.id), ...poRows.map((r) => r.programOutcomeId)])];
    const poMetaById = Object.fromEntries(allPos.map((p) => [p.id, p]));

    const mappings = poIds.length
      ? await prisma.coPoMapping.findMany({
          where: { programOutcomeId: { in: poIds }, ...(courseId && { courseId }) },
          include: {
            courseOutcome: { select: { id: true, code: true, title: true } },
            course: { select: { id: true, code: true, name: true } },
          },
        })
      : [];

    const policy = enrolments.length
      ? await getPolicyForCourse(enrolments[0].courseId).catch(() => null)
      : null;

    const coResultsById = Object.fromEntries(coAttainments.map((c) => [c.courseOutcomeId, c]));
    const CORR_WEIGHT = { WEAK: 1, MODERATE: 2, STRONG: 3 };

    const poAttainments = poIds.map((programOutcomeId) => {
      const rowsForPo = poRows.filter((r) => r.programOutcomeId === programOutcomeId);
      const meta = poMetaById[programOutcomeId] || rowsForPo[0]?.programOutcome;

      const overall = computeStudentPoAttainment({
        studentId,
        programOutcomeId,
        mappings,
        coResultsById,
        policy,
      });

      // Contributing COs, with the course each belongs to, so the dropdown
      // explains where the number came from.
      const contributors = mappings
        .filter((m) => m.programOutcomeId === programOutcomeId)
        .map((m) => {
          const co = coResultsById[m.courseOutcomeId];
          const weight = CORR_WEIGHT[m.correlation] ?? 1;
          return {
            courseOutcomeId: m.courseOutcomeId,
            code: m.courseOutcome.code,
            title: m.courseOutcome.title,
            courseCode: m.course?.code ?? null,
            correlation: m.correlation,
            weight,
            percentage: co ? co.percentage : null,
            attained: co ? co.attained : null,
          };
        })
        .sort((a, b) => (a.courseCode || '').localeCompare(b.courseCode || '') || a.code.localeCompare(b.code));

      const counted = contributors.filter((c) => c.percentage != null);
      const weightTotal = counted.reduce((t, c) => t + c.weight, 0);

      return {
        programOutcomeId,
        programOutcome: meta,
        percentage: overall ? overall.percentage : null,
        // Unassessed is a third state, not a failure. A PO with no mapped CO, or
        // one the student has no marks against, has produced no evidence either
        // way, and reporting it as "not attained" would be a claim the data does
        // not support.
        assessed: !!overall,
        attained: overall ? overall.attained : false,
        level: overall ? overall.level : 'L0',
        policyVersion: rowsForPo[0]?.policyVersion ?? null,
        breakdown: {
          contributors: contributors.map((c) => ({
            ...c,
            sharePct: weightTotal && c.percentage != null
              ? Math.round((c.weight / weightTotal) * 1000) / 10
              : null,
          })),
          countedCos: counted.length,
          unassessedCos: contributors.length - counted.length,
          // The stored per-course figures, kept so the dropdown can show that
          // one course pulled the outcome up and another pulled it down.
          perCourse: rowsForPo.map((r) => ({
            courseId: r.courseId,
            courseCode: r.courseId ? (courseMap[r.courseId]?.code ?? null) : null,
            percentage: r.percentage,
            attained: r.attained,
          })).sort((a, b) => (a.courseCode || '').localeCompare(b.courseCode || '')),
        },
      };
    });

    // PO1..PO12 numerically. A plain code sort puts PO10 between PO1 and PO2.
    const numSort = (a, b) => {
      const nA = parseInt(String(a).replace(/\D+/g, ''), 10);
      const nB = parseInt(String(b).replace(/\D+/g, ''), 10);
      return isNaN(nA) || isNaN(nB) ? String(a).localeCompare(String(b)) : nA - nB;
    };
    poAttainments.sort((a, b) => numSort(a.programOutcome.code, b.programOutcome.code));

    coAttainments.sort(
      (a, b) =>
        (a.courseOutcome.course?.code || '').localeCompare(b.courseOutcome.course?.code || '') ||
        numSort(a.courseOutcome.code, b.courseOutcome.code)
    );

    res.json({
      status: 'success',
      data: { student, coAttainments, poAttainments, courses: Object.values(courseMap) },
    });
  } catch (err) { next(err); }
};

// ── Enrolments ───────────────────────────────────────────────
const getEnrolments = async (req, res, next) => {
  try {
    const { courseId } = req.query;
    if (!courseId) return res.status(400).json({ status: 'error', error: 'courseId required' });
    const enrolments = await prisma.enrolment.findMany({
      where: { courseId },
      orderBy: { createdAt: 'asc' },
    });
    // Fetch student details separately since Enrolment has no student relation
    const studentIds = enrolments.map(e => e.studentId);
    const students = await prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, firstName: true, lastName: true, institutionalId: true, section: true },
    });
    const studentMap = Object.fromEntries(students.map(s => [s.id, s]));
    const data = enrolments.map(e => ({ ...e, student: studentMap[e.studentId] || null }));
    res.json({ status: 'success', data });
  } catch (err) { next(err); }
};

const enrolStudents = async (req, res, next) => {
  try {
    const { courseId, studentIds, sessionId, batchYear, section } = req.body;
    if (!courseId) return res.status(400).json({ status: 'error', error: 'courseId required' });

    // Get course to find programId
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { programId: true, program: { select: { departmentId: true } } },
    });
    if (!course) return res.status(404).json({ status: 'error', error: 'Course not found' });

    let students = [];
    if (studentIds && studentIds.length > 0) {
      // Individual students
      students = await prisma.user.findMany({
        where: { id: { in: studentIds }, role: 'STUDENT', deletedAt: null },
        select: { id: true },
      });
    } else {
      // Batch enrolment.
      //
      // The batch scope is mandatory. Previously, if sessionId arrived empty the
      // query fell through to { role: STUDENT, isActive: true } plus an optional
      // section, which matches every student in the institution. Choosing "Batch
      // 2026, all sections" then enrolled section A of every other batch as
      // well, because nothing in the query mentioned 2026 at all.
      if (!sessionId && !batchYear) {
        return res.status(400).json({
          status: 'error',
          error: 'Pick a batch. Enrolling without one would match every student in the institution.',
        });
      }

      const where = { role: 'STUDENT', deletedAt: null, isActive: true };
      if (sessionId) {
        where.sessionId = sessionId;
      } else {
        // batchYear is a fallback for callers that only know the year. Match the
        // session by name rather than by slicing digits off the roll number,
        // which assumed a roll format that does not hold: a 2026 batch was
        // matched with startsWith "26" against roll numbers beginning "23".
        const sessions = await prisma.session.findMany({
          where: {
            institutionId: req.user.institutionId,
            name: { contains: String(batchYear), mode: 'insensitive' },
          },
          select: { id: true },
        });
        if (!sessions.length) {
          return res.status(400).json({ status: 'error', error: `No batch matching "${batchYear}" found.` });
        }
        where.sessionId = { in: sessions.map((x) => x.id) };
      }
      if (section) where.section = section;

      students = await prisma.user.findMany({ where, select: { id: true } });
    }

    if (!students.length) return res.status(400).json({ status: 'error', error: 'No students found for the given criteria' });

    // Upsert enrolments (skip already enrolled)
    let enrolled = 0, skipped = 0;
    for (const stu of students) {
      const existing = await prisma.enrolment.findUnique({
        where: { studentId_courseId: { studentId: stu.id, courseId } },
      });
      if (existing) { skipped++; continue; }
      await prisma.enrolment.create({ data: { studentId: stu.id, courseId, programId: course.programId } });
      enrolled++;
    }
    res.json({ status: 'success', data: { enrolled, skipped, total: students.length } });
  } catch (err) { next(err); }
};

const removeEnrolment = async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.enrolment.delete({ where: { id } });
    res.json({ status: 'success' });
  } catch (err) { next(err); }
};

module.exports = {
  getFaculties, createFaculty, updateFaculty, deleteFaculty,
  getDepartments, createDepartment, updateDepartment, deleteDepartment,
  getPrograms, createProgram, updateProgram, deleteProgram,
  getSessions, createSession, updateSession, deleteSession,
  getCourses, createCourse, updateCourse, deleteCourse, assignFaculty,
  getUsers, createUser, updateUser, bulkCreateUsers,
  getEnrolments, enrolStudents, removeEnrolment,
  getAttainmentReport,
  getStudentAttainmentAdmin,
  getCurriculumVersions,
  createCurriculumVersion,
  updateCurriculumVersion,
  deleteCurriculumVersion,
  getProgramOutcomes, createProgramOutcome, updateProgramOutcome, deleteProgramOutcome,
  getDashboard,
};

