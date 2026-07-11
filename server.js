require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const { getOrCreatePlayer, updatePlayer } = require('./db');

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.WEBAPP_URL; // رابط الاستضافة النهائي (مثال: https://yourapp.up.railway.app)

const ENERGY_REGEN_MS = 3000; // استعادة نقطة طاقة كل 3 ثواني
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// قائمة المشاريع المتاحة (Change Project) بطابع جزائري
const PROJECTS = {
  party:  { name: 'حفلة مشهورة', emoji: '🎉', duration: '1M 41S', min: 120 },
  cafe:   { name: 'قهوة الفنك',   emoji: '☕', duration: '2M 10S', min: 90  },
  souk:   { name: 'سوق الحرف',    emoji: '🏺', duration: '1M 55S', min: 150 },
};

// ---------- منطق الطاقة ----------
function regenEnergy(player) {
  const now = Date.now();
  const elapsed = now - player.last_energy_update;
  const regenAmount = Math.floor(elapsed / ENERGY_REGEN_MS);
  if (regenAmount > 0 && player.energy < player.max_energy) {
    const newEnergy = Math.min(player.max_energy, player.energy + regenAmount);
    updatePlayer(player.telegram_id, {
      energy: newEnergy,
      last_energy_update: now,
    });
    player.energy = newEnergy;
    player.last_energy_update = now;
  }
  return player;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- API ----------

// جلب حالة اللاعب (تُستدعى عند فتح التطبيق)
app.get('/api/state', (req, res) => {
  const { id, name } = req.query;
  if (!id) return res.status(400).json({ error: 'missing id' });
  let player = getOrCreatePlayer(id, name);
  player = regenEnergy(player);
  res.json({ player, project: PROJECTS[player.project_key] });
});

// نقرة على الشخصية
app.post('/api/tap', (req, res) => {
  const { id, taps } = req.body;
  if (!id || !taps || taps < 1) return res.status(400).json({ error: 'invalid request' });

  let player = getOrCreatePlayer(id);
  player = regenEnergy(player);

  const allowedTaps = Math.min(taps, player.energy);
  if (allowedTaps <= 0) {
    return res.json({ player, gained: 0 });
  }

  const gained = allowedTaps * player.coins_per_tap;
  const newCoins = player.coins + gained;
  const newEnergy = player.energy - allowedTaps;
  const newComboTaps = player.daily_combo_taps + allowedTaps;

  updatePlayer(id, {
    coins: newCoins,
    energy: newEnergy,
    total_taps: player.total_taps + allowedTaps,
    daily_combo_taps: newComboTaps,
    last_energy_update: Date.now(),
  });

  res.json({ gained, coins: newCoins, energy: newEnergy });
});

// المطالبة بمكافأة "Daily Cipher" اليومية
app.post('/api/cipher/claim', (req, res) => {
  const { id } = req.body;
  const player = getOrCreatePlayer(id);
  const today = todayStr();
  if (player.last_daily_cipher === today) {
    return res.status(400).json({ error: 'already_claimed' });
  }
  const reward = 5000;
  updatePlayer(id, { coins: player.coins + reward, last_daily_cipher: today });
  res.json({ reward, coins: player.coins + reward });
});

// المطالبة بمكافأة "Daily Combo" اليومية
app.post('/api/combo/claim', (req, res) => {
  const { id } = req.body;
  const player = getOrCreatePlayer(id);
  const today = todayStr();
  if (player.last_daily_combo === today) {
    return res.status(400).json({ error: 'already_claimed' });
  }
  if (player.daily_combo_taps < 100) {
    return res.status(400).json({ error: 'not_enough_taps' });
  }
  const reward = 10000;
  updatePlayer(id, {
    coins: player.coins + reward,
    last_daily_combo: today,
    daily_combo_taps: 0,
  });
  res.json({ reward, coins: player.coins + reward });
});

// تغيير المشروع الحالي (Change Project)
app.post('/api/project/change', (req, res) => {
  const { id } = req.body;
  const player = getOrCreatePlayer(id);
  const keys = Object.keys(PROJECTS);
  const currentIndex = keys.indexOf(player.project_key);
  const nextKey = keys[(currentIndex + 1) % keys.length];
  updatePlayer(id, { project_key: nextKey });
  res.json({ project_key: nextKey, project: PROJECTS[nextKey] });
});

// ---------- بوت تيليجرام ----------
if (BOT_TOKEN) {
  const bot = new TelegramBot(BOT_TOKEN, { polling: true });

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '🦊 أهلاً بك في فينك كومبات!\nاضغط الزر أدناه لبدء اللعب.', {
      reply_markup: {
        inline_keyboard: [[
          { text: '🎮 العب الآن', web_app: { url: WEBAPP_URL || 'https://example.com' } }
        ]]
      }
    });
  });

  console.log('✅ بوت تيليجرام يعمل الآن (polling)...');
} else {
  console.log('⚠️ لم يتم ضبط BOT_TOKEN — الخادم سيعمل بدون تشغيل البوت (واجهة اللعبة فقط للتجربة على المتصفح).');
}

app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
});
