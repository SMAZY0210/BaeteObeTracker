// ── Icon ──────────────────────────────────────────────────────
const ICONS={
  home:`<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>`,
  book:`<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>`,
  users:`<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
  target:`<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>`,
  sliders:`<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>`,
  chart:`<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>`,
  file:`<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>`,
  grid:`<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>`,
  tree:`<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>`,
  edit:`<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>`,
  trash:`<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>`,
  plus:`<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`,
  person:`<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
  save:`<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>`,
  back:`<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>`,
  dl:`<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>`,
  add_user:`<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>`,
};
function ico(name,size=15){return`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||''}</svg>`}

// ── Toast ──────────────────────────────────────────────────────
function toast(msg,type='ok'){
  const cfg={ok:['toast-ok','t-ico-ok','✓'],err:['toast-err','t-ico-err','✕'],inf:['toast-inf','t-ico-inf','i']};
  const[tc,ic,ch]=cfg[type]||cfg.ok;
  const el=document.createElement('div');
  el.className=`toast ${tc}`;
  el.innerHTML=`<div class="t-ico ${ic}">${ch}</div><div>${msg}</div>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(()=>el.remove(),4000);
}

// ── Modal ──────────────────────────────────────────────────────
function showModal(title,body,foot='',large=false){
  document.getElementById('modal-title').textContent=title;
  document.getElementById('modal-body').innerHTML=body;
  const mf=document.getElementById('modal-ft');
  if(foot){mf.innerHTML=foot;mf.classList.remove('hidden')}else{mf.classList.add('hidden')}
  document.querySelector('.modal-box').classList.toggle('modal-lg',large);
  document.getElementById('modal-overlay').classList.remove('hidden');
  setTimeout(()=>document.querySelector('#modal-body input,#modal-body select,#modal-body textarea')?.focus(),60);
}
function closeModal(e){
  if(!e||e.target===document.getElementById('modal-overlay'))
    document.getElementById('modal-overlay').classList.add('hidden');
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('modal-overlay').classList.add('hidden')});

// ── Tabs ───────────────────────────────────────────────────────
function initTabs(id){
  const c=document.getElementById(id);if(!c)return;
  c.querySelectorAll('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>{
    c.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    c.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab)?.classList.add('active');
  }));
}

// ── Render helpers ─────────────────────────────────────────────
const loading=()=>`<div class="loading-box"><div class="spin"></div> Loading…</div>`;
const tdLoad=(n=6)=>`<tr><td colspan="${n}" class="td-load"><div class="spin" style="display:inline-block"></div></td></tr>`;
const tdEmpty=(m,n=6)=>`<tr><td colspan="${n}" class="td-load text-muted">${m}</td></tr>`;

function levelBadge(lvl,pct){
  // Binary model: L3 = Attained, L0 = Not Attained
  const attained = lvl === 'L3';
  const cls  = attained ? 'bg-green' : 'bg-red';
  const lbl  = attained ? 'Attained' : 'Not Attained';
  const disp = pct !== undefined ? `${pct.toFixed(1)}%` : lbl;
  return `<span class="badge ${cls}">${disp} - ${lbl}</span>`;
}

function attBar(pct,lvl){
  // Binary: green bar if attained, red bar if not
  const attained = lvl === 'L3';
  const c = attained ? 'var(--l3)' : 'var(--l0)';
  const threshold = 60; // 60% threshold line
  return`<div class="att-row">
    <div class="att-track" style="position:relative">
      <div class="att-fill" style="width:${Math.min(100,pct||0).toFixed(1)}%;background:${c}"></div>
      <div style="position:absolute;left:${threshold}%;top:0;bottom:0;width:2px;background:rgba(0,0,0,.25)" title="60% threshold"></div>
    </div>
    <span class="att-pct" style="color:${c}">${(pct||0).toFixed(1)}%</span>
  </div>`;
}

// ── Multi-profile helpers ──────────────────────────────────────
const PROFILE_TYPES=[
  {key:'FUNDAMENTAL',label:'Fundamental',sub:'Core discipline skills',letter:'F',cls:'profile-chip-F'},
  {key:'SOCIAL',     label:'Social',     sub:'Interpersonal & communication',letter:'S',cls:'profile-chip-S'},
  {key:'THINKING',   label:'Thinking',   sub:'Critical & analytical reasoning',letter:'T',cls:'profile-chip-T'},
  {key:'PERSONAL',   label:'Personal',   sub:'Self-management & ethics',letter:'P',cls:'profile-chip-P'},
];

// Parse stored profile data (JSON array in profileCode, or legacy single value)
function parseProfiles(co){
  if(!co.profileCode) return[];
  try{
    const p=JSON.parse(co.profileCode);
    if(Array.isArray(p)) return p; // new format: [{type,code},...]
  }catch(_){}
  // Legacy single profile
  if(co.profileType) return [{type:co.profileType,code:co.profileCode}];
  return[];
}

function renderProfileChips(profiles){
  if(!profiles.length) return'<span class="text-muted text-sm">-</span>';
  return profiles.map(p=>{
    const def=PROFILE_TYPES.find(t=>t.key===p.type)||{letter:'?',cls:'',label:p.type};
    return`<span class="profile-chip ${def.cls}">${def.letter}${p.code?': '+p.code:''}</span>`;
  }).join(' ');
}

// Render multi-profile selector for modals
function profileSelectorHTML(current=[]){
  const curMap={};
  current.forEach(p=>{curMap[p.type]=p.code||''});
  return`<div class="profile-selector" id="profile-sel">
    ${PROFILE_TYPES.map(t=>`
      <div class="profile-option ${curMap[t.key]!==undefined?'selected':''}" onclick="toggleProfile(this,'${t.key}')">
        <input type="checkbox" class="pro-chk" data-ptype="${t.key}" value="${t.key}" ${curMap[t.key]!==undefined?'checked':''} style="width:auto" onclick="event.stopPropagation()">
        <div>
          <div class="profile-option-label">${t.label}</div>
          <div class="profile-option-sub">${t.sub}</div>
          <div class="po-code-input ${curMap[t.key]!==undefined?'':'hidden'}">
            <input type="text" class="pro-code" data-ptype="${t.key}" placeholder="${t.letter} code e.g. ${t.letter}1" value="${curMap[t.key]||''}">
          </div>
        </div>
      </div>`).join('')}
  </div>`;
}

function toggleProfile(card,type){
  const cb=card.querySelector('.pro-chk');
  const codeWrap=card.querySelector('.po-code-input');
  cb.checked=!cb.checked;
  card.classList.toggle('selected',cb.checked);
  codeWrap.classList.toggle('hidden',!cb.checked);
}

function collectProfiles(){
  const profiles=[];
  document.querySelectorAll('#profile-sel .pro-chk:checked').forEach(cb=>{
    const type=cb.dataset.ptype;
    const codeInput=document.querySelector(`#profile-sel .pro-code[data-ptype="${type}"]`);
    profiles.push({type,code:codeInput?.value.trim()||''});
  });
  return profiles;
}
