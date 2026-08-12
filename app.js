const { sports } = window.PLAYYR_DATA;

const selected = new Set();
const grid = document.getElementById('sportGrid');
const authScreen = document.getElementById('authScreen');
const profileModal = document.getElementById('profileModal');

function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

function applyProfile(profile) {
  if (!profile || !profile.name) return;
  const parts = profile.name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'PL';
  setText('homeGreeting', `Good evening, ${parts[0] || 'Player'} 👋`);
  setText('profileDisplayName', profile.name);
  setText('profileAvatar', initials);
  setText('settingsAvatar', initials);
  setText('settingsAccount', profile.email || 'Your PLAYYR account');
  if (profile.city) { document.querySelectorAll('.cityText').forEach(el => el.textContent = profile.city); document.getElementById('cityInput').value = profile.city; }
}

function showAuthForm(mode) {
  const signingUp = mode === 'signup';
  document.getElementById('signUpTab').classList.toggle('active', signingUp);
  document.getElementById('signInTab').classList.toggle('active', !signingUp);
  document.getElementById('signUpForm').classList.toggle('hidden', !signingUp);
  document.getElementById('signInForm').classList.toggle('hidden', signingUp);
}

document.getElementById('signUpTab').onclick = () => showAuthForm('signup');
document.getElementById('signInTab').onclick = () => showAuthForm('signin');

