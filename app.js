const { sports } = window.PLAYYR_DATA;
const sb = window.supabaseClient;
const sportIcons = Object.fromEntries(sports.map(([icon, name]) => [name, icon]));

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
const THEME_KEY = 'playyrTheme';

function applyTheme(theme, persist = true) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = nextTheme;
  if (persist) localStorage.setItem(THEME_KEY, nextTheme);
  const toggle = document.getElementById('themeSetting');
  const icon = document.getElementById('themeSettingIcon');
  const description = document.getElementById('themeSettingDescription');
  if (toggle) toggle.checked = nextTheme === 'dark';
  if (icon) icon.textContent = nextTheme === 'dark' ? '☀' : '☾';
  if (description) description.textContent = nextTheme === 'dark'
    ? 'Dark theme is active. Switch off for light mode.'
    : 'Use a darker interface in low light.';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', nextTheme === 'dark' ? '#090e0a' : '#f6f5ef');
}

applyTheme(localStorage.getItem(THEME_KEY) || document.documentElement.dataset.theme || 'light', false);

function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function currentSportsList() {
  return [...selected];
}

function renderEventFilterChips() {
  const row = document.getElementById('eventFilters');
  if (!row) return;
  const active = row.querySelector('.chip.active')?.dataset.filter || 'For you';
  row.innerHTML = '';
  const chips = ['For you', ...currentSportsList()];
  chips.forEach((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `chip${index === 0 && active === 'For you' ? ' active' : ''}`;
    button.dataset.filter = name;
    button.textContent = name === 'For you' ? 'For you' : `${sportIcons[name] || ''} ${name}`.trim();
    if (name === active) button.classList.add('active');
    button.onclick = () => {
      row.querySelectorAll('.chip').forEach(item => item.classList.toggle('active', item === button));
      filterEvents(button.dataset.filter);
      toast(`Showing ${button.textContent.toLowerCase()} events`);
    };
    row.appendChild(button);
  });
}

function renderFindFilterChips() {
  const row = document.getElementById('findFilters');
  if (!row) return;
  const active = row.querySelector('.chip.active')?.dataset.filter || 'All nearby';
  row.innerHTML = '';
  const chips = ['All nearby', ...currentSportsList()];
  chips.forEach((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `chip${index === 0 && active === 'All nearby' ? ' active' : ''}`;
    button.dataset.filter = name;
    button.textContent = name === 'All nearby' ? 'All nearby' : `${sportIcons[name] || ''} ${name}`.trim();
    if (name === active) button.classList.add('active');
    button.onclick = () => {
      row.querySelectorAll('.chip').forEach(item => item.classList.toggle('active', item === button));
      filterFindTeams(button.dataset.filter);
      toast(`Showing ${button.textContent.toLowerCase()} teams`);
    };
    row.appendChild(button);
  });
}

