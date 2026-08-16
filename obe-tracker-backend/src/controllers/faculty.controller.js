const prisma = require('../prisma');
const { recomputeAttainmentForCourse } = require('../services/attainment.service');
const { getPolicyForCourse } = require('../services/policy.service');

// ── My Courses ───────────────────────────────────────────────
const getMyCourses = async (req, res, next) => {
  try {
    const { userId, role, institutionId } = req.user;
    const where = {
      deletedAt: null,
      program: { department: { institutionId } },
      ...(role !== 'ADMIN' && { assignments: { some: { facultyId: userId } } }),
    };
    const courses = await prisma.course.findMany({
      where,
      include: {
        program: { select: { name: true, code: true } },
        session: { select: { name: true, status: true } },
        assignments: { include: { faculty: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ status: 'success', data: courses });
  } catch (err) { next(err); }
};

// ── Course Outcomes (include PO mappings) ────────────────────
const getCourseOutcomes = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    await assertFacultyOwns(req.user, courseId);
    const items = await prisma.courseOutcome.findMany({
      where: { courseId, deletedAt: null },
      include: CO_INCLUDE,
      include: {
        mappings: {
          include: { programOutcome: { select: { id: true, code: true, title: true } } },
        },
      },
      orderBy: { code: 'asc' },
    });
    res.json({ status: 'success', data: items });
  } catch (err) { next(err); }
};

/**
 * Resolve WK / WP / EA codes to ids on the active framework.
 *
 * Replaces profileType and profileCode, which held a FUNDAMENTAL / SOCIAL /
 * THINKING / PERSONAL taxonomy. That is not BAETE's, and the columns were
 * dropped from the schema while these handlers kept writing to them, so
 * creating any course outcome failed outright.
 *
 * ACC-MAN-02 v3.0 s.5.3(vi) is what replaces it: the curriculum must map how
 * each WK1-WK9 attribute is addressed, and show how WP1-WP7 and EA1-EA5 are
 * incorporated into teaching, learning and assessment.
 */
async function activeFramework() {
  const fw = await prisma.accreditationFramework.findFirst({
    where: { isActive: true },
    select: { id: true },
  });
  if (!fw) {
    const e = new Error('No accreditation framework seeded. Run prisma/seed-framework.js');
    e.status = 400;
    throw e;
  }
  return fw;
}

async function resolveWkIds(codes) {
  if (!Array.isArray(codes) || !codes.length) return [];
  const fw = await activeFramework();
  const rows = await prisma.knowledgeProfile.findMany({
    where: { frameworkId: fw.id, code: { in: codes } },
    select: { id: true, code: true },
  });
  const missing = codes.filter((c) => !rows.some((r) => r.code === c));
  if (missing.length) {
    const e = new Error(`Unknown knowledge profile code(s): ${missing.join(', ')}`);
    e.status = 400;
    throw e;
  }
  return rows.map((r) => r.id);
}

async function resolveComplexIds(codes) {
  if (!Array.isArray(codes) || !codes.length) return [];
  const fw = await activeFramework();
  const rows = await prisma.complexAttribute.findMany({
    where: { frameworkId: fw.id, code: { in: codes } },
    select: { id: true, code: true, kind: true },
  });
  const missing = codes.filter((c) => !rows.some((r) => r.code === c));
  if (missing.length) {
    const e = new Error(`Unknown complex attribute code(s): ${missing.join(', ')}`);
    e.status = 400;
    throw e;
  }
  return rows.map((r) => r.id);
}

/**
 * WP1 is not optional. Table 6.2 states a complex engineering problem has WP1
 * and some or all of WP2 to WP7, so a CO claiming WP3 without WP1 is claiming
 * something the manual does not recognise. Warned rather than refused, because
 * the judgement is the course teacher's and a hard block would push people into
 * ticking WP1 without meaning it.
 */
function wp1Warning(codes) {
  const wps = (codes || []).filter((c) => /^WP[2-7]$/.test(c));
  if (wps.length && !(codes || []).includes('WP1')) {
    return `This outcome claims ${wps.join(', ')} without WP1. Table 6.2 defines a complex engineering problem as WP1 plus some or all of WP2 to WP7, so WP1 is expected wherever any other WP applies.`;
  }
  return null;
}

const CO_INCLUDE = {
  knowledgeProfiles: { include: { knowledgeProfile: { select: { code: true, shortName: true, attribute: true } } } },
  complexAttributes: { include: { complexAttribute: { select: { code: true, kind: true, dimension: true, attribute: true } } } },
};

const createCourseOutcome = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    await assertFacultyOwns(req.user, courseId);
    const {
      code, title, description, bloomDomain, bloomLevel,
      knowledgeProfileCodes, complexAttributeCodes,
    } = req.body;

    const existing = await prisma.courseOutcome.findFirst({ where: { courseId, code, deletedAt: null } });
    if (existing) {
      return res.status(409).json({ status: 'error', error: `CO code "${code}" already exists in this course.` });
    }

    const [wkIds, caIds] = await Promise.all([
      resolveWkIds(knowledgeProfileCodes),
      resolveComplexIds(complexAttributeCodes),
    ]);

    const item = await prisma.courseOutcome.create({
      data: {
        courseId, code, title, description, bloomDomain, bloomLevel,
        knowledgeProfiles: { create: wkIds.map((id) => ({ knowledgeProfileId: id })) },
        complexAttributes: { create: caIds.map((id) => ({ complexAttributeId: id })) },
      },
      include: CO_INCLUDE,
    });

    res.status(201).json({ status: 'success', data: item, warning: wp1Warning(complexAttributeCodes) });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ status: 'error', error: err.message });
    next(err);
  }
};