document.getElementById('signUpForm').onsubmit = event => {
  event.preventDefault();
  const username = document.getElementById('signUpUsername').value.trim();
  const password = document.getElementById('signUpPassword').value;
  localStorage.setItem('playyrDemoAccount', JSON.stringify({ username, password }));
  profileModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

document.getElementById('signInForm').onsubmit = event => {
  event.preventDefault();
  const username = document.getElementById('signInUsername').value.trim();
  const password = document.getElementById('signInPassword').value;
  const account = JSON.parse(localStorage.getItem('playyrDemoAccount') || 'null');
  if (!account || account.username !== username || account.password !== password) {
    toast('Username or password is incorrect');
    return;
  }
  applyProfile(JSON.parse(localStorage.getItem('playyrDemoProfile') || 'null'));
  authScreen.classList.add('hidden');
  document.getElementById('onboarding').classList.remove('hidden');
};

document.getElementById('profileForm').onsubmit = event => {
  event.preventDefault();
  const profile = {
    name: document.getElementById('fullName').value.trim(),
    email: document.getElementById('profileEmail').value.trim(),
    phone: document.getElementById('profilePhone').value.trim(),
    birthDate: document.getElementById('birthDate').value,
    gender: document.getElementById('profileGender').value,
    city: document.getElementById('profileCity').value.trim()
  };
  localStorage.setItem('playyrDemoProfile', JSON.stringify(profile));
  applyProfile(profile);
  profileModal.classList.add('hidden');
  authScreen.classList.add('hidden');
  document.getElementById('onboarding').classList.remove('hidden');
  document.body.style.overflow = '';
  toast('Profile saved — now pick your games');
};

sports.forEach(([icon, name, type]) => {
  const button = document.createElement('button');
  button.className = 'sport';
  button.innerHTML = `<span class="icon">${icon}</span><strong>${name}</strong><small>${type}</small>`;
  button.onclick = () => {
    if (selected.has(name)) {
      selected.delete(name);
      button.classList.remove('selected');
    } else if (selected.size < 4) {
      selected.add(name);
      button.classList.add('selected');
    } else {
      toast('Choose up to 4 interests');
    }
    document.getElementById('count').textContent = selected.size;
    document.getElementById('interestNext').disabled = selected.size < 3;
  };
  grid.appendChild(button);
});

document.getElementById('interestNext').onclick = () => {
  document.getElementById('interestStep').classList.add('hidden');
  document.getElementById('locationStep').classList.remove('hidden');
  document.getElementById('p2').classList.add('active');
};

document.getElementById('back').onclick = () => {
  document.getElementById('locationStep').classList.add('hidden');
  document.getElementById('interestStep').classList.remove('hidden');
  document.getElementById('p2').classList.remove('active');
};

function enter(city = 'Bengaluru') {
  document.querySelectorAll('.cityText').forEach(element => element.textContent = city);
  document.getElementById('onboarding').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  localStorage.setItem('playyrPreferences', JSON.stringify([...selected]));
  renderSettingsPreferences();
  window.scrollTo(0, 0);
}

document.getElementById('manualGo').onclick = () => {
  enter(document.getElementById('cityInput').value.trim() || 'Bengaluru');
};

document.getElementById('useLocation').onclick = () => {
  const button = document.getElementById('useLocation');
  if (!navigator.geolocation) {
    toast('Location is unavailable — enter your city instead');
    return;
  }
  button.textContent = 'Finding nearby play…';
  navigator.geolocation.getCurrentPosition(
    () => enter('Near you'),
    () => {
      button.textContent = 'Use my current location';
      toast('Couldn’t access location — enter your city instead');
    },
    { timeout: 7000 }
  );
};

function navigateTo(pageId) { const page = document.getElementById(pageId); if (!page) return; document.querySelectorAll('.nav button').forEach(item => item.classList.toggle('active', item.dataset.page === pageId)); document.querySelectorAll('.page').forEach(el => el.classList.add('hidden')); page.classList.remove('hidden'); window.scrollTo({top:0,behavior:'smooth'}); }
document.querySelectorAll('.nav button').forEach(button => button.onclick = () => navigateTo(button.dataset.page));
const profileAvatarBtn = document.getElementById('profileAvatar');
if (profileAvatarBtn) profileAvatarBtn.onclick = () => navigateTo('settingsPage');

document.querySelectorAll('.filters').forEach(row => {
  row.addEventListener('click', event => {
    if (!event.target.classList.contains('chip')) return;
    row.querySelectorAll('.chip').forEach(chip => chip.classList.remove('active'));
    event.target.classList.add('active');
    toast(`Showing ${event.target.textContent.toLowerCase()}`);
  });
});

document.querySelectorAll('.action').forEach(button => {
  button.onclick = () => toast(button.dataset.message);
});

const hostModal = document.getElementById('hostModal');
document.getElementById('hostBtn').onclick = () => {
  hostModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};

function closeHost() {
  hostModal.classList.add('hidden');
  document.body.style.overflow = '';
}

document.getElementById('closeHost').onclick = closeHost;
hostModal.onclick = event => {
  if (event.target === hostModal) closeHost();
};

document.getElementById('hostForm').onsubmit = event => {
  event.preventDefault();
  const name = document.getElementById('tournamentName').value;
  closeHost();
  event.target.reset();
  toast(`${name} submitted — ₹49 payment initiated`);
};

function renderSettingsPreferences() { const container=document.getElementById('settingsPreferences'); if(!container) return; container.innerHTML=''; sports.forEach(([icon,name])=>{ const button=document.createElement('button'); button.type='button'; button.className=`preference${selected.has(name)?' selected':''}`; button.textContent=`${icon} ${name}`; button.onclick=()=>{ if(selected.has(name)){if(selected.size<=3)return toast('Keep at least 3 sports selected');selected.delete(name)}else{if(selected.size>=4)return toast('Choose up to 4 sports');selected.add(name)} localStorage.setItem('playyrPreferences',JSON.stringify([...selected]));renderSettingsPreferences();toast('Sports preferences updated')};container.appendChild(button)}); }
JSON.parse(localStorage.getItem('playyrPreferences')||'[]').forEach(name=>selected.add(name));
renderSettingsPreferences();
['discoverableSetting','activitySetting','locationSetting','alertsSetting'].forEach(id=>{const control=document.getElementById(id);if(!control)return;const saved=localStorage.getItem(`playyr-${id}`);if(saved!==null)control.checked=saved==='true';control.onchange=()=>{localStorage.setItem(`playyr-${id}`,control.checked);toast('Setting saved')}});
const changePasswordBtn=document.getElementById('changePasswordBtn');
if(changePasswordBtn) changePasswordBtn.onclick=()=>toast('Password changes require secure backend authentication');
const signOutBtn=document.getElementById('signOutBtn');
if(signOutBtn) signOutBtn.onclick=()=>{document.getElementById('mainApp').classList.add('hidden');authScreen.classList.remove('hidden');showAuthForm('signin');window.scrollTo(0,0);toast('Signed out')};

function toast(message) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => element.classList.remove('show'), 2600);
}
applyProfile(JSON.parse(localStorage.getItem('playyrDemoProfile') || 'null'));
