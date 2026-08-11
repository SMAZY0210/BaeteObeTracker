// ── UI Helpers ────────────────────────────────────────────────
function toast(msg, type='success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function showModal(title, bodyHTML, footerHTML='', large=false) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  document.getElementById('modal-footer').innerHTML = footerHTML;
  const box = document.querySelector('.modal-box');
  large ? box.classList.add('modal-lg') : box.classList.remove('modal-lg');
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('modal-overlay')) {
    document.getElementById('modal-overlay').classList.add('hidden');
  }
}

function loadingRow(colspan=10) {
  return `<tr><td colspan="${colspan}" class="loading-row"><span class="spinner"></span> Loading…</td></tr>`;
}

function emptyRow(msg, colspan=10) {
  return `<tr><td colspan="${colspan}" class="loading-row" style="color:var(--text-muted)">${msg}</td></tr>`;
}

function levelBadge(level, pct) {
  const map = { L3:['badge-green','Fully Attained'], L2:['badge-blue','Moderately Attained'], L1:['badge-amber','Partially Attained'], L0:['badge-red','Not Attained'] };
  const [cls, label] = map[level] || ['badge-gray', level];
  return `<span class="badge ${cls}">${pct !== undefined ? pct.toFixed(1)+'%' : label}</span>`;
}

function attainBar(pct, level) {
  const colors = { L3:'var(--l3)', L2:'var(--l2)', L1:'var(--l1)', L0:'var(--l0)' };
  const color = colors[level] || 'var(--text-light)';
  return `<div class="attain-bar-wrap">
    <div class="attain-bar"><div class="attain-bar-fill" style="width:${Math.min(100,pct||0).toFixed(1)}%;background:${color}"></div></div>
    <span class="attain-pct" style="color:${color}">${(pct||0).toFixed(1)}%</span>
  </div>`;
}

function icon(name) {
  const icons = {
    dashboard: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
    structure: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    courses:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    users:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    outcomes:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    thresholds:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
    mapping:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
    assess:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
    marks:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    attain:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  };
  return icons[name] || '';
}

// ── Tabs ──────────────────────────────────────────────────────
function initTabs(containerId) {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      c.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      c.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      c.querySelector('#' + btn.dataset.tab)?.classList.add('active');
    });
  });
}
