function togglePw(){const i=document.getElementById('login-password');i.type=i.type==='password'?'text':'password'}
document.addEventListener('DOMContentLoaded',()=>{
  ['login-email','login-password'].forEach(id=>document.getElementById(id)?.addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()}));
});
async function doLogin(){
  const email=document.getElementById('login-email').value.trim();
  const pw=document.getElementById('login-password').value;
  const err=document.getElementById('login-error');
  const btn=document.getElementById('login-btn');
  err.classList.add('hidden');
  if(!email||!pw){err.innerHTML='<span class="alert-icon">⚠</span>Email and password are required.';err.classList.remove('hidden');return}
  btn.disabled=true;btn.textContent='Signing in…';
  try{
    const d=await Api.login(email,pw);
    Api.setToken(d.token);localStorage.setItem('obe_user',JSON.stringify(d.user));App.start(d.user);
  }catch(e){
    err.innerHTML=`<span class="alert-icon">⚠</span>${e.message}`;err.classList.remove('hidden');
    btn.disabled=false;btn.textContent='Sign in →';
  }
}
async function doLogout(){
  try{await Api.logout()}catch(_){}
  Api.clearToken();
  localStorage.removeItem('obe_user');
  // Reset login form and button before showing login page
  const btn=document.getElementById('login-btn');
  const emailEl=document.getElementById('login-email');
  const pwEl=document.getElementById('login-password');
  const errEl=document.getElementById('login-error');
  if(btn){btn.disabled=false;btn.textContent='Sign in →';}
  if(emailEl) emailEl.value='';
  if(pwEl) pwEl.value='';
  if(errEl) errEl.classList.add('hidden');
  App.showLogin();
}
function showForgot(e){e?.preventDefault();document.getElementById('page-login').style.display='none';document.getElementById('page-login').classList.remove('active');const fp=document.getElementById('page-forgot');fp.style.display='flex';fp.classList.add('active')}
function showLogin(){document.getElementById('page-forgot').style.display='none';document.getElementById('page-forgot').classList.remove('active');document.getElementById('page-login').style.display='flex';document.getElementById('page-login').classList.add('active')}
async function sendOtp(){
  const email=document.getElementById('forgot-email').value.trim();
  const err=document.getElementById('forgot-error');err.classList.add('hidden');
  try{await Api.forgotPassword(email);document.getElementById('fstep1').classList.add('hidden');document.getElementById('fstep2').classList.remove('hidden');document.getElementById('fh').textContent='Check your email';document.getElementById('fs').textContent='Enter the 6-digit code we sent you.'}
  catch(e){err.innerHTML=`<span class="alert-icon">⚠</span>${e.message}`;err.classList.remove('hidden')}
}
async function resetPw(){
  const email=document.getElementById('forgot-email').value.trim();
  const otp=document.getElementById('forgot-otp').value.trim();
  const pw=document.getElementById('forgot-pw').value;
  const cpw=document.getElementById('forgot-cpw').value;
  const err=document.getElementById('forgot-error');err.classList.add('hidden');
  if(pw!==cpw){err.innerHTML='<span class="alert-icon">⚠</span>Passwords do not match.';err.classList.remove('hidden');return}
  try{await Api.resetPassword(email,otp,pw);toast('Password reset - please sign in.','ok');showLogin()}
  catch(e){err.innerHTML=`<span class="alert-icon">⚠</span>${e.message}`;err.classList.remove('hidden')}
}
