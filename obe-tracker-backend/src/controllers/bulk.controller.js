const multer = require('multer');
const ExcelJS = require('exceljs');
const bcrypt = require('bcrypt');
const prisma = require('../prisma');
const { recomputeAttainmentForCourse } = require('../services/attainment.service');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = process.env.UPLOADS_DIR || '/tmp/obe-uploads';
try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch(e) {}

const upload = multer({ dest: UPLOADS_DIR });
const uploadMiddleware = upload.single('file');

// POST /api/v1/bulk/students
const bulkImportStudents = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ status: 'error', error: 'No file uploaded' });

    // The whole file is assigned to one batch, chosen in the dialog.
    const sessionId = req.body.sessionId || null;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const sheet = workbook.worksheets[0];

    const errors = [];
    const valid = [];
    let rowIndex = 0;

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      rowIndex++;
      // row.values is 1-indexed with values[0] === null, and values[1] is the
      // template's leading "#" column — so real data starts at values[2].
      const [, , firstName, lastName, email, institutionalId, section] = row.values;

      if (!firstName || !lastName || !email) {
        errors.push({ row: rowNumber, error: 'firstName, lastName, email are required' });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push({ row: rowNumber, error: `Invalid email: ${email}` });
        return;
      }
      valid.push({ firstName: String(firstName), lastName: String(lastName), email: String(email).toLowerCase(), institutionalId: institutionalId ? String(institutionalId) : null, section: section ? String(section).toUpperCase() : null });
    });

    if (errors.length) {
      fs.unlinkSync(req.file.path);
      return res.status(422).json({ status: 'error', error: 'Validation errors in file', errors });
    }

    // Commit atomically
    const results = [];
    await prisma.$transaction(async (tx) => {
      for (const row of valid) {
        const tempPassword = Math.random().toString(36).slice(-8) + 'A1';
        const passwordHash = await bcrypt.hash(tempPassword, Number(process.env.BCRYPT_COST) || 10);
        const user = await tx.user.upsert({
          where: { email: row.email },
          create: {
            email: row.email, firstName: row.firstName, lastName: row.lastName,
            institutionalId: row.institutionalId, section: row.section, sessionId,
            passwordHash,
            role: 'STUDENT', institutionId: req.user.institutionId,
          },
          update: { firstName: row.firstName, lastName: row.lastName, institutionalId: row.institutionalId, section: row.section, sessionId },
        });
        results.push({ userId: user.id, email: user.email });
      }
    });

    fs.unlinkSync(req.file.path);
    res.status(201).json({ status: 'success', data: { imported: results.length, results } });
  } catch (err) { next(err); }
};

