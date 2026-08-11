# Migrating ObeTracker to BAETE v3.0

Notes on what changed from `SMAZY0210/ObeTracker` and why. Read the first section
before you seed anything.

Reference: ACC-MAN-02 v3.0, effective 01 July 2025. SAR template ACC-TMP-04-04
v3.0, mandatory for all programs from 01 July 2026. The v2.1 template expired on
30 June 2026, so there is no longer a choice.

---

## 1. The seeded POs were the wrong accord

This is the finding that matters most, and it is not a formatting problem.

`prisma/seed.js` in the original repo seeds twelve POs worded like this:

> Identify and analyse **well-defined** engineering problems reaching substantiated
> conclusions using **codified methods of analysis**.

> Design solutions for **well-defined technical problems** and **assist with** the design
> of systems, components or processes to meet specified needs.

"Well-defined problems", "codified methods", "assist with the design" is Dublin
Accord language. Dublin covers engineering **technicians**. BAETE accredits
engineering degree programmes under the **Washington Accord**, where the
equivalent outcomes say *complex* engineering problems throughout, and where PO3
asks the graduate to design solutions rather than assist with them.

A SAR built on that seed describes a diploma programme. An evaluator reading the
PO table against ACC-MAN-02 would stop there.

The ordering also moved between IEA v3.21 (2013) and GAPC v4 (2021), which
BAETE v3 adopts:

| Code | Old seed (Dublin/v3.21 ordering) | BAETE v3.0 |
|------|----------------------------------|------------|
| PO6  | The Engineer and Society | The Engineer and the World |
| PO7  | Environment and Sustainability | Ethics |
| PO8  | Ethics | Individual and Collaborative Team Work |
| PO9  | Individual and Teamwork | Communication |
| PO10 | Communication | Project Management and Finance |
| PO11 | Project Management and Finance | Life Long Learning |
| PO12 | Lifelong Learning | **Entrepreneurship** (new) |

So every `CoPoMapping` row pointing at PO7 through PO12 now means something
different. There is no automated fix for this. The mapping matrix has to be
re-done by the course teachers, because only they know whether a CO mapped to
"Ethics" was mapped to old-PO8 or was always meant to be new-PO7.

Knowledge Profile changed too: **K1-K8 became WK1-WK9**, with WK9 (ethics,
inclusive behaviour, diversity) added. Not a rename, an extension.

---

## 2. Four bugs in the attainment engine

`src/utils/attainment.js` was rewritten. Each of these changes the numbers.

**2.1 The 60% was hardcoded.** `const CO_THRESHOLD_PCT = 0.60` sat at the top of
the module, and `AttainmentThreshold` (l1Min/l2Min/l3Min) existed in the schema
but was never read by the engine. `getLevel()` returned only `L3` or `L0`, so the
four-level enum was decoration.

ACC-MAN-02 v3.0 s.5.0 says the criteria carry no quantitative benchmark and that
adequacy is decided qualitatively. The number is yours to set and to defend, so
it now lives in `ThresholdPolicy` with a `rationale` text column, an approval
reference, and effective dates. Every stored attainment row carries the
`policyVersion` that produced it. When someone asks in 2029 why a 2026 cohort
was scored at 60, the answer is in the row.

**2.2 `Assessment.weight` was doing two jobs.** The engine read it as an absolute
attainment mark:

```js
const aAttainMark = a.weight > 0 ? a.weight : Math.floor(a.totalMarks * CO_THRESHOLD_PCT);
```

One column cannot be both a relative weight and a mark out of 100. Genuine
weighting was therefore impossible, and a 100-mark final counted the same as a
10-mark quiz. `attainmentMark` is now its own nullable column and `weight` is a
weight again. `faculty.controller.js:423` has the same line and needs the same
fix.

**2.3 Correlation was collected and discarded.** The comment said so:

```js
// PO attainment: sum marks from all COs mapped to this PO (correlation strength ignored)
```

The mapping UI asks faculty for WEAK/MODERATE/STRONG, stores it, and then the
engine ignored it. The README's claim of "correlation-weighted COs" was not true
of the code. Weights of 1/2/3 now apply.

**2.4 PO attainment summed raw marks.** `computePOAttainmentFromCOs` added up
`totalObtained` and `totalPossible` across every CO mapped to the PO. If CO1 is
assessed by a 100-mark final and CO2 by a 10-mark quiz, CO1 supplies about 91%
of the PO figure regardless of what the mapping says. Each CO is now normalised
to a percentage first, then combined by correlation weight.

Worked example from the test run, one PO fed by a STRONG CO and a WEAK CO:

```
s1: 100% on the STRONG co1, 40% on the WEAK co2 -> 85.00%  attained
s2:  30% on the STRONG co1, 85% on the WEAK co2 -> 43.75%  not attained
    (unweighted mean would have given s2 57.5%, and the old raw-mark sum
     would have handed s2 a pass on the strength of one big final paper)
```

