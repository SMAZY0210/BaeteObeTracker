// Use Vercel backend in production, localhost for local dev
const API_BASE = (window.location.hostname === 'localhost' || window.location.protocol === 'file:')
  ? 'http://localhost:3000/api/v1'
  : 'https://obe-tracker.vercel.app/api/v1';

const Api = {
  _token: null,

  setToken(t) { this._token = t; localStorage.setItem('obe_token', t); },
  loadToken()  { this._token = localStorage.getItem('obe_token'); },
  clearToken() { this._token = null; localStorage.removeItem('obe_token'); localStorage.removeItem('obe_user'); },

  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this._token) headers['Authorization'] = 'Bearer ' + this._token;
    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    try {
      const res = await fetch(API_BASE + path, opts);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
      return data.data;
    } catch (e) {
      if (e.message === 'Failed to fetch') throw new Error('Cannot reach server. Is the backend running?');
      throw e;
    }
  },

  get(path, params)    { return this.request('GET', path + (params ? '?' + new URLSearchParams(params) : '')); },
  post(path, body)     { return this.request('POST', path, body); },
  put(path, body)      { return this.request('PUT', path, body); },
  delete(path)         { return this.request('DELETE', path); },

  // Auth
  login(email, password)              { return this.post('/auth/login', { email, password }); },
  logout()                            { return this.post('/auth/logout'); },
  forgotPassword(email)               { return this.post('/auth/forgot-password', { email }); },
  resetPassword(email, otp, newPassword) { return this.post('/auth/reset-password', { email, otp, newPassword }); },

  // Admin
  getDashboard()                      { return this.get('/admin/dashboard'); },
  getFaculties()                      { return this.get('/admin/faculties'); },
  createFaculty(d)                    { return this.post('/admin/faculties', d); },
  updateFaculty(id, d)                { return this.put('/admin/faculties/' + id, d); },
  deleteFaculty(id)                   { return this.delete('/admin/faculties/' + id); },
  getDepartments()                    { return this.get('/admin/departments'); },
  createDepartment(d)                 { return this.post('/admin/departments', d); },
  updateDepartment(id, d)             { return this.put('/admin/departments/' + id, d); },
  getPrograms()                       { return this.get('/admin/programs'); },
  createProgram(d)                    { return this.post('/admin/programs', d); },
  getSessions()                       { return this.get('/admin/sessions'); },
  createSession(d)                    { return this.post('/admin/sessions', d); },
  updateSession(id, d)                { return this.put('/admin/sessions/' + id, d); },
  deleteSession(id)                   { return this.delete('/admin/sessions/' + id); },
  getCourses(filters)                 { return this.get('/admin/courses', filters); },
  createCourse(d)                     { return this.post('/admin/courses', d); },
  deleteCourse(id)                    { return this.delete('/admin/courses/' + id); },
  updateCourse(id, d)                 { return this.put('/admin/courses/' + id, d); },
  assignFaculty(courseId, facultyIds) { return this.put('/admin/courses/' + courseId + '/faculty', { facultyIds }); },
  getUsers(filters)                   { return this.get('/admin/users', filters); },
  createUser(d)                       { return this.post('/admin/users', d); },
  updateUser(id, d)                   { return this.put('/admin/users/' + id, d); },
  getEnrolments(courseId)             { return this.get('/admin/enrolments?courseId=' + courseId); },
  enrolStudents(d)                    { return this.post('/admin/enrolments', d); },
  removeEnrolment(id)                 { return this.delete('/admin/enrolments/' + id); },
  getThresholds()                     { return this.get('/admin/thresholds'); },
  upsertThresholds(d)                 { return this.put('/admin/thresholds', d); },
  getProgramOutcomes(programId)       { return this.get('/admin/programs/' + programId + '/outcomes'); },
  getAttainmentReport(filters)        { return this.get('/admin/attainment-report', filters); },
  bulkCreateUsers(users, sessionId)   { return this.post('/admin/users/bulk', { users, sessionId }); },
  createProgramOutcome(programId, d)  { return this.post('/admin/programs/' + programId + '/outcomes', d); },
  updateProgramOutcome(id, d)         { return this.put('/admin/outcomes/' + id, d); },
  deleteProgramOutcome(id)            { return this.delete('/admin/outcomes/' + id); },

  // Faculty
  getMyCourses()                      { return this.get('/faculty/courses'); },
  getCourseOutcomes(courseId)         { return this.get('/faculty/courses/' + courseId + '/outcomes'); },
  createCO(courseId, d)               { return this.post('/faculty/courses/' + courseId + '/outcomes', d); },
  deleteCO(courseId, coId)            { return this.delete('/faculty/courses/' + courseId + '/outcomes/' + coId); },
  updateCO(courseId, coId, d)         { return this.put('/faculty/courses/' + courseId + '/outcomes/' + coId, d); },
  getMapping(courseId)                { return this.get('/faculty/courses/' + courseId + '/mapping'); },
  saveMapping(courseId, mappings)     { return this.post('/faculty/courses/' + courseId + '/mapping', { mappings }); },
  getAssessments(courseId)            { return this.get('/faculty/courses/' + courseId + '/assessments'); },
  createAssessment(courseId, d)       { return this.post('/faculty/courses/' + courseId + '/assessments', d); },
  getMarks(assessmentId)              { return this.get('/faculty/assessments/' + assessmentId + '/marks'); },
  saveMarks(assessmentId, marks)      { return this.post('/faculty/assessments/' + assessmentId + '/marks', { marks }); },
  getCourseStudents(courseId)          { return this.get('/faculty/courses/' + courseId + '/students'); },
  getCourseAttainment(courseId)       { return this.get('/faculty/courses/' + courseId + '/attainment'); },
  getStudentAttainment(courseId, studentId) { return this.get('/faculty/courses/' + courseId + '/students/' + studentId + '/attainment'); },
  setAttainmentMark(courseId, assessmentId, mark) { return this.put('/faculty/courses/' + courseId + '/assessments/' + assessmentId + '/attainment-mark', { attainmentMark: mark }); },
  getStudentAttainmentAdmin(studentId, courseId) { return this.get('/admin/students/' + studentId + '/attainment', courseId ? { courseId } : {}); },

  // Student
  getEnrolledCourses()                { return this.get('/student/courses'); },
  getMyMarks(courseId)                { return this.get('/student/courses/' + courseId + '/marks'); },
  getMyAttainment(courseId)           { return this.get('/student/courses/' + courseId + '/attainment'); },
  getProgramAttainment()              { return this.get('/student/program-attainment'); },
};