const updateCourseOutcome = async (req, res, next) => {
  try {
    const { courseId, id } = req.params;
    await assertFacultyOwns(req.user, courseId);
    const {
      code, title, description, bloomDomain, bloomLevel,
      knowledgeProfileCodes, complexAttributeCodes,
    } = req.body;

    const existing = await prisma.courseOutcome.findFirst({
      where: { courseId, code, deletedAt: null, NOT: { id } },
    });
    if (existing) {
      return res.status(409).json({ status: 'error', error: `CO code "${code}" already exists in this course.` });
    }

    // Only touch a link set when the caller actually sent it, so a partial
    // update that omits the field does not silently wipe the mapping.
    const touchWk = knowledgeProfileCodes !== undefined;
    const touchCa = complexAttributeCodes !== undefined;
    const [wkIds, caIds] = await Promise.all([
      touchWk ? resolveWkIds(knowledgeProfileCodes) : [],
      touchCa ? resolveComplexIds(complexAttributeCodes) : [],
    ]);

    const item = await prisma.$transaction(async (tx) => {
      if (touchWk) {
        await tx.courseOutcomeWk.deleteMany({ where: { courseOutcomeId: id } });
        if (wkIds.length) {
          await tx.courseOutcomeWk.createMany({
            data: wkIds.map((wid) => ({ courseOutcomeId: id, knowledgeProfileId: wid })),
          });
        }
      }
      if (touchCa) {
        await tx.courseOutcomeComplexAttr.deleteMany({ where: { courseOutcomeId: id } });
        if (caIds.length) {
          await tx.courseOutcomeComplexAttr.createMany({
            data: caIds.map((cid) => ({ courseOutcomeId: id, complexAttributeId: cid })),
          });
        }
      }
      return tx.courseOutcome.update({
        where: { id },
        data: { code, title, description, bloomDomain, bloomLevel },
        include: CO_INCLUDE,
      });
    });

    res.json({ status: 'success', data: item, warning: touchCa ? wp1Warning(complexAttributeCodes) : null });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ status: 'error', error: err.message });
    next(err);
  }
};

/**
 * The full v3.0 attribute vocabulary for the CO editor: WK1-WK9 from Table 6.1,
 * WP1-WP7 from Table 6.2, EA1-EA5 from Table 6.3. Served from the framework
 * rather than hardcoded in the frontend, so a future manual revision does not
 * need a UI change.
 */