function renderRadius(radius) {
  const value = Math.min(50, Math.max(1, Number(radius) || 15));
  document.querySelectorAll('.radius-slider').forEach(slider => {
    slider.value = value;
    slider.style.setProperty('--radius-progress', `${((value - 1) / 49) * 100}%`);
  });
  document.querySelectorAll('.radiusValue').forEach(element => element.textContent = `${value} km`);
  document.querySelectorAll('.radiusText').forEach(element => element.textContent = `${value} km`);
  document.querySelectorAll('#findPage .team').forEach(team => {
    const label = team.querySelector('.sport-name')?.textContent || '';
    const distance = Number((label.match(/([\d.]+)\s*km/i) || [])[1] || 0);
    team.hidden = distance > value;
  });
  const activeEventFilter = document.querySelector('#eventFilters [data-filter].active');
  filterEvents(activeEventFilter ? activeEventFilter.dataset.filter : 'For you');
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localWeekKey(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return localDateKey(start);
}

function renderActivityStats(metadata = {}) {
  const currentWeek = localWeekKey();
  const recordedThisWeek = metadata.playyr_activity_week === currentWeek;
  const completedToday = metadata.playyr_last_activity_date === localDateKey();
  const challenges = recordedThisWeek
    ? Math.max(0, Number(metadata.playyr_week_challenges) || 0)
    : (completedToday ? 1 : 0);
  const activeMinutes = recordedThisWeek
    ? Math.max(0, Number(metadata.playyr_week_active_minutes) || 0)
    : (completedToday ? 30 : 0);
  setText('challengesStat', challenges);
  setText('activeTimeStat', activeMinutes >= 60
    ? `${Math.floor(activeMinutes / 60)}h ${activeMinutes % 60}m`
    : `${activeMinutes}m`);
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
  renderActivityStats(metadata);
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
  setText('profileHeroName', profile.full_name);
  setText('profileAvatar', initials);
  setText('settingsAvatar', initials);
  setText('leaderboardAvatar', initials);
  setText('settingsAccount', profile.email || 'Your PLAYYR account');
  const settingsName = document.getElementById('settingsNameInput');
  if (settingsName) settingsName.value = profile.full_name;
  const settingsBio = document.getElementById('settingsBioInput');
  if (settingsBio) {
    settingsBio.value = profile.bio || '';
    setText('settingsBioCount', `${settingsBio.value.length} / 300`);
  }
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
  renderEventFilterChips();
  renderFindFilterChips();
  const activeEventFilter = document.querySelector('#eventFilters .chip.active');
  filterEvents(activeEventFilter ? activeEventFilter.dataset.filter : 'For you');
  const activeFindFilter = document.querySelector('#findFilters .chip.active');
  filterFindTeams(activeFindFilter ? activeFindFilter.dataset.filter : 'All nearby');
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
  renderRadius(data.user.user_metadata.playyr_radius_km || localStorage.getItem(`playyrRadius:${data.user.id}`));
  if (displayProfile.city && (displayProfile.sports || []).length >= 3) {
    await enterAppWithProfile(displayProfile);
    await handlePendingTeamInvite();
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
  renderEventFilterChips();
  renderFindFilterChips();
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

function navigateTo(pageId) { const page = document.getElementById(pageId); if (!page) return; document.querySelectorAll('.nav button').forEach(item => item.classList.toggle('active', item.dataset.page === pageId)); document.querySelectorAll('.page').forEach(el => el.classList.add('hidden')); page.classList.remove('hidden'); if (pageId === 'findPage') loadFindTeams(); window.scrollTo({top:0,behavior:'smooth'}); }
document.querySelectorAll('.nav button').forEach(button => button.onclick = () => navigateTo(button.dataset.page));
const escapeHtml = value => String(value || '').replace(/[&<>'"]/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[character]);
const initialsFor = value => String(value || 'Player').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'PL';

let findTeamsCache = [];
async function loadFindTeams() {
  const container = document.getElementById('findRealTeams');
  if (!container) return;
  container.innerHTML = '<div class="empty-state"><strong>Loading nearby teams</strong><span>Finding discoverable PLAYYR teams...</span></div>';
  const { data, error } = await sb.rpc('get_find_teams');
  if (error) {
    container.innerHTML = '<div class="empty-state"><strong>Could not load live teams</strong><span>Please try again in a moment.</span></div>';
    return;
  }
  findTeamsCache = data || [];
  if (!findTeamsCache.length) {
    container.innerHTML = '<div class="empty-state"><strong>No public teams yet</strong><span>Make a team and enable discovery to appear here.</span></div>';
    return;
  }
  container.innerHTML = findTeamsCache.map(team => `<article class="team" data-sport="${escapeHtml(team.sport)}"><div class="find-team-summary"><div class="team-logo">${escapeHtml(initialsFor(team.team_name))}</div><div><h3>${escapeHtml(team.team_name)}</h3><p>${escapeHtml(sportIcons[team.sport] || '')} ${escapeHtml(team.sport)} · ${team.member_count}/${team.max_members} players</p></div><span class="open">PLAYYR</span></div><div class="find-team-actions"><button class="secondary-btn" type="button" data-find-team="${team.team_id}">View details</button></div></article>`).join('');
  container.querySelectorAll('[data-find-team]').forEach(button => button.onclick = () => openFindTeamDetails(button.dataset.findTeam));
  filterFindTeams(document.querySelector('#findFilters .chip.active')?.dataset.filter || 'All nearby');
}

function setModalOpen(modal, open) {
  if (!modal) return;
  modal.classList.toggle('hidden', !open);
  document.body.style.overflow = open ? 'hidden' : '';
}

function openFindTeamDetails(teamId) {
  const team = findTeamsCache.find(item => item.team_id === teamId);
  if (!team) return toast('Team details are unavailable');
  setText('findTeamDetailsTitle', team.team_name);
  setText('findTeamDetailsMeta', `${sportIcons[team.sport] || ''} ${team.sport} · ${team.member_count}/${team.max_members} players`);
  const roster = document.getElementById('findTeamRoster');
  const members = Array.isArray(team.members) ? team.members : [];
  roster.innerHTML = members.length ? members.map(member => `<button class="profile-row" type="button" data-public-profile="${member.id}"><i>${escapeHtml(initialsFor(member.full_name))}</i><span><strong>${escapeHtml(member.full_name)}</strong><small>${escapeHtml(member.city || 'PLAYYR member')}</small></span><b>›</b></button>`).join('') : '<div class="empty-state"><strong>No public profiles</strong><span>Members can enable discovery in Settings.</span></div>';
  roster.querySelectorAll('[data-public-profile]').forEach(button => button.onclick = () => openPublicProfile(button.dataset.publicProfile));
  setModalOpen(document.getElementById('findTeamDetailsModal'), true);
}

function openStaticFindTeamDetails(card) {
  const name = card.querySelector('h3')?.textContent?.trim() || 'Nearby team';
  const sport = card.querySelector('.sport-name')?.textContent?.trim() || 'Local team';
  const memberCount = card.querySelector('.members span')?.textContent?.trim() || 'Members';
  setText('findTeamDetailsTitle', name);
  setText('findTeamDetailsMeta', `${sport} · ${memberCount}`);
  const details = [...card.querySelectorAll('.detail')].map(item => `<div class="detail-chip"><span>${escapeHtml(item.querySelector('span')?.textContent || 'Details')}</span><b>${escapeHtml(item.querySelector('b')?.textContent || '')}</b></div>`).join('');
  document.getElementById('findTeamRoster').innerHTML = `<div class="detail-grid">${details}</div><div class="empty-state"><strong>Player profiles coming from live members</strong><span>Profiles will appear here when this team is connected to a PLAYYR account.</span></div>`;
  setModalOpen(document.getElementById('findTeamDetailsModal'), true);
}

document.querySelectorAll('.static-team-details').forEach(button => button.onclick = () => openStaticFindTeamDetails(button.closest('.team')));

async function openPublicProfile(userId) {
  const { data, error } = await sb.rpc('get_public_profile', { p_user_id:userId });
  const profile = Array.isArray(data) ? data[0] : data;
  if (error || !profile) return toast('This profile is private');
  setText('publicProfileAvatar', initialsFor(profile.full_name));
  setText('publicProfileName', profile.full_name || 'PLAYYR player');
  setText('publicProfileCity', profile.city || 'PLAYYR member');
  setText('publicProfileBio', profile.bio || 'No bio added yet.');
  const sportsList = document.getElementById('publicProfileSports');
  sportsList.innerHTML = (profile.sports || []).map(name => `<span>${escapeHtml(sportIcons[name] || '')} ${escapeHtml(name)}</span>`).join('') || '<span>No sports shared</span>';
  setModalOpen(document.getElementById('publicProfileModal'), true);
}

['closeFindTeamDetails','closeFindTeamDetailsBottom'].forEach(id => document.getElementById(id)?.addEventListener('click', () => setModalOpen(document.getElementById('findTeamDetailsModal'), false)));
['closePublicProfile','closePublicProfileBottom'].forEach(id => document.getElementById(id)?.addEventListener('click', () => setModalOpen(document.getElementById('publicProfileModal'), false)));
document.getElementById('findTeamDetailsModal')?.addEventListener('click', event => { if (event.target === event.currentTarget) setModalOpen(event.currentTarget, false); });
document.getElementById('publicProfileModal')?.addEventListener('click', event => { if (event.target === event.currentTarget) setModalOpen(event.currentTarget, false); });

async function loadYourTeams() {
  const list = document.getElementById('yourTeamsList');
  if (!list) return;
  list.innerHTML = '<div class="empty-teams"><strong>Loading your teams</strong><span>Getting your latest memberships...</span></div>';
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const { data, error } = await sb.from('teams').select('id,name,sport,max_members,creator_id,invite_code,team_members(user_id,display_name,joined_at)').order('created_at', { ascending:false });
  if (error) {
    list.innerHTML = '<div class="empty-teams"><strong>Teams need database setup</strong><span>Run supabase/teams.sql in your Supabase SQL Editor.</span></div>';
    return;
  }
  const teams = data || [];
  if (!teams.length) {
    list.innerHTML = '<div class="empty-teams"><strong>No teams yet</strong><span>Make your first team or join one through an invite link.</span></div>';
    return;
  }
  list.innerHTML = teams.map(team => {
    const isCreator = team.creator_id === user.id;
    const members = team.team_members || [];
    const creatorName = members.find(member => member.user_id === team.creator_id)?.display_name || 'A PLAYYR player';
    const rows = members.map(member => `<div class="member-row"><i>${escapeHtml(initialsFor(member.display_name))}</i><span>${escapeHtml(member.display_name || 'PLAYYR member')}${member.user_id === team.creator_id ? ' · Creator' : ''}</span>${isCreator && member.user_id !== user.id ? `<button type="button" data-remove-member="${member.user_id}" data-team-id="${team.id}">Remove</button>` : ''}</div>`).join('');
    return `<article class="team owned-team"><div class="owned-team-summary"><div class="team-logo">${escapeHtml(initialsFor(team.name))}</div><div><h3>${escapeHtml(team.name)}</h3><p>${escapeHtml(team.sport)} · ${members.length}/${team.max_members} players</p></div>${isCreator ? '<span class="owner-pill">Creator</span>' : '<span class="owner-pill">Member</span>'}</div><div class="team-actions">${isCreator ? `<button class="small-btn" type="button" data-invite-code="${team.invite_code}" data-inviter="${escapeHtml(creatorName)}" data-team-name="${escapeHtml(team.name)}" data-team-sport="${escapeHtml(team.sport)}">Invite people</button>` : ''}<button class="ghost" type="button" data-toggle-members="${team.id}">View members</button></div><div id="members-${team.id}" class="member-list hidden">${rows}</div></article>`;
  }).join('');
  list.querySelectorAll('[data-remove-member]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      removeTeamMember(button);
    });
  });
}

async function removeTeamMember(removeButton) {
  if (!removeButton || removeButton.dataset.removing === 'true') return;
  if (!window.confirm('Remove this player from the team?')) return;
  const teamId = removeButton.dataset.teamId;
  const memberId = removeButton.dataset.removeMember;
  removeButton.dataset.removing = 'true';
  removeButton.disabled = true;
  removeButton.textContent = 'Removing...';
  const { data, error } = await sb.rpc('remove_team_member', { p_team_id:teamId, p_user_id:memberId });
  let result = data;
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch (_) {}
  }
  if (!error && result?.removed !== false) {
    toast(result?.message || 'Player removed from the team');
    await loadYourTeams();
    return;
  }
  const message = error?.message || result?.message || 'Player could not be removed';
  removeButton.dataset.removing = 'false';
  removeButton.disabled = false;
  removeButton.textContent = 'Try again';
  removeButton.title = message;
  toast(message);
}

async function openYourTeams() {
  navigateTo('yourTeamsPage');
  await loadYourTeams();
}

document.getElementById('yourTeamsBtn')?.addEventListener('click', openYourTeams);
document.getElementById('backToEventsBtn')?.addEventListener('click', () => navigateTo('eventsPage'));
document.getElementById('yourTeamsList')?.addEventListener('click', async event => {
  const inviteButton = event.target.closest('[data-invite-code]');
  if (inviteButton) {
    const inviteUrl = new URL(location.pathname, location.origin);
    inviteUrl.searchParams.set('join', inviteButton.dataset.inviteCode);
    inviteUrl.searchParams.set('from', inviteButton.dataset.inviter);
    inviteUrl.searchParams.set('team', inviteButton.dataset.teamName);
    inviteUrl.searchParams.set('sport', inviteButton.dataset.teamSport);
    const url = inviteUrl.toString();
    const message = `${inviteButton.dataset.inviter} has invited you to join ${inviteButton.dataset.teamName}, a ${inviteButton.dataset.teamSport} team on PLAYYR.\n${url}`;
    try { await navigator.clipboard.writeText(message); toast('Invite message and link copied'); }
    catch (_) { window.prompt('Copy this team invitation', message); }
    return;
  }
  const toggleButton = event.target.closest('[data-toggle-members]');
  if (toggleButton) {
    document.getElementById(`members-${toggleButton.dataset.toggleMembers}`)?.classList.toggle('hidden');
    return;
  }
});

const makeTeamModal = document.getElementById('makeTeamModal');
function closeMakeTeam() { makeTeamModal?.classList.add('hidden'); document.body.style.overflow = ''; }
document.getElementById('makeTeamBtn')?.addEventListener('click', () => { makeTeamModal.classList.remove('hidden'); document.body.style.overflow = 'hidden'; });
document.getElementById('closeMakeTeam')?.addEventListener('click', closeMakeTeam);
makeTeamModal?.addEventListener('click', event => { if (event.target === makeTeamModal) closeMakeTeam(); });
document.getElementById('makeTeamForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return toast('Sign in to create a team');
  const payload = { name:document.getElementById('newTeamName').value.trim(), sport:document.getElementById('newTeamSport').value, max_members:Number(document.getElementById('newTeamMax').value), creator_id:user.id };
  const { error } = await sb.from('teams').insert(payload);
  if (error) return toast(error.message.includes('teams') ? 'Run the PLAYYR teams database setup first' : error.message);
  event.target.reset();
  closeMakeTeam();
  toast(`${payload.name} created`);
  await loadYourTeams();
});

