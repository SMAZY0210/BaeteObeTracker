const StudentView={
  async dash(){
    document.getElementById('view-root').innerHTML=`<div class="page-hd"><div class="page-hd-left"><h1>My Dashboard</h1><div class="hd-sub">Enrolled courses and performance</div></div></div><div id="sl">${loading()}</div>`;
    try{
      const l=await Api.getEnrolledCourses();
      if(!l.length){document.getElementById('sl').innerHTML=`<div class="empty-box"><div class="empty-ico">${ico('book',24)}</div><h3>No courses enrolled</h3><p>Contact your administrator.</p></div>`;return}
      document.getElementById('sl').innerHTML=`<div class="course-grid">${l.map(c=>`<div class="course-card" onclick="StudentView._openC('${c.id}','${c.name.replace(/'/g,'&#39;')}','${c.code}')">
        <div class="cc-icon">${ico('book',18)}</div>
        <div class="cc-code">${c.code}</div><div class="cc-name">${c.name}</div>
        <div class="cc-meta"><span>${c.session?.name||''}</span></div>
      </div>`).join('')}</div>`;
    }catch(e){document.getElementById('sl').innerHTML=`<div class="alert alert-error"><span class="alert-icon">⚠</span>${e.message}</div>`}
  },

  _openC(id,name,code){
    document.getElementById('view-root').innerHTML=`
      <div class="page-hd"><div class="page-hd-left">
        <button class="btn btn-ghost btn-sm mb2" onclick="StudentView.dash()">${ico('back',13)} Back</button>
        <h1>${name}</h1><div class="hd-sub">${code}</div>
      </div></div>
      <div id="stabs"><div class="tab-bar"><button class="tab-btn active" data-tab="sm">My Marks</button><button class="tab-btn" data-tab="sa">Attainment</button></div>
      <div class="tab-pane active" id="sm"></div><div class="tab-pane" id="sa"></div></div>`;
    initTabs('stabs');this._marks(id);
    document.querySelector('[data-tab="sa"]').addEventListener('click',()=>this._attain(id),{once:true});
  },

  async _marks(cid){
    const el=document.getElementById('sm');el.innerHTML=loading();
    try{
      const l=await Api.getMyMarks(cid);
      el.innerHTML=`<div class="tbl-wrap"><table><thead><tr><th>Assessment</th><th>Type</th><th>Total</th><th>My Marks</th><th>%</th></tr></thead>
      <tbody>${l.length?l.map(a=>{const m=a.marks?.[0],p=m?+(m.marksObtained/a.totalMarks*100).toFixed(1):null,col=p===null?'':p>=50?'var(--l3)':'var(--l0)';return`<tr>
        <td class="fw7">${a.title}</td><td><span class="badge bg-gray">${a.type.replace(/_/g,' ')}</span></td>
        <td>${a.totalMarks}</td><td style="font-weight:700;color:${col}">${m?m.marksObtained:'-'}</td>
        <td>${p!==null?`<span style="color:${col};font-weight:700">${p}%</span>`:'-'}</td></tr>`}).join(''):tdEmpty('No marks yet',5)}</tbody></table></div>`;
    }catch(e){el.innerHTML=`<div class="alert alert-error"><span class="alert-icon">⚠</span>${e.message}</div>`}
  },

  async _attain(cid){
    const el=document.getElementById('sa');el.innerHTML=loading();
    try{
      const{coAttainments,poAttainments}=await Api.getMyAttainment(cid);
      if(!coAttainments.length){el.innerHTML=`<div class="empty-box"><div class="empty-ico">${ico('chart',24)}</div><h3>No attainment data yet</h3><p>Your faculty needs to enter marks and set up CO-PO mappings first.</p></div>`;return}
      el.innerHTML=`<div class="sec-title mb3">Course Outcome Attainment</div>
        <div class="tbl-wrap mb4"><table><thead><tr><th>CO</th><th>Title</th><th style="min-width:200px">Attainment</th><th>Level</th></tr></thead>
        <tbody>${coAttainments.map(a=>{const p=a.percentage,l=a.level;return`<tr><td><span class="badge bg-green">${a.courseOutcome?.code||''}</span></td><td>${a.courseOutcome?.title||''}</td><td>${attBar(p,l)}</td><td>${levelBadge(l,p)}</td></tr>`}).join('')}</tbody></table></div>
        ${poAttainments.length?`<div class="sec-title mb3">Program Outcome Attainment</div><div class="tbl-wrap"><table><thead><tr><th>PO</th><th>Title</th><th style="min-width:200px">Attainment</th><th>Level</th></tr></thead>
        <tbody>${poAttainments.map(a=>{const p=a.percentage,l=a.level;return`<tr><td><span class="badge bg-blue">${a.programOutcome?.code||''}</span></td><td>${a.programOutcome?.title||''}</td><td>${attBar(p,l)}</td><td>${levelBadge(l,p)}</td></tr>`}).join('')}</tbody></table></div>`:''}`;
    }catch(e){el.innerHTML=`<div class="alert alert-error"><span class="alert-icon">⚠</span>${e.message}</div>`}
  },

  async attainment(){
    document.getElementById('view-root').innerHTML=`<div class="page-hd"><div class="page-hd-left"><h1>My Program Attainment</h1><div class="hd-sub">Overall PO attainment across all enrolled courses</div></div></div>${loading()}`;
    try{
      const l=await Api.getProgramAttainment();
      if(!l.length){document.getElementById('view-root').innerHTML+=`<div class="empty-box"><div class="empty-ico">${ico('chart',24)}</div><h3>No data yet</h3><p>Data appears once faculty enters marks and sets up mappings.</p></div>`;return}
      const bvl={attained:0,notAttained:0};l.forEach(a=>{a.averagePercentage>=60?bvl.attained++:bvl.notAttained++;});
      document.getElementById('view-root').innerHTML=`
        <div class="page-hd"><div class="page-hd-left"><h1>My Program Attainment</h1><div class="hd-sub">Overall PO attainment across all enrolled courses</div></div></div>
        <div class="stats-row mb4">
          <div class="stat-card"><div class="stat-icon-wrap si-green">${ico('chart',18)}</div><div class="stat-val" style="color:var(--l3)">${bvl.attained}</div><div class="stat-lbl">POs Attained</div></div><div class="stat-card"><div class="stat-icon-wrap si-red">${ico('chart',18)}</div><div class="stat-val" style="color:var(--l0)">${bvl.notAttained}</div><div class="stat-lbl">POs Not Attained</div></div>
        </div>
        <div class="tbl-wrap"><table><thead><tr><th>PO</th><th>Title</th><th style="min-width:200px">Avg Attainment</th><th>Level</th></tr></thead>
        <tbody>${l.map(a=>{const p=a.averagePercentage,lv=p>=60?'L3':'L0';return`<tr><td><span class="badge bg-blue">${a.code}</span></td><td>${a.title}</td><td>${attBar(p,lv)}</td><td>${levelBadge(lv,p)}</td></tr>`}).join('')}</tbody></table></div>`;
    }catch(e){document.getElementById('view-root').innerHTML+=`<div class="alert alert-error"><span class="alert-icon">⚠</span>${e.message}</div>`}
  },
};
