# OBE Tracker — Backend API

**BUP CO–PO Mapping & Attainment Tracking System**  
Node.js/Express REST API · PostgreSQL · Prisma ORM

---

## Quick Start

### 1. Prerequisites
- Node.js v20 LTS+
- PostgreSQL v15+

### 2. Install & Configure
```bash
npm install
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, SMTP credentials
```

### 3. Database Setup
```bash
npm run db:generate    # generate Prisma client
npm run db:migrate     # run migrations (creates tables)
npm run db:seed        # seed with BUP institution + demo users
```

### 4. Run
```bash
npm run dev    # development with nodemon
npm start      # production
```

---

## Demo Credentials (after seed)

| Role    | Email                    | Password      |
|---------|--------------------------|---------------|
| Admin   | admin@bup.edu.bd         | Admin@1234    |
| Faculty | faculty@bup.edu.bd       | Faculty@1234  |
| Student | student@bup.edu.bd       | Student@1234  |

---

## API Reference

Base URL: `http://localhost:3000/api/v1`

All protected routes require: `Authorization: Bearer <JWT>`

### Auth
| Method | Endpoint                    | Description              |
|--------|-----------------------------|--------------------------|
| POST   | `/auth/login`               | Login (all roles)        |
| POST   | `/auth/logout`              | Invalidate token         |
| POST   | `/auth/forgot-password`     | Request OTP              |
| POST   | `/auth/reset-password`      | Reset with OTP           |

### Admin
| Method | Endpoint                              | Description                  |
|--------|---------------------------------------|------------------------------|
| GET    | `/admin/dashboard`                    | Institution stats            |
| CRUD   | `/admin/departments`                  | Department management        |
| CRUD   | `/admin/programs`                     | Program management           |
| GET    | `/admin/programs/:id/outcomes`        | List POs                     |
| POST   | `/admin/programs/:id/outcomes`        | Create PO                    |
| CRUD   | `/admin/sessions`                     | Session management           |
| CRUD   | `/admin/courses`                      | Course management            |
| PUT    | `/admin/courses/:id/faculty`          | Assign faculty to course     |
| CRUD   | `/admin/users`                        | User management              |
| GET/PUT| `/admin/thresholds`                   | Attainment thresholds        |

### Faculty
| Method | Endpoint                                    | Description              |
|--------|---------------------------------------------|--------------------------|
| CRUD   | `/faculty/courses/:courseId/outcomes`       | CO management            |
| GET    | `/faculty/courses/:courseId/mapping`        | Get CO-PO matrix         |
| POST   | `/faculty/courses/:courseId/mapping`        | Save CO-PO matrix        |
| CRUD   | `/faculty/courses/:courseId/assessments`    | Assessment management    |
| GET    | `/faculty/assessments/:id/marks`            | Get marks roster         |
| POST   | `/faculty/assessments/:id/marks`            | Save marks (triggers attainment recompute) |
| GET    | `/faculty/courses/:courseId/attainment`     | View CO/PO attainment    |

### Student
| Method | Endpoint                                  | Description              |
|--------|-------------------------------------------|--------------------------|
| GET    | `/student/courses`                        | My enrolled courses      |
| GET    | `/student/courses/:courseId/marks`        | My marks                 |
| GET    | `/student/courses/:courseId/attainment`   | My CO/PO attainment      |
| GET    | `/student/program-attainment`             | My overall PO summary    |

### Reports
| Method | Endpoint                           | Description                  |
|--------|------------------------------------|------------------------------|
| POST   | `/reports/course/:courseId`        | Generate course report       |
| POST   | `/reports/transcript`              | Generate student transcript  |
| GET    | `/reports/:reportId/download`      | Download generated report    |

### Bulk Operations
| Method | Endpoint                               | Description                    |
|--------|----------------------------------------|--------------------------------|
| POST   | `/bulk/students`                       | Bulk import students (xlsx)    |
| POST   | `/bulk/marks/:assessmentId`            | Bulk import marks (xlsx)       |
| GET    | `/bulk/templates/students`             | Download student import template |
| GET    | `/bulk/templates/marks/:assessmentId`  | Download marks template        |

---

## Architecture

```
src/
├── app.js                  # Express app setup
├── server.js               # Entry point
├── prisma.js               # Prisma singleton
├── controllers/
│   ├── auth.controller.js   # Login, OTP, logout
│   ├── admin.controller.js  # Institution CRUD, user management
│   ├── faculty.controller.js # CO/PO/Assessments/Marks + attainment engine
│   ├── student.controller.js # Read-only student views
│   ├── report.controller.js  # PDF/CSV generation
│   └── bulk.controller.js    # Excel/CSV bulk imports
├── middleware/
│   ├── auth.js              # JWT authenticate + authorize
│   └── errorHandler.js      # Global error handler
├── routes/
│   ├── auth.routes.js
│   ├── admin.routes.js
│   ├── faculty.routes.js
│   ├── student.routes.js
│   ├── report.routes.js
│   └── bulk.routes.js
└── utils/
    ├── jwt.js               # Token signing
    ├── mailer.js            # SMTP OTP delivery
    └── attainment.js        # Level/weight helpers

prisma/
├── schema.prisma            # Full data model (28 models)
└── seed.js                  # Demo seed data
```

---

## Attainment Calculation

**CO Attainment (per student, per CO):**
```
CO% = Σ(markObtained/totalMarks × 100 × assessmentWeight) / Σ(assessmentWeight)
      [across assessments mapped to that CO]
```

**PO Attainment (per student, per PO, per course):**
```
PO% = Σ(CO% × correlationWeight) / Σ(correlationWeight)
      [across COs mapped to that PO; weights: WEAK=1, MODERATE=2, STRONG=3]
```

**Level mapping (configurable):**
- L3: ≥ 70%
- L2: 60–69%
- L1: 50–59%
- L0: < 50%

Recomputed automatically on: marks save, mapping change, threshold update.

---

## Key Design Decisions (per SRS)

- **Multi-tenant ready**: every entity carries `institutionId`
- **Soft deletes**: `deletedAt` / `isActive` throughout, never physical row removal
- **Matrix versioning**: CO-PO mapping stored with version number for reproducibility
- **Frozen thresholds**: session closure snapshots thresholds into `frozenThresholds` JSON
- **Audit log**: every mark change → `MarkAuditLog` with before/after values
- **Password policy**: ≥8 chars, 1 letter, 1 digit; bcrypt cost ≥10
- **OTP**: 6-digit, 10-min expiry, single-use
- **Rate limiting**: 5 attempts / 15min on auth + reset endpoints
- **JWT blacklist**: logout invalidates token until natural expiry