const getOutcomeAttributes = async (req, res, next) => {
  try {
    const fw = await prisma.accreditationFramework.findFirst({
      where: { isActive: true },
      include: {
        knowledgeProfiles: { orderBy: { code: 'asc' } },
        complexAttributes: { orderBy: { code: 'asc' } },
      },
    });
    if (!fw) return res.status(404).json({ status: 'error', error: 'No accreditation framework seeded' });

    const byCode = (a, b) =>
      a.code.replace(/\d+/, '').localeCompare(b.code.replace(/\d+/, '')) ||
      parseInt(a.code.replace(/\D+/, ''), 10) - parseInt(b.code.replace(/\D+/, ''), 10);

    res.json({
      status: 'success',
      data: {
        knowledgeProfile: fw.knowledgeProfiles.sort(byCode),
        complexProblem: fw.complexAttributes.filter((c) => c.kind === 'PROBLEM').sort(byCode),
        complexActivity: fw.complexAttributes.filter((c) => c.kind === 'ACTIVITY').sort(byCode),
      },
    });
  } catch (err) { next(err); }
};

const deleteCourseOutcome = async (req, res, next) => {
  try {
    const { courseId, id } = req.params;
    await assertFacultyOwns(req.user, courseId);
    const hasMapping = await prisma.coPoMapping.findFirst({ where: { courseOutcomeId: id } });
    const hasAssessment = await prisma.assessmentCO.findFirst({ where: { courseOutcomeId: id } });
    if (hasMapping || hasAssessment) {
      return res.status(409).json({ status: 'error', error: 'CO has mappings or assessments. Remove those first.' });
    }
    await prisma.courseOutcome.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    res.json({ status: 'success', data: { message: 'CO removed' } });
  } catch (err) { next(err); }
};

// ── CO-PO Mapping (simple list, no matrix) ───────────────────
const getMapping = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const [cos, pos, mappings] = await Promise.all([
      prisma.courseOutcome.findMany({ where: { courseId, deletedAt: null }, orderBy: { code: 'asc' } }),
      prisma.programOutcome.findMany({
        where: { program: { courses: { some: { id: courseId } } }, deletedAt: null },
        orderBy: { code: 'asc' },
      }),
      prisma.coPoMapping.findMany({ where: { courseId } }),
    ]);
    const numSort = (a, b) => {
      const nA = parseInt(a.code.replace(/\D+/g, ''), 10);
      const nB = parseInt(b.code.replace(/\D+/g, ''), 10);
      return isNaN(nA) || isNaN(nB) ? a.code.localeCompare(b.code) : nA - nB;
    };
    cos.sort(numSort); pos.sort(numSort);
    res.json({ status: 'success', data: { courseOutcomes: cos, programOutcomes: pos, mappings } });
  } catch (err) { next(err); }
};

const saveMapping = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    await assertFacultyOwns(req.user, courseId);
    const { mappings } = req.body;
    const existing = await prisma.coPoMapping.findFirst({ where: { courseId }, orderBy: { version: 'desc' } });
    const nextVersion = (existing?.version || 0) + 1;
    await prisma.$transaction(
      mappings.map(({ courseOutcomeId, programOutcomeId, correlation }) =>
        prisma.coPoMapping.upsert({
          where: { courseId_courseOutcomeId_programOutcomeId: { courseId, courseOutcomeId, programOutcomeId } },
          create: { courseId, courseOutcomeId, programOutcomeId, correlation: correlation || null, version: nextVersion },
          update: { correlation: correlation || null, version: nextVersion },
        })
      )
    );
    await recomputeAttainmentForCourse(courseId, nextVersion, req.user.institutionId);
    res.json({ status: 'success', data: { message: 'Mapping saved', version: nextVersion } });
  } catch (err) { next(err); }
};

