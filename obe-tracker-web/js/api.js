// Same origin. nginx serves this frontend and proxies /api/ to the Node process
// on 127.0.0.1:3000, so a relative path is correct everywhere and there is no
// cross-origin request to configure. Hardcoding a deployment URL here meant the
// fix had to be re-applied by hand after every git pull on the server.
const API_BASE = '/api/v1';

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
      if (!res.ok) {
        // Keep the whole payload on the error. Several endpoints return
        // structured detail alongside the message (which marks a CO change
        // would discard, which departments block a delete), and throwing only
        // the string meant callers could never act on it.
        const err = new Error(data.error || data.message || `HTTP ${res.status}`);
        err.status = res.status;
        err.body = data;
        throw err;
      }
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
  deleteDepartment(id)                { return this.delete('/admin/departments/' + id); },

  // Curriculum versions
  getCurriculumVersions(programId)    { return this.get(`/admin/programs/${programId}/curriculum-versions`); },
  createCurriculumVersion(programId, d) { return this.post(`/admin/programs/${programId}/curriculum-versions`, d); },
  updateCurriculumVersion(id, d)      { return this.put('/admin/curriculum-versions/' + id, d); },
  deleteCurriculumVersion(id)         { return this.delete('/admin/curriculum-versions/' + id); },
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
  updateAssessment(courseId, id, d)   { return this.put('/faculty/courses/' + courseId + '/assessments/' + id, d); },
  deleteAssessment(courseId, id)      { return this.delete('/faculty/courses/' + courseId + '/assessments/' + id); },
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