let pendingInviteHandled = false;
let pendingInviteCode = '';
async function handlePendingTeamInvite() {
  if (pendingInviteHandled) return;
  const inviteParams = new URLSearchParams(location.search);
  const code = inviteParams.get('join');
  if (!code) return;
  pendingInviteCode = code;
  const { data, error } = await sb.rpc('get_team_invite_preview', { p_invite_code:code });
  const modal = document.getElementById('teamInviteModal');
  const joinButton = document.getElementById('acceptTeamInviteBtn');
  const linkPreview = {
    inviter_name:inviteParams.get('from'),
    team_name:inviteParams.get('team'),
    sport:inviteParams.get('sport')
  };
  const hasLinkPreview = Boolean(linkPreview.inviter_name && linkPreview.team_name && linkPreview.sport);
  const preview = data?.valid ? data : (hasLinkPreview ? { ...linkPreview, valid:true, member_count:null, max_members:null, is_full:false } : null);
  if (!preview?.valid) {
    setText('teamInviteTitle', 'Invite unavailable');
    setText('teamInviteMessage', data?.message || (error ? 'Invite details could not load. Ask the sender to copy a fresh invitation link.' : 'This team invitation is invalid or no longer available.'));
    joinButton.disabled = true;
  } else {
    setText('inviteTeamIcon', initialsFor(preview.team_name));
    setText('teamInviteTitle', `Join ${preview.team_name}`);
    document.getElementById('teamInviteMessage').innerHTML = `<strong>${escapeHtml(preview.inviter_name)}</strong> has invited you to join <strong>${escapeHtml(preview.team_name)}</strong>, a ${escapeHtml(preview.sport)} team on PLAYYR.`;
    setText('inviteSport', preview.sport);
    setText('inviteCapacity', preview.member_count === null ? 'Team invite' : `${preview.member_count}/${preview.max_members} players`);
    joinButton.disabled = Boolean(preview.is_full);
    joinButton.textContent = preview.is_full ? 'Team is full' : 'Join team';
  }
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

document.getElementById('acceptTeamInviteBtn')?.addEventListener('click', async () => {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    document.getElementById('teamInviteModal').classList.add('hidden');
    document.body.style.overflow = '';
    showAuthForm('signin');
    toast('Sign in first, then you can choose to join');
    return;
  }
  const button = document.getElementById('acceptTeamInviteBtn');
  button.disabled = true;
  button.textContent = 'Joining...';
  const { data, error } = await sb.rpc('join_team_by_invite', { p_invite_code:pendingInviteCode });
  if (error) {
    button.disabled = false;
    button.textContent = 'Join team';
    return toast(error.message);
  }
  pendingInviteHandled = true;
  document.getElementById('teamInviteModal').classList.add('hidden');
  document.body.style.overflow = '';
  history.replaceState({}, '', `${location.pathname}${location.hash}`);
  toast(data === 'already_member' ? 'You are already in this team' : 'You joined the team');
  await openYourTeams();
});