// ── Assessments (no weight, just totalMarks and CO links) ─────
const getAssessments = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const items = await prisma.assessment.findMany({
      where: { courseId, deletedAt: null },
      include: {
        assessmentCOs: {
          include: { courseOutcome: { select: { id: true, code: true, title: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ status: 'success', data: { assessments: items } });
  } catch (err) { next(err); }
};

/**
 * Validates the CO mark allocation for an assessment.
 *
 * Body shape: courseOutcomes: [{ courseOutcomeId, coMarks }, ...]
 * The allocations must sum to totalMarks, because they describe how the
 * question paper is divided. A 30-mark mid-term with 12+10+8 across three COs
 * is the whole paper; 12+10 would mean 8 marks are assessed against nothing.
 *
 * Also accepts the legacy courseOutcomeIds array for a single-CO assessment,
 * where the whole paper belongs to one CO.
 */
function normaliseCourseOutcomes(body, totalMarks) {
  let list = body.courseOutcomes;

  if (!list && Array.isArray(body.courseOutcomeIds)) {
    const ids = body.courseOutcomeIds;
    if (ids.length === 1) {
      list = [{ courseOutcomeId: ids[0], coMarks: totalMarks }];
    } else if (ids.length > 1) {
      return {
        error:
          'This assessment covers more than one CO, so each needs its own mark allocation. Send courseOutcomes: [{ courseOutcomeId, coMarks }] instead of a bare id list.',
      };
    }
  }

  if (!Array.isArray(list) || !list.length) {
    return { error: 'At least one course outcome is required' };
  }

  const seen = new Set();
  let sum = 0;
  const clean = [];

  for (const row of list) {
    const coId = row.courseOutcomeId;
    const marks = Number(row.coMarks);

    if (!coId) return { error: 'Each entry needs a courseOutcomeId' };
    if (seen.has(coId)) return { error: 'The same CO appears twice in this assessment' };
    seen.add(coId);

    if (!Number.isFinite(marks) || marks <= 0) {
      return { error: `Mark allocation for each CO must be greater than zero` };
    }
    sum += marks;
    clean.push({ courseOutcomeId: coId, coMarks: marks });
  }

  // Float tolerance: half-mark allocations are common.
  if (Math.abs(sum - totalMarks) > 0.001) {
    return {
      error: `CO allocations total ${sum} but the assessment is out of ${totalMarks}. They must match, otherwise some marks are assessed against no outcome.`,
    };
  }

  return { list: clean };
}

const createAssessment = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    await assertFacultyOwns(req.user, courseId);
    const { type, title, totalMarks, weight, method, conductedOn } = req.body;

    const total = parseFloat(totalMarks);
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ status: 'error', error: 'totalMarks must be greater than zero' });
    }

    const { list, error } = normaliseCourseOutcomes(req.body, total);
    if (error) return res.status(400).json({ status: 'error', error });

    // Every CO must belong to this course. Without this a faculty member could
    // attach another course's outcome and quietly corrupt its attainment.
    const owned = await prisma.courseOutcome.findMany({
      where: { courseId, deletedAt: null, id: { in: list.map((x) => x.courseOutcomeId) } },
      select: { id: true },
    });
    if (owned.length !== list.length) {
      return res.status(400).json({ status: 'error', error: 'One or more COs do not belong to this course' });
    }

    const item = await prisma.assessment.create({
      data: {
        courseId,
        type,
        title,
        totalMarks: total,
        weight: weight != null ? parseFloat(weight) : 1,
        method: method === 'INDIRECT' ? 'INDIRECT' : 'DIRECT',
        conductedOn: conductedOn ? new Date(conductedOn) : null,
        assessmentCOs: { create: list },
      },
      include: { assessmentCOs: { include: { courseOutcome: { select: { code: true, title: true } } } } },
    });

    res.status(201).json({ status: 'success', data: item });
  } catch (err) { next(err); }
};

/**
 * Edit an assessment, including which COs it covers.
 *
 * Changing the CO links after marks exist is the dangerous case. Marks are keyed
 * on (assessment, student, CO), so dropping a CO orphans its marks and adding
 * one leaves a section with no marks at all. Rather than silently discarding
 * data, this refuses unless the caller passes force=true, and then deletes the
 * orphaned marks inside the same transaction and recomputes.
 */
