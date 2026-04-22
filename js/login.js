// UNICHECK login.js v5 - STI Domain Validation, Campus detect, Terms
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, sendEmailVerification, setPersistence,
  browserLocalPersistence, browserSessionPersistence }
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc }
  from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey:"AIzaSyB0y465dDA5dK1-PAdrHQsa3_nFZ7Z8kX8",
  authDomain:"unicheck-6a2d7.firebaseapp.com",
  projectId:"unicheck-6a2d7",
  storageBucket:"unicheck-6a2d7.firebasestorage.app",
  messagingSenderId:"419341148656",
  appId:"1:419341148656:web:b99673fcee73509ce47d35"
};
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const wrapper     = document.getElementById('authWrapper');
const toRegister  = document.getElementById('toRegister');
const toLogin     = document.getElementById('toLogin');
const dynamicText = document.getElementById('dynamicText');
const overlay     = document.getElementById('popupOverlay');
const loader      = document.getElementById('popupLoader');
const icon        = document.getElementById('popupIcon');
const title       = document.getElementById('popupTitle');
const msg         = document.getElementById('popupMessage');
const closeBtn    = document.getElementById('closePopup');
let isProcessing  = false;

//  Panel Toggle 
const isMobile = () => window.innerWidth <= 768;

function switchToRegister() {
  const login = document.getElementById('loginBox');
  const reg   = document.getElementById('registerBox');
  if (!login || !reg) return;
 
  login.style.animation = 'slideOutLeft .32s cubic-bezier(.4,0,.2,1) both';
  setTimeout(() => {
    login.classList.add('hidden-form');
    login.style.animation = '';
    reg.classList.remove('hidden-form');
    void reg.offsetWidth;
    reg.style.animation = 'slideInRight .36s cubic-bezier(.25,.46,.45,.94) both';
    document.querySelectorAll('.mobile-tab').forEach(t => t.classList.toggle('active', t.dataset.target === 'register'));
  }, 280);
  window.scrollTo(0,0);
}

function switchToLogin() {
  const login = document.getElementById('loginBox');
  const reg   = document.getElementById('registerBox');
  if (!login || !reg) return;
  
  reg.style.animation = 'slideOutRight .32s cubic-bezier(.4,0,.2,1) both';
  setTimeout(() => {
    reg.classList.add('hidden-form');
    reg.style.animation = '';
    login.classList.remove('hidden-form');
    void login.offsetWidth;
    login.style.animation = 'slideInLeft .36s cubic-bezier(.25,.46,.45,.94) both';
    document.querySelectorAll('.mobile-tab').forEach(t => t.classList.toggle('active', t.dataset.target === 'login'));
  }, 280);
  window.scrollTo(0,0);
}

toRegister?.addEventListener('click',e=>{ e.preventDefault(); switchToRegister(); });
toLogin?.addEventListener('click',e=>{ e.preventDefault(); switchToLogin(); });

// ── Mobile tab bar 
document.addEventListener('DOMContentLoaded', () => {
  const fc = document.querySelector('.form-container');
  if (fc && window.innerWidth <= 768) {
    const tabBar = document.createElement('div');
    tabBar.className = 'mobile-tab-bar';
    tabBar.innerHTML = `
      <button class="mobile-tab active" data-target="login">Sign In</button>
      <button class="mobile-tab" data-target="register">Register</button>`;
    fc.insertBefore(tabBar, fc.firstChild);
    tabBar.addEventListener('click', e => {
      const btn = e.target.closest('.mobile-tab');
      if (!btn) return;
      if (btn.dataset.target === 'register') switchToRegister();
      else switchToLogin();
    });
  }
});

