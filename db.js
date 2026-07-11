const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'game.db'));

// إنشاء الجداول عند أول تشغيل
db.exec(`
  CREATE TABLE IF NOT EXISTS players (
    telegram_id TEXT PRIMARY KEY,
    first_name TEXT,
    coins INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    energy INTEGER DEFAULT 1000,
    max_energy INTEGER DEFAULT 1000,
    coins_per_tap INTEGER DEFAULT 1,
    total_taps INTEGER DEFAULT 0,
    project_key TEXT DEFAULT 'party',
    project_progress_1 INTEGER DEFAULT 0,
    project_progress_2 INTEGER DEFAULT 0,
    project_progress_3 INTEGER DEFAULT 0,
    last_energy_update INTEGER DEFAULT 0,
    last_daily_cipher TEXT DEFAULT NULL,
    last_daily_combo TEXT DEFAULT NULL,
    daily_combo_taps INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

function getOrCreatePlayer(telegramId, firstName) {
  let player = db.prepare('SELECT * FROM players WHERE telegram_id = ?').get(telegramId);
  if (!player) {
    db.prepare(`
      INSERT INTO players (telegram_id, first_name, last_energy_update)
      VALUES (?, ?, ?)
    `).run(telegramId, firstName || 'لاعب', Date.now());
    player = db.prepare('SELECT * FROM players WHERE telegram_id = ?').get(telegramId);
  }
  return player;
}

function updatePlayer(telegramId, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => fields[k]);
  db.prepare(`UPDATE players SET ${setClause} WHERE telegram_id = ?`).run(...values, telegramId);
}

module.exports = { db, getOrCreatePlayer, updatePlayer };