const updateAssessment = async (req, res, next) => {
  try {
    const { courseId, id } = req.params;
    await assertFacultyOwns(req.user, courseId);

    const existing = await prisma.assessment.findFirst({
      where: { id, courseId, deletedAt: null },
      include: { assessmentCOs: true },
    });
    if (!existing) return res.status(404).json({ status: 'error', error: 'Assessment not found' });

    const { type, title, totalMarks, weight, method, conductedOn, force } = req.body;
    const total = totalMarks != null ? parseFloat(totalMarks) : existing.totalMarks;
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ status: 'error', error: 'totalMarks must be greater than zero' });
    }

    const wantsCoChange = req.body.courseOutcomes != null || req.body.courseOutcomeIds != null;
    let list = existing.assessmentCOs.map((a) => ({ courseOutcomeId: a.courseOutcomeId, coMarks: a.coMarks }));

    if (wantsCoChange) {
      const parsed = normaliseCourseOutcomes(req.body, total);
      if (parsed.error) return res.status(400).json({ status: 'error', error: parsed.error });
      list = parsed.list;

      const owned = await prisma.courseOutcome.findMany({
        where: { courseId, deletedAt: null, id: { in: list.map((x) => x.courseOutcomeId) } },
        select: { id: true },
      });
      if (owned.length !== list.length) {
        return res.status(400).json({ status: 'error', error: 'One or more COs do not belong to this course' });
      }
    } else if (totalMarks != null && Math.abs(total - existing.totalMarks) > 0.001) {
      // Total changed but the allocations did not, so they no longer add up.
      const sum = list.reduce((t, x) => t + x.coMarks, 0);
      if (Math.abs(sum - total) > 0.001) {
        return res.status(400).json({
          status: 'error',
          error: `Changing totalMarks to ${total} leaves the CO allocations summing to ${sum}. Send courseOutcomes with the new split.`,
        });
      }
    }

    const keptCoIds = new Set(list.map((x) => x.courseOutcomeId));
    const removedCoIds = existing.assessmentCOs
      .map((a) => a.courseOutcomeId)
      .filter((coId) => !keptCoIds.has(coId));

    // Marks that would be orphaned: those on a CO being removed, plus any mark
    // now exceeding a reduced allocation.
    const orphanCount = removedCoIds.length
      ? await prisma.mark.count({ where: { assessmentId: id, courseOutcomeId: { in: removedCoIds } } })
      : 0;

    const overCap = await prisma.mark.findMany({
      where: { assessmentId: id, courseOutcomeId: { in: [...keptCoIds] } },
      select: { id: true, courseOutcomeId: true, marksObtained: true },
    });
    const capByCo = Object.fromEntries(list.map((x) => [x.courseOutcomeId, x.coMarks]));
    const exceeding = overCap.filter((m) => m.marksObtained > (capByCo[m.courseOutcomeId] ?? Infinity));

    if ((orphanCount || exceeding.length) && !force) {
      return res.status(409).json({
        status: 'error',
        error: 'This change would discard or invalidate existing marks.',
        impact: {
          marksOnRemovedCos: orphanCount,
          marksExceedingNewAllocation: exceeding.length,
          removedCoIds,
        },
        hint: 'Re-send with force: true to proceed. The affected marks will be deleted and attainment recomputed.',
      });
    }

    await prisma.$transaction([
      ...(removedCoIds.length
        ? [prisma.mark.deleteMany({ where: { assessmentId: id, courseOutcomeId: { in: removedCoIds } } })]
        : []),
      ...(exceeding.length
        ? [prisma.mark.deleteMany({ where: { id: { in: exceeding.map((m) => m.id) } } })]
        : []),
      prisma.assessmentCO.deleteMany({ where: { assessmentId: id } }),
      prisma.assessment.update({
        where: { id },
        data: {
          ...(type != null ? { type } : {}),
          ...(title != null ? { title } : {}),
          totalMarks: total,
          ...(weight != null ? { weight: parseFloat(weight) } : {}),
          ...(method != null ? { method: method === 'INDIRECT' ? 'INDIRECT' : 'DIRECT' } : {}),
          ...(conductedOn !== undefined ? { conductedOn: conductedOn ? new Date(conductedOn) : null } : {}),
          assessmentCOs: { create: list },
        },
      }),
    ]);

    // Attainment reflects the old CO links until this runs.
    await recomputeAttainmentForCourse(courseId, null, req.user.institutionId);

    const updated = await prisma.assessment.findUnique({
      where: { id },
      include: { assessmentCOs: { include: { courseOutcome: { select: { code: true, title: true } } } } },
    });

    res.json({
      status: 'success',
      data: updated,
      discarded: orphanCount + exceeding.length || undefined,
    });
  } catch (err) { next(err); }
};

const deleteAssessment = async (req, res, next) => {
  try {
    const { courseId, id } = req.params;
    await assertFacultyOwns(req.user, courseId);
    const hasMarks = await prisma.mark.findFirst({ where: { assessmentId: id } });
    if (hasMarks) return res.status(409).json({ status: 'error', error: 'Assessment has marks and cannot be deleted.' });
    await prisma.assessment.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    res.json({ status: 'success', data: { message: 'Assessment deleted' } });
  } catch (err) { next(err); }
};

