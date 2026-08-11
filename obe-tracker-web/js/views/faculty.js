const FacultyView = {
  _cid: null,

  // ── Course List ──────────────────────────────────────────────
  async courses() {
    document.getElementById('view-root').innerHTML = `
      <div class="page-hd"><div class="page-hd-left"><h1>My Courses</h1><div class="hd-sub">Courses assigned to you</div></div></div>
      <div id="fac-list">${loading()}</div>`;
    try {
      const list = await Api.getMyCourses();
      if (!list.length) {
        document.getElementById('fac-list').innerHTML = `<div class="empty-box"><div class="empty-ico">${ico('book',24)}</div><h3>No courses assigned</h3><p>Contact your administrator.</p></div>`;
        return;
      }
      document.getElementById('fac-list').innerHTML = `<div class="course-grid">${list.map(c => `
        <div class="course-card" onclick="FacultyView._openC('${c.id}','${c.name.replace(/'/g,'&#39;')}','${c.code}')">
          <div class="cc-icon">${ico('book',18)}</div>
          <div class="cc-code">${c.code}</div>
          <div class="cc-name">${c.name}</div>
          <div class="cc-meta"><span>${c.session?.name||''}</span><span>${c.creditHours||''} cr.</span></div>
        </div>`).join('')}</div>`;
    } catch(e) { document.getElementById('fac-list').innerHTML = `<div class="alert alert-error"><span class="alert-icon">⚠</span>${e.message}</div>`; }
  },

  _editCourse(id, name, code, creditHours) {
    showModal('Edit Course', `
      <div class="fg mb3"><label>Course Name</label><input id="ec-name" value="${name}"></div>
      <div class="form-row fr2">
        <div class="fg"><label>Course Code</label><input id="ec-code" value="${code}"></div>
        <div class="fg"><label>Credit Hours</label><input id="ec-cr" type="number" value="${creditHours}" min="1" max="6"></div>
      </div>`,
      `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="FacultyView._saveEditCourse('${id}')">${ico('save')} Save</button>`);
  },

  async _saveEditCourse(id) {
    const name = document.getElementById('ec-name').value.trim();
    const code = document.getElementById('ec-code').value.trim();
    const creditHours = parseInt(document.getElementById('ec-cr').value) || 3;
    if (!name || !code) return toast('Name and code required', 'err');
    try {
      await Api.updateCourse(id, { name, code, creditHours });
      toast('Course updated');
      closeModal();
      this.courses();
    } catch(e) { toast(e.message, 'err'); }
  },

  async _deleteCourse(id, name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await Api.deleteCourse(id);
      toast('Course deleted');
      this.courses();
    } catch(e) { toast(e.message, 'err'); }
  },

  _openC(id, name, code) {
    this._cid = id;
    document.getElementById('view-root').innerHTML = `
      <div class="page-hd"><div class="page-hd-left">
        <button class="btn btn-ghost btn-sm mb2" onclick="FacultyView.courses()">${ico('back',13)} All Courses</button>
        <h1>${name}</h1><div class="hd-sub">${code}</div>
      </div></div>
      <div id="ctabs">
        <div class="tab-bar">
          <button class="tab-btn active" data-tab="tc-co">Course Outcomes</button>
          <button class="tab-btn" data-tab="tc-ass">Assessments</button>
          <button class="tab-btn" data-tab="tc-att">Attainment</button>
        </div>
        <div class="tab-pane active" id="tc-co"></div>
        <div class="tab-pane" id="tc-ass"></div>
        <div class="tab-pane" id="tc-att"></div>
      </div>`;
    initTabs('ctabs');
    this._loadCOs();
    document.querySelector('[data-tab="tc-ass"]').addEventListener('click',()=>this._loadAssess(),{once:true});
    document.querySelector('[data-tab="tc-att"]').addEventListener('click',()=>this._loadAttain(),{once:true});
  },

  // ── Course Outcomes (with PO mappings shown) ─────────────────
  async _loadCOs() {
    const el = document.getElementById('tc-co');
    el.innerHTML = `<div class="flex-between mb3"><span class="sec-title">Course Outcomes</span>
      <button class="btn btn-primary btn-sm" onclick="FacultyView._addCO()">${ico('plus')} Add CO</button></div>
      <div class="tbl-wrap"><table><thead><tr>
        <th>Code</th><th>Title</th><th>Bloom's</th><th>Profiles</th><th>Maps to POs</th><th class="td-r">Actions</th>
      </tr></thead><tbody id="co-tb">${tdLoad(6)}</tbody></table></div>`;
    try {
      const list = await Api.getCourseOutcomes(this._cid);
      document.getElementById('co-tb').innerHTML = list.length ? list.map(co => {
        const profiles = parseProfiles(co);
        const poLinks = (co.mappings||[])
          .filter(m => m.correlation)  // only show POs with an active mapping
          .map(m => `<span class="badge bg-blue" title="${m.programOutcome.title}">${m.programOutcome.code}</span>`)
          .join(' ') || '<span class="text-muted text-sm">None</span>';
        return `<tr>
          <td><span class="badge bg-green">${co.code}</span></td>
          <td><div class="fw7">${co.title}</div>${co.description?`<div class="text-sm text-muted">${co.description}</div>`:''}</td>
          <td>${co.bloomDomain?`<span class="badge bg-gray">${co.bloomDomain.charAt(0)}${co.bloomLevel||''}</span>`:'-'}</td>
          <td><div class="profile-chips">${renderProfileChips(profiles)}</div></td>
          <td>${poLinks}</td>
          <td class="td-r" style="white-space:nowrap;vertical-align:middle">
            <button class="btn btn-secondary btn-xs" style="margin-right:4px" onclick="FacultyView._editCO('${co.id}','${co.code}','${co.title.replace(/'/g,"&#39;")}','${(co.description||'').replace(/'/g,"&#39;")}','${co.bloomDomain||''}',${co.bloomLevel||'null'},'${co.profileCode||''}')">${ico('edit',13)} Edit</button>
            <button class="icon-btn danger" style="vertical-align:middle" onclick="FacultyView._delCO('${co.id}','${co.code}')">${ico('trash',13)}</button>
          </td>
        </tr>`;
      }).join('') : tdEmpty('No COs yet. Add your first Course Outcome.',6);
    } catch(e) { document.getElementById('co-tb').innerHTML = tdEmpty(e.message,6); }
  },

  async _addCO() {
    // Fetch POs for this course's program
    const { programOutcomes: pos } = await Api.getMapping(this._cid);

    // Bloom's level labels per domain
    const bloomLevels = {
      COGNITIVE:    ['1 - Remember','2 - Understand','3 - Apply','4 - Analyse','5 - Evaluate','6 - Create'],
      AFFECTIVE:    ['1 - Receiving','2 - Responding','3 - Valuing','4 - Organising','5 - Characterising'],
      PSYCHOMOTOR:  ['1 - Imitation','2 - Manipulation','3 - Precision','4 - Articulation','5 - Naturalisation'],
    };

    showModal('Add Course Outcome', `
      <div class="form-row fr2 mb3">
        <div class="fg"><label>Code</label><input id="mco-code" placeholder="e.g. CO1"></div>
        <div class="fg"><label>Title</label><input id="mco-title" placeholder="Short learning outcome"></div>
      </div>
      <div class="fg mb3"><label>Description <span class="text-muted">(optional)</span></label><textarea id="mco-desc" rows="2"></textarea></div>

      <div class="divider"></div>
      <div class="form-row fr2 mb3">
        <div class="fg">
          <label>Bloom's Domain</label>
          <select id="mco-bloom" onchange="FacultyView._updateBloomLevels()">
            <option value="">- None -</option>
            <option value="COGNITIVE">Cognitive (6 levels)</option>
            <option value="AFFECTIVE">Affective (5 levels)</option>
            <option value="PSYCHOMOTOR">Psychomotor (5 levels)</option>
          </select>
        </div>
        <div class="fg">
          <label>Bloom's Level</label>
          <select id="mco-blvl" disabled>
            <option value="">Select domain first</option>
          </select>
        </div>
      </div>

      <div class="fg mb3">
        <label>Graduate Profiles <span class="text-muted">(select all that apply)</span></label>
        ${profileSelectorHTML()}
      </div>

      <div class="divider"></div>
      <div class="fg">
        <label>Maps to Program Outcomes</label>
        <p class="text-sm text-muted mb2">Check all POs this CO contributes to.</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${pos.map(po => `
            <label style="display:flex;align-items:center;gap:7px;padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;cursor:pointer;font-size:12.5px;min-width:100px"
              onmouseenter="this.style.borderColor='var(--green)'" onmouseleave="this.style.borderColor='var(--border)'">
              <input type="checkbox" class="new-co-po" value="${po.id}"
                style="width:auto;accent-color:var(--green)">
              <span><strong>${po.code}</strong> <span class="text-muted">${po.title}</span></span>
            </label>`).join('')}
        </div>
        ${!pos.length ? '<p class="text-sm text-muted">No POs defined for this program yet.</p>' : ''}
      </div>`,
      `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="FacultyView._saveCO()">${ico('save')} Add CO</button>`, true);

    // Store bloom levels for use by the onchange handler
    window._bloomLevels = bloomLevels;
  },

  _updateBloomLevels() {
    const domain = document.getElementById('mco-bloom').value;
    const sel = document.getElementById('mco-blvl');
    if (!domain) {
      sel.innerHTML = '<option value="">Select domain first</option>';
      sel.disabled = true;
      return;
    }
    const levels = window._bloomLevels[domain] || [];
    sel.innerHTML = '<option value="">- Select level -</option>' +
      levels.map((lbl, i) => `<option value="${i+1}">${lbl}</option>`).join('');
    sel.disabled = false;
  },

  async _saveCO() {
    const profiles = collectProfiles();
    const d = {
      code: document.getElementById('mco-code').value.trim(),
      title: document.getElementById('mco-title').value.trim(),
      description: document.getElementById('mco-desc').value.trim() || null,
      bloomDomain: document.getElementById('mco-bloom').value || null,
      bloomLevel: parseInt(document.getElementById('mco-blvl').value) || null,
      profileType: profiles.length ? profiles[0].type : null,
      profileCode: profiles.length ? JSON.stringify(profiles) : null,
    };
    if (!d.code || !d.title) return toast('Code and title required', 'err');
    try {
      // Create the CO
      const co = await Api.createCO(this._cid, d);

      // Save PO mappings for this CO - get all PO checkboxes
      const checkedPoIds = [...document.querySelectorAll('.new-co-po:checked')].map(cb => cb.value);
      if (checkedPoIds.length) {
        // Fetch existing mappings, merge with new ones
        const { mappings: existingMappings, programOutcomes: pos } = await Api.getMapping(this._cid);
        const newMappings = pos.map(po => ({
          courseOutcomeId: co.id,
          programOutcomeId: po.id,
          correlation: checkedPoIds.includes(po.id) ? 'STRONG' : null,
        }));
        // Also preserve existing mappings for OTHER COs
        const otherMappings = existingMappings
          .filter(m => m.courseOutcomeId !== co.id)
          .map(m => ({ courseOutcomeId: m.courseOutcomeId, programOutcomeId: m.programOutcomeId, correlation: m.correlation }));
        await Api.saveMapping(this._cid, [...otherMappings, ...newMappings]);
      }

      toast('CO added' + (checkedPoIds.length ? ' with PO mappings' : ''));
      closeModal();
      this._loadCOs();
    }
    catch(e) { toast(e.message, 'err'); }
  },

  async _delCO(coId, code) {
    if (!confirm(`Delete ${code}?`)) return;
    try { await Api.deleteCO(this._cid, coId); toast('Deleted'); this._loadCOs(); }
    catch(e) { toast(e.message, 'err'); }
  },

  async _editCO(coId, code, title, description, bloomDomain, bloomLevel, profileCodeRaw) {
    const bloomLevels = {
      COGNITIVE:   ['1 - Remember','2 - Understand','3 - Apply','4 - Analyse','5 - Evaluate','6 - Create'],
      AFFECTIVE:   ['1 - Receiving','2 - Responding','3 - Valuing','4 - Organising','5 - Characterising'],
      PSYCHOMOTOR: ['1 - Imitation','2 - Manipulation','3 - Precision','4 - Articulation','5 - Naturalisation'],
    };
    window._bloomLevels = bloomLevels;
    const makeLvlOpts = (domain, current) => {
      if (!domain) return '<option value="">Select domain first</option>';
      return '<option value="">- Select level -</option>' +
        (bloomLevels[domain]||[]).map((lbl,i)=>`<option value="${i+1}" ${current==i+1?'selected':''}>${lbl}</option>`).join('');
    };
    showModal('Edit Course Outcome', `
      <div class="form-row fr2 mb3">
        <div class="fg"><label>Code</label><input id="eco-code" value="${code}"></div>
        <div class="fg"><label>Title</label><input id="eco-title" value="${title}"></div>
      </div>
      <div class="fg mb3"><label>Description <span class="text-muted">(optional)</span></label>
        <textarea id="eco-desc" rows="2">${description||''}</textarea></div>
      <div class="form-row fr2 mb3">
        <div class="fg"><label>Bloom's Domain</label>
          <select id="eco-bloom" onchange="FacultyView._updateEditBloomLevels()">
            <option value="" ${!bloomDomain?'selected':''}>- None -</option>
            <option value="COGNITIVE" ${bloomDomain==='COGNITIVE'?'selected':''}>Cognitive (6 levels)</option>
            <option value="AFFECTIVE" ${bloomDomain==='AFFECTIVE'?'selected':''}>Affective (5 levels)</option>
            <option value="PSYCHOMOTOR" ${bloomDomain==='PSYCHOMOTOR'?'selected':''}>Psychomotor (5 levels)</option>
          </select>
        </div>
        <div class="fg"><label>Bloom's Level</label>
          <select id="eco-blvl" ${!bloomDomain?'disabled':''}>
            ${makeLvlOpts(bloomDomain, bloomLevel)}
          </select>
        </div>
      </div>
      <div class="fg mb3">
        <label>Graduate Profiles <span class="text-muted">(select all that apply)</span></label>
        ${(()=>{ try{ return profileSelectorHTML(profileCodeRaw ? JSON.parse(decodeURIComponent(profileCodeRaw)) : []); }catch(e){ return profileSelectorHTML([]); } })()}
      </div>`,
      `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="FacultyView._saveEditCO('${coId}')">${ico('save')} Save CO</button>`, true);
  },

  _updateEditBloomLevels() {
    const domain = document.getElementById('eco-bloom').value;
    const sel = document.getElementById('eco-blvl');
    if (!domain) { sel.innerHTML = '<option value="">Select domain first</option>'; sel.disabled = true; return; }
    sel.innerHTML = '<option value="">- Select level -</option>' +
      (window._bloomLevels[domain]||[]).map((lbl,i)=>`<option value="${i+1}">${lbl}</option>`).join('');
    sel.disabled = false;
  },

  async _saveEditCO(coId) {
    const profiles = collectProfiles();
    const d = {
      code:        document.getElementById('eco-code').value.trim(),
      title:       document.getElementById('eco-title').value.trim(),
      description: document.getElementById('eco-desc').value.trim() || null,
      bloomDomain: document.getElementById('eco-bloom').value || null,
      bloomLevel:  parseInt(document.getElementById('eco-blvl').value) || null,
      profileType: profiles.length ? profiles[0].type : null,
      profileCode: profiles.length ? JSON.stringify(profiles) : null,
    };
    if (!d.code || !d.title) return toast('Code and title required', 'err');
    try {
      await Api.updateCO(this._cid, coId, d);
      toast('CO updated');
      closeModal();
      this._loadCOs();
    } catch(e) { toast(e.message, 'err'); }
  },

  // ── CO-PO Mapping (list, not matrix) ────────────────────────
  // CO-PO mapping is done inline when creating a CO (see _addCO / _saveCO)

  // ── Assessments (no weight, spreadsheet marks entry) ─────────
  async _loadAssess() {
    const el = document.getElementById('tc-ass');
    el.innerHTML = loading();
    try {
      const { assessments } = await Api.getAssessments(this._cid);
      el.innerHTML = `
        <div class="flex-between mb3">
          <div class="sec-title">Assessments</div>
          <button class="btn btn-primary btn-sm" onclick="FacultyView._addAssess()">${ico('plus')} Add Assessment</button>
        </div>
        <div class="tbl-wrap"><table><thead><tr>
          <th>Title</th><th>Type</th><th>Total Marks</th><th>Attainment Mark</th><th>Maps to COs</th><th class="td-r">Actions</th>
        </tr></thead>
        <tbody>${assessments.length ? assessments.map(a => {
          const attMark = a.weight > 0 ? a.weight : Math.floor(a.totalMarks * 0.6);
          return `<tr>
            <td class="fw7">${a.title}</td>
            <td><span class="badge bg-gray">${a.type.replace(/_/g,' ')}</span></td>
            <td>${a.totalMarks}</td>
            <td>
              <span id="am-${a.id}" style="font-weight:700;color:var(--green)">${attMark}</span>
              <button class="btn btn-ghost btn-xs" style="margin-left:4px" onclick="FacultyView._setAttainMark('${a.id}','${a.totalMarks}',${attMark})" title="Edit attainment mark">&#9998;</button>
            </td>
            <td>${(a.assessmentCOs||[]).map(ac=>'<span class="badge bg-green">'+( ac.courseOutcome?.code||'')+'</span>').join(' ')||'-'}</td>
            <td class="td-r" style="white-space:nowrap">
              <button class="btn btn-secondary btn-xs" onclick="FacultyView._uploadMarks('${a.id}','${a.title.replace(/'/g,'&#39;')}','${a.totalMarks}')" title="Upload Excel/CSV">&#8679; Upload</button>
              <button class="btn btn-primary btn-xs" onclick="FacultyView._openMarksSheet('${a.id}','${a.title.replace(/'/g,'&#39;')}','${a.totalMarks}')">${ico('edit',13)} Enter</button>
            </td>
          </tr>`;
        }).join('') : tdEmpty('No assessments yet',6)}</tbody></table></div>`;
    } catch(e) { el.innerHTML = `<div class="alert alert-error"><span class="alert-icon">⚠</span>${e.message}</div>`; }
  },

  _setAttainMark(aid, totalMarks, current) {
    showModal('Set Attainment Mark', `
      <p class="text-sm text-muted mb3">
        The attainment mark is the minimum a student must score on this assessment<br>
        for it to count towards CO achievement. Default is 60% of total marks.
      </p>
      <div style="display:flex;align-items:center;gap:12px">
        <div class="fg" style="flex:1"><label>Attainment Mark</label>
          <input id="am-inp" type="number" value="${current}" min="1" max="${totalMarks}" style="font-size:18px;font-weight:700;text-align:center">
        </div>
        <div style="padding-top:22px;color:var(--text3);font-size:13px">out of <strong>${totalMarks}</strong></div>
      </div>
      <p class="text-sm text-muted mt2">Valid range: 1 – ${totalMarks}</p>`,
      '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-primary" id="save-attain-btn">Save</button>');
    setTimeout(() => {
      const btn = document.getElementById('save-attain-btn');
      if (btn) btn.onclick = () => FacultyView._saveAttainMark(aid);
    }, 50);
  },

  async _saveAttainMark(aid) {
    const val = parseFloat(document.getElementById('am-inp').value);
    if (!val || val < 1) return toast('Enter a valid attainment mark', 'err');
    try {
      await Api.setAttainmentMark(this._cid, aid, val);
      document.getElementById('am-' + aid).textContent = val;
      toast('Attainment mark updated - attainment recomputed');
      closeModal();
    } catch(e) { toast(e.message, 'err'); }
  },

  async _uploadMarks(aid, title, totalMarks) {
    showModal('Upload Marks - ' + title, `
      <div class="alert alert-info mb3"><span class="alert-icon">i</span>
        Upload Excel (.xlsx) or CSV with columns: <strong>institutionalId</strong> (roll number) and <strong>marks</strong><br>
        Total marks for this assessment: <strong>${totalMarks}</strong>
      </div>
      <div class="fg mb3">
        <label>Download Template</label>
        <button class="btn btn-secondary btn-sm" onclick="FacultyView._dlMarksTemplate('${aid}')">&#8659; CSV Template</button>
      </div>
      <div class="fg"><label>Upload File</label>
        <input type="file" id="marks-upload-file" accept=".csv,.xlsx,.xls" style="padding:8px">
      </div>
      <div id="marks-upload-preview" class="mt3"></div>`,
      '<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="btn btn-secondary" id="parse-marks-btn">Parse File</button>' +
      '<button class="btn btn-primary" id="confirm-marks-btn">Confirm Upload</button>'
    );
    setTimeout(function() {
      var pb = document.getElementById('parse-marks-btn');
      var cb = document.getElementById('confirm-marks-btn');
      var _aid = aid; var _tm = totalMarks;
      if (pb) pb.onclick = function() { FacultyView._parseMarksFile(_aid, _tm); };
      if (cb) cb.onclick = function() { FacultyView._confirmMarksUpload(_aid, _tm); };
    }, 50);
  },

  async _dlMarksTemplate(aid) {
    try {
      const marks = await Api.getMarks(aid);
      const rows = ['institutionalId,marks', ...marks.map(m => m.institutionalId + ',')];
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([rows.join('\n')], {type:'text/csv'}));
      a.download = 'marks_template.csv'; a.click();
    } catch(e) { toast(e.message, 'err'); }
  },

  async _parseMarksFile(aid, totalMarks) {
    const file = document.getElementById('marks-upload-file')?.files[0];
    if (!file) return toast('Select a file first', 'err');
    const preview = document.getElementById('marks-upload-preview');
    preview.innerHTML = '<div class="loading-box" style="padding:10px 0"><div class="spin"></div> Reading...</div>';
    try {
      let rows = [];
      const tm = parseFloat(totalMarks);
      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,'').toLowerCase());
        const idIdx = headers.findIndex(h => h.includes('id') || h.includes('roll'));
        const markIdx = headers.findIndex(h => h.includes('mark') || h.includes('score'));
        rows = lines.slice(1).filter(l => l.trim()).map(line => {
          const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g,''));
          return { institutionalId: vals[idIdx]||'', marks: vals[markIdx]||'' };
        });
      } else {
        const ab = await file.arrayBuffer();
        const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs');
        const wb = XLSX.read(ab);
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
        rows = raw.map(r => ({
          institutionalId: String(r.institutionalId||r['Institutional ID']||r.rollNumber||r.roll||'').trim(),
          marks: String(r.marks||r.Marks||r.score||r.Score||'').trim(),
        }));
      }
      rows = rows.filter(r => r.institutionalId);
      if (!rows.length) { preview.innerHTML = '<div class="alert alert-warn">No data found.</div>'; return; }

      // Validate
      const invalid = rows.filter(r => r.marks !== '' && (isNaN(parseFloat(r.marks)) || parseFloat(r.marks) < 0 || parseFloat(r.marks) > tm));
      preview.innerHTML = '<div class="sec-title mb2">Preview - ' + rows.length + ' students</div>' +
        (invalid.length ? '<div class="alert alert-warn mb2">&#9888; ' + invalid.length + ' row(s) have invalid marks (will be skipped)</div>' : '') +
        '<div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--r)">' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead style="background:var(--surface2)"><tr>' +
        '<th style="padding:7px 10px">Roll No.</th><th style="padding:7px 10px">Marks</th><th style="padding:7px 10px">%</th><th style="padding:7px 10px">Status</th>' +
        '</tr></thead><tbody>' +
        rows.map((r,i) => {
          const m = parseFloat(r.marks);
          const valid = r.marks !== '' && !isNaN(m) && m >= 0 && m <= tm;
          const pct = valid ? (m/tm*100).toFixed(1)+'%' : '-';
          const st = !r.marks ? '<span class="text-muted">Empty</span>' : valid ? '<span class="badge '+(m/tm>=0.6?'bg-green':'bg-red')+'">'+(m/tm>=0.6?'Pass':'Fail')+'</span>' : '<span class="badge bg-red">Invalid</span>';
          return '<tr style="background:'+(i%2?'var(--surface2)':'var(--surface)')+'"><td style="padding:6px 10px;border-top:1px solid var(--border);font-family:monospace">'+r.institutionalId+'</td><td style="padding:6px 10px;border-top:1px solid var(--border);font-weight:700">'+( r.marks||'-')+'</td><td style="padding:6px 10px;border-top:1px solid var(--border)">'+pct+'</td><td style="padding:6px 10px;border-top:1px solid var(--border)">'+st+'</td></tr>';
        }).join('') + '</tbody></table></div>';
      window._parsedMarks = rows;
      toast(rows.length + ' rows parsed. Click Confirm Upload.', 'ok');
    } catch(e) { preview.innerHTML = '<div class="alert alert-error"><span class="alert-icon">!</span>' + e.message + '</div>'; }
  },

  async _confirmMarksUpload(aid, totalMarks) {
    const parsed = window._parsedMarks;
    if (!parsed || !parsed.length) return toast('Parse a file first', 'err');
    // Match institutionalId to studentId
    try {
      const allMarks = await Api.getMarks(aid);
      const idMap = Object.fromEntries(allMarks.map(m => [m.institutionalId, m.studentId]));
      const tm = parseFloat(totalMarks);
      const marks = [];
      const skipped = [];
      for (const r of parsed) {
        if (!r.marks) continue;
        const m = parseFloat(r.marks);
        if (isNaN(m) || m < 0 || m > tm) { skipped.push(r.institutionalId); continue; }
        const sid = idMap[r.institutionalId];
        if (!sid) { skipped.push(r.institutionalId + ' (not enrolled)'); continue; }
        marks.push({ studentId: sid, marksObtained: m });
      }
      if (!marks.length) return toast('No valid marks to upload', 'err');
      await Api.saveMarks(aid, marks);
      toast('Uploaded ' + marks.length + ' marks' + (skipped.length ? ', skipped ' + skipped.length : ''));
      closeModal();
      window._parsedMarks = null;
      this._loadAssess();
    } catch(e) { toast(e.message, 'err'); }
  },

  async _viewStudentAttainment(courseId, studentId, studentName) {
    showModal('Attainment - ' + studentName, loading(), '', true);
    try {
      const d = await Api.getStudentAttainment(courseId, studentId);
      const stu = d.student || {};
      const stuInfo = '<div style="display:flex;gap:16px;margin-bottom:16px;padding:12px;background:var(--surface2);border-radius:var(--r)">' +
        '<div><span class="text-muted text-sm">ID</span><div class="fw7" style="font-family:monospace">'+(stu.institutionalId||'--')+'</div></div>' +
        (stu.section?'<div><span class="text-muted text-sm">Section</span><div class="fw7">Section '+stu.section+'</div></div>':'') +
        '</div>';

      const coRows = (d.coAttainments||[]).map(r => {
        const att = r.level === 'L3';
        return '<tr><td><span class="badge bg-green">' + r.courseOutcome.code + '</span></td>' +
          '<td>' + r.courseOutcome.title + '</td>' +
          '<td style="text-align:center"><span class="badge ' + (att?'bg-green':'bg-red') + '">' + (att?'Attained':'Not Attained') + '</span></td>' +
          '<td style="text-align:right;font-weight:700;color:' + (att?'var(--l3)':'var(--l0)') + '">' + r.percentage.toFixed(1) + '%</td></tr>';
      }).join('');
      const poRows = (d.poAttainments||[]).map(r => {
        const att = r.level === 'L3';
        return '<tr><td><span class="badge bg-blue">' + r.programOutcome.code + '</span></td>' +
          '<td>' + r.programOutcome.title + '</td>' +
          '<td style="text-align:center"><span class="badge ' + (att?'bg-green':'bg-red') + '">' + (att?'Attained':'Not Attained') + '</span></td>' +
          '<td style="text-align:right;font-weight:700;color:' + (att?'var(--l3)':'var(--l0)') + '">' + r.percentage.toFixed(1) + '%</td></tr>';
      }).join('');
      const assRows = (d.assessmentDetail||[]).map(a => {
        const hm = a.marksObtained != null;
        return '<tr><td class="fw6">' + a.title + '</td>' +
          '<td style="text-align:center">' + a.totalMarks + '</td>' +
          '<td style="text-align:center;color:var(--text3)">' + a.attainmentMark + '</td>' +
          '<td style="text-align:center;font-weight:700">' + (hm ? a.marksObtained : '-') + '</td>' +
          '<td style="text-align:center">' + (hm ? '<span class="badge ' + (a.passed?'bg-green':'bg-red') + '">' + (a.passed?'Pass':'Fail') + '</span>' : '-') + '</td></tr>';
      }).join('');
      document.getElementById('modal-body').innerHTML =
        stuInfo +
        '<div class="sec-title mb2">Marks by Assessment</div>' +
        '<div class="tbl-wrap mb4"><table><thead><tr><th>Assessment</th><th style="text-align:center">Total</th><th style="text-align:center">Attainment Mark</th><th style="text-align:center">Obtained</th><th style="text-align:center">Result</th></tr></thead><tbody>' + assRows + '</tbody></table></div>' +
        '<div class="sec-title mb2">PO Attainment</div>' +
        '<div class="tbl-wrap mb4"><table><thead><tr><th>PO</th><th>Title</th><th style="text-align:center">Result</th><th style="text-align:right">Score</th></tr></thead><tbody>' + poRows + '</tbody></table></div>' +
        '<div class="sec-title mb2">CO Attainment</div>' +
        '<div class="tbl-wrap"><table><thead><tr><th>CO</th><th>Title</th><th style="text-align:center">Result</th><th style="text-align:right">Score</th></tr></thead><tbody>' + coRows + '</tbody></table></div>';
      FacultyView._lastStuReport = { student: d.student, assessmentDetail: d.assessmentDetail||[], coAttainments: d.coAttainments||[], poAttainments: d.poAttainments||[] };
      document.getElementById('modal-ft').innerHTML =
        '<button class="btn btn-secondary btn-sm" onclick="FacultyView._exportStuCSV()">CSV</button>' +
        '<button class="btn btn-secondary btn-sm" onclick="FacultyView._exportStuPDF()">PDF</button>' +
        '<button class="btn btn-ghost" onclick="closeModal()">Close</button>';
      document.getElementById('modal-ft').classList.remove('hidden');
    } catch(e) { document.getElementById('modal-body').innerHTML = '<div class="alert alert-error"><span class="alert-icon">!</span>' + e.message + '</div>'; }
  },

  async _addAssess() {
    const cos = await Api.getCourseOutcomes(this._cid);
    const types = ['QUIZ','ASSIGNMENT','MID_TERM','FINAL','LAB','PROJECT','PRESENTATION','OTHER'];
    showModal('Add Assessment', `
      <div class="fg mb3"><label>Title</label><input id="ma-title" placeholder="e.g. Mid Term Examination"></div>
      <div class="form-row fr2 mb3">
        <div class="fg"><label>Type</label>
          <select id="ma-type">${types.map(t=>`<option value="${t}">${t.replace(/_/g,' ')}</option>`).join('')}</select></div>
        <div class="fg"><label>Total Marks</label><input id="ma-marks" type="number" value="100" min="1"></div>
      </div>
      <div class="fg"><label>Map to Course Outcomes</label>
        <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:6px">
          ${cos.map(co=>`
            <label style="display:flex;align-items:center;gap:6px;padding:6px 11px;border:1.5px solid var(--border);border-radius:7px;cursor:pointer;font-size:12.5px">
              <input type="checkbox" class="co-chk" value="${co.id}" style="width:auto;accent-color:var(--green)">
              <strong>${co.code}</strong> <span class="text-muted">${co.title}</span>
            </label>`).join('')}
        </div>
      </div>`,
      `<button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
       <button class="btn btn-primary" onclick="FacultyView._saveAssess()">${ico('save')} Add</button>`);
  },

  async _saveAssess() {
    const d = {
      title: document.getElementById('ma-title').value.trim(),
      type: document.getElementById('ma-type').value,
      totalMarks: parseFloat(document.getElementById('ma-marks').value),
      courseOutcomeIds: [...document.querySelectorAll('.co-chk:checked')].map(c=>c.value),
    };
    if (!d.title) return toast('Title required', 'err');
    try { await Api.createAssessment(this._cid, d); toast('Assessment added'); closeModal(); this._loadAssess(); }
    catch(e) { toast(e.message, 'err'); }
  },

  // ── Marks - Spreadsheet style ────────────────────────────────
  async _openMarksSheet(aid, title, totalMarks) {
    document.getElementById('tc-ass').innerHTML = loading();
    try {
      const marks = await Api.getMarks(aid);
      const tm = parseFloat(totalMarks);

      document.getElementById('tc-ass').innerHTML = `
        <div class="flex-between mb3">
          <div>
            <button class="btn btn-ghost btn-sm mb2" onclick="FacultyView._loadAssess()">${ico('back',13)} Back to Assessments</button>
            <div class="sec-title">Marks - ${title} <span class="badge bg-gray">/${tm}</span></div>
            <p class="text-sm text-muted">Edit marks inline. Click Save when done.</p>
          </div>
          <button class="btn btn-primary" onclick="FacultyView._saveAllMarks('${aid}','${tm}')">${ico('save')} Save All Marks</button>
        </div>
        <div class="tbl-wrap">
          <table id="marks-sheet">
            <thead><tr>
              <th style="width:40px">#</th>
              <th>Roll No.</th>
              <th>Name</th>
              <th style="width:120px;text-align:center">Marks / ${tm}</th>
              <th style="width:80px;text-align:center">% Score</th>
              <th style="width:100px;text-align:center">Status</th>
            </tr></thead>
            <tbody>
              ${marks.map((m, i) => {
                const hasMark = m.marksObtained != null;
                const pct = hasMark ? (m.marksObtained / tm * 100).toFixed(1) : '';
                const pass = hasMark && m.marksObtained / tm >= 0.6;
                return `<tr id="mrow-${m.studentId}">
                  <td style="color:var(--text3)">${i+1}</td>
                  <td style="font-family:monospace;font-size:12px">${m.institutionalId}</td>
                  <td class="fw6">${m.name}</td>
                  <td style="text-align:center">
                    <input type="number" class="mark-inp" data-sid="${m.studentId}" data-tm="${tm}"
                      value="${hasMark ? m.marksObtained : ''}" min="0" max="${tm}" placeholder="-"
                      style="width:90px;text-align:center;font-weight:700"
                      oninput="FacultyView._onMarkInput(this)">
                  </td>
                  <td class="pct-cell" style="text-align:center;font-weight:700;color:${hasMark?(pass?'var(--l3)':'var(--l0)'):'var(--text4)'}">
                    ${pct ? pct+'%' : '-'}
                  </td>
                  <td class="status-cell" style="text-align:center">
                    ${hasMark ? `<span class="badge ${pass?'bg-green':'bg-red'}">${pass?'Attained':'Not Attained'}</span>` : '-'}
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="mt3 flex-between">
          <span class="text-sm text-muted">${marks.length} students</span>
          <button class="btn btn-primary" onclick="FacultyView._saveAllMarks('${aid}','${tm}')">${ico('save')} Save All Marks</button>
        </div>`;
    } catch(e) {
      document.getElementById('tc-ass').innerHTML = `<div class="alert alert-error"><span class="alert-icon">⚠</span>${e.message}</div>`;
    }
  },

  _onMarkInput(inp) {
    const tm = parseFloat(inp.dataset.tm);
    const v = parseFloat(inp.value);
    const row = inp.closest('tr');
    const pctCell = row.querySelector('.pct-cell');
    const statusCell = row.querySelector('.status-cell');
    if (!inp.value || isNaN(v)) {
      pctCell.textContent = '-'; pctCell.style.color = 'var(--text4)';
      statusCell.innerHTML = '-';
      return;
    }
    const pct = (v / tm * 100).toFixed(1);
    const pass = v / tm >= 0.6;
    pctCell.textContent = pct + '%';
    pctCell.style.color = pass ? 'var(--l3)' : 'var(--l0)';
    statusCell.innerHTML = `<span class="badge ${pass?'bg-green':'bg-red'}">${pass?'Attained':'Not Attained'}</span>`;
  },

  async _saveAllMarks(aid, totalMarks) {
    const tm = parseFloat(totalMarks);
    const marks = [], invalid = [];
    document.querySelectorAll('.mark-inp').forEach(inp => {
      if (!inp.value) return;
      const v = parseFloat(inp.value);
      if (isNaN(v) || v < 0 || v > tm) { invalid.push(inp.dataset.sid); return; }
      marks.push({ studentId: inp.dataset.sid, marksObtained: v });
    });
    if (invalid.length) return toast(`Invalid marks for ${invalid.length} student(s)`, 'err');
    if (!marks.length) return toast('No marks entered', 'err');
    try {
      await Api.saveMarks(aid, marks);
      toast(`${marks.length} marks saved - attainment recomputed`);
    } catch(e) { toast(e.message, 'err'); }
  },

  // ── Attainment - % of students who attained ──────────────────
  async _loadAttain() {
    const el = document.getElementById('tc-att');
    el.innerHTML = loading();
    try {
      const _attRes = await Api.getCourseAttainment(this._cid);
      const coSummary = (_attRes && _attRes.coSummary) || [];
      const poSummary = (_attRes && _attRes.poSummary) || [];
      if (!coSummary.length && !poSummary.length) {
        el.innerHTML = `<div class="empty-box"><div class="empty-ico">${ico('chart',24)}</div>
          <h3>No attainment data yet</h3>
          <p>Enter marks and save CO-PO mappings to compute attainment.</p></div>`;
        return;
      }

      FacultyView._lastAttainData = { coSummary, poSummary };
      el.innerHTML = `
        <div class="flex-between mb3">
          <div class="sec-title">Program Outcome Attainment</div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="FacultyView._exportAttainCSV()">${ico('dl',13)} Export CSV</button>
            <button class="btn btn-secondary btn-sm" onclick="FacultyView._exportAttainPDF()">${ico('dl',13)} Export PDF</button>
          </div>
        </div>
        <div class="tbl-wrap mb4"><table>
          <thead><tr>
            <th>PO</th><th>Title</th>
            <th style="text-align:center">Students Attained</th>
            <th style="text-align:center">Total Students</th>
            <th style="min-width:180px">Attainment Rate</th>
          </tr></thead>
          <tbody>${poSummary.map(po => {
            const lvl = po.attainmentRate >= 60 ? 'L3' : 'L0';
            return `<tr>
              <td><span class="badge bg-blue">${po.code}</span></td>
              <td>${po.title}</td>
              <td style="text-align:center;font-weight:700;color:var(--l3)">${po.attainedCount}</td>
              <td style="text-align:center;color:var(--text3)">${po.totalStudents}</td>
              <td>${attBar(po.attainmentRate, lvl)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>

        <div class="sec-title mb3">Course Outcome Attainment</div>
        <div class="tbl-wrap mb4"><table>
          <thead><tr>
            <th>CO</th><th>Title</th>
            <th style="text-align:center">Students Attained</th>
            <th style="text-align:center">Total Students</th>
            <th style="min-width:180px">Attainment Rate</th>
          </tr></thead>
          <tbody>${coSummary.map(co => {
            const lvl = co.attainmentRate >= 60 ? 'L3' : 'L0';
            return `<tr>
              <td><span class="badge bg-green">${co.code}</span></td>
              <td>${co.title}</td>
              <td style="text-align:center;font-weight:700;color:var(--l3)">${co.attainedCount}</td>
              <td style="text-align:center;color:var(--text3)">${co.totalStudents}</td>
              <td>${attBar(co.attainmentRate, lvl)}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>
        <div class="sec-title mb3">Individual Student Report</div>
        <div id="att-students">${loading()}</div>`;
      // Load enrolled students for per-student view
      FacultyView._loadAttainStudents();
    } catch(e) { el.innerHTML = `<div class="alert alert-error"><span class="alert-icon">⚠</span>${e.message}</div>`; }
  },

  _exportAttainCSV() {
    const d = FacultyView._lastAttainData;
    if (!d) return toast('Load attainment first', 'err');
    const rows = [
      ['Type','Code','Title','Attained Students','Total Students','Attainment Rate (%)'],
      ...(d.poSummary||[]).map(r=>['PO',r.code,r.title,r.attainedCount,r.totalStudents,(+(r.attainmentRate||0)).toFixed(1)]),
      ['','','','','',''],
      ...(d.coSummary||[]).map(r=>['CO',r.code,r.title,r.attainedCount,r.totalStudents,(+(r.attainmentRate||0)).toFixed(1)]),
    ];
    const csv = rows.map(r=>r.map(v=>'"'+String(v||'').replace(/"/g,'""')+'"').join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download = 'course_attainment.csv'; a.click();
  },

  _exportAttainPDF() {
    const d = FacultyView._lastAttainData;
    if (!d) return toast('Load attainment first', 'err');
    const win = window.open('','_blank');
    const poRows=(d.poSummary||[]).map(r=>`<tr><td><b>${r.code}</b></td><td>${r.title}</td><td style="text-align:center;font-weight:700;color:${r.attainmentRate>=60?'#16a34a':'#dc2626'}">${r.attainedCount}</td><td style="text-align:center">${r.totalStudents}</td><td style="text-align:right">${(+(r.attainmentRate||0)).toFixed(1)}%</td></tr>`).join('');
    const coRows=(d.coSummary||[]).map(r=>`<tr><td><b>${r.code}</b></td><td>${r.title}</td><td style="text-align:center;font-weight:700;color:${r.attainmentRate>=60?'#16a34a':'#dc2626'}">${r.attainedCount}</td><td style="text-align:center">${r.totalStudents}</td><td style="text-align:right">${(+(r.attainmentRate||0)).toFixed(1)}%</td></tr>`).join('');
    win.document.write(`<!DOCTYPE html><html><head><title>Course Attainment Report</title><style>
      body{font-family:Arial,sans-serif;padding:30px;color:#222}
      h1{font-size:20px;margin-bottom:4px}h2{font-size:15px;color:#555;margin:20px 0 8px}p{color:#888;font-size:12px;margin:0 0 20px}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px}
      th{background:#f0f0f0;padding:8px 10px;text-align:left;border:1px solid #ccc}
      td{padding:7px 10px;border:1px solid #ddd}tr:nth-child(even){background:#fafafa}
      @media print{button{display:none}}
    </style></head><body>
    <h1>Course Attainment Report</h1><p>Generated: ${new Date().toLocaleString()}</p>
    <h2>Program Outcome Attainment</h2>
    <table><thead><tr><th>PO</th><th>Title</th><th>Attained</th><th>Total</th><th style="text-align:right">Rate</th></tr></thead>
    <tbody>${poRows}</tbody></table>
    <h2>Course Outcome Attainment</h2>
    <table><thead><tr><th>CO</th><th>Title</th><th>Attained</th><th>Total</th><th style="text-align:right">Rate</th></tr></thead>
    <tbody>${coRows}</tbody></table>
    <button onclick="window.print()" style="padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨 Print / Save as PDF</button>
    </body></html>`);
    win.document.close();
  },

  // ── Reports ──────────────────────────────────────────────────
  async _loadAttainStudents() {
    const el = document.getElementById('att-students');
    if (!el) return;
    try {
      const students = await Api.getCourseStudents(this._cid);
      if (!students || !students.length) {
        el.innerHTML = '<div class="empty-box"><h3>No students enrolled in this course</h3></div>';
        return;
      }
      this._allAttainStudents = students;
      this._renderAttainStudents(students);
    } catch(e) {
      if (el) el.innerHTML = '<div class="alert alert-warn"><span class="alert-icon">&#9888;</span>' + e.message + '</div>';
    }
  },

  _renderAttainStudents(students) {
    const el = document.getElementById('att-students');
    if (!el) return;
    if (!students.length) {
      el.innerHTML = '<div class="empty-box"><h3>No students match the filter</h3></div>';
      return;
    }
    const ths = 'padding:8px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text3);border-bottom:1px solid var(--border)';
    el.innerHTML =
      '<div style="display:flex;gap:10px;margin-bottom:12px">' +
        '<div class="search-wrap" style="flex:1"><input id="att-stu-search" placeholder="Search name or roll number..." oninput="FacultyView._filterAttainStudents()" style="font-size:13px"></div>' +
        '<select id="att-stu-section" onchange="FacultyView._filterAttainStudents()" style="min-width:130px">' +
          '<option value="">All Sections</option>' +
          '<option value="A">Section A</option>' +
          '<option value="B">Section B</option>' +
        '</select>' +
      '</div>' +
      '<div class="tbl-wrap"><table style="width:100%;border-collapse:collapse">' +
      '<thead style="background:var(--surface2)"><tr>' +
        '<th style="' + ths + ';width:40px">#</th>' +
        '<th style="' + ths + '">Roll No.</th>' +
        '<th style="' + ths + '">Name</th>' +
        '<th style="' + ths + '">Section</th>' +
        '<th style="' + ths + '">Batch</th>' +
        '<th style="' + ths + ';text-align:right">Report</th>' +
      '</tr></thead><tbody>' +
      students.map((s, i) => {
        const batch = s.session?.name || (s.institutionalId ? 'Batch 20' + s.institutionalId.substring(0,2) : '--');
        const sec   = s.section ? 'Section ' + s.section : '--';
        return '<tr style="background:' + (i%2?'var(--surface2)':'var(--surface)') + '">' +
          '<td style="padding:9px 12px;color:var(--text3);border-bottom:1px solid var(--border)">' + (i+1) + '</td>' +
          '<td style="padding:9px 12px;font-family:monospace;font-size:12px;border-bottom:1px solid var(--border)">' + (s.institutionalId||'-') + '</td>' +
          '<td style="padding:9px 12px;font-weight:600;border-bottom:1px solid var(--border)">' + s.firstName + ' ' + s.lastName + '</td>' +
          '<td style="padding:9px 12px;border-bottom:1px solid var(--border)"><span class="badge bg-gray">' + sec + '</span></td>' +
          '<td style="padding:9px 12px;border-bottom:1px solid var(--border)"><span class="badge bg-blue">' + batch + '</span></td>' +
          '<td style="padding:9px 12px;text-align:right;border-bottom:1px solid var(--border)">' +
            '<button class="btn btn-primary btn-xs stu-att-btn" data-cid="' + this._cid + '" data-sid="' + s.id + '" data-name="' + (s.firstName + ' ' + s.lastName).replace(/"/g,'&quot;') + '">View Report</button>' +
          '</td></tr>';
      }).join('') +
      '</tbody></table></div>' +
      '<div class="mt2 text-sm text-muted">' + students.length + ' students enrolled</div>';

    el.querySelectorAll('.stu-att-btn').forEach(function(btn) {
      btn.onclick = function() {
        FacultyView._viewStudentAttainment(btn.dataset.cid, btn.dataset.sid, btn.dataset.name);
      };
    });
  },

  _filterAttainStudents() {
    const q     = (document.getElementById('att-stu-search')?.value || '').toLowerCase();
    const sec   = document.getElementById('att-stu-section')?.value || '';
    const all   = this._allAttainStudents || [];
    const filtered = all.filter(s => {
      const matchQ   = !q || (s.firstName+' '+s.lastName).toLowerCase().includes(q) || (s.institutionalId||'').includes(q);
      const matchSec = !sec || s.section === sec;
      return matchQ && matchSec;
    });
    this._renderAttainStudents(filtered);
  },


  async reports() {
    document.getElementById('view-root').innerHTML = `
      <div class="page-hd"><div class="page-hd-left"><h1>Reports</h1><div class="hd-sub">Generate course attainment reports</div></div></div>
      ${loading()}`;
    try {
      const list = await Api.getMyCourses();
      document.getElementById('view-root').innerHTML = `
        <div class="page-hd"><div class="page-hd-left"><h1>Reports</h1><div class="hd-sub">Download attainment data</div></div></div>
        <div class="card" style="max-width:500px"><div class="card-bd">
          <div class="fg mb4"><label>Course</label>
            <select id="rep-c"><option value="">-- Select Course --</option>${list.map(c=>`<option value="${c.id}" data-code="${c.code}" data-name="${c.name.replace(/"/g,'&quot;')}">${c.code} - ${c.name}</option>`).join('')}</select></div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-primary" onclick="FacultyView._genReport('csv')">${ico('dl')} Download CSV</button>
            <button class="btn btn-secondary" onclick="FacultyView._genReport('pdf')">${ico('dl')} Download PDF</button>
          </div>
          <div id="rep-res" class="mt3"></div>
        </div></div>`;
    } catch(e) { document.getElementById('view-root').innerHTML += `<div class="alert alert-error"><span class="alert-icon">⚠</span>${e.message}</div>`; }
  },

  async _genReport(format='csv') {
    const sel = document.getElementById('rep-c');
    const courseId = sel.value;
    if (!courseId) return toast('Please select a course first', 'err');
    const courseCode = sel.selectedOptions[0]?.dataset.code || sel.selectedOptions[0]?.text.split(' - ')[0] || 'course';
    const courseName = sel.selectedOptions[0]?.text.split(' - ').slice(1).join(' - ') || '';
    const el = document.getElementById('rep-res');
    el.innerHTML = `<div class="loading-box" style="padding:12px 0;justify-content:flex-start"><div class="spin"></div> Generating…</div>`;
    try {
      const _repRes = await Api.getCourseAttainment(courseId);
      const coSummary = (_repRes && _repRes.coSummary) || [];
      const poSummary = (_repRes && _repRes.poSummary) || [];
      if (!coSummary.length && !poSummary.length) { el.innerHTML = '<div class="alert alert-warn">No attainment data yet for this course.</div>'; return; }

      if (format === 'csv') {
        const rows = [
          ['Type','Code','Title','Attained Students','Total Students','Attainment Rate (%)'],
          ...poSummary.map(r => ['PO', r.code, r.title, r.attainedCount, r.totalStudents, (+(r.attainmentRate||0)).toFixed(1)]),
          ['','','','','',''],
          ...coSummary.map(r => ['CO', r.code, r.title, r.attainedCount, r.totalStudents, (+(r.attainmentRate||0)).toFixed(1)]),
        ];
        const csv = rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
        a.download = 'attainment_' + courseCode + '.csv'; a.click();
        el.innerHTML = `<div class="alert alert-success"><span class="alert-icon">✓</span>CSV downloaded.</div>`;
      } else {
        const win = window.open('','_blank');
        const poRows = poSummary.map(r=>`<tr><td><b>${r.code}</b></td><td>${r.title}</td><td style="text-align:center;font-weight:700;color:${r.attainmentRate>=60?'#16a34a':'#dc2626'}">${r.attainedCount}</td><td style="text-align:center">${r.totalStudents}</td><td style="text-align:right">${(+(r.attainmentRate||0)).toFixed(1)}%</td></tr>`).join('');
        const coRows = coSummary.map(r=>`<tr><td><b>${r.code}</b></td><td>${r.title}</td><td style="text-align:center;font-weight:700;color:${r.attainmentRate>=60?'#16a34a':'#dc2626'}">${r.attainedCount}</td><td style="text-align:center">${r.totalStudents}</td><td style="text-align:right">${(+(r.attainmentRate||0)).toFixed(1)}%</td></tr>`).join('');
        win.document.write(`<!DOCTYPE html><html><head><title>Report - ${courseCode}</title><style>
          body{font-family:Arial,sans-serif;padding:30px;color:#222}
          h1{font-size:20px;margin-bottom:4px}h2{font-size:15px;color:#555;margin:20px 0 8px}
          p{color:#888;font-size:12px;margin:0 0 20px}
          table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px}
          th{background:#f0f0f0;padding:8px 10px;text-align:left;border:1px solid #ccc}
          td{padding:7px 10px;border:1px solid #ddd}tr:nth-child(even){background:#fafafa}
          @media print{button{display:none}}
        </style></head><body>
        <h1>Attainment Report — ${courseCode}: ${courseName}</h1>
        <p>Generated: ${new Date().toLocaleString()}</p>
        <h2>Program Outcome Attainment</h2>
        <table><thead><tr><th>PO</th><th>Title</th><th>Attained</th><th>Total</th><th style="text-align:right">Rate</th></tr></thead>
        <tbody>${poRows}</tbody></table>
        <h2>Course Outcome Attainment</h2>
        <table><thead><tr><th>CO</th><th>Title</th><th>Attained</th><th>Total</th><th style="text-align:right">Rate</th></tr></thead>
        <tbody>${coRows}</tbody></table>
        <button onclick="window.print()" style="padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨 Print / Save as PDF</button>
        </body></html>`);
        win.document.close();
        el.innerHTML = `<div class="alert alert-success"><span class="alert-icon">✓</span>PDF opened in new tab — use Print to save.</div>`;
      }
    } catch(e) { el.innerHTML = `<div class="alert alert-error"><span class="alert-icon">⚠</span>${e.message}</div>`; }
  },

  // ── Individual student export (from attainment tab) ──────────
  _exportStuCSV() {
    const d = FacultyView._lastStuReport; if(!d) return toast('Open a student report first','err');
    const stu = d.student||{};
    const rows=[
      ['Student', (stu.firstName||'')+' '+(stu.lastName||'')], ['ID', stu.institutionalId||''], ['',''],
      ['Type','Code','Title','Result','Score (%)'],
      ...(d.poAttainments||[]).map(r=>['PO',r.programOutcome.code,r.programOutcome.title,r.level==='L3'?'Attained':'Not Attained',r.percentage.toFixed(1)]),
      ['','','','',''],
      ...(d.coAttainments||[]).map(r=>['CO',r.courseOutcome.code,r.courseOutcome.title,r.level==='L3'?'Attained':'Not Attained',r.percentage.toFixed(1)]),
    ];
    const csv=rows.map(r=>r.map(v=>'"'+String(v||'').replace(/"/g,'""')+'"').join(',')).join('\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='attainment_'+(stu.institutionalId||'student')+'.csv'; a.click();
  },

  _exportStuPDF() {
    const d = FacultyView._lastStuReport; if(!d) return toast('Open a student report first','err');
    const stu=d.student||{};
    const name=(stu.firstName||'')+' '+(stu.lastName||'');
    const batch=stu.session?.name || (stu.institutionalId?'Batch 20'+stu.institutionalId.substring(0,2):'--');
    const win=window.open('','_blank');
    const poRows=(d.poAttainments||[]).map(r=>{const att=r.level==='L3';return`<tr><td><b>${r.programOutcome.code}</b></td><td>${r.programOutcome.title}</td><td style="text-align:center;color:${att?'#16a34a':'#dc2626'};font-weight:700">${att?'Attained':'Not Attained'}</td><td style="text-align:right">${r.percentage.toFixed(1)}%</td></tr>`;}).join('');
    const coRows=(d.coAttainments||[]).map(r=>{const att=r.level==='L3';return`<tr><td><b>${r.courseOutcome.code}</b></td><td>${r.courseOutcome.title}</td><td style="text-align:center;color:${att?'#16a34a':'#dc2626'};font-weight:700">${att?'Attained':'Not Attained'}</td><td style="text-align:right">${r.percentage.toFixed(1)}%</td></tr>`;}).join('');
    const assRows=(d.assessmentDetail||[]).map(a=>`<tr><td>${a.title}</td><td style="text-align:center">${a.totalMarks}</td><td style="text-align:center">${a.attainmentMark}</td><td style="text-align:center;font-weight:700">${a.marksObtained!=null?a.marksObtained:'-'}</td><td style="text-align:center;color:${a.passed?'#16a34a':'#dc2626'}">${a.marksObtained!=null?(a.passed?'Pass':'Fail'):'-'}</td></tr>`).join('');
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
    <h2>Marks by Assessment</h2>
    <table><thead><tr><th>Assessment</th><th style="text-align:center">Total</th><th style="text-align:center">Att. Mark</th><th style="text-align:center">Obtained</th><th style="text-align:center">Result</th></tr></thead>
    <tbody>${assRows}</tbody></table>
    <h2>Program Outcome Attainment</h2>
    <table><thead><tr><th>PO</th><th>Title</th><th>Result</th><th style="text-align:right">Score</th></tr></thead>
    <tbody>${poRows}</tbody></table>
    <h2>Course Outcome Attainment</h2>
    <table><thead><tr><th>CO</th><th>Title</th><th>Result</th><th style="text-align:right">Score</th></tr></thead>
    <tbody>${coRows}</tbody></table>
    <button onclick="window.print()" style="padding:8px 20px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px">🖨 Print / Save as PDF</button>
    </body></html>`);
    win.document.close();
  },
};