// ── STI Campus Domains ──
const stiCampusMap = {
  'alabang':        'STI Alabang',
  'alaminos':       'STI Alaminos',
  'angeles':        'STI Angeles',
  'westnegros':     'STI Bacolod - West Negros University',
  'bacoor':         'STI Bacoor',
  'baguio':         'STI Baguio',
  'balagtas':       'STI Balagtas',
  'balayan':        'STI Balayan',
  'baliuag':        'STI Baliuag',
  'batangas':       'STI Batangas',
  'cdo':            'STI Cagayan De Oro',
  'calamba':        'STI Calamba',
  'calbayog':       'STI Calbayog',
  'caloocan':       'STI Caloocan',
  'carmona':        'STI Carmona',
  'cauayan':        'STI Cauayan',
  'cotabato':       'STI Cotabato',
  'cubao':          'STI Cubao',
  'dagupan':        'STI Dagupan',
  'dasmarinas':     'STI Dasmariñas',
  'davao':          'STI Davao',
  'dumaguete':      'STI Dumaguete',
  'fairview':       'STI Fairview',
  'gensan':         'STI General Santos',
  'globalcity':     'STI Global City',
  'iligan':         'STI Iligan',
  'kalibo':         'STI Kalibo',
  'koronadal':      'STI Koronadal',
  'laoag':          'STI Laoag',
  'laspinas':       'STI Las Piñas',
  'legazpi':        'STI Legazpi',
  'lipa':           'STI Lipa',
  'lucena':         'STI Lucena',
  'maasin':         'STI Maasin',
  'malaybalay':     'STI Malaybalay',
  'malolos':        'STI Malolos',
  'marikina':       'STI Marikina',
  'meycauayan':     'STI Meycauayan',
  'munoz':          'STI Munoz-EDSA',
  'naga':           'STI Naga',
  'novaliches':     'STI Novaliches',
  'ormoc':          'STI Ormoc',
  'ortigascainta':  'STI Ortigas-Cainta',
  'pasayedsa':      'STI Pasay-EDSA',
  'puertoprincesa': 'STI Puerto Princesa',
  'rosario':        'STI Rosario',
  'sanfernando':    'STI San Fernando',
  'sjdelmonte':     'STI San Jose Del Monte',
  'sanjose':        'STI San Jose Nueva Ecija',
  'stisanpablo':    'STI San Pablo',
  'santarosa':      'STI Santa Rosa',
  'stacruz':        'STI Sta. Cruz',
  'stamaria':       'STI Sta. Maria',
  'stamesa':        'STI Sta. Mesa',
  'surigao':        'STI Surigao',
  'tacurong':       'STI Tacurong',
  'tagaytay':       'STI Tagaytay',
  'tagum':          'STI Tagum',
  'tanauan':        'STI Tanauan',
  'tanay':          'STI Tanay',
  'tarlac':         'STI Tarlac',
  'valencia':       'STI Valencia',
  'vigan':          'STI Vigan',
};

//Sti email valid checker
const validStiDomains = new Set(Object.keys(stiCampusMap).map(k => `${k}.sti.edu.ph`));


function validateAndDetectCampus(email) {
  if (!email || !email.includes('@')) return null;
  const domain = email.split('@')[1]?.toLowerCase().trim() || '';
  if (!domain.endsWith('.sti.edu.ph')) return null;
  const slug = domain.replace('.sti.edu.ph', '');
  return stiCampusMap[slug] || null;
}

function detectCampusHint(email) {
  if (!email || !email.includes('@')) return '';
  const domain = email.split('@')[1]?.toLowerCase().trim() || '';
  if (!domain.endsWith('.sti.edu.ph')) return '';
  const slug = domain.replace('.sti.edu.ph', '');
  return stiCampusMap[slug] || '';
}

const regEmailInput=document.getElementById('regEmail');
const campusInput=document.getElementById('regCampus');
const campusDetected=document.getElementById('campusDetected');
regEmailInput?.addEventListener('input',()=>{
  const email = regEmailInput.value.trim();
  const campus = detectCampusHint(email);
  const domain = email.split('@')[1]?.toLowerCase().trim() || '';
  if(campusInput) campusInput.value = campus;
  if(campusDetected){
    if(campus){
      campusDetected.innerText = `✓ Campus: ${campus}`;
      campusDetected.style.color = '#00C87A';
    } else if(domain && !domain.endsWith('.sti.edu.ph') && email.includes('@')){
      campusDetected.innerText = '✗ Not a valid STI email — use yourname@campus.sti.edu.ph';
      campusDetected.style.color = '#FF3B3B';
    } else {
      campusDetected.innerText = 'Campus will be auto-detected from your STI email';
      campusDetected.style.color = '';
    }
  }
});

// Popup 
function showPopup(type,message){
  overlay.style.display='flex'; msg.innerText=message;
  if(type==='loading'){
    loader.style.display='block';icon.style.display='none';closeBtn.style.display='none';title.innerText="Processing...";
  }else{
    loader.style.display='none';icon.style.display='block';closeBtn.style.display='block';
    icon.style.color=type==='success'?'#00C87A':'#FF3B3B';
    icon.innerText=type==='success'?'✓':'!';
    title.innerText=type==='success'?"Success!":"Oops!";
  }
}
closeBtn.onclick=()=>{overlay.style.display='none';};

const authErrors={
  'auth/invalid-credential':"Incorrect email or password.",
  'auth/user-not-found':"No account found with this email.",
  'auth/wrong-password':"Incorrect password.",
  'auth/too-many-requests':"Too many attempts. Please try later.",
  'auth/email-already-in-use':"This email is already registered.",
  'auth/weak-password':"Password must be at least 6 characters.",
  'auth/invalid-email':"Please enter a valid email address.",
};