**Also new:** absent students are excluded rather than scored zero. An absence is
missing evidence, not evidence of failure, and zeroing it drags cohort figures
down in a way you cannot defend.

---

## 3. Two-tier attainment

The original model had one tier: did this student attain this CO. Nothing
recorded whether the **course offering delivered** the CO, which is the number
CQI actually runs on.

- `CoAttainment` — per student, unchanged in spirit, now stores `attained` and `policyVersion`
- `CourseCoAttainment` — **new**, per course offering: how many of the assessed students cleared tier 1
- `PoAttainment` — per student, `courseId` now nullable so a PO can roll up across courses
- `CohortPoAttainment` — **new**, per batch per PO, which is what s.5.2.5 ("students attain all POs by graduation") is actually asking for

`CourseCoAttainment` also carries `coverageWarning`, set when fewer than 80% of
enrolled students were assessed against the CO. A CO attained by three of three
assessed students out of forty enrolled is not a CO that survives a visit.

---

## 4. New tables

| Area | Tables | Criterion |
|---|---|---|
| Framework vocabulary | `AccreditationFramework`, `FrameworkOutcome`, `KnowledgeProfile`, `ComplexAttribute`, `ProgramSpecificCriteria`, `Sdg` | s.5.2, s.5.3.6 |
| PEO layer | `Peo`, `PeoPoMap` | s.5.1 |
| Surveys | `Survey`, `SurveyQuestion`, `SurveyResponse`, `SurveyAnswer` | s.5.1.3, s.5.4.1, s.5.5 |
| Curriculum mapping | `CourseOutcomeWk`, `CourseComplexAttr`, `CourseSdg`, `AssessmentComplexAttr`, `AssessmentSdg` | s.5.3.6 |
| Evidence | `Evidence` | s.5.2.3 |
| CQI | `CqiAction` | s.5.5 |
| Policy | `ThresholdPolicy` (replaces `AttainmentThreshold`) | s.5.0 |
| Advising | `StudentAdvisor` | s.5.6.3 |

The framework layer is the one worth arguing about. Putting PO/WK/WP/EA in
tables rather than in the seed means BAETE v4 is a row insert and a migration
path, not another rewrite. Given that v3 landed in July 2025 and v2.1 died in
June 2026, that will pay for itself.

WP and EA tag at the **assessment** level, not just the course level, because an
evaluator asks which specific piece of coursework carries WP3. A course-level tag
cannot answer that.

---

## 5. Referential integrity

`Enrolment.studentId`, `Mark.studentId`, `CoAttainment.studentId` and
`PoAttainment.studentId` were bare `String` columns with no foreign key. Deleting
a user left marks and attainment rows pointing at nothing, and nothing in the
database stopped it. All four are real relations now.

This makes the migration destructive if orphans already exist. Check first:

```sql
SELECT COUNT(*) FROM "Mark" m
  LEFT JOIN "User" u ON u.id = m."studentId" WHERE u.id IS NULL;
```

Same shape for `Enrolment`, `CoAttainment`, `PoAttainment`. Clean the orphans
before applying, or the FK creation fails.

---

## 6. Credentials

`User.mustChangePassword` defaults to true. The original README publishes admin
and faculty passwords as `1234` in a public repo, and students authenticate with
their roll number as their password. That is fine for a demo in front of judges
and not fine once a department puts real marks in it, because roll numbers are
semi-public at BUP. Force the change on first login before handover, and take the
credentials table out of the public README.

`Evidence.retainUntil` exists for the same reason: script samples are student
personal data, and "we kept every answer script forever because an accreditation
body might want one" is not a retention policy.

---

## 7. Order of work

1. `node prisma/seed-framework.js` — framework vocabulary, safe to re-run
2. Create the program, attach `frameworkId` and pick a `ProgramSpecificCriteria`
3. Write `ThresholdPolicy` v1 **with the rationale text filled in**
4. Re-do the CO-PO matrix against the v3 PO codes (see s.1, this cannot be automated)
5. Map COs to WK, then tag assessments with WP/EA and SDGs
6. Backfill PEOs and their PO mapping
7. Evidence uploads and surveys last

Steps 1 to 3 are a day. Step 4 is the one that needs the course teachers in a
room, and it is the step that decides whether any number the system produces
means anything.

---

## Open question

Which program-specific criteria does ICE map to? ACC-MAN-03 v3.0 does not list
Information and Communication Engineering, and s.6.12 says an unlisted program is
evaluated against the closest listed criteria. Both are seeded:

- **§6.5 CSE** — discrete maths, data structures, algorithms and complexity, digital logic, computer organisation, operating systems, networking
- **§6.6 EEE/ECE** — differential equations, linear algebra, complex variables, plus communication theory and systems, plus telecommunication network design and operation for programmes carrying "communication" in the title

ICE carries Communication in the title, which points at §6.6, but the curriculum
may look more like §6.5. The department has to decide and record it, because it
drives the whole course-to-WK matrix. Ask the OBE coordinator before step 5.
