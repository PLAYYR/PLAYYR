const { sports } = window.PLAYYR_DATA;
const sb = window.supabaseClient;

const selected = new Set();
const grid = document.getElementById('sportGrid');
const authScreen = document.getElementById('authScreen');
const profileModal = document.getElementById('profileModal');
let profilePromptAuthorized = false;
const sportsKey = userId => `playyrSports:${userId}`;
const cityKey = userId => `playyrCity:${userId}`;
const SETTINGS_MAP = {
  discoverableSetting: 'discoverable',
  activitySetting: 'activity_visible',
  locationSetting: 'location_enabled',
  alertsSetting: 'alerts_enabled'
};

function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderStreak(metadata = {}) {
  const count = Math.max(0, Number(metadata.playyr_streak_count) || 0);
  const completedToday = metadata.playyr_last_activity_date === localDateKey();
  const streakButton = document.getElementById('streakButton');
  const challengeButton = document.getElementById('dailyChallengeButton');
  setText('streakCount', count);
  setText('streakStat', count);
  if (streakButton) streakButton.title = count ? `${count}-day activity streak` : 'Complete a daily challenge to begin your streak';
  if (challengeButton) {
    challengeButton.dataset.started = completedToday ? 'completed' : 'false';
    challengeButton.textContent = completedToday ? 'Completed today' : 'Start now';
    challengeButton.disabled = completedToday;
  }
  const trophy = document.getElementById('streakTrophy');
  if (trophy) trophy.classList.toggle('locked', count < 30);
  setText('streakTrophyStatus', count >= 30 ? 'Unlocked' : `${count}/30 days`);
}

function closeProfilePrompt() {
  profileModal.classList.add('hidden');
  document.body.style.overflow = '';
}

function openProfilePrompt() {
  if (!profilePromptAuthorized) return;
  profileModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

closeProfilePrompt();
window.addEventListener('pageshow', () => {
  if (!profilePromptAuthorized) closeProfilePrompt();
});

function withAuthIdentity(profile, user) {
  const email = (profile && profile.email) || (user && user.email) || '';
  const metadata = (user && user.user_metadata) || {};
  const fallbackName = metadata.full_name || metadata.username || email.split('@')[0] || 'Player';
  return {
    ...(profile || {}),
    full_name: (profile && profile.full_name && profile.full_name.trim()) || fallbackName,
    email
  };
}

function withSavedOnboarding(profile, user) {
  let savedSports = [];
  try { savedSports = JSON.parse(localStorage.getItem(sportsKey(user.id)) || '[]'); } catch (_) {}
  return {
    ...withAuthIdentity(profile, user),
    sports: (profile && profile.sports && profile.sports.length) ? profile.sports : savedSports,
    city: (profile && profile.city) || localStorage.getItem(cityKey(user.id)) || ''
  };
}

function applyProfile(profile) {
  if (!profile || !profile.full_name) return;
  const parts = profile.full_name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'PL';
  setText('homeGreeting', `Good evening, ${parts[0] || 'Player'} 👋`);
  setText('profileDisplayName', profile.full_name);
  setText('profilePageName', profile.full_name);
  setText('profileAvatar', initials);
  setText('settingsAvatar', initials);
  setText('leaderboardAvatar', initials);
  setText('settingsAccount', profile.email || 'Your PLAYYR account');
  if (profile.city) {
    document.querySelectorAll('.cityText').forEach(el => el.textContent = profile.city);
    setText('leaderboardCity', profile.city);
    document.getElementById('cityInput').value = profile.city;
    const settingsCity = document.getElementById('settingsCityInput');
    if (settingsCity) settingsCity.value = profile.city;
  }
}

function syncSportGridUI() {
  grid.querySelectorAll('.sport').forEach(button => {
    const name = button.querySelector('strong').textContent;
    button.classList.toggle('selected', selected.has(name));
  });
  document.getElementById('count').textContent = selected.size;
  document.getElementById('interestNext').disabled = selected.size < 3;
}

async function loadProfile(userId) {
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) return null;
  return data;
}

