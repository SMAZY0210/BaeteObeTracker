const AdminView={
  // ── Dashboard ──────────────────────────────────────────────
  async dash(){
    const vr=document.getElementById('view-root');
    vr.innerHTML=`<div class="page-hd"><div class="page-hd-left"><h1>Dashboard</h1><div class="hd-sub">Bangladesh University of Professionals - Institution Overview</div></div></div>
      <div class="stats-row" id="dash-stats">${loading()}</div>`;
    try{
      const s=await Api.getDashboard();
      document.getElementById('dash-stats').innerHTML=[
        ['si-green','tree',s.deptCount,'Departments'],
        ['si-blue','book',s.programCount,'Programs'],
        ['si-amber','grid',s.courseCount,'Courses'],
        ['si-red','users',s.userCount,'Active Users'],
      ].map(([sc,ic,val,lbl])=>`<div class="stat-card"><div class="stat-icon-wrap ${sc}">${ico(ic,18)}</div><div class="stat-val">${val}</div><div class="stat-lbl">${lbl}</div></div>`).join('');
    }catch(e){document.getElementById('dash-stats').innerHTML=`<div class="alert alert-error"><span class="alert-icon">⚠</span>${e.message}</div>`}
  },

  // ── Structure ──────────────────────────────────────────────
  async structure(){
    document.getElementById('view-root').innerHTML=`
      <div class="page-hd"><div class="page-hd-left"><h1>Institutional Structure</h1><div class="hd-sub">Faculties · Departments · Programs · Sessions</div></div></div>
      <div id="struct">
        <div class="tab-bar"><button class="tab-btn active" data-tab="tf">Faculties</button><button class="tab-btn" data-tab="td">Departments</button><button class="tab-btn" data-tab="tp">Programs</button><button class="tab-btn" data-tab="ts">Sessions</button></div>
        <div class="tab-pane active" id="tf"></div><div class="tab-pane" id="td"></div><div class="tab-pane" id="tp"></div><div class="tab-pane" id="ts"></div>
      </div>`;
    initTabs('struct');this._faculties();this._depts();this._progs();this._sessions();
  },

  async _faculties(){
    const el=document.getElementById('tf');
    el.innerHTML=`<div class="flex-between mb3"><span class="sec-title">Faculties</span><button class="btn btn-primary btn-sm" onclick="AdminView._addFaculty()">${ico('plus')} Add</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Departments</th><th>Status</th><th class="td-r">Actions</th></tr></thead><tbody id="ftb">${tdLoad(5)}</tbody></table></div>`;
    try{
      const l=await Api.getFaculties();
      document.getElementById('ftb').innerHTML=l.length?l.map(f=>`<tr>
        <td><span class="code-badge">${f.code}</span></td><td class="fw7">${f.name}</td>
        <td class="text-muted">${f._count?.departments??0}</td>
        <td><span class="badge ${f.isActive?'bg-green':'bg-gray'}">${f.isActive?'Active':'Inactive'}</span></td>
        <td class="td-r"><button class="btn btn-secondary btn-xs" onclick="AdminView._editFaculty('${f.id}','${f.name.replace(/'/g,"\\'")}','${f.code}')">${ico('edit',13)} Edit</button></td>
      </tr>`).join(''):tdEmpty('No faculties yet',5);
    }catch(e){document.getElementById('ftb').innerHTML=tdEmpty(e.message,5)}
  },
  _addFaculty(){showModal('Add Faculty',`<div class="form-row fr2"><div class="fg"><label>Name</label><input id="mf-name" placeholder="e.g. Faculty of Science and Technology"></div><div class="fg"><label>Code</label><input id="mf-code" placeholder="e.g. FST" style="text-transform:uppercase"></div></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="AdminView._saveFaculty()">${ico('save')} Save</button>`)},
  async _saveFaculty(){const name=document.getElementById('mf-name').value.trim(),code=document.getElementById('mf-code').value.trim();if(!name||!code)return toast('Name and code required','err');
    try{await Api.createFaculty({name,code});toast('Faculty added');closeModal();this._faculties()}catch(e){toast(e.message,'err')}},
  _editFaculty(id,name,code){showModal('Edit Faculty',`<div class="form-row fr2"><div class="fg"><label>Name</label><input id="mf-name" value="${name}"></div><div class="fg"><label>Code</label><input id="mf-code" value="${code}"></div></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="AdminView._updFaculty('${id}')">${ico('save')} Save</button>`)},
  async _updFaculty(id){const name=document.getElementById('mf-name').value.trim(),code=document.getElementById('mf-code').value.trim();
    try{await Api.updateFaculty(id,{name,code});toast('Updated');closeModal();this._faculties()}catch(e){toast(e.message,'err')}},

  async _depts(){
    const el=document.getElementById('td');
    el.innerHTML=`<div class="flex-between mb3"><span class="sec-title">Departments</span><button class="btn btn-primary btn-sm" onclick="AdminView._addDept()">${ico('plus')} Add</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Faculty</th><th>Status</th><th class="td-r">Actions</th></tr></thead><tbody id="dtb">${tdLoad(5)}</tbody></table></div>`;
    try{
      const l=await Api.getDepartments();
      document.getElementById('dtb').innerHTML=l.length?l.map(d=>`<tr>
        <td><span class="code-badge">${d.code}</span></td><td class="fw7">${d.name}</td>
        <td class="text-muted">${d.faculty?.name||'-'}</td>
        <td><span class="badge ${d.isActive?'bg-green':'bg-gray'}">${d.isActive?'Active':'Inactive'}</span></td>
        <td class="td-r"><button class="btn btn-secondary btn-xs" onclick="AdminView._editDept('${d.id}','${d.name.replace(/'/g,"\\'")}','${d.code}','${d.facultyId||''}')">${ico('edit',13)} Edit</button></td>
      </tr>`).join(''):tdEmpty('No departments yet',5);
    }catch(e){document.getElementById('dtb').innerHTML=tdEmpty(e.message,5)}
  },
  _facSelect(sel){return `<div class="fg mb3"><label>Faculty</label><select id="md-faculty"><option value="">-- None --</option>${(AdminView._facCache||[]).map(f=>`<option value="${f.id}" ${f.id===sel?'selected':''}>${f.name}</option>`).join('')}</select></div>`},
  async _addDept(){
    try{ AdminView._facCache=await Api.getFaculties(); }catch(_){ AdminView._facCache=[]; }
    showModal('Add Department',`<div class="form-row fr2"><div class="fg"><label>Name</label><input id="md-name" placeholder="e.g. Information and Communication Engineering"></div><div class="fg"><label>Code</label><input id="md-code" placeholder="e.g. ICE" style="text-transform:uppercase"></div></div>${AdminView._facSelect('')}`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="AdminView._saveDept()">${ico('save')} Save</button>`)},
  async _saveDept(){const name=document.getElementById('md-name').value.trim(),code=document.getElementById('md-code').value.trim(),facultyId=document.getElementById('md-faculty')?.value||null;if(!name||!code)return toast('Name and code required','err');
    try{await Api.createDepartment({name,code,facultyId});toast('Department added');closeModal();this._depts()}catch(e){toast(e.message,'err')}},
  async _editDept(id,name,code,facultyId){
    try{ AdminView._facCache=await Api.getFaculties(); }catch(_){ AdminView._facCache=[]; }
    showModal('Edit Department',`<div class="form-row fr2"><div class="fg"><label>Name</label><input id="md-name" value="${name}"></div><div class="fg"><label>Code</label><input id="md-code" value="${code}"></div></div>${AdminView._facSelect(facultyId)}`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="AdminView._updDept('${id}')">${ico('save')} Save</button>`)},
  async _updDept(id){const name=document.getElementById('md-name').value.trim(),code=document.getElementById('md-code').value.trim(),facultyId=document.getElementById('md-faculty')?.value||null;
    try{await Api.updateDepartment(id,{name,code,facultyId});toast('Updated');closeModal();this._depts()}catch(e){toast(e.message,'err')}},

  async _progs(){
    const el=document.getElementById('tp');
    el.innerHTML=`<div class="flex-between mb3"><span class="sec-title">Programs</span><button class="btn btn-primary btn-sm" onclick="AdminView._addProg()">${ico('plus')} Add</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Department</th></tr></thead><tbody id="ptb">${tdLoad(3)}</tbody></table></div>`;
    try{const l=await Api.getPrograms();document.getElementById('ptb').innerHTML=l.length?l.map(p=>`<tr><td><span class="code-badge">${p.code}</span></td><td class="fw7">${p.name}</td><td class="text-muted">${p.department?.name||'-'}</td></tr>`).join(''):tdEmpty('No programs yet',3)}
    catch(e){document.getElementById('ptb').innerHTML=tdEmpty(e.message,3)}
  },
  async _addProg(){const d=await Api.getDepartments();showModal('Add Program',`<div class="fg mb3"><label>Department</label><select id="mp-dept">${d.map(x=>`<option value="${x.id}">${x.name}</option>`).join('')}</select></div>
    <div class="form-row fr2"><div class="fg"><label>Name</label><input id="mp-name" placeholder="e.g. B.Sc. in ICE"></div><div class="fg"><label>Code</label><input id="mp-code" placeholder="e.g. BICE"></div></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="AdminView._saveProg()">${ico('save')} Save</button>`)},
  async _saveProg(){const departmentId=document.getElementById('mp-dept').value,name=document.getElementById('mp-name').value.trim(),code=document.getElementById('mp-code').value.trim();
    if(!name||!code)return toast('Name and code required','err');
    try{await Api.createProgram({departmentId,name,code});toast('Program added');closeModal();this._progs()}catch(e){toast(e.message,'err')}},

  async _sessions(){
    const el=document.getElementById('ts');
    el.innerHTML=`<div class="flex-between mb3"><span class="sec-title">Sessions / Batches</span><button class="btn btn-primary btn-sm" onclick="AdminView._addSession()">${ico('plus')} Add</button></div>
      <div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Department</th><th>Students</th><th>Start</th><th>Status</th><th class="td-r">Actions</th></tr></thead><tbody id="stb">${tdLoad(6)}</tbody></table></div>`;
    try{
      const l=await Api.getSessions();const sc={ACTIVE:'bg-green',DRAFT:'bg-gray',CLOSED:'bg-amber',ARCHIVED:'bg-gray'};
      document.getElementById('stb').innerHTML=l.length?l.map(s=>`<tr><td class="fw7">${s.name}</td>
        <td class="text-muted">${s.department?.name||'<span style="color:var(--text3)">Unassigned</span>'}</td>
        <td class="text-muted">${s._count?.students??0}</td>
        <td class="text-muted">${new Date(s.startDate).getFullYear()}</td>
        <td><span class="badge ${sc[s.status]||'bg-gray'}">${s.status}</span></td>
        <td class="td-r" style="white-space:nowrap"><button class="btn btn-secondary btn-xs" style="margin-right:4px" onclick="AdminView._editSession('${s.id}','${s.name.replace(/'/g,"\\'")}','${s.status}','${s.departmentId||''}')">${ico('edit',13)} Edit</button>
        <button class="icon-btn danger" onclick="AdminView._delSession('${s.id}','${s.name.replace(/'/g,"\\'")}',${s._count?.students??0})">${ico('trash',13)}</button></td></tr>`).join(''):tdEmpty('No sessions yet',6);
    }catch(e){document.getElementById('stb').innerHTML=tdEmpty(e.message,6)}
  },
  _sessDeptSelect(sel){return `<div class="fg"><label>Department</label><select id="ms-dept"><option value="">-- Unassigned --</option>${(AdminView._sDeptCache||[]).map(d=>`<option value="${d.id}" ${d.id===sel?'selected':''}>${d.name}</option>`).join('')}</select></div>`},
  async _addSession(){
    try{ AdminView._sDeptCache=await Api.getDepartments(); }catch(_){ AdminView._sDeptCache=[]; }
    showModal('Add Session',`<div class="form-row fr2"><div class="fg"><label>Name</label><input id="ms-name" placeholder="e.g. ICE 2026"></div><div class="fg"><label>Start Date</label><input type="date" id="ms-date"></div></div>${AdminView._sessDeptSelect('')}`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="AdminView._saveSession()">${ico('save')} Save</button>`)},
  async _saveSession(){const name=document.getElementById('ms-name').value.trim(),startDate=document.getElementById('ms-date').value,departmentId=document.getElementById('ms-dept')?.value||null;if(!name||!startDate)return toast('Name and date required','err');
    try{await Api.createSession({name,startDate,departmentId});toast('Session added');closeModal();this._sessions()}catch(e){toast(e.message,'err')}},
  async _editSession(id,name,cur,deptId){
    try{ AdminView._sDeptCache=await Api.getDepartments(); }catch(_){ AdminView._sDeptCache=[]; }
    showModal(`Edit - ${name}`,`${AdminView._sessDeptSelect(deptId)}<div class="fg mt2"><label>Status</label><select id="ms-status">${['DRAFT','ACTIVE','CLOSED','ARCHIVED'].map(s=>`<option value="${s}" ${s===cur?'selected':''}>${s}</option>`).join('')}</select></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="AdminView._saveSessionEdit('${id}')">${ico('save')} Save</button>`)},
  async _saveSessionEdit(id){const status=document.getElementById('ms-status').value,departmentId=document.getElementById('ms-dept')?.value||null;try{await Api.updateSession(id,{status,departmentId});toast('Updated');closeModal();this._sessions()}catch(e){toast(e.message,'err')}},
  async _delSession(id,name,count){if(count>0)return toast(`Cannot delete "${name}": ${count} student(s) still in this batch`,'err');if(!confirm(`Delete session "${name}"?`))return;
    try{await Api.deleteSession(id);toast('Session deleted');this._sessions()}catch(e){toast(e.message,'err')}},

  // ── Courses ────────────────────────────────────────────────
  async courses(){
    document.getElementById('view-root').innerHTML=`
      <div class="page-hd"><div class="page-hd-left"><h1>Courses</h1><div class="hd-sub">All courses across sessions and programs</div></div>
        <div class="page-hd-actions"><button class="btn btn-primary" onclick="AdminView._addCourse()">${ico('plus')} Add Course</button></div>
      </div>
      <div class="filter-bar">
        <div class="search-wrap"><input id="cq" placeholder="Search by code or name…" oninput="AdminView._filterC()"></div>
        <select id="cf-sess" onchange="AdminView._loadC()"><option value="">All Sessions</option></select>
      </div>
      <div class="tbl-wrap"><table><thead><tr><th>Code</th><th>Course Name</th><th>Program</th><th>Batch</th><th style="text-align:center">Cr.</th><th>Faculty</th><th class="td-r" style="min-width:180px">Actions</th></tr></thead>
        <tbody id="ctb">${tdLoad(7)}</tbody></table></div>`;
    const sess=await Api.getSessions();sess.forEach(s=>{const o=document.createElement('option');o.value=s.id;o.textContent=s.name;document.getElementById('cf-sess').appendChild(o)});
    this._loadC();
  },
  async _loadC(){
    const sid=document.getElementById('cf-sess')?.value;document.getElementById('ctb').innerHTML=tdLoad(7);
    try{const l=await Api.getCourses(sid?{sessionId:sid}:{});this._cl=l;this._renderC(l)}catch(e){document.getElementById('ctb').innerHTML=tdEmpty(e.message,7)}
  },
  _filterC(){const q=document.getElementById('cq').value.toLowerCase();this._renderC((this._cl||[]).filter(c=>c.name.toLowerCase().includes(q)||c.code.toLowerCase().includes(q)))},
  _renderC(list){
    document.getElementById('ctb').innerHTML=list.length?list.map(c=>{
      const fac=(c.assignments||[]).map(a=>`<span class="tag">${a.faculty.firstName} ${a.faculty.lastName}</span>`).join(' ')||`<span class="tag tag-warn">⚠ Unassigned</span>`;
      const sn=c.name.replace(/'/g,'&#39;');
      return`<tr>
        <td><span class="code-badge">${c.code}</span></td>
        <td class="fw7">${c.name}</td>
        <td><span class="badge bg-gray">${c.program?.code||'-'}</span></td>
        <td class="text-muted">${c.session?.name||'-'}</td>
        <td style="text-align:center;color:var(--text3)">${c.creditHours}</td>
        <td><div style="display:flex;flex-wrap:wrap;gap:4px">${fac}</div></td>
        <td class="td-r">
          <div style="display:inline-flex;gap:6px">
            <button class="btn btn-secondary btn-xs" onclick="AdminView._assignFac('${c.id}','${c.code}')">${ico('add_user',13)} Assign</button>
            <button class="btn btn-secondary btn-xs" onclick="AdminView._openEnrol('${c.id}','${c.code} - ${c.name.replace(/'/g,"&#39;")}')">${ico('users',13)} Enrol</button>
            <button class="icon-btn danger" onclick="AdminView._delC('${c.id}','${sn}')" title="Delete course">${ico('trash',13)}</button>
          </div>
        </td></tr>`;
    }).join(''):tdEmpty('No courses found',7);
  },
  async _addCourse(){
    const[p,s]=await Promise.all([Api.getPrograms(),Api.getSessions()]);
    showModal('Add Course',`<div class="form-row fr2 mb3"><div class="fg"><label>Program</label><select id="mco-p">${p.map(x=>`<option value="${x.id}">${x.code} - ${x.name}</option>`).join('')}</select></div>
      <div class="fg"><label>Session / Batch</label><select id="mco-s">${s.map(x=>`<option value="${x.id}">${x.name}</option>`).join('')}</select></div></div>
      <div class="form-row fr2"><div class="fg"><label>Course Name</label><input id="mco-n" placeholder="e.g. Artificial Intelligence"></div>
      <div class="fg"><label>Course Code</label><input id="mco-c" placeholder="e.g. ICE-4107"></div></div>
      <div class="fg mt2" style="max-width:120px"><label>Credit Hours</label><input id="mco-cr" type="number" value="3" min="1" max="6"></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="AdminView._saveC()">${ico('save')} Add Course</button>`)},
  async _saveC(){const d={programId:document.getElementById('mco-p').value,sessionId:document.getElementById('mco-s').value,name:document.getElementById('mco-n').value.trim(),code:document.getElementById('mco-c').value.trim(),creditHours:parseInt(document.getElementById('mco-cr').value)||3};
    if(!d.name||!d.code)return toast('Name and code required','err');
    try{await Api.createCourse(d);toast('Course added');closeModal();this._loadC()}catch(e){toast(e.message,'err')}},
  async _delC(id,name){if(!confirm(`Delete "${name}"?`))return;try{await Api.deleteCourse(id);toast('Deleted');this._loadC()}catch(e){toast(e.message,'err')}},
  async _openEnrol(courseId, courseLabel) {
    showModal(`Enrol Students — ${courseLabel}`, `
      <div style="border-bottom:1px solid var(--border);margin-bottom:16px;display:flex;gap:0">
        <button class="tab-btn active" id="en-tab-batch" style="border-radius:0" onclick="AdminView._enrolTab('batch')">By Batch</button>
        <button class="tab-btn" id="en-tab-indiv" style="border-radius:0" onclick="AdminView._enrolTab('indiv')">Individual</button>
      </div>

      <!-- Batch pane -->
      <div id="en-pane-batch">
        <div class="form-row fr2 mb3">
          <div class="fg"><label>Batch / Session</label>
            <select id="en-batch" style="width:100%">
              <option value="">Select Batch</option>
            </select>
          </div>
          <div class="fg"><label>Section</label>
            <select id="en-section" style="width:100%">
              <option value="">All Sections</option>
              <option value="A">Section A</option>
              <option value="B">Section B</option>
            </select>
          </div>
        </div>
        <button class="btn btn-primary" style="width:100%" onclick="AdminView._enrolBatchModal('${courseId}')">Enrol Batch</button>
      </div>

      <!-- Individual pane -->
      <div id="en-pane-indiv" style="display:none">
        <div class="fg mb3">
          <input id="en-search" placeholder="Search name or student ID..." oninput="AdminView._enrolSearchModal()" style="width:100%">
        </div>
        <div id="en-search-results" style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r);margin-bottom:12px">
          <div class="text-muted text-sm" style="padding:12px">Type to search</div>
        </div>
        <button class="btn btn-primary" style="width:100%" onclick="AdminView._enrolSelectedModal('${courseId}')">Enrol Selected</button>
      </div>

      <div id="en-modal-result" class="mt3"></div>

      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">
        <div class="flex-between mb2">
          <span class="sec-title" style="font-size:13px">Currently Enrolled</span>
          <span id="en-modal-count" class="badge bg-blue">...</span>
        </div>
        <div style="max-height:180px;overflow-y:auto">
          <table style="width:100%;font-size:13px;border-collapse:collapse">
            <thead><tr style="border-bottom:1px solid var(--border)">
              <th style="padding:6px 8px;text-align:left">Name</th>
              <th style="padding:6px 8px;text-align:left">ID</th>
              <th style="padding:6px 8px;text-align:left">Section</th>
              <th style="padding:6px 8px;text-align:right">Remove</th>
            </tr></thead>
            <tbody id="en-modal-enrolled">
              <tr><td colspan="4" style="padding:12px;text-align:center;color:var(--text3)">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>`, null, true);

    AdminView._enrolCourseId = courseId;
    AdminView._enrolSelectedIds = new Set();

    // Load sessions for batch dropdown
    try {
      const sessions = await Api.getSessions();
      const sel = document.getElementById('en-batch');
      if(sel) sel.innerHTML = '<option value="">Select Batch</option>' +
        sessions.map(s=>`<option value="${s.name.replace(/\D+/,'')}">${s.name}</option>`).join('');
    } catch(_) {}

    await AdminView._enrolRefreshModal();
  },

  _enrolTab(tab) {
    document.getElementById('en-pane-batch').style.display = tab==='batch' ? '' : 'none';
    document.getElementById('en-pane-indiv').style.display = tab==='indiv'  ? '' : 'none';
    document.getElementById('en-tab-batch').classList.toggle('active', tab==='batch');
    document.getElementById('en-tab-indiv').classList.toggle('active',  tab==='indiv');
  },

  async _enrolRefreshModal() {
    const courseId = AdminView._enrolCourseId;
    if(!courseId) return;
    try {
      const list = await Api.getEnrolments(courseId);
      const countEl = document.getElementById('en-modal-count');
      const tbody = document.getElementById('en-modal-enrolled');
      if(countEl) countEl.textContent = list.length + ' student' + (list.length===1?'':'s');
      if(!tbody) return;
      if(!list.length) { tbody.innerHTML='<tr><td colspan="4" style="padding:12px;text-align:center;color:var(--text3)">No students enrolled yet</td></tr>'; return; }
      tbody.innerHTML = list.map(e=>`<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:6px 8px">${e.student.firstName} ${e.student.lastName}</td>
        <td style="padding:6px 8px;font-family:monospace;font-size:12px">${e.student.institutionalId||'--'}</td>
        <td style="padding:6px 8px">${e.student.section?'Section '+e.student.section:'--'}</td>
        <td style="padding:6px 8px;text-align:right"><button class="icon-btn danger" onclick="AdminView._enrolRemoveModal('${e.id}')">${ico('trash',13)}</button></td>
      </tr>`).join('');
    } catch(e) {
      const tbody = document.getElementById('en-modal-enrolled');
      if(tbody) tbody.innerHTML=`<tr><td colspan="4" style="padding:12px;color:var(--red)">${e.message}</td></tr>`;
    }
  },

  async _enrolBatchModal(courseId) {
    const batchYear = document.getElementById('en-batch')?.value;
    const section   = document.getElementById('en-section')?.value;
    const resEl     = document.getElementById('en-modal-result');
    resEl.innerHTML = `<div class="loading-box" style="padding:8px 0;justify-content:flex-start"><div class="spin"></div> Enrolling…</div>`;
    try {
      const r = await Api.enrolStudents({ courseId, batchYear, section });
      resEl.innerHTML = `<div class="alert alert-success"><span class="alert-icon">✓</span>Enrolled ${r.enrolled} student(s). ${r.skipped} already enrolled.</div>`;
      await AdminView._enrolRefreshModal();
    } catch(e) { resEl.innerHTML=`<div class="alert alert-error"><span class="alert-icon">⚠</span>${e.message}</div>`; }
  },

  async _enrolSearchModal() {
    const q = (document.getElementById('en-search')?.value||'').trim();
    const el = document.getElementById('en-search-results');
    if(!el) return;
    if(q.length < 2) { el.innerHTML='<div class="text-muted text-sm" style="padding:12px">Type at least 2 characters</div>'; return; }
    try {
      const list = await Api.getUsers({role:'STUDENT', search:q});
      if(!list.length) { el.innerHTML='<div class="text-muted text-sm" style="padding:12px">No students found</div>'; return; }
      el.innerHTML = list.map(u=>`
        <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border)">
          <input type="checkbox" value="${u.id}" ${AdminView._enrolSelectedIds?.has(u.id)?'checked':''}
            onchange="AdminView._enrolToggleModal('${u.id}',this.checked)">
          <span class="fw7">${u.firstName} ${u.lastName}</span>
          <span class="text-muted text-sm">${u.institutionalId||u.email}</span>
        </label>`).join('');
    } catch(e) { el.innerHTML=`<div class="text-muted text-sm" style="padding:12px">${e.message}</div>`; }
  },

  _enrolToggleModal(id, checked) {
    if(!AdminView._enrolSelectedIds) AdminView._enrolSelectedIds = new Set();
    if(checked) AdminView._enrolSelectedIds.add(id);
    else AdminView._enrolSelectedIds.delete(id);
  },

  async _enrolSelectedModal(courseId) {
    const ids = [...(AdminView._enrolSelectedIds||[])];
    const resEl = document.getElementById('en-modal-result');
    if(!ids.length) return toast('Select at least one student','err');
    resEl.innerHTML = `<div class="loading-box" style="padding:8px 0;justify-content:flex-start"><div class="spin"></div> Enrolling…</div>`;
    try {
      const r = await Api.enrolStudents({ courseId, studentIds: ids });
      resEl.innerHTML = `<div class="alert alert-success"><span class="alert-icon">✓</span>Enrolled ${r.enrolled} student(s). ${r.skipped} already enrolled.</div>`;
      AdminView._enrolSelectedIds = new Set();
      const searchEl = document.getElementById('en-search');
      if(searchEl) searchEl.value='';
      const resultsEl = document.getElementById('en-search-results');
      if(resultsEl) resultsEl.innerHTML='<div class="text-muted text-sm" style="padding:12px">Type to search</div>';
      await AdminView._enrolRefreshModal();
    } catch(e) { resEl.innerHTML=`<div class="alert alert-error"><span class="alert-icon">⚠</span>${e.message}</div>`; }
  },

  async _enrolRemoveModal(id) {
    if(!confirm('Remove this student from the course?')) return;
    try {
      await Api.removeEnrolment(id);
      toast('Student removed');
      await AdminView._enrolRefreshModal();
    } catch(e) { toast(e.message,'err'); }
  },

  async _assignFac(courseId,code){
    const users=await Api.getUsers({role:'FACULTY'});
    const c=(this._cl||[]).find(x=>x.id===courseId);
    const assigned=new Set((c?.assignments||[]).map(a=>a.faculty.id));
    showModal(`Assign Faculty - ${code}`,`<div style="display:flex;flex-direction:column;gap:8px;max-height:340px;overflow-y:auto">
      ${users.map(u=>`<label style="display:flex;align-items:center;gap:12px;padding:11px 13px;border:1.5px solid ${assigned.has(u.id)?'var(--green)':'var(--border)'};border-radius:8px;cursor:pointer;background:${assigned.has(u.id)?'var(--green-xl)':'#fff'};transition:all .12s" onmouseenter="this.style.borderColor='var(--green)'" onmouseleave="this.style.borderColor='${assigned.has(u.id)?'var(--green)':'var(--border)'}'"">
        <input type="checkbox" value="${u.id}" ${assigned.has(u.id)?'checked':''} style="width:auto;accent-color:var(--green)">
        <div><div class="fw7">${u.firstName} ${u.lastName}</div><div class="text-sm text-muted">${u.email}</div></div>
      </label>`).join('')}</div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="AdminView._saveAssign('${courseId}')">${ico('save')} Save</button>`)},
  async _saveAssign(courseId){const ids=[...document.querySelectorAll('#modal-body input[type=checkbox]:checked')].map(c=>c.value);
    try{await Api.assignFaculty(courseId,ids);toast('Faculty assigned');closeModal();this._loadC()}catch(e){toast(e.message,'err')}},

  // ── Users ──────────────────────────────────────────────────
  async admins(){
    const root = document.getElementById('view-root');
    root.innerHTML=`
      <div class="page-hd">
        <div class="page-hd-left"><h1>Admins</h1><div class="hd-sub">System administrator accounts</div></div>
        <div class="page-hd-actions">
          <button class="btn btn-primary" onclick="AdminView._addUser('ADMIN')">${ico('add_user')} Add Admin</button>
        </div>
      </div>
      <div style="margin-bottom:12px">
        <div class="search-wrap"><input id="uq-admin" placeholder="Search name or email..." oninput="AdminView._filterTab('admin')" style="min-width:280px"></div>
      </div>
      <div class="tbl-wrap"><table><thead><tr>
        <th>Name</th><th>Email</th><th style="text-align:center">Active</th><th>Last Login</th><th class="td-r">Actions</th>
      </tr></thead><tbody id="utb-admin">${tdLoad(4)}</tbody></table></div>`;
    try{
      const l=await Api.getUsers({role:'ADMIN'});
      AdminView._ul_admin=l; AdminView._renderTab('admin',l);
    }catch(e){
      const el=document.getElementById('utb-admin');
      if(el) el.innerHTML=tdEmpty(e.message,4);
    }
  },

  async faculty(){
    document.getElementById('view-root').innerHTML=`
      <div class="page-hd">
        <div class="page-hd-left"><h1>Faculty</h1><div class="hd-sub">Faculty member accounts</div></div>
        <div class="page-hd-actions">
          <button class="btn btn-secondary" onclick="AdminView._bulkUpload()">${ico('plus')} Bulk Upload</button>
          <button class="btn btn-primary" onclick="AdminView._addUser('FACULTY')">${ico('add_user')} Add Faculty</button>
        </div>
      </div>
      <div style="margin-bottom:12px">
        <div class="search-wrap"><input id="uq-faculty" placeholder="Search name or email..." oninput="AdminView._filterTab('faculty')" style="min-width:280px"></div>
      </div>
      <div class="tbl-wrap"><table><thead><tr>
        <th>Name</th><th>Email</th><th style="text-align:center">Active</th><th>Last Login</th><th class="td-r">Actions</th>
      </tr></thead><tbody id="utb-faculty">${tdLoad(4)}</tbody></table></div>`;
    try{
      const l=await Api.getUsers({role:'FACULTY'});
      AdminView._ul_faculty=l; AdminView._renderTab('faculty',l);
    }catch(e){
      const el=document.getElementById('utb-faculty');
      if(el) el.innerHTML=tdEmpty(e.message,4);
    }
  },

  async students(){
    // Load departments and sessions for filter dropdowns
    let deptOptions = '<option value="">Select Department</option>';
    try {
      const [depts, sessions] = await Promise.all([Api.getDepartments(), Api.getSessions()]);
      AdminView._stuSessions = sessions;
      deptOptions += depts.map(d=>`<option value="${d.id}">${d.name}</option>`).join('');
    } catch(_) { AdminView._stuSessions = []; }

    document.getElementById('view-root').innerHTML=`
      <div class="page-hd">
        <div class="page-hd-left"><h1>Students</h1><div class="hd-sub">Student accounts</div></div>
        <div class="page-hd-actions">
          <button class="btn btn-secondary" onclick="AdminView._bulkUpload()">${ico('plus')} Bulk Upload</button>
          <button class="btn btn-primary" onclick="AdminView._addUser('STUDENT')">${ico('add_user')} Add Student</button>
        </div>
      </div>
      <div class="filter-bar" style="margin-bottom:12px">
        <div class="search-wrap" style="flex:2"><input id="uq-students" placeholder="Search name, email or ID..." oninput="AdminView._filterTab('students')"></div>
        <select id="uf-dept-s" onchange="AdminView._stuFillBatches();AdminView._loadStudents()" style="min-width:180px">
          ${deptOptions}
        </select>
        <select id="uf-batch-s" onchange="AdminView._loadStudents()" style="min-width:150px">
          <option value="">Select department first</option>
        </select>
        <select id="uf-section-s" onchange="AdminView._loadStudents()" style="min-width:120px">
          <option value="">Select Section</option>
          <option value="A">Section A</option>
          <option value="B">Section B</option>
        </select>
      </div>
      <div class="tbl-wrap"><table><thead><tr>
        <th>Name</th><th>Student ID</th><th>Batch</th><th>Section</th>
        <th style="text-align:center">Active</th><th>Last Login</th><th class="td-r">Attainment</th>
      </tr></thead><tbody id="utb-students">
        <tr><td colspan="7" class="td-load text-muted">Select a department or batch to view students.</td></tr>
      </tbody></table></div>`;
  },

  _stuFillBatches(){
    const dept=document.getElementById('uf-dept-s')?.value;
    const b=document.getElementById('uf-batch-s');
    if(!b)return;
    const ss=(AdminView._stuSessions||[]).filter(s=>s.departmentId===dept);
    b.innerHTML=dept?('<option value="">All batches in department</option>'+ss.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')):'<option value="">Select department first</option>';
  },

  async _loadStudents(){
    const el=document.getElementById('utb-students'); if(!el) return;
    const dept=document.getElementById('uf-dept-s')?.value;
    const sessionId=document.getElementById('uf-batch-s')?.value;
    const section=document.getElementById('uf-section-s')?.value;

    // Don't load until at least one filter is chosen
    if(!dept && !sessionId && !section){
      el.innerHTML='<tr><td colspan="7" class="td-load text-muted">Select a department or batch to view students.</td></tr>';
      AdminView._ul_students=[];
      return;
    }
    el.innerHTML=tdLoad(7);
    try{
      const params={role:'STUDENT'};
      if(sessionId) params.sessionId=sessionId;
      if(section) params.section=section;
      let l=await Api.getUsers(params);
      // Department chosen but no specific batch: keep students whose batch is in that department.
      if(dept && !sessionId) l=l.filter(u=>u.session?.departmentId===dept);
      AdminView._ul_students=l;
      AdminView._renderTab('students',l);
    }catch(e){if(el)el.innerHTML=tdEmpty(e.message,7);}
  },

  _filterTab(tab){
    const q=(document.getElementById('uq-'+tab)?.value||'').toLowerCase();
    const all=AdminView['_ul_'+tab]||[];
    AdminView._renderTab(tab, all.filter(u=>
      `${u.firstName} ${u.lastName} ${u.email} ${u.institutionalId||''}`.toLowerCase().includes(q)
    ));
  },

  _renderTab(tab,list){
    const cols=(tab==='students')?7:4;
    const el=document.getElementById('utb-'+tab); if(!el) return;
    if(!list.length){el.innerHTML=tdEmpty('No users found',cols);return;}
    if(tab==='admin'||tab==='faculty'){
      el.innerHTML=list.map(u=>`<tr>
        <td class="fw7">${u.firstName} ${u.lastName}</td>
        <td class="text-muted text-sm">${u.email}</td>
        <td style="text-align:center">
          <label class="tog"><input type="checkbox" ${u.isActive?'checked':''} onchange="AdminView._togUser('${u.id}',this)"><span class="tog-track"></span></label>
        </td>
        <td class="text-muted text-sm">${u.lastLoginAt?new Date(u.lastLoginAt).toLocaleDateString():'Never'}</td>
        <td class="td-r"><button class="btn btn-secondary btn-xs" onclick="AdminView._editUser('${u.id}','${u.firstName}','${u.lastName}','${u.email}','${u.role}','','','')">Edit</button></td>
      </tr>`).join('');
    } else {
      el.innerHTML=list.map(u=>{
        const batch=u.session?.name || (u.institutionalId?'Batch 20'+u.institutionalId.substring(0,2):'--');
        const sec=u.section?'<span class="badge bg-gray">Section '+u.section+'</span>':'--';
        return `<tr>
          <td class="fw7">${u.firstName} ${u.lastName}</td>
          <td style="font-family:monospace;font-size:12px">${u.institutionalId||u.email}</td>
          <td><span class="badge bg-blue">${batch}</span></td>
          <td>${sec}</td>
          <td style="text-align:center">
            <label class="tog"><input type="checkbox" ${u.isActive?'checked':''} onchange="AdminView._togUser('${u.id}',this)"><span class="tog-track"></span></label>
          </td>
          <td class="text-muted text-sm">${u.lastLoginAt?new Date(u.lastLoginAt).toLocaleDateString():'Never'}</td>
          <td class="td-r" style="white-space:nowrap">
            <button class="btn btn-secondary btn-xs" style="margin-right:4px" onclick="AdminView._editUser('${u.id}','${u.firstName}','${u.lastName}','${u.email}','${u.role}','${u.institutionalId||''}','${u.section||''}','${u.sessionId||''}')">Edit</button>
            <button class="btn btn-primary btn-xs" onclick="AdminView._viewStuAtt('${u.id}','${u.firstName} ${u.lastName}')">Attainment</button>
          </td>
        </tr>`;
      }).join('');
    }
  },

  // legacy compat
  users(){ AdminView.admins(); },

  async enrolment(){
    document.getElementById('view-root').innerHTML=`
      <div class="page-hd">
        <div class="page-hd-left"><h1>Enrolment</h1><div class="hd-sub">Assign courses to batches or individual students</div></div>
      </div>
      <div class="card mb4"><div class="card-bd">
        <div class="sec-title mb3">Select Course</div>
        <div class="filter-bar" style="margin-bottom:0">
          <div class="fg" style="flex:2;margin:0"><label>Session / Batch</label>
            <select id="en-sess" onchange="AdminView._enrolLoadCourses()" style="width:100%">
              <option value="">-- Select Session --</option>
            </select>
          </div>
          <div class="fg" style="flex:3;margin:0"><label>Course</label>
            <select id="en-course" onchange="AdminView._enrolLoadData()" style="width:100%">
              <option value="">-- Select Course --</option>
            </select>
          </div>
        </div>
      </div></div>

      <div id="en-main" style="display:none">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">

          <!-- Enrol Panel -->
          <div class="card"><div class="card-bd">
            <div class="sec-title mb3">Enrol Students</div>

            <div style="border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin-bottom:16px">
              <div style="display:flex">
                <button class="tab-btn active" id="en-tab-batch" style="flex:1;border-radius:0;border-bottom:none"
                  onclick="AdminView._enrolSwitchTab('batch')">By Batch</button>
                <button class="tab-btn" id="en-tab-individual" style="flex:1;border-radius:0;border-bottom:none"
                  onclick="AdminView._enrolSwitchTab('individual')">Individual</button>
              </div>
            </div>

            <div id="en-pane-batch">
              <div class="fg mb3"><label>Batch Year</label>
                <select id="en-batch" style="width:100%">
                  <option value="">Select Batch</option>
                </select>
              </div>
              <div class="fg mb3"><label>Section</label>
                <select id="en-section" style="width:100%">
                  <option value="">All Sections</option>
                  <option value="A">Section A</option>
                  <option value="B">Section B</option>
                </select>
              </div>
              <button class="btn btn-primary" style="width:100%" onclick="AdminView._enrolBatch()">Enrol Batch</button>
            </div>

            <div id="en-pane-individual" style="display:none">
              <div class="fg mb3"><label>Search Students</label>
                <input id="en-search" placeholder="Type name or student ID..." oninput="AdminView._enrolSearch()" style="width:100%">
              </div>
              <div id="en-search-results" style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r);margin-bottom:12px">
                <div class="text-muted text-sm" style="padding:12px">Type to search students</div>
              </div>
              <button class="btn btn-primary" style="width:100%" onclick="AdminView._enrolSelected()">Enrol Selected</button>
            </div>

            <div id="en-result" class="mt3"></div>
          </div></div>

          <!-- Enrolled Students Panel -->
          <div class="card"><div class="card-bd">
            <div class="flex-between mb3">
              <div class="sec-title">Currently Enrolled</div>
              <span id="en-count" class="badge bg-blue">0 students</span>
            </div>
            <div style="max-height:420px;overflow-y:auto">
              <div class="tbl-wrap" style="margin:0"><table>
                <thead><tr><th>Name</th><th>ID</th><th>Section</th><th class="td-r">Remove</th></tr></thead>
                <tbody id="en-enrolled">${tdLoad(4)}</tbody>
              </table></div>
            </div>
          </div></div>

        </div>
      </div>`;

    // Load sessions. Top dropdown selects a session to list its courses.
    // The Batch dropdown carries the session id, so batch enrolment matches
    // on the batch link (department-safe) instead of ID digits.
    try {
      const sessions = await Api.getSessions();
      const sel = document.getElementById('en-sess');
      if(sel) sel.innerHTML = '<option value="">-- Select Session --</option>' +
        sessions.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');

      const bSel = document.getElementById('en-batch');
      if(bSel) bSel.innerHTML = '<option value="">Select Batch</option>' +
        sessions.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
    } catch(e) {}

    AdminView._enrolSelectedIds = new Set();
  },

  async _enrolLoadCourses(){
    const sessId = document.getElementById('en-sess')?.value;
    const courseSel = document.getElementById('en-course');
    if(!courseSel) return;
    if(!sessId){ courseSel.innerHTML='<option value="">-- Select Course --</option>'; return; }
    try{
      const courses = await Api.getCourses({ sessionId: sessId });
      courseSel.innerHTML = '<option value="">-- Select Course --</option>' +
        courses.map(c=>`<option value="${c.id}">${c.code} - ${c.name}</option>`).join('');
      document.getElementById('en-main').style.display='none';
    }catch(e){ toast(e.message,'err'); }
  },

  async _enrolLoadData(){
    const courseId = document.getElementById('en-course')?.value;
    if(!courseId){ document.getElementById('en-main').style.display='none'; return; }
    document.getElementById('en-main').style.display='';
    await AdminView._enrolRefreshList();
  },

  async _enrolRefreshList(){
    const courseId = document.getElementById('en-course')?.value;
    if(!courseId) return;
    const tbody = document.getElementById('en-enrolled');
    const countEl = document.getElementById('en-count');
    if(tbody) tbody.innerHTML = tdLoad(4);
    try{
      const list = await Api.getEnrolments(courseId);
      if(countEl) countEl.textContent = list.length + ' student' + (list.length===1?'':'s');
      if(!tbody) return;
      if(!list.length){ tbody.innerHTML=tdEmpty('No students enrolled yet',4); return; }
      tbody.innerHTML = list.map(e=>`<tr>
        <td class="fw7">${e.student.firstName} ${e.student.lastName}</td>
        <td style="font-family:monospace;font-size:12px">${e.student.institutionalId||'--'}</td>
        <td>${e.student.section?'Section '+e.student.section:'--'}</td>
        <td class="td-r"><button class="icon-btn danger" onclick="AdminView._removeEnrolment('${e.id}')">${ico('trash',13)}</button></td>
      </tr>`).join('');
    }catch(e){ if(tbody) tbody.innerHTML=tdEmpty(e.message,4); }
  },

  _enrolSwitchTab(tab){
    document.getElementById('en-pane-batch').style.display = tab==='batch'?'':'none';
    document.getElementById('en-pane-individual').style.display = tab==='individual'?'':'none';
    document.getElementById('en-tab-batch').classList.toggle('active', tab==='batch');
    document.getElementById('en-tab-individual').classList.toggle('active', tab==='individual');
  },

  async _enrolBatch(){
    const courseId = document.getElementById('en-course')?.value;
    const sessionId = document.getElementById('en-batch')?.value;
    const section = document.getElementById('en-section')?.value;
    const resEl = document.getElementById('en-result');
    if(!courseId) return toast('Select a course first','err');
    resEl.innerHTML=`<div class="loading-box" style="padding:8px 0;justify-content:flex-start"><div class="spin"></div> Enrolling...</div>`;
    try{
      const r = await Api.enrolStudents({ courseId, sessionId, section });
      resEl.innerHTML=`<div class="alert alert-success"><span class="alert-icon">✓</span>Enrolled ${r.enrolled} student(s). ${r.skipped} already enrolled.</div>`;
      await AdminView._enrolRefreshList();
    }catch(e){ resEl.innerHTML=`<div class="alert alert-error"><span class="alert-icon">⚠</span>${e.message}</div>`; }
  },

  async _enrolSearch(){
    const q = (document.getElementById('en-search')?.value||'').trim();
    const el = document.getElementById('en-search-results');
    if(!el) return;
    if(q.length < 2){ el.innerHTML='<div class="text-muted text-sm" style="padding:12px">Type at least 2 characters</div>'; return; }
    try{
      const list = await Api.getUsers({role:'STUDENT', search:q});
      if(!list.length){ el.innerHTML='<div class="text-muted text-sm" style="padding:12px">No students found</div>'; return; }
      el.innerHTML = list.map(u=>`
        <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;cursor:pointer;border-bottom:1px solid var(--border)">
          <input type="checkbox" value="${u.id}" ${AdminView._enrolSelectedIds?.has(u.id)?'checked':''}
            onchange="AdminView._enrolToggle('${u.id}',this.checked)">
          <span>
            <span class="fw7">${u.firstName} ${u.lastName}</span>
            <span class="text-muted text-sm" style="margin-left:8px">${u.institutionalId||u.email}</span>
          </span>
        </label>`).join('');
    }catch(e){ el.innerHTML=`<div class="text-muted text-sm" style="padding:12px">${e.message}</div>`; }
  },

  _enrolToggle(id, checked){
    if(!AdminView._enrolSelectedIds) AdminView._enrolSelectedIds = new Set();
    if(checked) AdminView._enrolSelectedIds.add(id);
    else AdminView._enrolSelectedIds.delete(id);
  },

  async _enrolSelected(){
    const courseId = document.getElementById('en-course')?.value;
    const resEl = document.getElementById('en-result');
    const ids = [...(AdminView._enrolSelectedIds||[])];
    if(!courseId) return toast('Select a course first','err');
    if(!ids.length) return toast('Select at least one student','err');
    resEl.innerHTML=`<div class="loading-box" style="padding:8px 0;justify-content:flex-start"><div class="spin"></div> Enrolling...</div>`;
    try{
      const r = await Api.enrolStudents({ courseId, studentIds: ids });
      resEl.innerHTML=`<div class="alert alert-success"><span class="alert-icon">✓</span>Enrolled ${r.enrolled} student(s). ${r.skipped} already enrolled.</div>`;
      AdminView._enrolSelectedIds = new Set();
      document.getElementById('en-search').value='';
      document.getElementById('en-search-results').innerHTML='<div class="text-muted text-sm" style="padding:12px">Type to search students</div>';
      await AdminView._enrolRefreshList();
    }catch(e){ resEl.innerHTML=`<div class="alert alert-error"><span class="alert-icon">⚠</span>${e.message}</div>`; }
  },

  async _removeEnrolment(id){
    if(!confirm('Remove this student from the course?')) return;
    try{
      await Api.removeEnrolment(id);
      toast('Student removed from course');
      await AdminView._enrolRefreshList();
    }catch(e){ toast(e.message,'err'); }
  },
  _loadU(){ },

  async outcomes(){
    const progs = await Api.getPrograms();
    document.getElementById('view-root').innerHTML = `
      <div class="page-hd">
        <div class="page-hd-left"><h1>Program Outcomes</h1><div class="hd-sub">PO1-PO12 per program</div></div>
        <div class="page-hd-actions">
          <select id="po-prog" style="min-width:260px" onchange="AdminView._loadPOs()">
            ${progs.map(p=>`<option value="${p.id}">${p.code} - ${p.name}</option>`).join('')}
          </select>
          <button class="btn btn-primary" onclick="AdminView._addPO()">${ico('plus')} Add PO</button>
        </div>
      </div>
      <div id="po-area">${loading()}</div>`;
    if (progs.length) this._loadPOs();
  },

  async _loadPOs(){
    const pid=document.getElementById('po-prog')?.value;if(!pid)return;
    const el=document.getElementById('po-area');el.innerHTML=loading();
    try{
      const l=await Api.getProgramOutcomes(pid);
      el.innerHTML=l.length?`<div class="po-grid">${l.map(po=>`<div class="po-card">
        <div class="po-card-top"><span class="po-code">${po.code}</span>
          <div style="display:flex;gap:6px">
            <button class="btn btn-secondary btn-xs" onclick="AdminView._editPO('${po.id}','${po.code}','${po.title.replace(/'/g,'&#39;')}','${(po.description||'').replace(/'/g,'&#39;')}')">${ico('edit',13)} Edit</button>
            <button class="icon-btn danger" onclick="AdminView._delPO('${po.id}','${po.code}')">${ico('trash',13)}</button>
          </div>
        </div>
        <div class="po-card-title">${po.title}</div>
        ${po.description?`<div class="po-card-desc">${po.description}</div>`:''}
      </div>`).join('')}</div>`
      :`<div class="empty-box"><div class="empty-ico">${ico('target',24)}</div><h3>No outcomes yet</h3><p>Add PO1-PO12 for this program.</p></div>`;
    }catch(e){el.innerHTML=`<div class="alert alert-error"><span class="alert-icon">⚠</span>${e.message}</div>`}
  },
  _addPO(){if(!document.getElementById('po-prog')?.value)return toast('Select a program first','err');
    showModal('Add Program Outcome',`<div class="form-row fr2 mb3"><div class="fg"><label>Code</label><input id="mpo-code" placeholder="e.g. PO1"></div><div class="fg"><label>Title</label><input id="mpo-title" placeholder="e.g. Engineering Knowledge"></div></div>
      <div class="fg"><label>Description</label><textarea id="mpo-desc" rows="3" placeholder="Describe this outcome…"></textarea></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="AdminView._savePO()">${ico('save')} Add</button>`)},
  async _savePO(){const pid=document.getElementById('po-prog').value,code=document.getElementById('mpo-code').value.trim(),title=document.getElementById('mpo-title').value.trim(),description=document.getElementById('mpo-desc').value.trim();
    if(!code||!title)return toast('Code and title required','err');
    try{await Api.createProgramOutcome(pid,{code,title,description});toast('PO added');closeModal();this._loadPOs()}catch(e){toast(e.message,'err')}},
  _editPO(id,code,title,desc){showModal('Edit PO',`<div class="form-row fr2 mb3"><div class="fg"><label>Code</label><input id="mpo-code" value="${code}"></div><div class="fg"><label>Title</label><input id="mpo-title" value="${title}"></div></div>
    <div class="fg"><label>Description</label><textarea id="mpo-desc" rows="3">${desc}</textarea></div>`,
    `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="AdminView._updPO('${id}')">${ico('save')} Save</button>`)},
  async _updPO(id){const code=document.getElementById('mpo-code').value.trim(),title=document.getElementById('mpo-title').value.trim(),description=document.getElementById('mpo-desc').value.trim();
    try{await Api.updateProgramOutcome(id,{code,title,description});toast('Updated');closeModal();this._loadPOs()}catch(e){toast(e.message,'err')}},
  async _delPO(id,code){if(!confirm(`Delete ${code}? Fails if mappings exist.`))return;
    try{await Api.deleteProgramOutcome(id);toast('Deleted');this._loadPOs()}catch(e){toast(e.message,'err')}},

  // ── Thresholds ─────────────────────────────────────────────
  _editUser(id, firstName, lastName, email, role, institutionalId, section, sessionId) {
    const isStudent = role === 'STUDENT';
    showModal('Edit User', `
      <div class="form-row fr2 mb3">
        <div class="fg"><label>First Name</label><input id="eu-fn" value="${firstName}"></div>
        <div class="fg"><label>Last Name</label><input id="eu-ln" value="${lastName}"></div>
      </div>
      <div class="fg mb3"><label>Email</label><input id="eu-em" type="email" value="${email}"></div>
      <div class="fg mb3"><label>New Password <span class="text-muted">(leave blank to keep current)</span></label>
        <input id="eu-pw" type="password" placeholder="Leave blank to keep unchanged"></div>
      ${isStudent ? `
      <div class="fg mb3"><label>Student ID</label><input id="eu-id" value="${institutionalId||''}"></div>
      <div class="form-row fr3 mb3">
        <div class="fg"><label>Department</label>
          <select id="eu-dept" onchange="AdminView._euFillBatches()"><option value="">Loading...</option></select>
        </div>
        <div class="fg"><label>Batch</label>
          <select id="eu-batch"><option value="">-- Select department first --</option></select>
        </div>
        <div class="fg"><label>Section</label>
          <select id="eu-sec">
            <option value="">-- Select --</option>
            <option value="A" ${section==='A'?'selected':''}>Section A</option>
            <option value="B" ${section==='B'?'selected':''}>Section B</option>
          </select>
        </div>
      </div>
      <div class="text-muted text-sm mb3">Clearing the batch leaves the student unassigned. To drop a student, set them inactive instead (their batch stays).</div>` : ''}`,
      `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="AdminView._saveEditUser('${id}','${role}')">Save Changes</button>`
    );
    if (isStudent) {
      setTimeout(() => {
        Promise.all([Api.getDepartments(), Api.getSessions()]).then(([depts, sessions]) => {
          AdminView._euSessions = sessions;
          const cur = sessions.find(s => s.id === sessionId);
          const curDept = cur ? cur.departmentId : '';
          const dSel = document.getElementById('eu-dept');
          if (dSel) dSel.innerHTML = '<option value="">-- Select --</option>' +
            depts.map(d => '<option value="' + d.id + '" ' + (d.id===curDept?'selected':'') + '>' + d.name + '</option>').join('');
          AdminView._euFillBatches(sessionId);
        }).catch(() => {});
      }, 50);
    }
  },

  _euFillBatches(preselect) {
    const dept = document.getElementById('eu-dept')?.value;
    const bSel = document.getElementById('eu-batch');
    if (!bSel) return;
    const sessions = (AdminView._euSessions || []).filter(s => s.departmentId === dept);
    bSel.innerHTML = dept
      ? ('<option value="">-- Unassigned --</option>' + sessions.map(s => '<option value="' + s.id + '" ' + (s.id===preselect?'selected':'') + '>' + s.name + '</option>').join(''))
      : '<option value="">-- Select department first --</option>';
  },

  async _saveEditUser(id, role) {
    const pw = document.getElementById('eu-pw')?.value.trim();
    const d = {
      firstName: document.getElementById('eu-fn').value.trim(),
      lastName:  document.getElementById('eu-ln').value.trim(),
      email:     document.getElementById('eu-em').value.trim(),
    };
    if (role === 'STUDENT') {
      d.institutionalId = document.getElementById('eu-id')?.value.trim() || null;
      d.section = document.getElementById('eu-sec')?.value || null;
      d.sessionId = document.getElementById('eu-batch')?.value || null;
    }
    if (pw) d.password = pw;
    if (!d.firstName || !d.lastName || !d.email) return toast('Name and email required', 'err');
    try {
      await Api.updateUser(id, d);
      toast('User updated');
      closeModal();
      if (role === 'ADMIN') AdminView.admins();
      else if (role === 'FACULTY') AdminView.faculty();
      else AdminView._loadStudents();
    } catch(e) { toast(e.message, 'err'); }
  },

  async _togUser(id,cb){const v=cb.checked;try{await Api.updateUser(id,{isActive:v});toast('User '+(v?'activated':'deactivated'))}catch(e){cb.checked=!v;toast(e.message,'err')}},
  _bulkUpload(){showModal('Bulk Upload Users',`<div class="alert alert-info mb3"><span class="alert-icon">i</span>Upload CSV or Excel. Required columns:<br><strong>firstName, lastName, email, role, institutionalId, section</strong><br>Role: STUDENT / FACULTY / ADMIN &nbsp;|&nbsp; Section: A or B (students only)<br>Student password defaults to institutionalId. The whole file joins the batch you pick below.</div>
    <div class="form-row fr2 mb3">
      <div class="fg"><label>Department (for students)</label><select id="bulk-dept" onchange="AdminView._bulkFillBatches()"><option value="">Loading...</option></select></div>
      <div class="fg"><label>Batch (for students)</label><select id="bulk-batch"><option value="">-- Select department first --</option></select></div>
    </div>
    <div class="fg mb3"><label>Download Template</label><button class="btn btn-secondary btn-sm" onclick="AdminView._dlTemplate()">${ico('dl',13)} CSV Template</button></div><div class="fg"><label>Upload File (CSV or Excel)</label><input type="file" id="bulk-file" accept=".csv,.xlsx,.xls" style="padding:8px"></div><div id="bulk-preview" class="mt3"></div>`,`<button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-secondary" onclick="AdminView._parseFile()">${ico('edit')} Parse File</button><button class="btn btn-primary" onclick="AdminView._confirmBulk()">${ico('save')} Confirm Upload</button>`);
    setTimeout(()=>{Promise.all([Api.getDepartments(),Api.getSessions()]).then(([depts,sessions])=>{AdminView._bulkSessions=sessions;const d=document.getElementById('bulk-dept');if(d)d.innerHTML='<option value="">-- None --</option>'+depts.map(x=>'<option value="'+x.id+'">'+x.name+'</option>').join('');}).catch(()=>{});},50);
  },
  _bulkFillBatches(){const dept=document.getElementById('bulk-dept')?.value;const b=document.getElementById('bulk-batch');if(!b)return;const ss=(AdminView._bulkSessions||[]).filter(s=>s.departmentId===dept);b.innerHTML=dept?('<option value="">-- Unassigned --</option>'+ss.map(s=>'<option value="'+s.id+'">'+s.name+'</option>').join('')):'<option value="">-- Select department first --</option>';},
  _dlTemplate(){const csv='firstName,lastName,email,role,institutionalId,section\nJohn,Doe,john@bup.edu.bd,STUDENT,23549009999,A\nJane,Smith,jane@bup.edu.bd,STUDENT,23549009998,B\nProf,Khan,prof@bup.edu.bd,FACULTY,,';const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='users_template.csv';a.click();},
  async _parseFile(){
    const file=document.getElementById('bulk-file')?.files[0];if(!file)return toast('Select a file','err');
    const preview=document.getElementById('bulk-preview');preview.innerHTML='<div class="loading-box" style="padding:10px 0"><div class="spin"></div> Reading...</div>';
    try{
      let users=[];const mapRow=r=>({firstName:String(r.firstName||r['First Name']||r.firstname||'').trim(),lastName:String(r.lastName||r['Last Name']||r.lastname||'').trim(),email:String(r.email||r.Email||'').trim(),role:String(r.role||r.Role||'STUDENT').toUpperCase().trim(),institutionalId:String(r.institutionalId||r['Institutional ID']||r.institutionalid||'').trim(),section:(String(r.section||r.Section||'').trim().toUpperCase()||null)});
      if(file.name.endsWith('.csv')){const text=await file.text();const ls=text.trim().split('\n');const headers=ls[0].split(',').map(h=>h.trim().replace(/^"|"$/g,'').toLowerCase());users=ls.slice(1).filter(l=>l.trim()).map(line=>{const vals=line.split(',').map(v=>v.trim().replace(/^"|"$/g,''));const obj={};headers.forEach((h,i)=>obj[h]=vals[i]||'');return mapRow({firstName:obj.firstname||obj['first name'],lastName:obj.lastname||obj['last name'],email:obj.email,role:obj.role,institutionalId:obj.institutionalid||obj['institutional id']});});}
      else{const ab=await file.arrayBuffer();const XLSX=await import('https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs');const wb=XLSX.read(ab);users=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''}).map(mapRow);}
      if(!users.length){preview.innerHTML='<div class="alert alert-warn">No data found.</div>';return;}
      const _bn=(AdminView._bulkSessions||[]).find(s=>s.id===document.getElementById('bulk-batch')?.value);const _bl=_bn?_bn.name:'(set on upload)';
      preview.innerHTML='<div class="sec-title mb2">Preview - '+users.length+' users</div><div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r)"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead style="background:var(--surface2)"><tr><th style="padding:7px 10px">Name</th><th style="padding:7px 10px">Email / ID</th><th style="padding:7px 10px">Role</th><th style="padding:7px 10px">Batch</th><th style="padding:7px 10px">Section</th></tr></thead><tbody>'+users.slice(0,50).map((u,i)=>'<tr style="background:'+(i%2?'var(--surface2)':'var(--surface)')+'"><td style="padding:6px 10px;border-top:1px solid var(--border)">'+u.firstName+' '+u.lastName+'</td><td style="padding:6px 10px;border-top:1px solid var(--border);font-family:monospace;font-size:11px">'+(u.role==='STUDENT'?(u.institutionalId||u.email):u.email)+'</td><td style="padding:6px 10px;border-top:1px solid var(--border)"><span class="role-pill rp-'+(u.role||'STUDENT')+'">'+(u.role||'STUDENT')+'</span></td><td style="padding:6px 10px;border-top:1px solid var(--border)">'+(u.role==='STUDENT'?_bl:'--')+'</td><td style="padding:6px 10px;border-top:1px solid var(--border)">'+(u.section||'--')+'</td></tr>').join('')+(users.length>50?'<tr><td colspan="5" style="padding:8px;text-align:center;color:var(--text3)">...and '+(users.length-50)+' more</td></tr>':'')+'</tbody></table></div>';
      window._bulkUsers=users;toast(users.length+' users parsed. Click Confirm Upload.','ok');
    }catch(e){preview.innerHTML='<div class="alert alert-error"><span class="alert-icon">!</span>'+e.message+'</div>';}
  },
  async _confirmBulk(){const users=window._bulkUsers;if(!users||!users.length)return toast('Parse a file first','err');
    const sessionId=document.getElementById('bulk-batch')?.value||null;
    try{const res=await Api.bulkCreateUsers(users,sessionId);toast('Created: '+res.created+', Skipped: '+res.skipped+(res.errors.length?', Errors: '+res.errors.length:''),'ok');closeModal();window._bulkUsers=null;this._loadU();}catch(e){toast(e.message,'err');}},
  _addUser(forceRole) {
    const roleLabel = forceRole === 'ADMIN' ? 'Admin' : forceRole === 'FACULTY' ? 'Faculty' : 'Student';
    const isStudent = forceRole === 'STUDENT' || !forceRole;
    const isFaculty = forceRole === 'FACULTY';
    const isAdmin   = forceRole === 'ADMIN';

    showModal('Create ' + roleLabel, `
      <div class="form-row fr2 mb3">
        <div class="fg"><label>First Name</label><input id="mu-fn" placeholder="First name"></div>
        <div class="fg"><label>Last Name</label><input id="mu-ln" placeholder="Last name"></div>
      </div>
      <div class="fg mb3"><label>Email</label>
        <input id="mu-em" type="email" placeholder="name@bup.edu.bd">
      </div>
      <div class="fg mb3"><label>Password</label>
        <input id="mu-pw" type="password" placeholder="Set a password for this user">
      </div>
      <input type="hidden" id="mu-role" value="${forceRole||'STUDENT'}">
      ${isStudent ? `
      <div class="fg mb3"><label>Institutional ID</label>
        <input id="mu-id" placeholder="e.g. 23549009001">
      </div>
      <div class="form-row fr3 mb3">
        <div class="fg"><label>Department</label>
          <select id="mu-dept" onchange="AdminView._muFillBatches()"><option value="">Loading...</option></select>
        </div>
        <div class="fg"><label>Batch</label>
          <select id="mu-batch"><option value="">-- Select department first --</option></select>
        </div>
        <div class="fg"><label>Section</label>
          <select id="mu-section">
            <option value="">-- Select --</option>
            <option value="A">Section A</option>
            <option value="B">Section B</option>
          </select>
        </div>
      </div>` : `<input type="hidden" id="mu-id" value=""><input type="hidden" id="mu-section" value=""><input type="hidden" id="mu-batch" value="">`}`,
      `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="AdminView._saveUser()">${ico('save')} Create ${roleLabel}</button>`
    );
    if (isStudent) {
      setTimeout(() => {
        Promise.all([Api.getDepartments(), Api.getSessions()]).then(([depts, sessions]) => {
          AdminView._muSessions = sessions;
          const dSel = document.getElementById('mu-dept');
          if (dSel) dSel.innerHTML = '<option value="">-- Select --</option>' +
            depts.map(d => '<option value="' + d.id + '">' + d.name + '</option>').join('');
        }).catch(() => {});
      }, 50);
    }
  },

  // Fill the batch dropdown with sessions belonging to the chosen department.
  _muFillBatches() {
    const dept = document.getElementById('mu-dept')?.value;
    const bSel = document.getElementById('mu-batch');
    if (!bSel) return;
    const sessions = (AdminView._muSessions || []).filter(s => s.departmentId === dept);
    bSel.innerHTML = dept
      ? ('<option value="">-- Unassigned --</option>' + sessions.map(s => '<option value="' + s.id + '">' + s.name + '</option>').join(''))
      : '<option value="">-- Select department first --</option>';
  },

  _onRoleChange() {},


  async _saveUser() {
    const role    = document.getElementById('mu-role').value;
    const instId  = document.getElementById('mu-id')?.value.trim();
    const section = role === 'STUDENT' ? (document.getElementById('mu-section')?.value || null) : null;
    const sessionId = role === 'STUDENT' ? (document.getElementById('mu-batch')?.value || null) : null;
    const password = document.getElementById('mu-pw')?.value.trim();
    const d = {
      firstName:       document.getElementById('mu-fn').value.trim(),
      lastName:        document.getElementById('mu-ln').value.trim(),
      email:           document.getElementById('mu-em').value.trim(),
      role,
      institutionalId: instId || null,
      section,
      sessionId,
      password:        password || undefined,
    };
    if (!d.firstName || !d.lastName || !d.email) return toast('Name and email required', 'err');
    if (!password) return toast('Password is required', 'err');
    try {
      await Api.createUser(d);
      toast(role.charAt(0) + role.slice(1).toLowerCase() + ' created successfully');
      closeModal();
      // Reload the correct tab
      if (role === 'ADMIN') AdminView.admins();
      else if (role === 'FACULTY') AdminView.faculty();
      else AdminView._loadStudents();
    } catch(e) { toast(e.message, 'err'); }
  },


  async attainmentReport(){
    document.getElementById('view-root').innerHTML=`<div class="page-hd"><div class="page-hd-left"><h1>Attainment Report</h1><div class="hd-sub">CO/PO attainment by batch and department</div></div></div>${loading()}`;
    try{
      const [sessions,depts]=await Promise.all([Api.getSessions(),Api.getDepartments()]);
      document.getElementById('view-root').innerHTML=`
        <div class="page-hd"><div class="page-hd-left"><h1>Attainment Report</h1><div class="hd-sub">View attainment across batches and departments</div></div></div>
        <div class="card mb4"><div class="card-bd">
          <div class="filter-bar" style="margin-bottom:0">
            <div class="fg" style="flex:1;margin:0"><label>Batch / Session</label>
              <select id="ar-sess"><option value="">Select Batch</option>${sessions.map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}</select></div>
            <div class="fg" style="flex:1;margin:0"><label>Department</label>
              <select id="ar-dept"><option value="">Select Department</option>${depts.map(d=>`<option value="${d.id}">${d.name}</option>`).join('')}</select></div>
            <div class="fg" style="flex:1;margin:0"><label>Student ID (optional)</label>
              <input id="ar-stu" placeholder="e.g. 23549009001" style="font-family:monospace"></div>
            <div style="padding-top:22px">
              <button class="btn btn-primary" onclick="AdminView._loadAttainReport()">${ico('chart')} View Report</button>
            </div>
          </div>
        </div></div>
        <div id="ar-result"></div>`;
    }catch(e){document.getElementById('view-root').innerHTML+=`<div class="alert alert-error"><span class="alert-icon">&#9888;</span>${e.message}</div>`}
  },

  async _loadAttainReport(){
    const sessId=document.getElementById('ar-sess').value;
    const deptId=document.getElementById('ar-dept').value;
    const el=document.getElementById('ar-result');
    el.innerHTML=loading();
    try{
      const stuInput=document.getElementById('ar-stu')?.value?.trim();
      const filters={};
      if(sessId) filters.sessionId=sessId;
      if(deptId) filters.departmentId=deptId;

      if(stuInput){
        const users=await Api.getUsers({role:'STUDENT',search:stuInput});
        const stu=users.find(u=>u.institutionalId===stuInput||u.email===stuInput);
        if(!stu){el.innerHTML='<div class="alert alert-warn">Student "'+stuInput+'" not found.</div>';return;}
        AdminView._viewStuAtt(stu.id, stu.firstName+' '+stu.lastName);
        el.innerHTML='';
        return;
      }

      const{coSummary,poSummary}=await Api.getAttainmentReport(filters);
      if(!coSummary.length&&!poSummary.length){
        el.innerHTML=`<div class="empty-box"><div class="empty-ico">${ico('chart',24)}</div><h3>No data for this filter</h3><p>Try a different batch or department.</p></div>`;
        return;
      }

      // Build a map: poCode -> list of contributing COs
      const poCoMap={};
      poSummary.forEach(po=>{ poCoMap[po.poCode]=coSummary.filter(co=>co.poCode===po.poCode||true); });

      el.innerHTML=`
        <div class="flex-between mb3">
          <div class="sec-title">Program Outcome Attainment</div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="AdminView._exportCSV()">${ico('dl',13)} Export CSV</button>
            <button class="btn btn-secondary btn-sm" onclick="AdminView._exportPDF()">${ico('dl',13)} Export PDF</button>
          </div>
        </div>
        <div class="tbl-wrap mb4"><table>
          <thead><tr><th>PO</th><th>Title</th>
            <th style="text-align:center">Attained</th><th style="text-align:center">Total</th>
            <th style="min-width:160px">Rate</th><th style="text-align:center">Details</th></tr></thead>
          <tbody>${poSummary.map(r=>{const lvl=r.attainmentRate>=60?'L3':'L0';const relCOs=coSummary.filter(co=>co.poCode===r.poCode);return`<tr>
            <td><span class="badge bg-blue">${r.poCode||'?'}</span></td>
            <td>${r.poTitle||'?'}</td>
            <td style="text-align:center;font-weight:700;color:var(--l3)">${r.attained||0}</td>
            <td style="text-align:center;color:var(--text3)">${r.total||0}</td>
            <td>${attBar(r.attainmentRate||0,lvl)}</td>
            <td style="text-align:center"><button class="btn btn-ghost btn-xs" onclick="AdminView._togglePODetail('po-det-${r.poCode}')">${ico('expand',12)} Show COs</button></td>
          </tr>
          <tr id="po-det-${r.poCode}" style="display:none"><td colspan="6" style="padding:0;background:var(--surface2)">
            <div style="padding:12px 20px">
              <div class="text-sm fw7 mb2" style="color:var(--text3)">Contributing Course Outcomes for ${r.poCode}</div>
              ${(()=>{
                const relCOs=coSummary.filter(co=>(co.mappedPoIds||[]).includes(r.programOutcomeId));
                if(!relCOs.length) return '<p class="text-sm text-muted">No mapped COs found.</p>';
                return '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="border-bottom:1px solid var(--border)"><th style="padding:6px 10px;text-align:left">Course</th><th style="padding:6px 10px;text-align:left">CO</th><th style="padding:6px 10px;text-align:left">Title</th><th style="padding:6px 10px;text-align:center">Attained</th><th style="padding:6px 10px;text-align:center">Total</th><th style="padding:6px 10px;min-width:140px">Rate</th></tr></thead><tbody>'+
                  relCOs.map(co=>{const cl=co.attainmentRate>=60?'L3':'L0';return'<tr style="border-bottom:1px solid var(--border)"><td style="padding:6px 10px"><span class="code-badge">'+( co.courseCode||'-')+'</span></td><td style="padding:6px 10px"><span class="badge bg-green">'+(co.coCode||'?')+'</span></td><td style="padding:6px 10px">'+(co.coTitle||'?')+'</td><td style="padding:6px 10px;text-align:center;font-weight:700;color:var(--l3)">'+(co.attained||0)+'</td><td style="padding:6px 10px;text-align:center;color:var(--text3)">'+(co.total||0)+'</td><td style="padding:6px 10px">'+attBar(co.attainmentRate||0,cl)+'</td></tr>';}).join('')+
                  '</tbody></table>';
              })()}
            </div>
          </td></tr>`}).join('')}
          </tbody>
        </table></div>
        <div class="sec-title mb3">Course Outcome Attainment</div>
        <div class="tbl-wrap mb4"><table>
          <thead><tr><th>Course</th><th>CO</th><th>Title</th>
            <th style="text-align:center">Attained</th><th style="text-align:center">Total</th>
            <th style="min-width:160px">Rate</th></tr></thead>
          <tbody>${coSummary.map(r=>{const lvl=r.attainmentRate>=60?'L3':'L0';return`<tr>
            <td><span class="code-badge">${r.courseCode}</span></td>
            <td><span class="badge bg-green">${r.coCode||'?'}</span></td>
            <td>${r.coTitle||'?'}</td>
            <td style="text-align:center;font-weight:700;color:var(--l3)">${r.attained||0}</td>
            <td style="text-align:center;color:var(--text3)">${r.total||0}</td>
            <td>${attBar(r.attainmentRate||0,lvl)}</td>
          </tr>`}).join('')}</tbody>
        </table></div>`;
      this._lastReport={coSummary,poSummary};
    }catch(e){el.innerHTML=`<div class="alert alert-error"><span class="alert-icon">&#9888;</span>${e.message}</div>`}
  },

  _togglePODetail(id){
    const row=document.getElementById(id);
    if(!row) return;
    const btn=row.previousElementSibling?.querySelector('button');
    if(row.style.display==='none'){
      row.style.display='';
      if(btn) btn.innerHTML=ico('collapse',12)+' Hide COs';
    } else {
      row.style.display='none';
      if(btn) btn.innerHTML=ico('expand',12)+' Show COs';
    }
  },

  async _viewStuAtt(studentId, name){
    showModal('Attainment Report - ' + name, loading(), '', true);
    try{
      const d = await Api.getStudentAttainmentAdmin(studentId);
      const stu = d.student || {};
      const batch = stu.session?.name || (stu.institutionalId ? 'Batch 20'+stu.institutionalId.substring(0,2) : '--');
      const sec   = stu.section ? 'Section '+stu.section : '--';

      const coByGroup = {};
      (d.coAttainments||[]).forEach(r => {
        const k = r.courseId || 'Unknown';
        if(!coByGroup[k]) coByGroup[k] = { courseCode: r.courseCode||k, rows: [] };
        coByGroup[k].rows.push(r);
      });

      let coHtml = '';
      if((d.coAttainments||[]).length === 0){
        coHtml = '<tr><td colspan="4" class="td-load text-muted">No CO attainment data yet</td></tr>';
      } else {
        (d.coAttainments||[]).forEach(r => {
          const att = r.level==='L3';
          coHtml += '<tr>' +
            '<td><span class="badge bg-green">'+r.courseOutcome.code+'</span></td>' +
            '<td>'+r.courseOutcome.title+'</td>' +
            '<td style="text-align:center"><span class="badge '+(att?'bg-green':'bg-red')+'">'+(att?'Attained':'Not Attained')+'</span></td>' +
            '<td style="text-align:right;font-weight:700;color:'+(att?'var(--l3)':'var(--l0)')+'">'+r.percentage.toFixed(1)+'%</td>' +
            '</tr>';
        });
      }

      let poHtml = '';
      if((d.poAttainments||[]).length === 0){
        poHtml = '<tr><td colspan="4" class="td-load text-muted">No PO attainment data yet</td></tr>';
      } else {
        (d.poAttainments||[]).forEach(r => {
          const att = r.level==='L3';
          poHtml += '<tr>' +
            '<td><span class="badge bg-blue">'+r.programOutcome.code+'</span></td>' +
            '<td>'+r.programOutcome.title+'</td>' +
            '<td style="text-align:center"><span class="badge '+(att?'bg-green':'bg-red')+'">'+(att?'Attained':'Not Attained')+'</span></td>' +
            '<td style="text-align:right;font-weight:700;color:'+(att?'var(--l3)':'var(--l0)')+'">'+r.percentage.toFixed(1)+'%</td>' +
            '</tr>';
        });
      }

      document.getElementById('modal-body').innerHTML =
        '<div style="display:flex;gap:16px;margin-bottom:16px;padding:12px;background:var(--surface2);border-radius:var(--r)">' +
          '<div><span class="text-muted text-sm">Student</span><div class="fw7">'+name+'</div></div>' +
          '<div><span class="text-muted text-sm">ID</span><div class="fw7" style="font-family:monospace">'+(stu.institutionalId||'--')+'</div></div>' +
          '<div><span class="text-muted text-sm">Batch</span><div class="fw7">'+batch+'</div></div>' +
          '<div><span class="text-muted text-sm">Section</span><div class="fw7">'+sec+'</div></div>' +
        '</div>' +
        '<div class="sec-title mb2">Program Outcome Attainment</div>' +
        '<div class="tbl-wrap mb4"><table><thead><tr><th>PO</th><th>Title</th><th style="text-align:center">Result</th><th style="text-align:right">Score</th></tr></thead>' +
        '<tbody>'+poHtml+'</tbody></table></div>' +
        '<div class="sec-title mb2">Course Outcome Attainment</div>' +
        '<div class="tbl-wrap"><table><thead><tr><th>CO</th><th>Title</th><th style="text-align:center">Result</th><th style="text-align:right">Score</th></tr></thead>' +
        '<tbody>'+coHtml+'</tbody></table></div>';
      AdminView._lastStuReport = { student: stu, name, coAttainments: d.coAttainments||[], poAttainments: d.poAttainments||[] };

      const attained = (d.poAttainments||[]).filter(r=>r.level==='L3').length;
      const total    = (d.poAttainments||[]).length;
      document.getElementById('modal-ft').innerHTML =
        '<span class="text-sm text-muted">PO attained: '+attained+'/'+total+'</span>' +
        '<button class="btn btn-secondary btn-sm" onclick="AdminView._exportStuCSV(\''+studentId+'\',\''+name+'\')">CSV</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="AdminView._exportStuPDF(\''+studentId+'\',\''+name+'\')">PDF</button>' +
        '<button class="btn btn-ghost" onclick="closeModal()">Close</button>';
      document.getElementById('modal-ft').classList.remove('hidden');
    }catch(e){document.getElementById('modal-body').innerHTML='<div class="alert alert-error">'+e.message+'</div>';}
  },
  _exportStuCSV(studentId, name){
    const d = AdminView._lastStuReport; if(!d) return;
    const rows=[
      ['Name', name],['ID', d.student.institutionalId||''],['',''],
      ['Type','Code','Title','Result','Score (%)'],
      ...d.poAttainments.map(r=>['PO',r.programOutcome.code,r.programOutcome.title,r.level==='L3'?'Attained':'Not Attained',r.percentage.toFixed(1)]),
      ['','','','',''],
      ...d.coAttainments.map(r=>['CO',r.courseOutcome.code,r.courseOutcome.title,r.level==='L3'?'Attained':'Not Attained',r.percentage.toFixed(1)]),
    ];
    const csv=rows.map(r=>r.map(v=>'"'+String(v||'').replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='attainment_'+( d.student.institutionalId||'student')+'.csv'; a.click();
  },

  _exportStuPDF(studentId, name){
    const d = AdminView._lastStuReport; if(!d) return;
    const stu=d.student;
    const batch=stu.session?.name || (stu.institutionalId?'Batch 20'+stu.institutionalId.substring(0,2):'--');
    const win=window.open('','_blank');
    const poRows=d.poAttainments.map(r=>{const att=r.level==='L3';return`<tr><td><b>${r.programOutcome.code}</b></td><td>${r.programOutcome.title}</td><td style="text-align:center;color:${att?'#16a34a':'#dc2626'};font-weight:700">${att?'Attained':'Not Attained'}</td><td style="text-align:right">${r.percentage.toFixed(1)}%</td></tr>`;}).join('');
    const coRows=d.coAttainments.map(r=>{const att=r.level==='L3';return`<tr><td><b>${r.courseOutcome.code}</b></td><td>${r.courseOutcome.title}</td><td style="text-align:center;color:${att?'#16a34a':'#dc2626'};font-weight:700">${att?'Attained':'Not Attained'}</td><td style="text-align:right">${r.percentage.toFixed(1)}%</td></tr>`;}).join('');
    win.document.write(`<!DOCTYPE html><html><head><title>Attainment - ${name}</title><style>
      body{font-family:Arial,sans-serif;padding:30px;color:#222}
      h1{font-size:20px;margin-bottom:4px}h2{font-size:15px;color:#555;margin:20px 0 8px}
      .info{display:flex;gap:30px;padding:12px;background:#f5f5f5;border-radius:6px;margin-bottom:20px;font-size:13px}
      .info div span{display:block;color:#888;font-size:11px}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px}
      th{background:#f0f0f0;padding:8px 10px;text-align:left;border:1px solid #ccc}
      td{padding:7px 10px;border:1px solid #ddd}tr:nth-child(even){background:#fafafa}
      @media print{button{display:none}}
    </style></head><body>
    <h1>Student Attainment Report</h1>
    <div class="info">
      <div><span>Student</span><b>${name}</b></div>
      <div><span>ID</span><b>${stu.institutionalId||'--'}</b></div>
      <div><span>Batch</span><b>${batch}</b></div>
      <div><span>Section</span><b>${stu.section?'Section '+stu.section:'--'}</b></div>
    </div>
    <h2>Program Outcome Attainment</h2>
    <table><thead><tr><th>PO</th><th>Title</th><th>Result</th><th style="text-align:right">Score</th></tr></thead>
    <tbody>${poRows}</tbody></table>
    <h2>Course Outcome Attainment</h2>
    <table><thead><tr><th>CO</th><th>Title</th><th>Result</th><th style="text-align:right">Score</th></tr></thead>
    <tbody>${coRows}</tbody></table>
    <button onclick="window.print()" style="margin-top:10px;padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">Print / Save as PDF</button>
    </body></html>`);
    win.document.close();
  },

  _exportCSV(){
    const d=this._lastReport; if(!d) return toast('Generate a report first','err');
    const rows=[
      ['Type','Course','Code','Title','Attained','Total','Rate(%)'],
      ...d.poSummary.map(r=>['PO','',r.poCode,r.poTitle,r.attained,r.total,r.attainmentRate]),
      ['','','','','','',''],
      ...d.coSummary.map(r=>['CO',r.courseCode,r.coCode,r.coTitle,r.attained,r.total,r.attainmentRate]),
    ];
    const csv=rows.map(r=>r.map(v=>'"'+String(v||'').replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='attainment_report.csv'; a.click();
  },

  _exportPDF(){
    const d=this._lastReport; if(!d) return toast('Generate a report first','err');
    const win=window.open('','_blank');
    const poRows=d.poSummary.map(r=>`<tr><td><b>${r.poCode||''}</b></td><td>${r.poTitle||''}</td><td style="text-align:center">${r.attained||0}</td><td style="text-align:center">${r.total||0}</td><td style="text-align:center">${(+(r.attainmentRate||0)).toFixed(1)}%</td></tr>`).join('');
    const coRows=d.coSummary.map(r=>`<tr><td>${r.courseCode||''}</td><td><b>${r.coCode||''}</b></td><td>${r.coTitle||''}</td><td style="text-align:center">${r.attained||0}</td><td style="text-align:center">${r.total||0}</td><td style="text-align:center">${(+(r.attainmentRate||0)).toFixed(1)}%</td></tr>`).join('');
    win.document.write(`<!DOCTYPE html><html><head><title>Attainment Report</title><style>
      body{font-family:Arial,sans-serif;padding:30px;color:#222}
      h1{font-size:20px;margin-bottom:4px}h2{font-size:15px;color:#555;margin:20px 0 8px}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px}
      th{background:#f0f0f0;padding:8px 10px;text-align:left;border:1px solid #ccc}
      td{padding:7px 10px;border:1px solid #ddd}
      tr:nth-child(even){background:#fafafa}
      .att{color:#16a34a;font-weight:700}.not{color:#dc2626;font-weight:700}
      @media print{button{display:none}}
    </style></head><body>
    <h1>Attainment Report</h1><p style="color:#888;font-size:12px">Generated: ${new Date().toLocaleString()}</p>
    <h2>Program Outcome Attainment</h2>
    <table><thead><tr><th>PO</th><th>Title</th><th>Attained</th><th>Total</th><th>Rate</th></tr></thead>
    <tbody>${poRows}</tbody></table>
    <h2>Course Outcome Attainment</h2>
    <table><thead><tr><th>Course</th><th>CO</th><th>Title</th><th>Attained</th><th>Total</th><th>Rate</th></tr></thead>
    <tbody>${coRows}</tbody></table>
    <button onclick="window.print()" style="margin-top:10px;padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">Print / Save as PDF</button>
    </body></html>`);
    win.document.close();
  },

};