// ── Marks ────────────────────────────────────────────────────
const getMarks = async (req, res, next) => {
  try {
    const { assessmentId } = req.params;
    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: { courseId: true, totalMarks: true },
    });
    if (!assessment) return res.status(404).json({ status: 'error', error: 'Assessment not found' });

    const enrolments = await prisma.enrolment.findMany({
      where: { courseId: assessment.courseId },
      select: { studentId: true },
    });
    const studentIds = enrolments.map(e => e.studentId);

    const students = await prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, firstName: true, lastName: true, institutionalId: true, section: true },
      orderBy: { institutionalId: 'asc' },
    });

    // Marks are per (student, CO). The grid is one row per student with a
    // column per CO the assessment covers, plus a row total.
    const [assessmentCOs, existingMarks] = await Promise.all([
      prisma.assessmentCO.findMany({
        where: { assessmentId },
        include: { courseOutcome: { select: { id: true, code: true, title: true } } },
        orderBy: { courseOutcome: { code: 'asc' } },
      }),
      prisma.mark.findMany({ where: { assessmentId } }),
    ]);

    const byStudent = {};
    for (const m of existingMarks) {
      (byStudent[m.studentId] ||= {})[m.courseOutcomeId] = m;
    }

    const columns = assessmentCOs.map((ac) => ({
      courseOutcomeId: ac.courseOutcomeId,
      code: ac.courseOutcome.code,
      title: ac.courseOutcome.title,
      coMarks: ac.coMarks,
    }));

    const data = students.map((s) => {
      const mine = byStudent[s.id] || {};
      const cells = columns.map((c) => {
        const m = mine[c.courseOutcomeId];
        return {
          courseOutcomeId: c.courseOutcomeId,
          code: c.code,
          maxMarks: c.coMarks,
          marksObtained: m && !m.isAbsent ? m.marksObtained : null,
          isAbsent: m ? m.isAbsent : false,
        };
      });
      const scored = cells.filter((c) => c.marksObtained != null);
      return {
        studentId: s.id,
        institutionalId: s.institutionalId || '',
        name: `${s.firstName} ${s.lastName}`,
        section: s.section || null,
        marks: cells,
        // null rather than 0 when nothing is entered, so an unmarked script does
        // not read as a zero on the grid.
        total: scored.length ? scored.reduce((t, c) => t + c.marksObtained, 0) : null,
      };
    });

    res.json({
      status: 'success',
      data: { columns, totalMarks: columns.reduce((t, c) => t + c.coMarks, 0), students: data },
    });
  } catch (err) { next(err); }
};

/**
 * Save marks.
 *
 * Payload: marks: [{ studentId, courseOutcomeId, marksObtained, isAbsent }]
 * One entry per student per CO. Each is capped by that CO's own allocation, not
 * by the paper total: 9 out of a 10-mark CO2 section is valid even though the
 * paper is out of 30.
 */