async function saveSports() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const chosenSports = [...selected];
  localStorage.setItem(sportsKey(user.id), JSON.stringify(chosenSports));
  await sb.from('profiles').upsert({ id: user.id, sports: chosenSports }, { onConflict: 'id' });
}

function bindSettingsToggles(profile) {
  Object.entries(SETTINGS_MAP).forEach(([id, column]) => {
    const control = document.getElementById(id);
    if (!control) return;
    if (profile && profile[column] !== undefined && profile[column] !== null) control.checked = profile[column];
    control.onchange = async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      await sb.from('profiles').update({ [column]: control.checked }).eq('id', user.id);
      toast('Setting saved');
    };
  });
}

async function hydrateFromProfile(profile) {
  applyProfile(profile);
  selected.clear();
  (profile.sports || []).forEach(name => selected.add(name));
  syncSportGridUI();
  renderSettingsPreferences();
  bindSettingsToggles(profile);
  renderChosenInterests();
  const activeEventFilter = document.querySelector('#eventFilters .chip.active');
  filterEvents(activeEventFilter ? activeEventFilter.dataset.filter : 'For you');
}

async function enterAppWithProfile(profile) {
  await hydrateFromProfile(profile);
  authScreen.classList.add('hidden');
  document.getElementById('onboarding').classList.add('hidden');
  document.querySelectorAll('.cityText').forEach(el => el.textContent = profile.city || 'Bengaluru');
  document.getElementById('mainApp').classList.remove('hidden');
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

document.getElementById('signUpForm').onsubmit = async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton.disabled) return;
  const username = document.getElementById('signUpUsername').value.trim();
  const email = document.getElementById('signUpEmail').value.trim().toLowerCase();
  const password = document.getElementById('signUpPassword').value;
  submitButton.disabled = true;
  submitButton.textContent = 'Creating account…';
  try {
    await sb.auth.signOut({ scope: 'local' });
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { username } }
    });
    const duplicateAccount = error && (
      error.code === 'user_already_exists' ||
      error.code === 'email_exists' ||
      /already (registered|exists)/i.test(error.message)
    );
    const hiddenDuplicate = !error && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
    if (duplicateAccount || hiddenDuplicate) {
      document.getElementById('signInEmail').value = email;
      showAuthForm('signin');
      toast('This email already has an account — please sign in');
      return;
    }
    if (error) { toast(`Could not create account: ${error.message}`); return; }
    if (!data.session) {
      document.getElementById('signInEmail').value = email;
      toast('Account created — check your email to confirm it, then sign in.');
      showAuthForm('signin');
      return;
    }
    document.getElementById('profileEmail').value = email;
    profilePromptAuthorized = true;
    openProfilePrompt();
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Create account';
  }
};

document.getElementById('signInForm').onsubmit = async event => {
  event.preventDefault();
  const email = document.getElementById('signInEmail').value.trim();
  const password = document.getElementById('signInPassword').value;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { toast('Email or password is incorrect'); return; }
  const profile = await loadProfile(data.user.id);
  const displayProfile = withSavedOnboarding(profile, data.user);
  renderStreak(data.user.user_metadata || {});
  if (displayProfile.city && (displayProfile.sports || []).length >= 3) {
    await enterAppWithProfile(displayProfile);
    return;
  }
  if (profile) await hydrateFromProfile(displayProfile);
  else applyProfile(displayProfile);
  profilePromptAuthorized = false;
  closeProfilePrompt();
  authScreen.classList.add('hidden');
  document.getElementById('onboarding').classList.remove('hidden');
};

