/**
 * BAETE Accreditation Framework, Version 3.0
 * Source: ACC-MAN-02 v3.0, effective 01 July 2025.
 * Aligned to IEA Graduate Attributes and Professional Competencies (GAPC) v4 (2021).
 *
 * Do not edit the statement text. These are the canonical outcome definitions an
 * evaluator will compare your Self-assessment Report against. A program may add
 * outcomes of its own (ACC-MAN-02 v3.0 s.5.2), but it may not reword these.
 *
 * WARNING on migration from older data:
 * BAETE v2.x used Knowledge Profile K1-K8 and the IEA v3.21 (2013) PO ordering.
 * v3.0 uses WK1-WK9 (WK9 added: ethics, inclusion, diversity) and re-orders the
 * back half of the PO list. PO9 through PO12 do NOT mean what they meant before.
 * Any CO-PO mapping row carrying an old PO9-PO12 code is silently wrong.
 */

// ---------------------------------------------------------------------------
// Program Outcomes (ACC-MAN-02 v3.0, s.5.2)
// ---------------------------------------------------------------------------
const PROGRAM_OUTCOMES = [
  {
    code: 'PO1',
    title: 'Engineering Knowledge',
    statement:
      'Apply knowledge of mathematics, natural science, computing, engineering fundamentals and an engineering specialization as specified in WK1 to WK4 respectively to develop solutions of complex engineering problems.',
    knowledgeProfile: ['WK1', 'WK2', 'WK3', 'WK4'],
  },
  {
    code: 'PO2',
    title: 'Problem Analysis',
    statement:
      'Identify, formulate, research literature and analyze complex engineering problems reaching substantiated conclusions using first principles of mathematics, natural sciences and engineering sciences with holistic considerations for sustainable development.',
    knowledgeProfile: ['WK1', 'WK2', 'WK3', 'WK4'],
  },
  {
    code: 'PO3',
    title: 'Design/Development of Solutions',
    statement:
      'Design creative solutions for complex engineering problems and design systems, components or processes to meet identified needs with appropriate consideration for public health and safety, whole-life cost, net zero carbon as well as resource, cultural, societal, and environmental considerations as required.',
    knowledgeProfile: ['WK5'],
  },
  {
    code: 'PO4',
    title: 'Investigation',
    statement:
      'Conduct investigations of complex engineering problems using research methods including research-based knowledge, design of experiments, analysis and interpretation of data, and synthesis of information to provide valid conclusions.',
    knowledgeProfile: ['WK8'],
  },
  {
    code: 'PO5',
    title: 'Modern Tool Usage',
    statement:
      'Create, select and apply and recognize limitations of appropriate techniques, resources, and modern engineering and IT tools, including prediction and modeling, to complex engineering problems.',
    knowledgeProfile: ['WK2', 'WK6'],
  },
  {
    code: 'PO6',
    title: 'The Engineer and the World',
    statement:
      'When solving complex engineering problems, analyze and evaluate sustainable development impacts to: society, the economy, sustainability, health and safety, legal frameworks, and the environment.',
    knowledgeProfile: ['WK1', 'WK5', 'WK7'],
  },
  {
    code: 'PO7',
    title: 'Ethics',
    statement:
      'Apply ethical principles and commit to professional ethics and norms of engineering practice and adhere to relevant national and international laws. Demonstrate an understanding of the need for diversity and inclusion.',
    knowledgeProfile: ['WK9'],
  },
  {
    code: 'PO8',
    title: 'Individual and Collaborative Team Work',
    statement:
      'Function effectively as an individual, and as a member or leader in diverse and inclusive teams and in multi-disciplinary, face-to-face, remote and distributed settings.',
    knowledgeProfile: ['WK9'],
  },
  {
    code: 'PO9',
    title: 'Communication',
    statement:
      'Communicate effectively and inclusively on complex engineering activities with the engineering community and with society at large, such as being able to comprehend and write effective reports and design documentation, make effective presentations, taking into account cultural, language, and learning differences.',
    knowledgeProfile: [],
  },
  {
    code: 'PO10',
    title: 'Project Management and Finance',
    statement:
      "Apply knowledge and understanding of engineering management principles and economic decision-making and apply these to one's own work, as a member and leader in a team and to manage projects and in multidisciplinary environments.",
    knowledgeProfile: [],
  },
  {
    code: 'PO11',
    title: 'Life Long Learning',
    statement:
      'Recognize the need for, and have the preparation and ability for i) independent and life-long learning ii) adaptability to new and emerging technologies and iii) critical thinking in the broadest context of technological change.',
    knowledgeProfile: ['WK8'],
  },
  {
    code: 'PO12',
    title: 'Entrepreneurship',
    statement:
      'Demonstrate knowledge and understanding of the competences necessary to transform opportunities and ideas into a new business.',
    knowledgeProfile: [],
  },
];