const saveMarks = async (req, res, next) => {
  try {
    const { assessmentId } = req.params;
    const { marks } = req.body;

    if (!Array.isArray(marks) || !marks.length) {
      return res.status(400).json({ status: 'error', error: 'marks array is required' });
    }

    const assessment = await prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: { assessmentCOs: true },
    });
    if (!assessment) return res.status(404).json({ status: 'error', error: 'Assessment not found' });

    const capByCo = Object.fromEntries(assessment.assessmentCOs.map((a) => [a.courseOutcomeId, a.coMarks]));

    const problems = [];
    for (const m of marks) {
      if (!m.studentId || !m.courseOutcomeId) {
        problems.push('every entry needs studentId and courseOutcomeId');
        break;
      }
      const cap = capByCo[m.courseOutcomeId];
      if (cap == null) {
        problems.push(`CO ${m.courseOutcomeId} is not part of this assessment`);
        continue;
      }
      if (m.isAbsent) continue;
      const v = Number(m.marksObtained);
      if (!Number.isFinite(v) || v < 0 || v > cap) {
        problems.push(`mark ${m.marksObtained} is outside [0, ${cap}] for that CO`);
      }
    }
    if (problems.length) {
      return res.status(400).json({ status: 'error', error: problems[0], problems: problems.slice(0, 10) });
    }

    const prevMarks = await prisma.mark.findMany({ where: { assessmentId } });
    const prevMap = Object.fromEntries(
      prevMarks.map((m) => [`${m.studentId}:${m.courseOutcomeId}`, m.marksObtained])
    );

    await prisma.$transaction([
      ...marks.map(({ studentId, courseOutcomeId, marksObtained, isAbsent }) =>
        prisma.mark.upsert({
          where: {
            assessmentId_studentId_courseOutcomeId: { assessmentId, studentId, courseOutcomeId },
          },
          create: {
            assessmentId,
            studentId,
            courseOutcomeId,
            marksObtained: isAbsent ? 0 : Number(marksObtained),
            isAbsent: !!isAbsent,
          },
          update: {
            marksObtained: isAbsent ? 0 : Number(marksObtained),
            isAbsent: !!isAbsent,
          },
        })
      ),
      ...marks
        .filter((m) => prevMap[`${m.studentId}:${m.courseOutcomeId}`] !== Number(m.marksObtained))
        .map((m) =>
          prisma.markAuditLog.create({
            data: {
              assessmentId,
              studentId: m.studentId,
              changedById: req.user.userId,
              beforeValue: prevMap[`${m.studentId}:${m.courseOutcomeId}`] ?? null,
              afterValue: m.isAbsent ? null : Number(m.marksObtained),
            },
          })
        ),
    ]);

    await recomputeAttainmentForCourse(assessment.courseId, null, req.user.institutionId);
    res.json({ status: 'success', data: { message: `${marks.length} mark entries saved` } });
  } catch (err) { next(err); }
};

// ── Attainment (% of students who attained each CO/PO) ───────
const getCourseAttainment = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    await assertFacultyOwns(req.user, courseId);

    const coRaw = await prisma.coAttainment.findMany({
      where: { courseId },
      include: { courseOutcome: { select: { code: true, title: true } } },
    });
    const poRaw = await prisma.poAttainment.findMany({
      where: { courseId },
      include: { programOutcome: { select: { code: true, title: true } } },
    });

    // Group by CO/PO and compute % of students who attained
    const coMap = {};
    coRaw.forEach(r => {
      if (!coMap[r.courseOutcomeId]) coMap[r.courseOutcomeId] = { co: r.courseOutcome, attained: 0, total: 0 };
      coMap[r.courseOutcomeId].total++;
      if (r.level === 'L3') coMap[r.courseOutcomeId].attained++;
    });
    const poMap = {};
    poRaw.forEach(r => {
      if (!poMap[r.programOutcomeId]) poMap[r.programOutcomeId] = { po: r.programOutcome, attained: 0, total: 0 };
      poMap[r.programOutcomeId].total++;
      if (r.level === 'L3') poMap[r.programOutcomeId].attained++;
    });

    const coSummary = Object.values(coMap).map(({ co, attained, total }) => ({
      code: co.code, title: co.title,
      attainedCount: attained, totalStudents: total,
      attainmentRate: total ? (attained / total * 100) : 0,
    }));
    const poSummary = Object.values(poMap).map(({ po, attained, total }) => ({
      code: po.code, title: po.title,
      attainedCount: attained, totalStudents: total,
      attainmentRate: total ? (attained / total * 100) : 0,
    }));

    // Sort numerically
    const numSort = (a, b) => {
      const nA = parseInt(a.code.replace(/\D+/g, ''), 10);
      const nB = parseInt(b.code.replace(/\D+/g, ''), 10);
      return isNaN(nA) || isNaN(nB) ? a.code.localeCompare(b.code) : nA - nB;
    };
    coSummary.sort(numSort); poSummary.sort(numSort);

    res.json({ status: 'success', data: { coSummary, poSummary } });
  } catch (err) { next(err); }
};

// ── Recompute ────────────────────────────────────────────────
// The local recomputeAttainmentForCourse() used to live here. It has moved to
// src/services/attainment.service.js, which keeps the same signature but also
// writes the tier-2 CourseCoAttainment rows and generates CQI candidates.
// Imported at the top of this file; call sites are unchanged.

async function assertFacultyOwns(user, courseId) {
  if (user.role === 'ADMIN') return;
  const a = await prisma.courseAssignment.findFirst({ where: { courseId, facultyId: user.userId } });
  if (!a) { const e = new Error('Not assigned to this course'); e.status = 403; throw e; }
}

