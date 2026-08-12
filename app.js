const { sports } = window.PLAYYR_DATA;

const selected = new Set();
const grid = document.getElementById('sportGrid');

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
  document.getElementById('chosenInterests').innerHTML = [...selected]
    .map(interest => `<button class="chip active">${interest}</button>`)
    .join('');
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

document.querySelectorAll('.nav button').forEach(button => {
  button.onclick = () => {
    document.querySelectorAll('.nav button').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));
    document.getElementById(button.dataset.page).classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
});

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

document.getElementById('resetBtn').onclick = () => location.reload();

function toast(message) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => element.classList.remove('show'), 2600);
}
