const bcrypt = require('bcrypt');
const prisma = require('../prisma');
const { getPolicyForProgram } = require('../services/policy.service');

// ── Faculties ────────────────────────────────────────────────
const getFaculties = async (req, res, next) => {
  try {
    const items = await prisma.faculty.findMany({
      where: { institutionId: req.user.institutionId, deletedAt: null },
      include: { _count: { select: { departments: true } } },
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

    await prisma.faculty.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'FACULTY_DELETE',
        entity: 'Faculty',
        entityId: id,
        meta: { code: faculty.code, name: faculty.name },
      },
    });

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
        _count: { select: { programs: true, sessions: true } },
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

    await prisma.department.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'DEPARTMENT_DELETE',
        entity: 'Department',
        entityId: id,
        meta: { code: dept.code, name: dept.name },
      },
    });

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
    const { role, isActive, search, sessionId, batchYear, section } = req.query;

    const users = await prisma.user.findMany({
      where: {
        institutionId: req.user.institutionId,
        deletedAt: null,
        ...(role && { role }),
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

// ── Program Outcomes (Admin defines POs) ─────────────────────
const getProgramOutcomes = async (req, res, next) => {
  try {
    const { programId } = req.params;
    const items = await prisma.programOutcome.findMany({
      where: { programId, deletedAt: null },
    });
    // Sort numerically: PO1, PO2, ..., PO10, PO11, PO12
    items.sort((a, b) => {
      const numA = parseInt(a.code.replace(/\D+/g, ''), 10);
      const numB = parseInt(b.code.replace(/\D+/g, ''), 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.code.localeCompare(b.code);
    });
    res.json({ status: 'success', data: items });
  } catch (err) { next(err); }
};

const createProgramOutcome = async (req, res, next) => {
  try {
    const { programId } = req.params;
    const { code, title, description } = req.body;
    const item = await prisma.programOutcome.create({ data: { programId, code, title, description } });
    res.status(201).json({ status: 'success', data: item });
  } catch (err) { next(err); }
};

const updateProgramOutcome = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { code, title, description } = req.body;
    const item = await prisma.programOutcome.update({ where: { id }, data: { code, title, description } });
    res.json({ status: 'success', data: item });
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
      if (r.level === 'L3') coMap[key].attained++;
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
      if (r.level === 'L3') poMap[key].attained++;
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
    const results = { created: 0, skipped: 0, errors: [] };

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
        if (existing) { results.skipped++; continue; }
        const isStudent = u.role.toUpperCase() === 'STUDENT';
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

    const [coAttainments, poAttainments, enrolments] = await Promise.all([
      prisma.coAttainment.findMany({
        where: coWhere,
        include: {
          courseOutcome: { select: { code: true, title: true } },
        },
      }),
      prisma.poAttainment.findMany({
        where: poWhere,
        include: { programOutcome: { select: { code: true, title: true } } },
      }),
      prisma.enrolment.findMany({
        where: { studentId },
        include: { course: { select: { id: true, code: true, name: true } } },
      }),
    ]);

    // Group by course
    const courseMap = {};
    for (const e of enrolments) {
      courseMap[e.course.id] = e.course;
    }

    res.json({ status: 'success', data: { student, coAttainments, poAttainments, courses: Object.values(courseMap) } });
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
      // Batch enrolment. Match on the session (batch) link. Only active
      // students can be enrolled; a dropped student is inactive and skipped.
      const where = { role: 'STUDENT', deletedAt: null, isActive: true };
      if (sessionId) where.sessionId = sessionId;
      else if (batchYear) where.institutionalId = { startsWith: String(batchYear).slice(-2) };
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
  getProgramOutcomes, createProgramOutcome, updateProgramOutcome, deleteProgramOutcome,
  getDashboard,
};