// POST /api/v1/bulk/marks/:assessmentId
const bulkImportMarks = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ status: 'error', error: 'No file uploaded' });
    const { assessmentId } = req.params;

    // Marks are recorded per CO, so the sheet carries one mark column per CO the
    // assessment covers. Column order comes from the assessment, not the file,
    // and the header row is checked against it: a spreadsheet whose columns have
    // been reordered by hand would otherwise silently file CO3 marks under CO1.
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        assessmentCOs: {
          include: { courseOutcome: { select: { id: true, code: true } } },
          orderBy: { courseOutcome: { code: 'asc' } },
        },
      },
    });
    if (!assessment) return res.status(404).json({ status: 'error', error: 'Assessment not found' });
    if (!assessment.assessmentCOs.length) {
      return res.status(400).json({ status: 'error', error: 'This assessment has no COs attached' });
    }

    const cols = assessment.assessmentCOs.map((ac) => ({
      courseOutcomeId: ac.courseOutcomeId,
      code: ac.courseOutcome.code,
      max: ac.coMarks,
    }));

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const sheet = workbook.worksheets[0];

    const errors = [];
    const valid = [];

    // Header check. row.values is 1-based with a leading hole, so column 3
    // onwards are the CO columns: [ , '#', 'studentId', 'CO1 (12)', ... ]
    const header = (sheet.getRow(1).values || []).map((v) => String(v ?? '').trim());
    cols.forEach((c, i) => {
      const cell = header[3 + i] || '';
      if (!cell.startsWith(c.code)) {
        errors.push({
          row: 1,
          error: `Column ${3 + i} should be ${c.code} but reads "${cell}". Re-download the template rather than editing column order.`,
        });
      }
    });

    if (!errors.length) {
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const studentId = row.values[2];
        if (!studentId) {
          errors.push({ row: rowNumber, error: 'studentId is required' });
          return;
        }

        cols.forEach((c, i) => {
          const raw = row.values[3 + i];
          if (raw === undefined || raw === null || String(raw).trim() === '') return; // not entered yet

          const text = String(raw).trim().toUpperCase();
          if (text === 'A' || text === 'ABSENT') {
            valid.push({ studentId: String(studentId), courseOutcomeId: c.courseOutcomeId, marksObtained: 0, isAbsent: true });
            return;
          }

          const marks = Number(raw);
          if (isNaN(marks) || marks < 0 || marks > c.max) {
            errors.push({ row: rowNumber, error: `${c.code}: ${raw} is outside [0, ${c.max}]` });
            return;
          }
          valid.push({ studentId: String(studentId), courseOutcomeId: c.courseOutcomeId, marksObtained: marks, isAbsent: false });
        });
      });
    }

    if (errors.length) {
      fs.unlinkSync(req.file.path);
      return res.status(422).json({ status: 'error', error: 'Validation errors', errors: errors.slice(0, 50) });
    }

    await prisma.$transaction(
      valid.map(({ studentId, courseOutcomeId, marksObtained, isAbsent }) =>
        prisma.mark.upsert({
          where: {
            assessmentId_studentId_courseOutcomeId: { assessmentId, studentId, courseOutcomeId },
          },
          create: { assessmentId, studentId, courseOutcomeId, marksObtained, isAbsent },
          update: { marksObtained, isAbsent },
        })
      )
    );

    fs.unlinkSync(req.file.path);

    // Attainment reflects the previous marks until this runs.
    await recomputeAttainmentForCourse(assessment.courseId, null, req.user?.institutionId);

    res.json({ status: 'success', data: { imported: valid.length, coColumns: cols.length } });
  } catch (err) { next(err); }
};

// GET /api/v1/bulk/templates/students - Download student import template
const getStudentTemplate = async (req, res, next) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Students');
    sheet.addRow(['#', 'firstName', 'lastName', 'email', 'institutionalId', 'section']);
    sheet.addRow([1, 'Jane', 'Doe', 'jane.doe@example.com', 'STU001', 'BSCS']);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="student_import_template.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
};

// GET /api/v1/bulk/templates/marks/:assessmentId
const getMarksTemplate = async (req, res, next) => {
  try {
    const { assessmentId } = req.params;
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        assessmentCOs: {
          include: { courseOutcome: { select: { id: true, code: true } } },
          orderBy: { courseOutcome: { code: 'asc' } },
        },
      },
    });
    if (!assessment) return res.status(404).json({ status: 'error', error: 'Assessment not found' });

    const cols = assessment.assessmentCOs.map((ac) => ({ code: ac.courseOutcome.code, max: ac.coMarks }));

    // Student names are prefilled. The old template left the reference column
    // blank, which meant whoever filled it in was typing marks against opaque
    // cuid strings with no way to tell whose row they were on.
    const enrolments = await prisma.enrolment.findMany({
      where: { courseId: assessment.courseId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, institutionalId: true } },
      },
    });
    enrolments.sort((a, b) =>
      (a.student?.institutionalId || '').localeCompare(b.student?.institutionalId || '')
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Marks');

    sheet.addRow([
      '#',
      'studentId',
      ...cols.map((c) => `${c.code} (max: ${c.max})`),
      'studentName (reference)',
      'roll (reference)',
    ]);
    sheet.getRow(1).font = { bold: true };

    enrolments.forEach((e, i) =>
      sheet.addRow([
        i + 1,
        e.studentId,
        ...cols.map(() => ''),
        `${e.student?.firstName ?? ''} ${e.student?.lastName ?? ''}`.trim(),
        e.student?.institutionalId ?? '',
      ])
    );

    sheet.addRow([]);
    sheet.addRow(['', 'Enter "A" for absent. Blank means not yet marked, which is not the same as zero.']);
    sheet.addRow(['', 'Do not reorder or rename the CO columns; the importer checks them against the assessment.']);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="marks_template_${assessmentId}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
};

module.exports = { uploadMiddleware, bulkImportStudents, bulkImportMarks, getStudentTemplate, getMarksTemplate };