// Remember Me Restore saved email 
window.addEventListener('DOMContentLoaded',()=>{
  const saved=localStorage.getItem('ucRememberEmail');
  if(saved){
    const emailEl=document.getElementById('loginEmail');
    const rememberEl=document.getElementById('rememberMe');
    if(emailEl) emailEl.value=saved;
    if(rememberEl) rememberEl.checked=true;
  }
});

// Login 
document.getElementById("loginForm").onsubmit=async e=>{
  e.preventDefault();
  if(isProcessing) return;
  isProcessing=true;
  showPopup('loading',"Verifying your credentials...");
  const email=document.getElementById("loginEmail").value.trim();
  const pass=document.getElementById("loginPassword").value;
  const remember=document.getElementById("rememberMe")?.checked;
  try{
    
    await setPersistence(auth,remember?browserLocalPersistence:browserSessionPersistence);
    if(remember) localStorage.setItem('ucRememberEmail',email);
    else localStorage.removeItem('ucRememberEmail');
    const credential=await signInWithEmailAndPassword(auth,email,pass);
    const userDoc=await getDoc(doc(db,"users",credential.user.uid));
    window.location.href=(userDoc.exists()&&userDoc.data().role==="admin")?"admin.html":"menu.html";
  }catch(err){
    isProcessing=false;
    showPopup('error',authErrors[err.code]||"Login failed. Please try again.");
  }
};

//  Register 
document.getElementById("registerForm").onsubmit=async e=>{
  e.preventDefault();
  if(isProcessing) return;
  const email=document.getElementById("regEmail").value.trim();
  const campus=document.getElementById("regCampus").value.trim();
  const phone=document.getElementById("regPhone").value.trim();
  const address=document.getElementById("regAddress").value.trim();
  const password=document.getElementById("regPassword").value;
  const confirm=document.getElementById("confirmPassword").value;
  const terms=document.getElementById("termsCheck").checked;
  if(!terms) return showPopup('error',"Please accept the Terms & Conditions to continue.");
  if(password!==confirm) return showPopup('error',"Passwords do not match!");

  //  Strict STI domain validation 
  const detectedCampus = validateAndDetectCampus(email);
  if(!detectedCampus){
    return showPopup('error',
      "❌ Invalid email domain.\n\nOnly official STI institutional emails are accepted.\n\nFormat: yourname@campus.sti.edu.ph\nExample: juan.dela.cruz@cubao.sti.edu.ph"
    );
  }

  if(password.length<6) return showPopup('error',"Password must be at least 6 characters.");
  if(!phone||!address) return showPopup('error',"Please fill in all required fields.");
  isProcessing=true;
  showPopup('loading',"Creating your UniCheck profile...");
  try{
    const credential=await createUserWithEmailAndPassword(auth,email,password);
    const cityRaw=email.split('@')[1]?.split('.')[0]||'';
    await setDoc(doc(db,"users",credential.user.uid),{
      email, campus: detectedCampus, city: detectedCampus || cityRaw,
      phone, address,
      role:"user", createdAt:new Date(),
      username:"", age:null, gender:"", avatarUrl:""
    });

    // Send verification email
    await sendEmailVerification(credential.user);

    // Hide popup and show the email-verify screen
    overlay.style.display='none';
    isProcessing=false;
    showVerifyScreen(email);

  }catch(err){
    isProcessing=false;
    showPopup('error',authErrors[err.code]||"Registration failed. Please try again.");
  }
};