document.getElementById('profileForm').onsubmit = async event => {
  event.preventDefault();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { toast('Session expired — please sign in again'); return; }
  const profileUpdate = {
    full_name: document.getElementById('fullName').value.trim(),
    email: document.getElementById('profileEmail').value.trim(),
    phone: document.getElementById('profilePhone').value.trim(),
    birth_date: document.getElementById('birthDate').value,
    gender: document.getElementById('profileGender').value,
    city: document.getElementById('profileCity').value.trim()
  };
  const { data, error } = await sb.from('profiles').upsert({ id: user.id, ...profileUpdate }, { onConflict: 'id' }).select().single();
  if (error) { toast('Could not save profile'); return; }
  applyProfile(data);
  profilePromptAuthorized = false;
  closeProfilePrompt();
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
    } else {
      selected.add(name);
      button.classList.add('selected');
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

const resetBtn = document.getElementById('resetBtn');
if (resetBtn) resetBtn.onclick = () => {
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('locationStep').classList.add('hidden');
  document.getElementById('interestStep').classList.remove('hidden');
  document.getElementById('p2').classList.remove('active');
  document.getElementById('onboarding').classList.remove('hidden');
  document.getElementById('count').textContent = selected.size;
  document.getElementById('interestNext').disabled = selected.size < 3;
  window.scrollTo(0, 0);
};

function renderChosenInterests() {
  const container = document.getElementById('chosenInterests');
  if (!container) return;
  container.innerHTML = '';
  sports.filter(([, name]) => selected.has(name)).forEach(([icon, name]) => {
    const chip = document.createElement('span');
    chip.className = 'chip active';
    chip.textContent = `${icon} ${name}`;
    container.appendChild(chip);
  });
}

async function enter(city = 'Bengaluru') {
  document.querySelectorAll('.cityText').forEach(element => element.textContent = city);
  document.getElementById('onboarding').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  const { data: { user } } = await sb.auth.getUser();
  if (user) {
    const chosenSports = [...selected];
    localStorage.setItem(sportsKey(user.id), JSON.stringify(chosenSports));
    localStorage.setItem(cityKey(user.id), city);
    const { error } = await sb.from('profiles').upsert({ id: user.id, sports: chosenSports, city }, { onConflict: 'id' });
    if (error) toast('Saved on this device; cloud sync will retry later');
  }
  renderSettingsPreferences();
  renderChosenInterests();
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

const eventFilters = document.getElementById('eventFilters');
function filterEvents(filter = 'For you') {
  const cards = [...document.querySelectorAll('#eventsPage .event-card')];
  let visible = 0;
  cards.forEach(card => {
    const matches = filter === 'For you'
      ? (selected.size === 0 || selected.has(card.dataset.category))
      : card.dataset.category === filter;
    card.hidden = !matches;
    card.classList.toggle('hidden', !matches);
    card.setAttribute('aria-hidden', String(!matches));
    if (matches) visible += 1;
  });
  document.getElementById('eventsEmpty').classList.toggle('hidden', visible > 0);
}

if (eventFilters) eventFilters.querySelectorAll('[data-filter]').forEach(button => {
  button.onclick = () => {
    eventFilters.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active', item === button));
    filterEvents(button.dataset.filter);
    toast(`Showing ${button.textContent.toLowerCase()} events`);
  };
});
filterEvents();

const streakButton = document.getElementById('streakButton');
if (streakButton) streakButton.onclick = () => {
  const count = document.getElementById('streakCount').textContent;
  toast(Number(count) ? `${count}-day streak — complete today's challenge to keep it going` : 'Complete today’s challenge to start your streak');
};

const dailyChallengeButton = document.getElementById('dailyChallengeButton');
if (dailyChallengeButton) dailyChallengeButton.onclick = async () => {
  if (dailyChallengeButton.dataset.started !== 'true') {
    dailyChallengeButton.dataset.started = 'true';
    dailyChallengeButton.textContent = 'Mark complete';
    toast('Challenge started — mark it complete when you finish');
    return;
  }
  dailyChallengeButton.disabled = true;
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    dailyChallengeButton.disabled = false;
    return toast('Sign in to record your streak');
  }
  const metadata = user.user_metadata || {};
  const today = localDateKey();
  if (metadata.playyr_last_activity_date === today) {
    renderStreak(metadata);
    return toast('Today’s activity is already counted');
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const continued = metadata.playyr_last_activity_date === localDateKey(yesterday);
  const nextCount = continued ? (Number(metadata.playyr_streak_count) || 0) + 1 : 1;
  const streakUpdate = {
    playyr_streak_count: nextCount,
    playyr_last_activity_date: today
  };
  const nextMetadata = { ...metadata, ...streakUpdate };
  const { error } = await sb.auth.updateUser({ data: streakUpdate });
  if (error) {
    dailyChallengeButton.disabled = false;
    dailyChallengeButton.textContent = 'Mark complete';
    return toast('Could not save your activity — try again');
  }
  renderStreak(nextMetadata);
  toast(nextCount === 1 ? 'Your streak has started!' : `${nextCount}-day streak — keep it going!`);
};

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
  toast(`${name} submitted — ₹99 payment initiated`);
};

const teamModal = document.getElementById('teamModal');
const listTeamBtn = document.getElementById('listTeamBtn');
const closeTeamBtn = document.getElementById('closeTeam');

function closeTeamListing() {
  teamModal.classList.add('hidden');
  document.body.style.overflow = '';
}

if (listTeamBtn) listTeamBtn.onclick = () => {
  teamModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
};
if (closeTeamBtn) closeTeamBtn.onclick = closeTeamListing;
if (teamModal) teamModal.onclick = event => {
  if (event.target === teamModal) closeTeamListing();
};

const teamForm = document.getElementById('teamForm');
if (teamForm) teamForm.onsubmit = event => {
  event.preventDefault();
  const name = document.getElementById('teamName').value.trim();
  closeTeamListing();
  event.target.reset();
  toast(`${name} submitted for review`);
};

function renderSettingsPreferences() {
  const container = document.getElementById('settingsPreferences');
  if (!container) return;
  container.innerHTML = '';
  sports.forEach(([icon, name]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `preference${selected.has(name) ? ' selected' : ''}`;
    button.textContent = `${icon} ${name}`;
    button.onclick = async () => {
      if (selected.has(name)) {
        if (selected.size <= 3) return toast('Keep at least 3 sports selected');
        selected.delete(name);
      } else {
        selected.add(name);
      }
      await saveSports();
      renderSettingsPreferences();
      renderChosenInterests();
      toast('Sports preferences updated');
    };
    container.appendChild(button);
  });
}
renderSettingsPreferences();
bindSettingsToggles(null);

const saveSettingsCity = document.getElementById('saveSettingsCity');
if (saveSettingsCity) saveSettingsCity.onclick = async () => {
  const input = document.getElementById('settingsCityInput');
  const city = input.value.trim();
  if (!city) return toast('Enter your city or area');
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return toast('Sign in to update your location');
  localStorage.setItem(cityKey(user.id), city);
  document.getElementById('cityInput').value = city;
  document.querySelectorAll('.cityText').forEach(element => element.textContent = city);
  setText('leaderboardCity', city);
  const { error } = await sb.from('profiles').upsert({ id: user.id, city }, { onConflict: 'id' });
  toast(error ? 'Location saved on this device' : 'Location updated');
};

const changePasswordBtn = document.getElementById('changePasswordBtn');
if (changePasswordBtn) changePasswordBtn.onclick = async () => {
  const { data: { user } } = await sb.auth.getUser();
  if (!user || !user.email) { toast('Sign in to change your password'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(user.email);
  toast(error ? 'Could not send reset email' : 'Password reset email sent');
};

const signOutBtn = document.getElementById('signOutBtn');
if (signOutBtn) signOutBtn.onclick = async () => {
  await sb.auth.signOut();
  profilePromptAuthorized = false;
  closeProfilePrompt();
  selected.clear();
  document.getElementById('mainApp').classList.add('hidden');
  authScreen.classList.remove('hidden');
  showAuthForm('signin');
  window.scrollTo(0, 0);
  toast('Signed out');
};

function toast(message) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => element.classList.remove('show'), 2600);
}

(async function bootstrap() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  const profile = await loadProfile(session.user.id);
  const displayProfile = withSavedOnboarding(profile, session.user);
  if (displayProfile.city && (displayProfile.sports || []).length >= 3) {
    enterAppWithProfile(displayProfile);
    renderStreak(session.user.user_metadata || {});
    return;
  }
  if (profile) await hydrateFromProfile(displayProfile);
  else applyProfile(displayProfile);
  closeProfilePrompt();
  authScreen.classList.add('hidden');
  document.getElementById('onboarding').classList.remove('hidden');
  renderStreak(session.user.user_metadata || {});
})();