const getCourseStudents = async (req, res, next) => {
  try {
    const { courseId } = req.params;
    const enrolments = await prisma.enrolment.findMany({
      where: { courseId },
      select: { studentId: true },
    });
    const studentIds = enrolments.map(e => e.studentId);
    const students = await prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: {
        id: true, firstName: true, lastName: true,
        institutionalId: true, section: true,
      },
      orderBy: { institutionalId: 'asc' },
    });
    res.json({ status: 'success', data: students });
  } catch (err) { next(err); }
};

const getStudentAttainment = async (req, res, next) => {
  try {
    const { courseId, studentId } = req.params;
    await assertFacultyOwns(req.user, courseId);

    const [student, coAttainments, poAttainments, assessments] = await Promise.all([
      prisma.user.findUnique({
        where: { id: studentId },
        select: { id: true, firstName: true, lastName: true, institutionalId: true, section: true },
      }),
      prisma.coAttainment.findMany({
        where: { courseId, studentId },
        include: { courseOutcome: { select: { code: true, title: true } } },
      }),
      prisma.poAttainment.findMany({
        where: { courseId, studentId },
        include: { programOutcome: { select: { code: true, title: true } } },
      }),
      prisma.assessment.findMany({
        where: { courseId, deletedAt: null },
        include: {
          assessmentCOs: { include: { courseOutcome: { select: { id: true, code: true } } } },
          marks: { where: { studentId } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    if (!student) return res.status(404).json({ status: 'error', error: 'Student not found' });

    const policy = await getPolicyForCourse(courseId);

    const assessmentDetail = assessments.map(a => {
      const mark = a.marks[0];
      // weight is a weight again. The pass mark is either set explicitly on the
      // assessment or derived from the program's approved threshold policy.
      const attainmentMark =
        a.attainmentMark ?? (a.totalMarks * policy.coStudentThreshold) / 100;
      return {
        id: a.id, title: a.title, type: a.type,
        totalMarks: a.totalMarks, attainmentMark,
        marksObtained: mark ? mark.marksObtained : null,
        passed: mark ? mark.marksObtained >= attainmentMark : null,
        coCodes: a.assessmentCOs.map(ac => ac.courseOutcome.code),
      };
    });

    const numSort = (a, b) => {
      const nA = parseInt((a.code || '').replace(/[^0-9]+/g, ''), 10);
      const nB = parseInt((b.code || '').replace(/[^0-9]+/g, ''), 10);
      return isNaN(nA) || isNaN(nB) ? 0 : nA - nB;
    };
    coAttainments.sort((a, b) => numSort(a.courseOutcome, b.courseOutcome));
    poAttainments.sort((a, b) => numSort(a.programOutcome, b.programOutcome));

    res.json({ status: 'success', data: { student, coAttainments, poAttainments, assessmentDetail } });
  } catch (err) { next(err); }
};

const updateAssessmentAttainmentMark = async (req, res, next) => {
  try {
    const { courseId, assessmentId } = req.params;
    await assertFacultyOwns(req.user, courseId);
    const { attainmentMark } = req.body;
    const assessment = await prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) return res.status(404).json({ status: 'error', error: 'Not found' });
    if (parseFloat(attainmentMark) > assessment.totalMarks) {
      return res.status(400).json({ status: 'error', error: 'Attainment mark cannot exceed total marks' });
    }
    // Writes attainmentMark, not weight. The original version stored the pass
    // mark in the weight column, which made real weighting impossible and, now
    // that weight is a genuine weight again, would silently distort every CO
    // figure the assessment feeds.
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { attainmentMark: parseFloat(attainmentMark) },
    });
    await recomputeAttainmentForCourse(courseId, null, req.user.institutionId);
    res.json({ status: 'success', data: { message: 'Attainment mark updated' } });
  } catch (err) { next(err); }
};

module.exports = {
  getMyCourses,
  getCourseOutcomes,
  getOutcomeAttributes, createCourseOutcome, updateCourseOutcome, deleteCourseOutcome,
  getMapping, saveMapping,
  getAssessments, createAssessment, updateAssessment, deleteAssessment,
  getMarks, saveMarks,
  getCourseAttainment,
  getCourseStudents,
  getStudentAttainment,
  updateAssessmentAttainmentMark,
  recomputeAttainmentForCourse,
};