/* ── Email Verification Screen ── */
function showVerifyScreen(email){
  // Close auth modal if open
  const authModal=document.getElementById('authModal');
  if(authModal) authModal.style.display='none';
  document.body.style.overflow='';

  // Remove existing verify screen if any
  document.getElementById('ucVerifyScreen')?.remove();

  const screen=document.createElement('div');
  screen.id='ucVerifyScreen';
  screen.innerHTML=`
    <div class="ucv-backdrop"></div>
    <div class="ucv-card">
      <div class="ucv-icon-wrap">
        <div class="ucv-icon-ring ucv-ring-1"></div>
        <div class="ucv-icon-ring ucv-ring-2"></div>
        <div class="ucv-icon-ring ucv-ring-3"></div>
        <span class="material-icons ucv-envelope">mark_email_unread</span>
      </div>
      <h2 class="ucv-title">Verify Your Email</h2>
      <p class="ucv-sub">We sent a verification link to</p>
      <div class="ucv-email-pill">
        <span class="material-icons" style="font-size:16px;color:var(--ucv-blue);">email</span>
        <strong>${email}</strong>
      </div>
      <p class="ucv-hint">Open your STI email inbox, click the verification link, then come back and press <em>Continue</em>.</p>
      <div class="ucv-steps">
        <div class="ucv-step"><span class="ucv-step-num">1</span><span>Check your STI email inbox</span></div>
        <div class="ucv-step"><span class="ucv-step-num">2</span><span>Click the verification link</span></div>
        <div class="ucv-step"><span class="ucv-step-num">3</span><span>Return here &amp; press Continue</span></div>
      </div>
      <button class="ucv-btn-primary" id="ucvCheckBtn">
        <span class="material-icons">arrow_forward</span> I've Verified — Continue
      </button>
      <button class="ucv-btn-ghost" id="ucvResendBtn">
        <span class="material-icons">refresh</span> Resend Verification Email
      </button>
      <p class="ucv-status" id="ucvStatus"></p>
      <p class="ucv-footer">Wrong email? <a href="#" id="ucvGoBack">Go back and re-register</a></p>
    </div>
  `;
  document.body.appendChild(screen);

  // Animate in
  requestAnimationFrame(()=>{ screen.classList.add('ucv-visible'); });

  let resendCooldown=0;
  const statusEl=screen.querySelector('#ucvStatus');

  // Check verification
  screen.querySelector('#ucvCheckBtn').onclick=async()=>{
    const btn=screen.querySelector('#ucvCheckBtn');
    btn.disabled=true;
    btn.innerHTML='<span class="material-icons" style="animation:ucvSpin 1s linear infinite">refresh</span> Checking...';
    statusEl.textContent='';
    try{
      await auth.currentUser?.reload();
      if(auth.currentUser?.emailVerified){
        statusEl.style.color='#00C87A';
        statusEl.textContent='✓ Email verified! Redirecting…';
        btn.innerHTML='<span class="material-icons">check_circle</span> Verified!';
        screen.classList.add('ucv-success');
        setTimeout(()=>{ window.location.href='menu.html'; },1000);
      } else {
        btn.disabled=false;
        btn.innerHTML='<span class="material-icons">arrow_forward</span> I\'ve Verified — Continue';
        statusEl.style.color='#FF3B3B';
        statusEl.textContent='⚠ Email not yet verified. Please check your inbox and click the link first.';
      }
    }catch(err){
      btn.disabled=false;
      btn.innerHTML='<span class="material-icons">arrow_forward</span> I\'ve Verified — Continue';
      statusEl.style.color='#FF3B3B';
      statusEl.textContent='Could not check status. Please try again.';
    }
  };

  // Resend
  screen.querySelector('#ucvResendBtn').onclick=async()=>{
    const btn=screen.querySelector('#ucvResendBtn');
    if(resendCooldown>0) return;
    btn.disabled=true;
    statusEl.style.color='var(--ucv-blue)';
    statusEl.textContent='Sending...';
    try{
      await sendEmailVerification(auth.currentUser);
      statusEl.style.color='#00C87A';
      statusEl.textContent='✓ Verification email resent! Check your inbox.';
      resendCooldown=60;
      const countdown=setInterval(()=>{
        resendCooldown--;
        btn.innerHTML=`<span class="material-icons">refresh</span> Resend (${resendCooldown}s)`;
        if(resendCooldown<=0){ clearInterval(countdown); btn.disabled=false; btn.innerHTML='<span class="material-icons">refresh</span> Resend Verification Email'; }
      },1000);
    }catch(err){
      btn.disabled=false;
      statusEl.style.color='#FF3B3B';
      statusEl.textContent='Could not resend. Please wait and try again.';
    }
  };

  // Go back — delete unverified account so they can re-register
  screen.querySelector('#ucvGoBack').onclick=async(e)=>{
    e.preventDefault();
    try{ await auth.currentUser?.delete(); }catch(_){}
    screen.classList.remove('ucv-visible');
    setTimeout(()=>screen.remove(),400);
    openAuthModal('register');
  };
}
window.showVerifyScreen=showVerifyScreen;

//  Forgot Password 
document.getElementById("forgotPasswordLink").onclick=async e=>{
  e.preventDefault();
  const email=document.getElementById("loginEmail").value.trim();
  if(!email) return showPopup('error',"Enter your email first.");
  showPopup('loading',"Sending reset link...");
  try{
    await sendPasswordResetEmail(auth,email);
    showPopup('success',"Reset link sent! Check your STI email inbox.");
  }catch(err){
    showPopup('error',err.code==='auth/user-not-found'?"No account found.":"Could not send reset email.");
  }
};