// ---------------------------------------------------------------------------
// Knowledge and Attitude Profile (ACC-MAN-02 v3.0, Table 6.1)
// ---------------------------------------------------------------------------
const KNOWLEDGE_PROFILE = [
  {
    code: 'WK1',
    shortName: 'Natural Sciences',
    attribute:
      'A systematic, theory-based understanding of the natural sciences applicable to the discipline and awareness of relevant social sciences',
  },
  {
    code: 'WK2',
    shortName: 'Mathematics & Computing',
    attribute:
      'Conceptually based mathematics, numerical analysis, data analysis, statistics and the formal aspects of computer and information science to support detailed analysis and modeling applicable to the discipline',
  },
  {
    code: 'WK3',
    shortName: 'Engineering Fundamentals',
    attribute:
      'A systematic, theory-based formulation of engineering fundamentals required in the engineering discipline',
  },
  {
    code: 'WK4',
    shortName: 'Specialist Knowledge',
    attribute:
      'Engineering specialist knowledge that provides theoretical frameworks and bodies of knowledge for the accepted practice areas in the engineering discipline; much is at the forefront of the discipline',
  },
  {
    code: 'WK5',
    shortName: 'Engineering Design',
    attribute:
      'Knowledge, including efficient resource use, environmental impacts, whole-life cost, re-use of resources, net zero carbon, and similar concepts, that supports engineering design and operations in a practice area',
  },
  {
    code: 'WK6',
    shortName: 'Engineering Practice',
    attribute:
      'Knowledge of engineering practice (technology) in the practice areas in the engineering discipline',
  },
  {
    code: 'WK7',
    shortName: 'Comprehension',
    attribute:
      'Knowledge of the role of engineering in society and identified issues in engineering practice in the discipline, such as professional responsibility of an engineer to public safety and sustainable development',
  },
  {
    code: 'WK8',
    shortName: 'Research Literature & Critical Thinking',
    attribute:
      'Engagement with selected knowledge in the current research literature of the discipline, awareness of the power of critical thinking and creative approaches to evaluate emerging issues',
  },
  {
    code: 'WK9',
    shortName: 'Professional Ethics & Conduct',
    attribute:
      'Ethics, inclusive behavior and conduct. Knowledge of professional ethics, responsibilities, and norms of engineering practice. Awareness of the need for diversity by reason of ethnicity, gender, age, physical ability etc. with mutual understanding and respect, and of inclusive attitudes',
  },
];

// ---------------------------------------------------------------------------
// Range of Complex Engineering Problem Solving (Table 6.2)
// WP1 is mandatory. A complex problem carries WP1 plus some or all of WP2-WP7.
// ---------------------------------------------------------------------------
const COMPLEX_PROBLEM_ATTRIBUTES = [
  {
    code: 'WP1',
    dimension: 'Depth of knowledge required',
    attribute:
      'Cannot be resolved without in-depth engineering knowledge at the level of one or more of WK3, WK4, WK5, WK6 or WK8 which allows a fundamentals-based, first principles analytical approach',
    mandatory: true,
  },
  {
    code: 'WP2',
    dimension: 'Range of conflicting requirements',
    attribute:
      'Involve wide-ranging or conflicting technical, non-technical issues (such as ethical, sustainability, legal, political, economic, societal) and consideration of future requirements',
    mandatory: false,
  },
  {
    code: 'WP3',
    dimension: 'Depth of analysis required',
    attribute:
      'Have no obvious solution and require abstract thinking, creativity and originality in analysis to formulate suitable models',
    mandatory: false,
  },
  {
    code: 'WP4',
    dimension: 'Familiarity of issues',
    attribute: 'Involve infrequently encountered issues or novel problems',
    mandatory: false,
  },
  {
    code: 'WP5',
    dimension: 'Extent of applicable codes',
    attribute:
      'Address problems not encompassed by standards and codes of practice for professional engineering',
    mandatory: false,
  },
  {
    code: 'WP6',
    dimension: 'Extent of stakeholder involvement and conflicting requirements',
    attribute:
      'Involve collaboration across engineering disciplines, other fields, and/or diverse groups of stakeholders with widely varying needs',
    mandatory: false,
  },
  {
    code: 'WP7',
    dimension: 'Interdependence',
    attribute:
      'Address high level problems including many components or sub-problems that may require a systems approach',
    mandatory: false,
  },
];