document.getElementById('declineTeamInviteBtn')?.addEventListener('click', () => {
  document.getElementById('teamInviteModal').classList.add('hidden');
  document.body.style.overflow = '';
});

const registerTeamModal = document.getElementById('registerTeamModal');
const registrationTeamSelect = document.getElementById('registrationTeamSelect');
const registrationTeamPicker = document.getElementById('registrationTeamPicker');
const registrationTeamTrigger = document.getElementById('registrationTeamTrigger');
const registrationTeamMenu = document.getElementById('registrationTeamMenu');
const registrationTeamLabel = document.getElementById('registrationTeamLabel');
const registrationTeamSport = document.getElementById('registrationTeamSport');
const registrationEligibility = document.getElementById('registrationEligibility');
const payAndRegisterBtn = document.getElementById('payAndRegisterBtn');
let selectedTournament = null;
let selectedTeamEligible = false;

function closeTeamRegistration() {
  closeRegistrationTeamPicker();
  registerTeamModal?.classList.add('hidden');
  document.body.style.overflow = '';
  selectedTournament = null;
  selectedTeamEligible = false;
}

function closeRegistrationTeamPicker() {
  registrationTeamPicker?.classList.remove('open');
  registrationTeamMenu?.classList.add('hidden');
  registrationTeamTrigger?.setAttribute('aria-expanded', 'false');
}

function openRegistrationTeamPicker() {
  if (!registrationTeamMenu?.children.length) return;
  registrationTeamPicker?.classList.add('open');
  registrationTeamMenu.classList.remove('hidden');
  registrationTeamTrigger?.setAttribute('aria-expanded', 'true');
}

function renderRegistrationTeamPicker(teams = []) {
  registrationTeamMenu.innerHTML = '';
  registrationTeamLabel.textContent = 'Choose your team';
  registrationTeamSport.textContent = teams.length ? `${teams.length} ${teams.length === 1 ? 'team' : 'teams'} available` : 'No teams available';
  teams.forEach(team => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'team-picker-option';
    option.dataset.teamId = team.id;
    option.setAttribute('role', 'option');
    option.innerHTML = `<i class="team-option-icon" aria-hidden="true">${sportIcons[team.sport] || '&#127942;'}</i><span><strong>${escapeHtml(team.name)}</strong><small>${escapeHtml(team.sport)} team</small></span><b class="team-picker-check" aria-hidden="true"></b>`;
    option.addEventListener('click', () => {
      registrationTeamSelect.value = team.id;
      registrationTeamLabel.textContent = team.name;
      registrationTeamSport.textContent = `${team.sport} team`;
      registrationTeamMenu.querySelectorAll('.team-picker-option').forEach(item => {
        const selected = item === option;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-selected', String(selected));
        item.querySelector('.team-picker-check').textContent = selected ? '\u2713' : '';
      });
      closeRegistrationTeamPicker();
      registrationTeamSelect.dispatchEvent(new Event('change', { bubbles:true }));
    });
    registrationTeamMenu.appendChild(option);
  });
}

