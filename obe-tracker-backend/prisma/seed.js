/**
 * Program seed: institution, department, ICE program, users, courses, COs,
 * CO-PO mappings, enrolments, assessments, marks.
 *
 * Run AFTER prisma/seed-framework.js. That script loads the BAETE v3
 * vocabulary (PO1-PO12, WK1-WK9, WP1-WP7, EA1-EA5, SDG1-SDG17); this one
 * attaches a program to it. Running this first will fail on the framework
 * lookup, which is deliberate.
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { recomputeAttainmentForCourse } = require('../src/services/attainment.service');
const { createPolicyVersion } = require('../src/services/policy.service');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ── Institution ───────────────────────────────────────────────
  const institution = await prisma.institution.upsert({
    where: { code: 'BUP' },
    update: {},
    create: { name: 'Bangladesh University of Professionals', code: 'BUP' },
  });

  // Thresholds are no longer seeded. They live in ThresholdPolicy, are versioned
  // per program and require a written rationale, because ACC-MAN-02 v3.0 s.5.0
  // sets no benchmark number and leaves the choice to the program to defend.
  // A policy version is created near the end of this file.
  console.log('✓ Institution');

  // ── Academic Faculties ────────────────────────────────────────
  // NOTE: the `Faculty` model is an academic faculty (a school inside the
  // university). It has nothing to do with Role.FACULTY, which is a teacher
  // account on the `User` model. Same word, two different tables.
  // Department.facultyId points here.
  const fstFaculty = await prisma.faculty.upsert({
    where: { institutionId_code: { institutionId: institution.id, code: 'FST' } },
    update: { name: 'Faculty of Science and Technology' },
    create: {
      institutionId: institution.id,
      name: 'Faculty of Science and Technology',
      code: 'FST',
    },
  });

  const fbsFaculty = await prisma.faculty.upsert({
    where: { institutionId_code: { institutionId: institution.id, code: 'FBS' } },
    update: { name: 'Faculty of Business Studies' },
    create: {
      institutionId: institution.id,
      name: 'Faculty of Business Studies',
      code: 'FBS',
    },
  });
  console.log('✓ Faculties FST · FBS');

  // ── Admin (login: admin / 1234) ───────────────────────────────
  const adminHash = await bcrypt.hash('1234', 10);
  await prisma.user.upsert({
    where: { email: 'admin@bup.edu.bd' },
    update: { passwordHash: adminHash },
    create: {
      email: 'admin@bup.edu.bd', passwordHash: adminHash,
      role: 'ADMIN', firstName: 'System', lastName: 'Admin',
      institutionId: institution.id,
    },
  });
  console.log('✓ Admin  (email: admin@bup.edu.bd  password: 1234)');

  // ── Faculty (login: AZ / 1234  and  RAI / 1234) ───────────────
  const facHash = await bcrypt.hash('1234', 10);

  const abrar = await prisma.user.upsert({
    where: { email: 'AZ@bup.edu.bd' },
    update: { passwordHash: facHash },
    create: {
      email: 'AZ@bup.edu.bd', passwordHash: facHash,
      role: 'FACULTY', firstName: 'Abrar', lastName: 'Zawad',
      institutionId: institution.id,
    },
  });

  const refath = await prisma.user.upsert({
    where: { email: 'RAI@bup.edu.bd' },
    update: { passwordHash: facHash },
    create: {
      email: 'RAI@bup.edu.bd', passwordHash: facHash,
      role: 'FACULTY', firstName: 'Refath Ara', lastName: 'Islam',
      institutionId: institution.id,
    },
  });
  console.log('✓ Faculty: AZ@bup.edu.bd / 1234   RAI@bup.edu.bd / 1234');

  // ── Department & Program ──────────────────────────────────────
  const deptICT = await prisma.department.upsert({
    where: { institutionId_code: { institutionId: institution.id, code: 'ICT' } },
    // facultyId is in `update` too, so re-running repairs departments that were
    // created before the faculty tier existed.
    update: {
      name: 'Department of Information and Communication Technology',
      code: 'ICT',
      facultyId: fstFaculty.id,
    },
    create: {
      institutionId: institution.id,
      facultyId: fstFaculty.id,
      name: 'Department of Information and Communication Technology',
      code: 'ICT',
    },
  });

  // Second department, used only to prove batch scoping works. Its batch must
  // NOT appear in the ICT dropdowns. Delete this block if you want a lean seed.
  const deptBBA = await prisma.department.upsert({
    where: { institutionId_code: { institutionId: institution.id, code: 'BBA' } },
    update: { name: 'Department of Business Administration', facultyId: fbsFaculty.id },
    create: {
      institutionId: institution.id,
      facultyId: fbsFaculty.id,
      name: 'Department of Business Administration',
      code: 'BBA',
    },
  });

  const progBICT = await prisma.program.upsert({
    where: { departmentId_code: { departmentId: deptICT.id, code: 'BICT' } },
    update: {},
    create: {
      departmentId: deptICT.id,
      name: 'Bachelor of Science in Information and Communication Technology',
      code: 'BICT',
    },
  });
  console.log('✓ FST → Department ICT → Program BICT');
  console.log('✓ FBS → Department BBA (no program, scope test only)');

  // ── Program Outcomes ──────────────────────────────────────────
  // The previous seed hardcoded twelve POs worded for the Dublin Accord
  // ("well-defined engineering problems", "codified methods of analysis",
  // "assist with the design of systems"). Dublin covers engineering
  // TECHNICIANS. BAETE accredits engineering degrees under the Washington
  // Accord, where the equivalent outcomes all say COMPLEX engineering problems.
  //
  // POs now come from FrameworkOutcome, seeded by seed-framework.js from
  // ACC-MAN-02 v3.0. Each program ProgramOutcome points back at the canonical
  // row via frameworkOutcomeId, which is what lets a report prove the program's
  // outcomes are significantly equivalent to BAETE's (s.5.2.1).

  const framework = await prisma.accreditationFramework.findUnique({
    where: { code: 'BAETE_V3' },
    include: { frameworkOutcomes: { orderBy: { code: 'asc' } } },
  });

  if (!framework) {
    throw new Error(
      'BAETE_V3 framework not found. Run `node prisma/seed-framework.js` first.'
    );
  }

  await prisma.program.update({
    where: { id: progBICT.id },
    data: {
      frameworkId: framework.id,
      // ACC-MAN-03 v3.0 does not list Information and Communication
      // Engineering. Under s.6.12 an unlisted program is evaluated against the
      // closest listed criteria. ICE carries "Communication" in the title,
      // which points at s.6.6, but the curriculum may sit closer to s.6.5.
      // CONFIRM WITH THE ICE OBE COORDINATOR: this drives the whole
      // course-to-WK matrix.
      programSpecificCriteriaId: (
        await prisma.programSpecificCriteria.findUnique({
          where: { frameworkId_code: { frameworkId: framework.id, code: 'EEE_ECE' } },
          select: { id: true },
        })
      )?.id ?? null,
    },
  });

  const poMap = {};
  for (const fo of framework.frameworkOutcomes) {
    const r = await prisma.programOutcome.upsert({
      where: { programId_code: { programId: progBICT.id, code: fo.code } },
      update: {
        title: fo.title,
        description: fo.statement,
        frameworkOutcomeId: fo.id,
      },
      create: {
        programId: progBICT.id,
        frameworkOutcomeId: fo.id,
        code: fo.code,
        title: fo.title,
        description: fo.statement,
      },
    });
    poMap[fo.code] = r.id;
  }
  console.log(`✓ PO1-PO${framework.frameworkOutcomes.length} from ${framework.code} (Washington Accord)`);

  // ── Sessions ──────────────────────────────────────────────────
  // A session IS a batch, and a batch now belongs to one department. The admin
  // UI filters with a strict s.departmentId === dept, so a batch left at null
  // is invisible in every student-assignment dropdown even though the row is
  // there. Every session below gets a departmentId.
  //
  // The five ICT ids are unchanged on purpose. Re-running this seed repairs the
  // existing rows in place instead of forking a second copy and orphaning the
  // courses and marks already hanging off them. On a fresh database you can
  // rename them to session-ict-batch-2023 and so on.
  const batchData = [
    { id: 'session-batch-2022',     deptId: deptICT.id, name: 'Batch 2022', start: '2022-01-01', end: '2026-06-30' },
    { id: 'session-batch-2023',     deptId: deptICT.id, name: 'Batch 2023', start: '2023-01-01', end: '2027-06-30' },
    { id: 'session-batch-2024',     deptId: deptICT.id, name: 'Batch 2024', start: '2024-01-01', end: '2028-06-30' },
    { id: 'session-batch-2025',     deptId: deptICT.id, name: 'Batch 2025', start: '2025-01-01', end: '2029-06-30' },
    { id: 'session-batch-2026',     deptId: deptICT.id, name: 'Batch 2026', start: '2026-01-01', end: '2030-06-30' },
    // Scope test: belongs to BBA, so it must never show under ICT.
    { id: 'session-bba-batch-2023', deptId: deptBBA.id, name: 'BBA Batch 2023', start: '2023-01-01', end: '2027-06-30' },
  ];

  const sessions = {};
  for (const b of batchData) {
    sessions[b.name] = await prisma.session.upsert({
      where: { id: b.id },
      update: {
        departmentId: b.deptId,
        name: b.name,
        startDate: new Date(b.start),
        endDate: new Date(b.end),
        status: 'ACTIVE',
      },
      create: {
        id: b.id,
        institutionId: institution.id,
        departmentId: b.deptId,
        name: b.name,
        startDate: new Date(b.start),
        endDate: new Date(b.end),
        status: 'ACTIVE',
      },
    });
  }
  console.log('✓ Batches: ICT 2022-2026, BBA 2023 (all department-scoped)');

  // ── Courses ───────────────────────────────────────────────────
  const sre = await prisma.course.upsert({
    where: { sessionId_code: { sessionId: sessions['Batch 2023'].id, code: 'ICE-3207' } },
    update: {},
    create: { programId: progBICT.id, sessionId: sessions['Batch 2023'].id, name: 'Software and Requirement Engineering', code: 'ICE-3207', creditHours: 3 },
  });

  const web = await prisma.course.upsert({
    where: { sessionId_code: { sessionId: sessions['Batch 2023'].id, code: 'ICE-3205' } },
    update: {},
    create: { programId: progBICT.id, sessionId: sessions['Batch 2023'].id, name: 'Web Technologies', code: 'ICE-3205', creditHours: 3 },
  });

  const ai = await prisma.course.upsert({
    where: { sessionId_code: { sessionId: sessions['Batch 2022'].id, code: 'ICE-4107' } },
    update: {},
    create: { programId: progBICT.id, sessionId: sessions['Batch 2022'].id, name: 'Artificial Intelligence', code: 'ICE-4107', creditHours: 3 },
  });

  // SRE (ICE-3207) → Abrar Zawad (primary grader)
  await prisma.courseAssignment.upsert({
    where: { courseId_facultyId: { courseId: sre.id, facultyId: abrar.id } },
    update: {},
    create: { courseId: sre.id, facultyId: abrar.id },
  });
  // Web Technologies (ICE-3205) → Refath Ara Islam (primary grader)
  await prisma.courseAssignment.upsert({
    where: { courseId_facultyId: { courseId: web.id, facultyId: refath.id } },
    update: {},
    create: { courseId: web.id, facultyId: refath.id },
  });
  // Artificial Intelligence (ICE-4107) → both faculty
  for (const fac of [abrar, refath]) {
    await prisma.courseAssignment.upsert({
      where: { courseId_facultyId: { courseId: ai.id, facultyId: fac.id } },
      update: {},
      create: { courseId: ai.id, facultyId: fac.id },
    });
  }
  console.log('✓ Course assignments:');
  console.log('  ICE-3207 SRE             → Abrar Zawad (sole grader)');
  console.log('  ICE-3205 Web Technologies → Refath Ara Islam (sole grader)');
  console.log('  ICE-4107 AI              → both faculty');

  // ── Course Outcomes ───────────────────────────────────────────

  // ── ICE-3207 Software and Requirement Engineering ─────────────
  // CO1: Understand software process models and requirement elicitation → PO1 (Knowledge) + PO2 (Problem Analysis)
  const sre_co1 = await prisma.courseOutcome.upsert({
    where: { courseId_code: { courseId: sre.id, code: 'CO1' } },
    update: {},
    create: {
      courseId: sre.id, code: 'CO1',
      title: 'Software Process & Requirement Elicitation',
      description: 'Understand and apply software process models and elicit requirements from stakeholders using structured techniques.',
      bloomDomain: 'COGNITIVE', bloomLevel: 3,
    },
  });

  // CO2: Analyse and specify software requirements using formal notations → PO2 (Problem Analysis) + PO3 (Design)
  const sre_co2 = await prisma.courseOutcome.upsert({
    where: { courseId_code: { courseId: sre.id, code: 'CO2' } },
    update: {},
    create: {
      courseId: sre.id, code: 'CO2',
      title: 'Requirements Analysis & Specification',
      description: 'Analyse, model and formally specify software requirements using use-case diagrams, user stories and SRS documents.',
      bloomDomain: 'COGNITIVE', bloomLevel: 4,
    },
  });

  // CO3: Evaluate and validate requirements for correctness and completeness → PO4 (Investigation) + PO9 (Teamwork)
  const sre_co3 = await prisma.courseOutcome.upsert({
    where: { courseId_code: { courseId: sre.id, code: 'CO3' } },
    update: {},
    create: {
      courseId: sre.id, code: 'CO3',
      title: 'Requirements Validation & Management',
      description: 'Evaluate, validate and manage software requirements through reviews, prototyping and change control processes.',
      bloomDomain: 'COGNITIVE', bloomLevel: 5,
    },
  });
  console.log('✓ COs for ICE-3207 (SRE)');

  // ── ICE-3205 Web Technologies ─────────────────────────────────
  // CO1: Apply HTML/CSS/JS to build structured, styled web interfaces → PO1 + PO5 (Tools)
  const web_co1 = await prisma.courseOutcome.upsert({
    where: { courseId_code: { courseId: web.id, code: 'CO1' } },
    update: {},
    create: {
      courseId: web.id, code: 'CO1',
      title: 'Front-End Web Development',
      description: 'Apply HTML5, CSS3 and JavaScript to design and implement accessible, responsive web interfaces.',
      bloomDomain: 'COGNITIVE', bloomLevel: 3,
    },
  });

  // CO2: Develop dynamic web applications using server-side technologies → PO3 (Design) + PO5 (Tools)
  const web_co2 = await prisma.courseOutcome.upsert({
    where: { courseId_code: { courseId: web.id, code: 'CO2' } },
    update: {},
    create: {
      courseId: web.id, code: 'CO2',
      title: 'Server-Side & Database Integration',
      description: 'Develop dynamic web applications integrating server-side scripting, RESTful APIs and relational databases.',
      bloomDomain: 'COGNITIVE', bloomLevel: 4,
    },
  });

  // CO3: Evaluate web security practices and deploy applications → PO6 (Society) + PO8 (Ethics)
  const web_co3 = await prisma.courseOutcome.upsert({
    where: { courseId_code: { courseId: web.id, code: 'CO3' } },
    update: {},
    create: {
      courseId: web.id, code: 'CO3',
      title: 'Web Security & Deployment',
      description: 'Evaluate common web security vulnerabilities and apply best practices to deploy secure, maintainable web applications.',
      bloomDomain: 'COGNITIVE', bloomLevel: 5,
    },
  });
  console.log('✓ COs for ICE-3205 (Web Technologies)');

  // ── ICE-4107 Artificial Intelligence ──────────────────────────
  // CO1: Explain AI concepts, search strategies and knowledge representation → PO1 + PO12 (Lifelong)
  const ai_co1 = await prisma.courseOutcome.upsert({
    where: { courseId_code: { courseId: ai.id, code: 'CO1' } },
    update: {},
    create: {
      courseId: ai.id, code: 'CO1',
      title: 'AI Fundamentals & Knowledge Representation',
      description: 'Explain core AI concepts, search strategies and knowledge representation schemes including logic and semantic networks.',
      bloomDomain: 'COGNITIVE', bloomLevel: 2,
    },
  });

  // CO2: Design and implement machine learning models for real-world problems → PO2 + PO3 + PO5
  const ai_co2 = await prisma.courseOutcome.upsert({
    where: { courseId_code: { courseId: ai.id, code: 'CO2' } },
    update: {},
    create: {
      courseId: ai.id, code: 'CO2',
      title: 'Machine Learning Model Design',
      description: 'Design, implement and evaluate supervised and unsupervised machine learning models to solve well-defined engineering problems.',
      bloomDomain: 'COGNITIVE', bloomLevel: 4,
    },
  });

  // CO3: Assess ethical implications and societal impact of AI systems → PO6 + PO8
  const ai_co3 = await prisma.courseOutcome.upsert({
    where: { courseId_code: { courseId: ai.id, code: 'CO3' } },
    update: {},
    create: {
      courseId: ai.id, code: 'CO3',
      title: 'AI Ethics & Societal Impact',
      description: 'Assess ethical considerations, bias, fairness and the societal impact of AI systems in engineering contexts.',
      bloomDomain: 'AFFECTIVE', bloomLevel: 4,
    },
  });
  console.log('✓ COs for ICE-4107 (Artificial Intelligence)');

  // ── CO-PO Mappings ────────────────────────────────────────────
  // Correlation levels: WEAK=1, MODERATE=2, STRONG=3
  const mapData = [
    // ICE-3207 SRE
    // CO1: Software Process & Requirement Elicitation → PO1 Strong, PO2 Moderate, PO12 Weak
    { coId: sre_co1.id, poCode: 'PO1',  correlation: 'STRONG'   },
    { coId: sre_co1.id, poCode: 'PO2',  correlation: 'MODERATE' },
    { coId: sre_co1.id, poCode: 'PO12', correlation: 'WEAK'     },
    // CO2: Requirements Analysis → PO2 Strong, PO3 Strong, PO4 Moderate
    { coId: sre_co2.id, poCode: 'PO2',  correlation: 'STRONG'   },
    { coId: sre_co2.id, poCode: 'PO3',  correlation: 'STRONG'   },
    { coId: sre_co2.id, poCode: 'PO4',  correlation: 'MODERATE' },
    // CO3: Requirements Validation → PO4 Strong, PO9 Strong, PO10 Moderate
    { coId: sre_co3.id, poCode: 'PO4',  correlation: 'STRONG'   },
    { coId: sre_co3.id, poCode: 'PO9',  correlation: 'STRONG'   },
    { coId: sre_co3.id, poCode: 'PO10', correlation: 'MODERATE' },

    // ICE-3205 Web Technologies
    // CO1: Front-End → PO1 Strong, PO5 Strong, PO3 Moderate
    { coId: web_co1.id, poCode: 'PO1',  correlation: 'STRONG'   },
    { coId: web_co1.id, poCode: 'PO5',  correlation: 'STRONG'   },
    { coId: web_co1.id, poCode: 'PO3',  correlation: 'MODERATE' },
    // CO2: Server-Side → PO3 Strong, PO5 Strong, PO2 Moderate
    { coId: web_co2.id, poCode: 'PO3',  correlation: 'STRONG'   },
    { coId: web_co2.id, poCode: 'PO5',  correlation: 'STRONG'   },
    { coId: web_co2.id, poCode: 'PO2',  correlation: 'MODERATE' },
    // CO3: Security & Deployment → PO6 Strong, PO8 Strong, PO7 Moderate
    { coId: web_co3.id, poCode: 'PO6',  correlation: 'STRONG'   },
    { coId: web_co3.id, poCode: 'PO8',  correlation: 'STRONG'   },
    { coId: web_co3.id, poCode: 'PO7',  correlation: 'MODERATE' },

    // ICE-4107 Artificial Intelligence
    // CO1: Fundamentals → PO1 Strong, PO12 Moderate
    { coId: ai_co1.id, poCode: 'PO1',  correlation: 'STRONG'   },
    { coId: ai_co1.id, poCode: 'PO12', correlation: 'MODERATE' },
    // CO2: ML Design → PO2 Strong, PO3 Strong, PO5 Strong, PO4 Moderate
    { coId: ai_co2.id, poCode: 'PO2',  correlation: 'STRONG'   },
    { coId: ai_co2.id, poCode: 'PO3',  correlation: 'STRONG'   },
    { coId: ai_co2.id, poCode: 'PO5',  correlation: 'STRONG'   },
    { coId: ai_co2.id, poCode: 'PO4',  correlation: 'MODERATE' },
    // CO3: Ethics & Impact → PO6 Strong, PO8 Strong, PO9 Moderate
    { coId: ai_co3.id, poCode: 'PO6',  correlation: 'STRONG'   },
    { coId: ai_co3.id, poCode: 'PO8',  correlation: 'STRONG'   },
    { coId: ai_co3.id, poCode: 'PO9',  correlation: 'MODERATE' },
  ];

  // Attach courseId to each mapping entry
  const coToCourse = {};
  for (const co of [sre_co1, sre_co2, sre_co3]) coToCourse[co.id] = sre.id;
  for (const co of [web_co1, web_co2, web_co3]) coToCourse[co.id] = web.id;
  for (const co of [ai_co1, ai_co2, ai_co3])   coToCourse[co.id] = ai.id;

  for (const m of mapData) {
    const courseId = coToCourse[m.coId];
    const programOutcomeId = poMap[m.poCode];
    await prisma.coPoMapping.upsert({
      where: {
        courseId_courseOutcomeId_programOutcomeId: {
          courseId,
          courseOutcomeId: m.coId,
          programOutcomeId,
        },
      },
      update: { correlation: m.correlation, version: 1 },
      create: {
        courseId,
        courseOutcomeId: m.coId,
        programOutcomeId,
        correlation: m.correlation,
        version: 1,
      },
    });
  }
  console.log('✓ CO-PO mappings (9 per course, 27 total)');

  // ── Students (login: studentId / 1234) ────────────────────────
  const studentList = [
    ['23549009001','SUBAHA NURAIN','POURBI'],
    ['23549009002','ABEEDA UMMEY','HAAFSA'],
    ['23549009003','RAKIBUL','HASAN'],
    ['23549009004','REEFAH TASNIA','ROZONI'],
    ['23549009005','MD. HEMEL','PARVEJ'],
    ['23549009006','SUPRIO CHATTAPADHYA','RAJ'],
    ['23549009007','S M NAZIB UL','ALAM'],
    ['23549009008','AFIA','TASNIA'],
    ['23549009011','MD. SALMAN','ZAHID'],
    ['23549009012','HUMAIRA BINTE','MIZAN'],
    ['23549009013','MD. RAZOWAN','RABBI'],
    ['23549009020','AFIFA','HUMAYRA'],
    ['23549009021','RATRIXMNA','CHAKMA'],
    ['23549009022','S. M ABRAR ZAWAD','YOBORAJ'],
    ['23549009023','MAHANAZ','AFRIN'],
    ['23549009025','SAIDA','JAHAN'],
    ['23549009026','MD ISA BIN HABIB KHAN','NIROZ'],
    ['23549009027','ANIKA FAIRUZ','KHAN'],
    ['23549009029','SHAFIKA BINTE','ISMAIL'],
    ['23549009030','MD. ASIF AHMED','REZVI'],
    ['23549009031','FARZANA HOSSAIN','MIMI'],
    ['23549009032','ABRAR LABIB','TARAFDER'],
    ['23549009033','SUMIYA','AFRIN'],
    ['23549009034','AL','MOHIAN'],
    ['23549009037','SADMAN','SAKIB'],
    ['23549009038','MD. SAFIL','SARKER'],
    ['23549009039','MD. EFTHA KHARUL HAQUE','EFATH'],
    ['23549009040','ATIQUL ISLAM','SAYEM'],
    ['23549009041','LAIBA SUMAIYA','NAZIM'],
    ['23549009042','MUNTASIR','AHAMMED'],
    ['23549009043','ROWNOK TANVIN','AVA'],
    ['23549009044','BEENA RANI','DAS'],
    ['23549009045','SABIQUN NAHER','SAMIA'],
    ['23549009048','MD. MEHEDI HASSAN','RIDOY'],
    ['23549009052','MD. SAJIDUL','ISLAM'],
    ['23549009053','MD. NAZMUS SAKIB','SIAM'],
    ['23549009054','REFATH ARA','ISLAM'],
    ['23549009055','KHONDAKAR ANIQA','TASNEEM'],
    ['23549009056','FUAD AL','HASAN'],
    ['23549009061','MD. FARDOUS HOSSIN KHAN','NAHID'],
    ['23549009063','TASMIM ANAN','PROTIVA'],
    ['23549009065','MD SHAHRIAR NASIM','SHAWON'],
    ['23549009067','MD. SADMAN','SAKIB'],
    ['23549009069','MD. MEJBAUL ISLAM','ZIDAN'],
    ['23549009070','SAMIA RAHMAN','SHAMMI'],
    ['23549009071','SUMAYA','SANZIDA'],
    ['23549009073','TOWHIDUR RAHMAN','TALUKDAR'],
    ['23549009074','MAISHA MONWAR','PRODIPTA'],
    ['23549009075','MD. RIDWAN','RAHMAN'],
    ['23549009076','ISHTIAK HAQUE','SADMAN'],
    ['23549009078','TAHIA','PARSHA'],
    ['23549009081','JAKI - UL - ALAM','KHAN'],
    ['23549009085','MD. TANVIR','HOSSEN'],
    ['23549009087','SAMIHAH SULTANA','ERA'],
    ['23549009090','FAHIM','AHMED'],
    ['23549009091','MUSAYEB HOSSAIN','USAMA'],
    ['23549009093','MASUMA TASNIM','NIMO'],
    ['23549009095','MD. MAHFUZUR','RAHMAN'],
    ['23549009096','TASMIN HASAN','FUWAD'],
    ['23549009097','MUHAMMAD ZEEHAD','HASAN'],
    ['23549009098','MAHFUZA KHANUM','MAHE'],
    ['23549009099','RIDA ZAIMAH','KAMAL'],
    ['23549009100','MD. RASHEDUL','ISLAM'],
    ['23549009101','MD. FARIDUR','RAHMAN'],
    ['23549009102','MD. RAFAT HOSSAN','LEON'],
  ];

  // Every id above starts 235..., so this whole list is the ICT Batch 2023
  // cohort. sessionId is what puts them in that batch; without it the student
  // list renders but the batch and section filters return nothing.
  const ictBatch2023 = sessions['Batch 2023'];
  const students = [];

  for (const [id, firstName, lastName] of studentList) {
    // email = studentId@bup.edu.bd, password = studentId
    const stuPwHash = await bcrypt.hash(id, 10);
    // Section A = odd last digits, Section B = even last digits
    const lastDigit = parseInt(id.slice(-1), 10);
    const section = (lastDigit % 2 !== 0) ? 'A' : 'B';

    const stu = await prisma.user.upsert({
      where: { email: `${id}@bup.edu.bd` },
      update: {
        passwordHash: stuPwHash,
        institutionalId: id,
        section,
        sessionId: ictBatch2023.id,
      },
      create: {
        email: `${id}@bup.edu.bd`,
        passwordHash: stuPwHash,
        role: 'STUDENT',
        firstName, lastName,
        institutionalId: id,
        section,
        sessionId: ictBatch2023.id,
        institutionId: institution.id,
      },
    });
    students.push(stu);
  }
  console.log(`✓ ${students.length} students created (email: <id>@bup.edu.bd  password: <id>)`);
  console.log(`  all attached to ${ictBatch2023.name} under ICT, split into sections A and B`);

  // ── Enrol Batch 2023 students in ICE-3207 AND ICE-3205 ──────
  for (const stu of students) {
    await prisma.enrolment.upsert({
      where: { studentId_courseId: { studentId: stu.id, courseId: sre.id } },
      update: {},
      create: { studentId: stu.id, courseId: sre.id, programId: progBICT.id },
    });
    await prisma.enrolment.upsert({
      where: { studentId_courseId: { studentId: stu.id, courseId: web.id } },
      update: {},
      create: { studentId: stu.id, courseId: web.id, programId: progBICT.id },
    });
  }
  console.log(`✓ All ${students.length} students enrolled in ICE-3207 (SRE) and ICE-3205 (Web Technologies)`);

  // ── Summary ───────────────────────────────────────────────────
  console.log('');
  console.log('✅ Seed complete!');
  console.log('');
  console.log('  Credentials');
  console.log('  ─────────────────────────────────────────────────────────────────');
  console.log('  Admin   : admin@bup.edu.bd          password: 1234');
  console.log('  Faculty : AZ@bup.edu.bd             password: 1234  (Abrar Zawad)');
  console.log('  Faculty : RAI@bup.edu.bd            password: 1234  (Refath Ara Islam)');
  console.log('  Student : <studentId>@bup.edu.bd    password: <studentId>');
  console.log('            e.g. 23549009001@bup.edu.bd  password: 23549009001');
  console.log('');
  console.log('  Structure');
  console.log('  ─────────────────────────────────────────────────────────────────');
  console.log('  BUP → FST → ICT → BICT → Batches 2022, 2023, 2024, 2025, 2026');
  console.log('  BUP → FBS → BBA        → BBA Batch 2023  (scope test, empty)');
  console.log('');
  console.log('  Courses');
  console.log('  ─────────────────────────────────────────────────────────────────');
  console.log(`  ICE-3207  Software and Requirement Engineering  Batch 2023  ← ${students.length} students enrolled`);
  console.log(`  ICE-3205  Web Technologies                      Batch 2023  ← ${students.length} students enrolled`);
  console.log('  ICE-4107  Artificial Intelligence               Batch 2022  ← nobody enrolled');
  console.log('');
  console.log('  Course Outcomes (3 per course, with Bloom\'s + profiles + CO-PO maps)');
  console.log('  ─────────────────────────────────────────────────────────────────');
  console.log('  ICE-3207  CO1 Software Process (Cog L3) · CO2 Req Analysis (Cog L4) · CO3 Validation (Cog L5)');
  console.log('  ICE-3205  CO1 Front-End Dev (Cog L3)   · CO2 Server-Side (Cog L4)   · CO3 Security (Cog L5)');
  console.log('  ICE-4107  CO1 AI Fundamentals (Cog L2) · CO2 ML Design (Cog L4)     · CO3 AI Ethics (Aff L4)');

  // ── Assessments & Sample Marks (ICE-3207 only - Batch 2023) ──
  // Weightage plan (no FINAL - excluded as requested):
  //   Quiz 1        10%  20 marks  → CO1
  //   Quiz 2        10%  20 marks  → CO2
  //   Assignment 1  15%  50 marks  → CO1, CO2
  //   Assignment 2  15%  50 marks  → CO2, CO3
  //   Mid Term      25%  100 marks → CO1, CO2, CO3
  //   Lab           15%  50 marks  → CO3
  //   Presentation  10%  30 marks  → CO3
  // Total: 100%

  console.log('');
  console.log('  Seeding assessments and marks for ICE-3207...');

  // Fetch the COs we created for SRE (need their IDs)
  const sreCOs = await prisma.courseOutcome.findMany({
    where: { courseId: sre.id, deletedAt: null },
    orderBy: { code: 'asc' },
  });
  const [co1, co2, co3] = sreCOs;

  // ── ICE-3207 SRE: 3 assessments only ──────────────────────────
  // Total marks per CO:
  //   CO1: Quiz 1 (20) + Mid Term (30 of 60) = 50 total  → attainment = floor(50*0.6) = 30
  //   CO2: Quiz 2 (20) + Mid Term (30 of 60) = 50 total  → attainment = floor(50*0.6) = 30
  //   CO3: Assignment (40) + Mid Term (0 of 60) = 40      → attainment = floor(40*0.6) = 24
  // Mid Term maps to all 3 COs; Quiz 1 → CO1; Quiz 2 → CO2; Assignment → CO3

  const sreAssessmentDefs = [
    { title: 'Quiz 1',    type: 'QUIZ',       totalMarks: 20,  cos: [co1] },
    { title: 'Quiz 2',    type: 'QUIZ',       totalMarks: 20,  cos: [co2] },
    { title: 'Assignment',type: 'ASSIGNMENT', totalMarks: 40,  cos: [co3] },
    { title: 'Mid Term',  type: 'MID_TERM',   totalMarks: 60,  cos: [co1, co2, co3] },
  ];

  const sreAssessments = [];
  for (const def of sreAssessmentDefs) {
    const ass = await prisma.assessment.upsert({
      where: { id: 'seed-ass-sre-' + def.title.toLowerCase().replace(/[^a-z0-9]/g, '-') },
      update: { totalMarks: def.totalMarks, title: def.title },
      create: {
        id: 'seed-ass-sre-' + def.title.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        courseId: sre.id, type: def.type, title: def.title,
        totalMarks: def.totalMarks, weight: 0,
      },
    });
    for (const co of def.cos) {
      await prisma.assessmentCO.upsert({
        where: { assessmentId_courseOutcomeId: { assessmentId: ass.id, courseOutcomeId: co.id } },
        update: {},
        create: { assessmentId: ass.id, courseOutcomeId: co.id },
      });
    }
    sreAssessments.push({ ...ass, coIds: def.cos.map(c => c.id) });
  }
  console.log('  ✓ 4 assessments created for ICE-3207 (SRE)');

  // ── ICE-3205 Web Technologies: 3 assessments only ──────────────
  const webCOs = await prisma.courseOutcome.findMany({
    where: { courseId: web.id, deletedAt: null },
    orderBy: { code: 'asc' },
  });
  const [wco1, wco2, wco3] = webCOs;

  const webAssessmentDefs = [
    { title: 'Quiz 1',    type: 'QUIZ',       totalMarks: 20,  cos: [wco1] },
    { title: 'Quiz 2',    type: 'QUIZ',       totalMarks: 20,  cos: [wco2] },
    { title: 'Assignment',type: 'ASSIGNMENT', totalMarks: 40,  cos: [wco3] },
    { title: 'Mid Term',  type: 'MID_TERM',   totalMarks: 60,  cos: [wco1, wco2, wco3] },
  ];

  const webAssessments = [];
  for (const def of webAssessmentDefs) {
    const ass = await prisma.assessment.upsert({
      where: { id: 'seed-ass-web-' + def.title.toLowerCase().replace(/[^a-z0-9]/g, '-') },
      update: { totalMarks: def.totalMarks, title: def.title },
      create: {
        id: 'seed-ass-web-' + def.title.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        courseId: web.id, type: def.type, title: def.title,
        totalMarks: def.totalMarks, weight: 0,
      },
    });
    for (const co of def.cos) {
      await prisma.assessmentCO.upsert({
        where: { assessmentId_courseOutcomeId: { assessmentId: ass.id, courseOutcomeId: co.id } },
        update: {},
        create: { assessmentId: ass.id, courseOutcomeId: co.id },
      });
    }
    webAssessments.push({ ...ass, coIds: def.cos.map(c => c.id) });
  }
  console.log('  ✓ 4 assessments created for ICE-3205 (Web Technologies)');

  // ── Seeded random helper ────────────────────────────────────────
  function seededRandom(seed) {
    let s = seed;
    return function() {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  // -- Per-student ability: ~70% score >= 60% (above attainment threshold) --
  const studentAbility = {};
  students.forEach((stu, i) => {
    const rng = seededRandom(i * 7919 + 1234);
    const cut = rng();
    if (cut < 0.70) {
      studentAbility[stu.id] = 0.62 + rng() * 0.33; // passing: 62-95%
    } else {
      studentAbility[stu.id] = 0.35 + rng() * 0.24; // failing: 35-59%
    }
  });

  // ── Insert SRE marks (integer values) ──────────────────────────
  let sreMarkCount = 0;
  for (const ass of sreAssessments) {
    for (const stu of students) {
      const rng = seededRandom(stu.id.charCodeAt(0) * 31 + ass.id.charCodeAt(0) * 17);
      const base = studentAbility[stu.id];
      const noise = (rng() - 0.5) * 0.14;
      const pct = Math.min(1.0, Math.max(0.10, base + noise));
      // Integer marks only
      const marksObtained = Math.floor(pct * ass.totalMarks);
      await prisma.mark.upsert({
        where: { assessmentId_studentId: { assessmentId: ass.id, studentId: stu.id } },
        update: { marksObtained },
        create: { assessmentId: ass.id, studentId: stu.id, marksObtained },
      });
      sreMarkCount++;
    }
  }
  console.log(`  ✓ ${sreMarkCount} integer marks inserted for ICE-3207`);

  // ── Insert Web marks (integer values) ──────────────────────────
  let webMarkCount = 0;
  for (const ass of webAssessments) {
    for (const stu of students) {
      const rng = seededRandom(stu.id.charCodeAt(0) * 53 + ass.id.charCodeAt(0) * 23 + 9999);
      const base = studentAbility[stu.id];
      const bias = 0.03; // Web marks slightly higher on average
      const noise = (rng() - 0.5) * 0.12;
      const pct = Math.min(1.0, Math.max(0.10, base + bias + noise));
      const marksObtained = Math.floor(pct * ass.totalMarks);
      await prisma.mark.upsert({
        where: { assessmentId_studentId: { assessmentId: ass.id, studentId: stu.id } },
        update: { marksObtained },
        create: { assessmentId: ass.id, studentId: stu.id, marksObtained },
      });
      webMarkCount++;
    }
  }
  console.log(`  ✓ ${webMarkCount} integer marks inserted for ICE-3205`);

  // ── Threshold policy ────────────────────────────────────────────
  // Must exist before anything is computed. createPolicyVersion refuses a
  // rationale under 20 characters on purpose: BAETE gives no benchmark number,
  // so an unjustified 60 is a finding waiting to happen.
  const existingPolicy = await prisma.thresholdPolicy.findFirst({
    where: { programId: progBICT.id },
  });

  if (!existingPolicy) {
    await createPolicyVersion(
      progBICT.id,
      {
        label: 'ICE OBE Policy 2026',
        coStudentThreshold: 60,
        coCohortThreshold: 60,
        poStudentThreshold: 60,
        poCohortThreshold: 60,
        l3Min: 80, l2Min: 70, l1Min: 60,
        rationale:
          'PLACEHOLDER - not yet approved. Replace with the ICE academic committee ' +
          'minute recording why 60 percent was chosen for both the student and ' +
          'cohort tiers, and why the bands sit at 60/70/80. Leave the word ' +
          'PLACEHOLDER in place until that decision exists; it is greppable, and ' +
          'an invented justification would read as settled a year from now.',
      },
      null // approvedBy stays null until the committee signs off
    );
    console.log('✓ ThresholdPolicy v1 (UNAPPROVED - rationale is a placeholder)');
  } else {
    console.log(`✓ ThresholdPolicy v${existingPolicy.version} already present`);
  }

  // ── Recompute attainment ────────────────────────────────────────
  // The seed used to carry a private copy of the attainment engine here,
  // including the same raw-mark summing bug: PO attainment added obtained and
  // possible marks across every mapped CO, so a CO assessed by a 100 mark final
  // outweighed one assessed by a 10 mark quiz roughly ten to one no matter what
  // the mapping said, and correlation strength was filtered on but never
  // applied. Both recompute blocks are gone. The service does it properly and
  // also writes the tier-2 CourseCoAttainment rows and CQI candidates.

  // matrixVersion was resolved by hand in the old block. The service resolves it
  // itself when passed null, from the latest CoPoMapping version on the course.
  for (const [course, label] of [
    [sre, 'ICE-3207 SRE'],
    [web, 'ICE-3205 Web Technologies'],
  ]) {
    const result = await recomputeAttainmentForCourse(course.id, null, null, {
      cycleLabel: 'Seed 2026',
      generateCqi: false, // seeded data should not manufacture CQI findings
    });
    console.log(
      `✓ ${label}: ${result.students} students, ${result.cos} COs, ` +
      `${result.cosNotAttained} CO(s) below cohort threshold` +
      (result.unapprovedPolicy ? ' [policy v0, unapproved]' : '')
    );
  }

  // ── Integrity check ─────────────────────────────────────────────
  // Both of these fail silently in the UI. An unscoped batch never shows in a
  // department dropdown, and a batchless student never shows in a batch filter.
  // Neither throws, so check for them here rather than during a demo.
  const orphanSessions = await prisma.session.findMany({
    where: { institutionId: institution.id, departmentId: null },
    select: { id: true, name: true },
  });
  const orphanStudents = await prisma.user.count({
    where: { institutionId: institution.id, role: 'STUDENT', sessionId: null, deletedAt: null },
  });

  console.log('');
  if (orphanSessions.length) {
    console.log(`  ⚠ ${orphanSessions.length} batch(es) with no department, invisible in the admin UI:`);
    orphanSessions.forEach(s => console.log(`      ${s.name}  (${s.id})`));
  } else {
    console.log('  ✓ every batch is scoped to a department');
  }
  if (orphanStudents) {
    console.log(`  ⚠ ${orphanStudents} student(s) not attached to any batch`);
  } else {
    console.log('  ✓ every student is attached to a batch');
  }

  console.log('✅ All done - marks and attainment seeded!');
}

main().catch(console.error).finally(() => prisma.$disconnect());