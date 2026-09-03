const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DB_PATH || path.join(__dirname, 'invites.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS guild_settings (
  guildId TEXT PRIMARY KEY,
  prefix TEXT NOT NULL DEFAULT '!'
);

CREATE TABLE IF NOT EXISTS member_stats (
  guildId TEXT NOT NULL,
  userId TEXT NOT NULL,
  regular INTEGER NOT NULL DEFAULT 0,
  leaves INTEGER NOT NULL DEFAULT 0,
  fake INTEGER NOT NULL DEFAULT 0,
  bonus INTEGER NOT NULL DEFAULT 0,
  rejoins INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guildId, userId)
);

CREATE TABLE IF NOT EXISTS join_history (
  guildId TEXT NOT NULL,
  userId TEXT NOT NULL,
  inviterId TEXT,
  joinedAt INTEGER NOT NULL,
  hasLeft INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guildId, userId)
);
`);

function getPrefix(guildId) {
  const row = db.prepare('SELECT prefix FROM guild_settings WHERE guildId = ?').get(guildId);
  return row ? row.prefix : '!';
}

function setPrefix(guildId, prefix) {
  db.prepare(`
    INSERT INTO guild_settings (guildId, prefix) VALUES (?, ?)
    ON CONFLICT(guildId) DO UPDATE SET prefix = excluded.prefix
  `).run(guildId, prefix);
}

function ensureStatsRow(guildId, userId) {
  db.prepare(`
    INSERT INTO member_stats (guildId, userId) VALUES (?, ?)
    ON CONFLICT(guildId, userId) DO NOTHING
  `).run(guildId, userId);
}

function getStats(guildId, userId) {
  ensureStatsRow(guildId, userId);
  return db.prepare('SELECT * FROM member_stats WHERE guildId = ? AND userId = ?').get(guildId, userId);
}

function addRegular(guildId, userId, amount = 1) {
  ensureStatsRow(guildId, userId);
  db.prepare('UPDATE member_stats SET regular = regular + ? WHERE guildId = ? AND userId = ?').run(amount, guildId, userId);
}

function addFake(guildId, userId, amount = 1) {
  ensureStatsRow(guildId, userId);
  db.prepare('UPDATE member_stats SET fake = fake + ? WHERE guildId = ? AND userId = ?').run(amount, guildId, userId);
}

function addLeft(guildId, userId, amount = 1) {
  ensureStatsRow(guildId, userId);
  db.prepare('UPDATE member_stats SET leaves = leaves + ? WHERE guildId = ? AND userId = ?').run(amount, guildId, userId);
}

function addRejoin(guildId, userId, amount = 1) {
  ensureStatsRow(guildId, userId);
  db.prepare('UPDATE member_stats SET rejoins = rejoins + ? WHERE guildId = ? AND userId = ?').run(amount, guildId, userId);
}

function addBonus(guildId, userId, amount) {
  ensureStatsRow(guildId, userId);
  db.prepare('UPDATE member_stats SET bonus = bonus + ? WHERE guildId = ? AND userId = ?').run(amount, guildId, userId);
}

function resetStats(guildId, userId) {
  ensureStatsRow(guildId, userId);
  db.prepare('UPDATE member_stats SET regular=0, leaves=0, fake=0, bonus=0, rejoins=0 WHERE guildId = ? AND userId = ?').run(guildId, userId);
}

function getLeaderboard(guildId, limit = 10) {
  return db.prepare(`
    SELECT userId, regular, leaves, fake, bonus, rejoins,
      (regular - leaves - fake + bonus) AS valid
    FROM member_stats
    WHERE guildId = ?
    ORDER BY valid DESC
    LIMIT ?
  `).all(guildId, limit);
}

function getJoinHistory(guildId, userId) {
  return db.prepare('SELECT * FROM join_history WHERE guildId = ? AND userId = ?').get(guildId, userId);
}

function upsertJoinHistory(guildId, userId, inviterId, joinedAt) {
  db.prepare(`
    INSERT INTO join_history (guildId, userId, inviterId, joinedAt, hasLeft)
    VALUES (?, ?, ?, ?, 0)
    ON CONFLICT(guildId, userId) DO UPDATE SET inviterId = excluded.inviterId, joinedAt = excluded.joinedAt, hasLeft = 0
  `).run(guildId, userId, inviterId, joinedAt);
}

function markLeft(guildId, userId) {
  db.prepare('UPDATE join_history SET hasLeft = 1 WHERE guildId = ? AND userId = ?').run(guildId, userId);
}

module.exports = {
  getPrefix, setPrefix, getStats, addRegular, addFake, addLeft, addRejoin,
  addBonus, resetStats, getLeaderboard, getJoinHistory, upsertJoinHistory, markLeft
};
