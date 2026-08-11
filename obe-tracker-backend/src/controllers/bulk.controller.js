const multer = require('multer');
const ExcelJS = require('exceljs');
const bcrypt = require('bcrypt');
const prisma = require('../prisma');
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

    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) return res.status(404).json({ status: 'error', error: 'Assessment not found' });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const sheet = workbook.worksheets[0];

    const errors = [];
    const valid = [];

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const [, , studentId, marksObtained] = row.values;
      if (!studentId || marksObtained === undefined) {
        errors.push({ row: rowNumber, error: 'studentId and marksObtained are required' });
        return;
      }
      const marks = Number(marksObtained);
      if (isNaN(marks) || marks < 0 || marks > assessment.totalMarks) {
        errors.push({ row: rowNumber, error: `Marks ${marks} out of range [0, ${assessment.totalMarks}]` });
        return;
      }
      valid.push({ studentId: String(studentId), marksObtained: marks });
    });

    if (errors.length) {
      fs.unlinkSync(req.file.path);
      return res.status(422).json({ status: 'error', error: 'Validation errors', errors });
    }

    await prisma.$transaction(
      valid.map(({ studentId, marksObtained }) =>
        prisma.mark.upsert({
          where: { assessmentId_studentId: { assessmentId, studentId } },
          create: { assessmentId, studentId, marksObtained },
          update: { marksObtained },
        })
      )
    );

    fs.unlinkSync(req.file.path);
    res.json({ status: 'success', data: { imported: valid.length } });
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
    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) return res.status(404).json({ status: 'error', error: 'Assessment not found' });

    // Get enrolled students
    const enrolments = await prisma.enrolment.findMany({ where: { courseId: assessment.courseId } });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Marks');
    sheet.addRow(['#', 'studentId', `marksObtained (max: ${assessment.totalMarks})`, 'studentName (reference)']);
    enrolments.forEach((e, i) => sheet.addRow([i + 1, e.studentId, '', '']));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="marks_template_${assessmentId}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
};

module.exports = { uploadMiddleware, bulkImportStudents, bulkImportMarks, getStudentTemplate, getMarksTemplate };
