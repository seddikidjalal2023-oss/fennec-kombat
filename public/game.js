// ---------- تهيئة تطبيق تيليجرام المصغر ----------
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const tgUser = tg?.initDataUnsafe?.user;
const USER_ID = tgUser?.id || localStorage.getItem('demo_id') || (() => {
  const id = 'demo_' + Math.floor(Math.random() * 1000000);
  localStorage.setItem('demo_id', id);
  return id;
})();
const USER_NAME = tgUser?.first_name || 'زائر';

let state = {
  coins: 0,
  energy: 1000,
  maxEnergy: 1000,
  level: 1,
  coinsPerTap: 1,
};

// ---------- تحميل رسمة الفنك ----------
fetch('assets/fennec.svg')
  .then(r => r.text())
  .then(svg => { document.getElementById('fennecChar').innerHTML = svg; });

// ---------- عناصر DOM ----------
const el = {
  coins: document.getElementById('statCoins'),
  taps: document.getElementById('statTaps'),
  lvlPill: document.getElementById('lvlPill'),
  energyVal: document.getElementById('energyVal'),
  energyMax: document.getElementById('energyMax'),
  tapTarget: document.getElementById('tapTarget'),
  floatLayer: document.getElementById('floatLayer'),
  cipherBtn: document.getElementById('cipherBtn'),
  comboBtn: document.getElementById('comboBtn'),
  changeProjectBtn: document.getElementById('changeProjectBtn'),
  projectName: document.getElementById('projectName'),
  rewardModal: document.getElementById('rewardModal'),
  rewardTitle: document.getElementById('rewardTitle'),
  rewardDesc: document.getElementById('rewardDesc'),
  rewardClose: document.getElementById('rewardClose'),
};

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.floor(n).toString();
}

function renderState() {
  el.coins.textContent = formatNum(state.coins);
  el.taps.textContent = formatNum(state.totalTaps || 0);
  el.lvlPill.textContent = `${state.level} LVL`;
  el.energyVal.textContent = state.energy;
  el.energyMax.textContent = state.maxEnergy;
}

function showReward(title, desc) {
  el.rewardTitle.textContent = title;
  el.rewardDesc.textContent = desc;
  el.rewardModal.classList.add('show');
}
el.rewardClose.addEventListener('click', () => el.rewardModal.classList.remove('show'));

// ---------- جلب حالة اللاعب من الخادم ----------
async function loadState() {
  try {
    const res = await fetch(`/api/state?id=${USER_ID}&name=${encodeURIComponent(USER_NAME)}`);
    const data = await res.json();
    const p = data.player;
    state.coins = p.coins;
    state.energy = p.energy;
    state.maxEnergy = p.max_energy;
    state.level = p.level;
    state.coinsPerTap = p.coins_per_tap;
    state.totalTaps = p.total_taps;
    el.projectName.textContent = data.project.name;
    renderState();
  } catch (e) {
    console.warn('تعذر الاتصال بالخادم — العمل في وضع تجريبي محلي', e);
  }
}
loadState();

// ---------- منطق النقر (مع تجميع الطلبات) ----------
let pendingTaps = 0;
let sendTimer = null;

function spawnFloatNumber(x, y, amount) {
  const div = document.createElement('div');
  div.className = 'float-num';
  div.textContent = '+' + amount;
  div.style.left = (x - 10) + 'px';
  div.style.top = (y - 20) + 'px';
  el.floatLayer.appendChild(div);
  setTimeout(() => div.remove(), 900);
}

function flushTaps() {
  if (pendingTaps <= 0) return;
  const taps = pendingTaps;
  pendingTaps = 0;
  fetch('/api/tap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: USER_ID, taps }),
  })
    .then(r => r.json())
    .then(data => {
      if (typeof data.coins === 'number') state.coins = data.coins;
      if (typeof data.energy === 'number') state.energy = data.energy;
      renderState();
    })
    .catch(() => {});
}

el.tapTarget.addEventListener('click', (e) => {
  if (state.energy <= 0) return;
  const rect = el.tapTarget.getBoundingClientRect();
  const x = e.clientX || (rect.left + rect.width / 2);
  const y = e.clientY || rect.top;

  state.coins += state.coinsPerTap;
  state.energy = Math.max(0, state.energy - 1);
  state.totalTaps = (state.totalTaps || 0) + 1;
  renderState();
  spawnFloatNumber(x, y, state.coinsPerTap);

  if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');

  pendingTaps += 1;
  clearTimeout(sendTimer);
  sendTimer = setTimeout(flushTaps, 400);
});

// ---------- تجديد الطاقة تدريجياً على الواجهة (تقريبي، يُصحَّح من الخادم عند كل تحميل) ----------
setInterval(() => {
  if (state.energy < state.maxEnergy) {
    state.energy = Math.min(state.maxEnergy, state.energy + 1);
    renderState();
  }
}, 3000);

// ---------- الشيفرة اليومية ----------
el.cipherBtn.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/cipher/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: USER_ID }),
    });
    const data = await res.json();
    if (res.ok) {
      state.coins = data.coins;
      renderState();
      showReward('🔑 الشيفرة اليومية!', `حصلت على ${formatNum(data.reward)} عملة`);
    } else {
      showReward('تم بالفعل', 'لقد حصلت على مكافأة اليوم مسبقاً، عد غداً!');
    }
  } catch (e) { /* تجاهل */ }
});

// ---------- الكومبو اليومي ----------
el.comboBtn.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/combo/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: USER_ID }),
    });
    const data = await res.json();
    if (res.ok) {
      state.coins = data.coins;
      renderState();
      showReward('⭐ الكومبو اليومي!', `حصلت على ${formatNum(data.reward)} عملة`);
    } else if (data.error === 'not_enough_taps') {
      showReward('ليس بعد', 'استمر بالنقر أكثر لإكمال الكومبو اليومي');
    } else {
      showReward('تم بالفعل', 'لقد حصلت على مكافأة اليوم مسبقاً، عد غداً!');
    }
  } catch (e) { /* تجاهل */ }
});

// ---------- تغيير المشروع ----------
el.changeProjectBtn.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/project/change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: USER_ID }),
    });
    const data = await res.json();
    el.projectName.textContent = data.project.name;
    document.getElementById('projectTimer').textContent = data.project.duration;
  } catch (e) { /* تجاهل */ }
});