// ---------------------------------------------------------------------------
// Range of Complex Engineering Activities (Table 6.3)
// ---------------------------------------------------------------------------
const COMPLEX_ACTIVITY_ATTRIBUTES = [
  {
    code: 'EA1',
    dimension: 'Range of resources',
    attribute:
      'Involve the use of diverse resources including people, data and information, natural, financial and physical resources and appropriate technologies including analytical and/or design software',
  },
  {
    code: 'EA2',
    dimension: 'Level of interactions',
    attribute:
      'Require optimal resolution of interactions between wide-ranging and/or conflicting technical, non-technical, and engineering issues',
  },
  {
    code: 'EA3',
    dimension: 'Innovation',
    attribute:
      'Involve creative use of engineering principles, innovative solutions for a conscious purpose, and research-based knowledge',
  },
  {
    code: 'EA4',
    dimension: 'Consequences to society and the environment',
    attribute:
      'Have significant consequences in a range of contexts, characterized by difficulty of prediction and mitigation',
  },
  {
    code: 'EA5',
    dimension: 'Familiarity',
    attribute: 'Can extend beyond previous experiences by applying principles-based approaches',
  },
];

// ---------------------------------------------------------------------------
// UN Sustainable Development Goals
// ACC-MAN-02 v3.0 s.5.3.6 requires the program to show how SDGs are considered
// in teaching, learning and assessment. New requirement in v3, absent from v2.x.
// ---------------------------------------------------------------------------
const SDGS = [
  { code: 'SDG1', name: 'No Poverty' },
  { code: 'SDG2', name: 'Zero Hunger' },
  { code: 'SDG3', name: 'Good Health and Well-being' },
  { code: 'SDG4', name: 'Quality Education' },
  { code: 'SDG5', name: 'Gender Equality' },
  { code: 'SDG6', name: 'Clean Water and Sanitation' },
  { code: 'SDG7', name: 'Affordable and Clean Energy' },
  { code: 'SDG8', name: 'Decent Work and Economic Growth' },
  { code: 'SDG9', name: 'Industry, Innovation and Infrastructure' },
  { code: 'SDG10', name: 'Reduced Inequalities' },
  { code: 'SDG11', name: 'Sustainable Cities and Communities' },
  { code: 'SDG12', name: 'Responsible Consumption and Production' },
  { code: 'SDG13', name: 'Climate Action' },
  { code: 'SDG14', name: 'Life Below Water' },
  { code: 'SDG15', name: 'Life on Land' },
  { code: 'SDG16', name: 'Peace, Justice and Strong Institutions' },
  { code: 'SDG17', name: 'Partnerships for the Goals' },
];

// ---------------------------------------------------------------------------
// Program-specific criteria (ACC-MAN-03 v3.0, s.6)
// ICE is not named in s.6.1-6.11. Under s.6.12 an unlisted program is evaluated
// against the closest listed criteria. For Information and Communication
// Engineering that is EEE_ECE or CSE, or a blend. The department must decide and
// record which, because it drives the course-to-WK mapping.
// ---------------------------------------------------------------------------
const PROGRAM_SPECIFIC_CRITERIA = [
  {
    code: 'CSE',
    section: '6.5',
    name: 'Computer Science and Engineering or Similar Program',
    requiredTopics: [
      'probability and statistics',
      'differential and integral calculus',
      'discrete mathematics',
      'basic sciences',
      'concepts of programming languages',
      'data structures',
      'algorithms and complexity',
      'software design',
      'digital logic',
      'computer organization and architecture',
      'operating systems',
      'networking systems',
      'specification, design, implementation, testing and maintenance of software systems',
      'proficiency in at least one higher-level language',
      'advanced coursework providing depth',
    ],
  },
  {
    code: 'EEE_ECE',
    section: '6.6',
    name: 'Electrical, Electronic, Electronic and Telecommunication Engineering or Similar Program',
    requiredTopics: [
      'probability and statistics',
      'mathematics through differential and integral calculus',
      'biological, chemical or physical science',
      'engineering topics including computing science',
      'differential equations, linear algebra and complex variables',
      'communication theory and systems',
      'design and operation of telecommunication networks for voice, data, image and video transport',
    ],
    note: 'The last two rows apply only to programs whose title carries the modifier communication(s) or telecommunication(s). ICE carries Communication in the title, so both apply.',
  },
];

module.exports = {
  FRAMEWORK: {
    code: 'BAETE_V3',
    name: 'BAETE Accreditation Criteria',
    manualRef: 'ACC-MAN-02',
    version: '3.0',
    effectiveFrom: new Date('2025-07-01'),
    sarTemplateRef: 'ACC-TMP-04-04 v3.0',
    accord: 'WASHINGTON',
  },
  PROGRAM_OUTCOMES,
  KNOWLEDGE_PROFILE,
  COMPLEX_PROBLEM_ATTRIBUTES,
  COMPLEX_ACTIVITY_ATTRIBUTES,
  SDGS,
  PROGRAM_SPECIFIC_CRITERIA,
};
