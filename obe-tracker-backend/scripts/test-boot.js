// Boots the real Express app with @prisma/client swapped for a stub, so we
// can exercise routing + middleware + controller wiring without a live DB
// (this sandbox cannot reach one). Not a data-correctness test, a wiring
// test: does every route resolve to a real exported function, does auth
// actually gate what it should.
const Module = require('module');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const http = require('http');

process.env.JWT_SECRET = 'test-secret';
process.env.JWT_EXPIRES_IN = '1h';

// a stub model whose every method resolves to a benign value
const model = new Proxy({}, {
  get: (_t, method) => async () => {
    if (method === 'findMany') return [];
    if (method === 'findFirst') return null;
    if (method === 'findUnique') return null;
    if (method === 'count') return 0;
    if (method === '$queryRaw') return [{ '?column?': 1 }];
    return {};
  },
});
const prismaStub = new Proxy({
  $transaction: async (ops) => (Array.isArray(ops) ? Promise.all(ops) : ops(prismaStub)),
  $queryRaw: async () => [{ '?column?': 1 }],
  $disconnect: async () => {},
}, {
  get: (target, prop) => (prop in target ? target[prop] : model),
});

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@prisma/client') return { PrismaClient: function () { return prismaStub; } };
  return origLoad.apply(this, arguments);
};

const app = require('../src/app');
const server = http.createServer(app).listen(0);
const base = () => `http://127.0.0.1:${server.address().port}`;

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(base() + path);
    const r = http.request({
      method, hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    }, (res) => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: safe(b) })); });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const safe = (s) => { try { return JSON.parse(s); } catch { return s; } };
const tokenFor = (role, institutionId = 'inst1') =>
  jwt.sign({ userId: 'u1', role, institutionId, jti: crypto.randomUUID() }, process.env.JWT_SECRET, { expiresIn: '1h' });

(async () => {
  let pass = 0, fail = 0;
  const check = (n, c) => { c ? pass++ : fail++; console.log(`${c ? 'ok  ' : 'FAIL'}  ${n}`); };
  try {
    const h = await req('GET', '/api/v1/health');
    check('health 200', h.status === 200 && h.body.status === 'ok');

    const noauth = await req('GET', '/api/v1/admin/batches');
    check('admin route rejects missing token (401)', noauth.status === 401);

    const adminToken = tokenFor('ADMIN');
    const facultyToken = tokenFor('FACULTY');
    const studentToken = tokenFor('STUDENT');

    // ── every renamed/new admin route resolves to a real function, not 404/500 from a bad require ──
    const adminRoutes = [
      ['GET', '/api/v1/admin/batches'],
      ['GET', '/api/v1/admin/academic-sessions'],
      ['GET', '/api/v1/admin/courses'],
      ['GET', '/api/v1/admin/course-assignments'],
      ['GET', '/api/v1/admin/users?role=FACULTY'],
      ['GET', '/api/v1/admin/dashboard'],
      ['GET', '/api/v1/admin/enrolments?courseId=c1'],
    ];
    for (const [method, path] of adminRoutes) {
      const r = await req(method, path, null, adminToken);
      check(`admin ${method} ${path} resolves (got ${r.status})`, r.status !== 404 && r.status < 500);
    }

    // POST/PUT/DELETE routes with a stubbed DB: these will mostly fail on
    // missing related rows (stub returns null/{}), which is fine - the
    // point is confirming the route dispatches to real code, not a 404
    // (route doesn't exist) or a raw 500 from requiring an undefined
    // controller function (which Express throws on registration, before
    // any request even happens - so those would have already crashed the
    // require('../src/app') line above).
    const created = await req('POST', '/api/v1/admin/academic-sessions', { term: 'JAN_JUN', year: 2027 }, adminToken);
    check(`create academic session dispatches (got ${created.status})`, created.status !== 404);

    const courseAssign = await req('POST', '/api/v1/admin/course-assignments', { courseId: 'c1', facultyId: 'f1', academicSessionId: 'as1' }, adminToken);
    check(`create course assignment dispatches (got ${courseAssign.status})`, courseAssign.status !== 404);

    const enrol = await req('POST', '/api/v1/admin/enrolments', { courseId: 'c1', studentIds: ['s1'] }, adminToken);
    check('enrolStudents requires academicSessionId (400)', enrol.status === 400 && /academicSessionId/.test(JSON.stringify(enrol.body)));

    // ── role gating still works ──
    const facultyBlocked = await req('GET', '/api/v1/admin/batches', null, facultyToken);
    check('faculty blocked from admin routes (403)', facultyBlocked.status === 403);

    const facultyCourses = await req('GET', '/api/v1/faculty/courses?academicSessionId=as1', null, facultyToken);
    check('faculty my-courses with session filter resolves (200)', facultyCourses.status === 200);

    const studentCourses = await req('GET', '/api/v1/student/courses', null, studentToken);
    check('student courses resolves (200)', studentCourses.status === 200);

    const studentBlockedFromAdmin = await req('GET', '/api/v1/admin/batches', null, studentToken);
    check('student blocked from admin routes (403)', studentBlockedFromAdmin.status === 403);
  } catch (e) {
    console.error('threw:', e.message, e.stack); fail++;
  } finally {
    server.close();
    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
})();
