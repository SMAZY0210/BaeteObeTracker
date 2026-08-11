const Mobile={
  toggleNav(){document.body.classList.toggle('sb-open')},
  closeNav(){document.body.classList.remove('sb-open')},
};

const App={
  user:null,
  init(){
    Api.loadToken();
    const s=localStorage.getItem('obe_user');
    if(Api._token&&s){try{this.start(JSON.parse(s));return}catch(_){}}
    this.showLogin();
  },
  showLogin(){
    document.body.classList.remove('sb-open');
    document.querySelectorAll('.page').forEach(p=>{p.classList.remove('active');p.style.display=''});
    const lp=document.getElementById('page-login');lp.classList.add('active');lp.style.display='flex';
    setTimeout(()=>document.getElementById('login-email')?.focus(),80);
  },
  start(user){
    this.user=user;
    document.querySelectorAll('.page').forEach(p=>{p.classList.remove('active');p.style.display=''});
    const ap=document.getElementById('page-app');ap.classList.add('active');ap.style.display='flex';
    document.getElementById('sb-user-info').innerHTML=`<div class="sb-user-card"><div class="sb-uname">${user.firstName} ${user.lastName}</div><div class="sb-urole">${user.role}</div></div>`;
    const navs={
      ADMIN:[
        {id:'admin-dash',     label:'Dashboard',  icon:'home'},
        {id:'admin-structure',label:'Structure',  icon:'tree'},
        {id:'admin-courses',  label:'Courses',    icon:'book'},
        {id:'admin-admins',   label:'Admins',     icon:'users'},
        {id:'admin-faculty',  label:'Faculty',    icon:'users'},
        {id:'admin-students', label:'Students',   icon:'users'},
        {id:'admin-enrolment', label:'Enrolment',   icon:'book'},
        {id:'admin-outcomes', label:'Program Outcomes',   icon:'target'},
        {id:'admin-attain',   label:'Attainment',  icon:'chart'},
      ],
      FACULTY:[
        {id:'fac-courses', label:'My Courses', icon:'book'},
        {id:'fac-reports', label:'Reports',    icon:'file'},
      ],
      STUDENT:[
        {id:'stu-dash',   label:'Dashboard',     icon:'home'},
        {id:'stu-attain', label:'My Attainment', icon:'chart'},
      ],
    };
    const nav=navs[user.role]||[];
    document.getElementById('sb-nav').innerHTML=nav.map(n=>`
      <button class="nav-item" id="nav-${n.id}" onclick="App.go('${n.id}')">${ico(n.icon)} ${n.label}</button>`).join('');
    this.go(nav[0]?.id);
  },
  go(id){
    if(!id)return;
    Mobile.closeNav();
    document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
    document.getElementById('nav-'+id)?.classList.add('active');
    ({
      'admin-dash':     ()=>AdminView.dash(),
      'admin-structure':()=>AdminView.structure(),
      'admin-courses':  ()=>AdminView.courses(),
      'admin-admins':   ()=>AdminView.admins(),
      'admin-faculty':  ()=>AdminView.faculty(),
      'admin-students': ()=>AdminView.students(),
      'admin-enrolment': ()=>AdminView.enrolment(),
      'admin-outcomes': ()=>AdminView.outcomes(),
      'admin-attain':   ()=>AdminView.attainmentReport(),
      'fac-courses':    ()=>FacultyView.courses(),
      'fac-reports':    ()=>FacultyView.reports(),
      'stu-dash':       ()=>StudentView.dash(),
      'stu-attain':     ()=>StudentView.attainment(),
    })[id]?.();
  },
};
document.addEventListener('DOMContentLoaded',()=>App.init());