registrationTeamTrigger?.addEventListener('click', () => {
  registrationTeamPicker?.classList.contains('open') ? closeRegistrationTeamPicker() : openRegistrationTeamPicker();
});
document.addEventListener('click', event => {
  if (!registrationTeamPicker?.contains(event.target)) closeRegistrationTeamPicker();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeRegistrationTeamPicker();
});

async function openTeamRegistration(card) {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return toast('Sign in to register a team');
  selectedTournament = {
    key:card.dataset.tournament,
    name:card.querySelector('h3')?.textContent || 'Tournament',
    fee:Number(card.dataset.fee) || 0
  };
  setText('registerTournamentName', selectedTournament.name);
  setText('registrationFee', `₹${selectedTournament.fee.toLocaleString('en-IN')}`);
  registrationTeamSelect.innerHTML = '<option value="">Choose a team</option>';
  renderRegistrationTeamPicker([]);
  registrationEligibility.className = 'eligibility-box';
  registrationEligibility.textContent = 'Select a team to check its sport, age and gender eligibility.';
  payAndRegisterBtn.disabled = true;
  const { data, error } = await sb.from('teams').select('id,name,sport').eq('creator_id', user.id).order('name');
  if (error) return toast('Run the tournament registration database setup first');
  (data || []).forEach(team => {
    const option = document.createElement('option');
    option.value = team.id;
    option.textContent = `${team.name} · ${team.sport}`;
    registrationTeamSelect.appendChild(option);
  });
  renderRegistrationTeamPicker(data || []);
  if (!data?.length) {
    registrationEligibility.className = 'eligibility-box error';
    registrationEligibility.textContent = 'Create a team first. Only a team creator can register their team.';
  }
  registerTeamModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

document.querySelectorAll('.register-team-btn').forEach(button => {
  button.addEventListener('click', () => openTeamRegistration(button.closest('.event-card')));
});
document.getElementById('closeRegisterTeam')?.addEventListener('click', closeTeamRegistration);
registerTeamModal?.addEventListener('click', event => { if (event.target === registerTeamModal) closeTeamRegistration(); });

registrationTeamSelect?.addEventListener('change', async () => {
  selectedTeamEligible = false;
  payAndRegisterBtn.disabled = true;
  if (!registrationTeamSelect.value || !selectedTournament) {
    registrationEligibility.className = 'eligibility-box';
    registrationEligibility.textContent = 'Select a team to check its sport, age and gender eligibility.';
    return;
  }
  registrationEligibility.className = 'eligibility-box';
  registrationEligibility.textContent = 'Checking every team member...';
  const { data, error } = await sb.rpc('check_team_tournament_eligibility', { p_team_id:registrationTeamSelect.value, p_tournament_key:selectedTournament.key });
  if (error) {
    registrationEligibility.className = 'eligibility-box error';
    registrationEligibility.textContent = error.message;
    return;
  }
  selectedTeamEligible = Boolean(data?.eligible);
  registrationEligibility.className = `eligibility-box ${selectedTeamEligible ? 'ok' : 'error'}`;
  registrationEligibility.textContent = data?.message || (selectedTeamEligible ? 'Your team is eligible.' : 'This team is not eligible.');
  payAndRegisterBtn.disabled = !selectedTeamEligible;
});

document.getElementById('registerTeamForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!selectedTeamEligible || !selectedTournament) return;
  if (!confirm(`Pay ₹${selectedTournament.fee.toLocaleString('en-IN')} and register this team?`)) return;
  payAndRegisterBtn.disabled = true;
  payAndRegisterBtn.textContent = 'Processing payment...';
  const paymentReference = `playyr-${Date.now()}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
  const { data, error } = await sb.rpc('register_team_for_tournament', { p_team_id:registrationTeamSelect.value, p_tournament_key:selectedTournament.key, p_payment_reference:paymentReference });
  payAndRegisterBtn.textContent = 'Pay & register team';
  if (error) {
    payAndRegisterBtn.disabled = false;
    return toast(error.message);
  }
  closeTeamRegistration();
  toast(data?.message || 'Payment successful — your team is registered');
});
const profileAvatarBtn = document.getElementById('profileAvatar');
if (profileAvatarBtn) profileAvatarBtn.onclick = () => navigateTo('settingsPage');
const setRadiusBtn = document.getElementById('setRadiusBtn');
if (setRadiusBtn) setRadiusBtn.onclick = () => {
  navigateTo('eventsPage');
  setTimeout(() => document.querySelector('#eventsPage .radius-control')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
};

const radiusSliders = document.querySelectorAll('.radius-slider');
radiusSliders.forEach(slider => {
  slider.oninput = () => renderRadius(slider.value);
  slider.onchange = async () => {
    const radius = Number(slider.value);
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    localStorage.setItem(`playyrRadius:${user.id}`, String(radius));
    const { error } = await sb.auth.updateUser({ data: { playyr_radius_km: radius } });
    toast(error ? 'Radius saved on this device' : `Discovery radius set to ${radius} km`);
  };
});
renderRadius(15);

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

const eventDetailsModal = document.getElementById('eventDetailsModal');
const eventDetailsTitle = document.getElementById('eventDetailsTitle');
const eventDetailsSport = document.getElementById('eventDetailsSport');
const eventDetailsDate = document.getElementById('eventDetailsDate');
const eventDetailsVenue = document.getElementById('eventDetailsVenue');
const eventDetailsFee = document.getElementById('eventDetailsFee');
const eventDetailsDistance = document.getElementById('eventDetailsDistance');
const eventDetailsGoing = document.getElementById('eventDetailsGoing');
const eventDetailsSpots = document.getElementById('eventDetailsSpots');
const eventDetailsBlurb = document.getElementById('eventDetailsBlurb');
const eventDetailsMapsLink = document.getElementById('eventDetailsMapsLink');
const eventDetailsRegisterBtn = document.getElementById('eventDetailsRegisterBtn');
const closeEventDetailsBtn = document.getElementById('closeEventDetailsBtn');
const venueMapsBtn = document.getElementById('venueMapsBtn');
const venueInput = document.getElementById('venue');
const venueSuggestions = document.getElementById('venueSuggestions');
const venueSelection = document.getElementById('venueSelection');
let activeEventCard = null;
let selectedVenue = null;
let venueAutocompleteTimer = null;
let venueRequestId = 0;
let venueSessionToken = null;
let googlePlacesLoader = null;

const googleMapsSearchUrl = query => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || '')}`;

function loadGooglePlaces() {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps);
  if (googlePlacesLoader) return googlePlacesLoader;
  const apiKey = window.PLAYYR_GOOGLE_MAPS?.apiKey?.trim();
  if (!apiKey) return Promise.reject(new Error('Google Maps API key is not configured'));
  googlePlacesLoader = new Promise((resolve, reject) => {
    const callbackName = '__playyrGoogleMapsReady';
    window[callbackName] = () => {
      delete window[callbackName];
      resolve(window.google.maps);
    };
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&libraries=places&v=weekly&callback=${callbackName}`;
    script.onerror = () => reject(new Error('Google Maps could not be loaded'));
    document.head.appendChild(script);
  });
  return googlePlacesLoader;
}

function hideVenueSuggestions() {
  venueSuggestions?.classList.add('hidden');
  venueInput?.setAttribute('aria-expanded', 'false');
}

function clearSelectedVenue() {
  selectedVenue = null;
  ['venuePlaceId', 'venueAddress', 'venueLatitude', 'venueLongitude', 'venueMapsUrl'].forEach(id => {
    const field = document.getElementById(id);
    if (field) field.value = '';
  });
  venueSelection?.classList.add('hidden');
  if (venueSelection) venueSelection.innerHTML = '';
}

async function chooseVenue(placePrediction) {
  const place = placePrediction.toPlace();
  await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsURI'] });
  const displayName = place.displayName || placePrediction.text.toString();
  const address = place.formattedAddress || displayName;
  const latitude = typeof place.location?.lat === 'function' ? place.location.lat() : '';
  const longitude = typeof place.location?.lng === 'function' ? place.location.lng() : '';
  selectedVenue = { placeId: place.id || '', displayName, address, latitude, longitude, mapsUrl: place.googleMapsURI || googleMapsSearchUrl(address) };
  venueInput.value = displayName;
  document.getElementById('venuePlaceId').value = selectedVenue.placeId;
  document.getElementById('venueAddress').value = address;
  document.getElementById('venueLatitude').value = latitude;
  document.getElementById('venueLongitude').value = longitude;
  document.getElementById('venueMapsUrl').value = selectedVenue.mapsUrl;
  venueSelection.innerHTML = `<span aria-hidden="true">✓</span><span><b>${escapeHtml(displayName)}</b>${escapeHtml(address)}</span>`;
  venueSelection.classList.remove('hidden');
  hideVenueSuggestions();
  venueSessionToken = null;
}

async function searchVenuePredictions(query) {
  const currentRequest = ++venueRequestId;
  try {
    await loadGooglePlaces();
    const { AutocompleteSessionToken, AutocompleteSuggestion } = await google.maps.importLibrary('places');
    if (!venueSessionToken) venueSessionToken = new AutocompleteSessionToken();
    const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query,
      sessionToken: venueSessionToken,
      region: 'in',
      language: 'en-IN'
    });
    if (currentRequest !== venueRequestId) return;
    venueSuggestions.innerHTML = '';
    suggestions.slice(0, 6).forEach(suggestion => {
      const prediction = suggestion.placePrediction;
      if (!prediction) return;
      const fullText = prediction.text.toString();
      const mainText = prediction.mainText?.toString?.() || fullText.split(',')[0];
      const secondaryText = fullText.startsWith(mainText) ? fullText.slice(mainText.length).replace(/^,\s*/, '') : fullText;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'venue-suggestion';
      button.setAttribute('role', 'option');
      button.innerHTML = `<span class="venue-suggestion-pin" aria-hidden="true">📍</span><span class="venue-suggestion-copy"><strong>${escapeHtml(mainText)}</strong><small>${escapeHtml(secondaryText || 'Google Maps place')}</small></span>`;
      button.addEventListener('click', () => chooseVenue(prediction).catch(() => toast('Could not load that venue. Try again.')));
      venueSuggestions.appendChild(button);
    });
    if (venueSuggestions.children.length) {
      const credit = document.createElement('span');
      credit.className = 'venue-google-credit';
      credit.textContent = 'Powered by Google';
      venueSuggestions.appendChild(credit);
      venueSuggestions.classList.remove('hidden');
      venueInput.setAttribute('aria-expanded', 'true');
    } else {
      hideVenueSuggestions();
    }
  } catch (error) {
    hideVenueSuggestions();
    if (error.message?.includes('not configured')) venueInput.title = 'Add your Google Maps browser key in config.js to enable venue suggestions';
  }
}

venueInput?.addEventListener('input', () => {
  if (!selectedVenue || venueInput.value !== selectedVenue.displayName) clearSelectedVenue();
  window.clearTimeout(venueAutocompleteTimer);
  const query = venueInput.value.trim();
  if (query.length < 3 || /^(online|custom room)$/i.test(query)) return hideVenueSuggestions();
  venueAutocompleteTimer = window.setTimeout(() => searchVenuePredictions(query), 280);
});
venueInput?.addEventListener('keydown', event => {
  if (event.key === 'Escape') hideVenueSuggestions();
});
document.addEventListener('click', event => {
  if (!event.target.closest('.venue-autocomplete')) hideVenueSuggestions();
});

function closeEventDetails() {
  eventDetailsModal?.classList.add('hidden');
  document.body.style.overflow = '';
  activeEventCard = null;
}

function openEventDetails(card) {
  if (!card) return;
  activeEventCard = card;
  const title = card.querySelector('h3')?.textContent?.trim() || 'Tournament';
  const date = card.dataset.date || card.querySelector('.meta span')?.textContent?.replace(/^📅\s*/, '').trim() || 'Date not listed';
  const venue = card.dataset.venue || card.querySelectorAll('.meta span')?.[1]?.textContent?.replace(/^📍\s*/, '').trim() || 'Venue not listed';
  const fee = card.dataset.fee ? `₹${Number(card.dataset.fee).toLocaleString('en-IN')}/team` : 'Fee not listed';
  const distance = card.dataset.distance || card.querySelector('.distance')?.textContent?.trim() || 'Nearby';
  const spots = card.dataset.spots || card.querySelector('.spots b')?.textContent?.trim() || 'Open';
  const going = card.querySelector('.going span')?.textContent?.trim() || 'Players going';
  const category = card.dataset.category || 'Tournament';
  eventDetailsTitle.textContent = title;
  eventDetailsSport.textContent = category.toUpperCase();
  eventDetailsDate.textContent = `📅 ${date}`;
  eventDetailsVenue.textContent = `📍 ${venue}`;
  eventDetailsFee.textContent = fee;
  eventDetailsDistance.textContent = distance;
  eventDetailsGoing.textContent = going;
  eventDetailsSpots.textContent = spots;
  eventDetailsBlurb.textContent = `${title} is a ${category.toLowerCase()} event at ${venue}. Tap Maps to plan your route before registering.`;
  const mapsUrl = googleMapsSearchUrl(venue);
  eventDetailsMapsLink.href = mapsUrl;
  eventDetailsMapsLink.textContent = 'Open in Google Maps';
  eventDetailsModal?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

document.querySelectorAll('#eventsPage .view-details-btn').forEach(button => {
  button.addEventListener('click', () => openEventDetails(button.closest('.event-card')));
});

eventDetailsRegisterBtn?.addEventListener('click', () => {
  if (!activeEventCard) return closeEventDetails();
  closeEventDetails();
  openTeamRegistration(activeEventCard);
});

closeEventDetailsBtn?.addEventListener('click', closeEventDetails);
eventDetailsModal?.addEventListener('click', event => { if (event.target === eventDetailsModal) closeEventDetails(); });

venueMapsBtn?.addEventListener('click', () => {
  const venue = venueInput?.value?.trim();
  if (!venue) return toast('Enter a venue first');
  window.open(selectedVenue?.mapsUrl || googleMapsSearchUrl(venue), '_blank', 'noopener');
});

const activityModal = document.getElementById('activityModal');
const activityTitle = document.getElementById('activityTitle');
const activityMessage = document.getElementById('activityMessage');
const activitySport = document.getElementById('activitySport');
const activityLevel = document.getElementById('activityLevel');
const activityIcon = document.getElementById('activityIcon');
const joinActivityBtn = document.getElementById('joinActivityBtn');
const closeActivityBtn = document.getElementById('closeActivityBtn');
const suggestedActivities = document.querySelectorAll('#homePage .activity');
let activeActivityCard = null;

function closeActivityModal() {
  activityModal?.classList.add('hidden');
  document.body.style.overflow = '';
  activeActivityCard = null;
}

function openActivityModal(card) {
  if (!card) return;
  activeActivityCard = card;
  const title = card.querySelector('h3')?.textContent?.trim() || 'Suggested activity';
  const description = card.querySelector('p')?.textContent?.trim() || 'Open a challenge and start tracking it.';
  const label = description.split('·').map(part => part.trim()).filter(Boolean);
  activityTitle.textContent = title;
  activityMessage.textContent = description;
  activitySport.textContent = label[0] || 'Activity';
  activityLevel.textContent = label[1] || 'Suggested';
  activityIcon.textContent = card.querySelector('.activity-icon')?.textContent?.trim() || '?';
  activityModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

suggestedActivities.forEach(card => {
  card.classList.add('is-clickable');
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  card.addEventListener('click', () => openActivityModal(card));
  card.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openActivityModal(card);
    }
  });
});

joinActivityBtn?.addEventListener('click', async () => {
  if (!activeActivityCard) return closeActivityModal();
  closeActivityModal();
  const challengeBtn = document.getElementById('dailyChallengeButton');
  if (challengeBtn && challengeBtn.dataset.started !== 'true') {
    challengeBtn.dataset.started = 'true';
    challengeBtn.textContent = 'Mark complete';
  }
  toast(`Joined ${activeActivityCard.querySelector('h3')?.textContent?.trim() || 'activity'}`);
});

closeActivityBtn?.addEventListener('click', closeActivityModal);
activityModal?.addEventListener('click', event => {
  if (event.target === activityModal) closeActivityModal();
});

const eventFilters = document.getElementById('eventFilters');
function filterEvents(filter = 'For you') {
  const cards = [...document.querySelectorAll('#eventsPage .event-card')];
  const radius = Number(document.querySelector('.radius-slider')?.value) || 15;
  let visible = 0;
  cards.forEach(card => {
    const distanceLabel = card.querySelector('.distance')?.textContent || '';
    const distance = Number((distanceLabel.match(/([\d.]+)\s*km/i) || [])[1] || 0);
    const categoryMatches = filter === 'For you'
      ? (selected.size === 0 || selected.has(card.dataset.category))
      : card.dataset.category === filter;
    const matches = categoryMatches && distance <= radius;
    card.hidden = !matches;
    card.classList.toggle('hidden', !matches);
    card.setAttribute('aria-hidden', String(!matches));
    if (matches) visible += 1;
  });
  document.getElementById('eventsEmpty').classList.toggle('hidden', visible > 0);
}

function filterFindTeams(filter = 'All nearby') {
  const teams = [...document.querySelectorAll('#findPage .team')];
  const radius = Number(document.querySelector('.radius-slider')?.value) || 15;
  let visible = 0;
  teams.forEach(team => {
    const distanceLabel = team.querySelector('.sport-name')?.textContent || '';
    const distance = Number((distanceLabel.match(/([\d.]+)\s*km/i) || [])[1] || 0);
    const sportText = (team.dataset.sport || team.querySelector('.sport-name')?.textContent || '').toLowerCase();
    const matchesSport = filter === 'All nearby'
      ? (selected.size === 0 || [...selected].some(name => sportText.includes(String(name).toLowerCase())))
      : sportText.includes(String(filter).toLowerCase());
    const matches = matchesSport && distance <= radius;
    team.hidden = !matches;
    team.classList.toggle('hidden', !matches);
    team.setAttribute('aria-hidden', String(!matches));
    if (matches) visible += 1;
  });
  const empty = document.getElementById('findEmpty');
  if (empty) empty.classList.toggle('hidden', visible > 0);
}

renderEventFilterChips();
renderFindFilterChips();
filterEvents(document.querySelector('#eventFilters .chip.active')?.dataset.filter || 'For you');
filterFindTeams(document.querySelector('#findFilters .chip.active')?.dataset.filter || 'All nearby');

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
  const currentWeek = localWeekKey();
  const sameActivityWeek = metadata.playyr_activity_week === currentWeek;
  const streakUpdate = {
    playyr_streak_count: nextCount,
    playyr_last_activity_date: today,
    playyr_activity_week: currentWeek,
    playyr_week_challenges: sameActivityWeek ? (Number(metadata.playyr_week_challenges) || 0) + 1 : 1,
    playyr_week_active_minutes: sameActivityWeek ? (Number(metadata.playyr_week_active_minutes) || 0) + 30 : 30
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
  clearSelectedVenue();
  hideVenueSuggestions();
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
      syncSportGridUI();
      renderEventFilterChips();
      renderFindFilterChips();
      filterEvents(document.querySelector('#eventFilters .chip.active')?.dataset.filter || 'For you');
      filterFindTeams(document.querySelector('#findFilters .chip.active')?.dataset.filter || 'All nearby');
      toast('Sports preferences updated');
    };
    container.appendChild(button);
  });
}
renderSettingsPreferences();
bindSettingsToggles(null);

const themeSetting = document.getElementById('themeSetting');
if (themeSetting) {
  applyTheme(localStorage.getItem(THEME_KEY) || 'light', false);
  themeSetting.onchange = () => {
    applyTheme(themeSetting.checked ? 'dark' : 'light');
    toast(`${themeSetting.checked ? 'Dark' : 'Light'} theme enabled`);
  };
}

const saveSettingsCity = document.getElementById('saveSettingsCity');
const saveSettingsName = document.getElementById('saveSettingsName');
const settingsBioInput = document.getElementById('settingsBioInput');
const saveSettingsBio = document.getElementById('saveSettingsBio');
if (settingsBioInput) settingsBioInput.oninput = () => setText('settingsBioCount', `${settingsBioInput.value.length} / 300`);
if (saveSettingsBio) saveSettingsBio.onclick = async () => {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return toast('Sign in to update your bio');
  const bio = settingsBioInput.value.trim();
  saveSettingsBio.disabled = true;
  saveSettingsBio.textContent = 'Saving...';
  const { error } = await sb.from('profiles').upsert({ id:user.id, bio }, { onConflict:'id' });
  saveSettingsBio.disabled = false;
  saveSettingsBio.textContent = 'Save bio';
  toast(error ? (error.message || 'Could not save your bio') : 'Bio updated');
};
if (saveSettingsName) saveSettingsName.onclick = async () => {
  const input = document.getElementById('settingsNameInput');
  const fullName = input.value.trim().replace(/\s+/g, ' ');
  if (fullName.length < 2) return toast('Enter your full name');
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return toast('Sign in to change your name');
  saveSettingsName.disabled = true;
  saveSettingsName.textContent = 'Saving...';
  const { error:profileError } = await sb.from('profiles').upsert({ id:user.id, full_name:fullName, email:user.email }, { onConflict:'id' });
  if (!profileError) {
    await sb.auth.updateUser({ data:{ full_name:fullName } });
    await sb.rpc('sync_my_team_display_name', { p_full_name:fullName });
    applyProfile({ full_name:fullName, email:user.email });
    toast('Name updated everywhere');
  } else {
    toast(profileError.message || 'Could not update your name');
  }
  saveSettingsName.disabled = false;
  saveSettingsName.textContent = 'Save';
};

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
  if (!session) {
    await handlePendingTeamInvite();
    return;
  }
  const profile = await loadProfile(session.user.id);
  const displayProfile = withSavedOnboarding(profile, session.user);
  renderRadius(session.user.user_metadata.playyr_radius_km || localStorage.getItem(`playyrRadius:${session.user.id}`));
  if (displayProfile.city && (displayProfile.sports || []).length >= 3) {
    await enterAppWithProfile(displayProfile);
    renderStreak(session.user.user_metadata || {});
    await handlePendingTeamInvite();
    return;
  }
  if (profile) await hydrateFromProfile(displayProfile);
  else applyProfile(displayProfile);
  closeProfilePrompt();
  authScreen.classList.add('hidden');
  document.getElementById('onboarding').classList.remove('hidden');
  renderStreak(session.user.user_metadata || {});
})();
