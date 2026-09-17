const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('./config');

const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT DEFAULT 'student',
  country TEXT,
  region TEXT,
  city TEXT,
  bio TEXT,
  birth_day TEXT,
  birth_month TEXT,
  birth_year TEXT,
  avatar_data_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Har bir o'ynalgan o'yin uchun bitta yozuv (tarix / audit uchun)
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name TEXT NOT NULL,
  username TEXT,               -- ro'yxatdan o'tgan bo'lsa users.username, aks holda NULL (mehmon)
  mode TEXT NOT NULL,           -- solo | pvp | blitz | survival | exam ...
  grade TEXT,
  subject TEXT,
  score INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  correct INTEGER DEFAULT 0,
  max_combo INTEGER DEFAULT 0,
  survival_best INTEGER DEFAULT 0,
  won INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Har bir (o'yinchi, rejim) juftligi uchun yig'ma statistika -> reyting jadvallari shundan o'qiladi.
-- mode = 'overall' bo'lsa, bu barcha rejimlar bo'yicha umumiy statistika (yutuqlar shundan hisoblanadi).
CREATE TABLE IF NOT EXISTS user_stats (
  display_name TEXT NOT NULL,
  mode TEXT NOT NULL,
  games INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  best_score INTEGER DEFAULT 0,
  best_combo INTEGER DEFAULT 0,
  best_survival INTEGER DEFAULT 0,
  perfect_games INTEGER DEFAULT 0,
  achievements TEXT DEFAULT '[]',  -- JSON massiv: unlocked achievement id'lari
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (display_name, mode)
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  grade INTEGER NOT NULL,
  teacher_username TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS class_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  role TEXT DEFAULT 'student',
  child_username TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(class_id, username),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS class_tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  subject TEXT,
  teacher_username TEXT NOT NULL,
  questions TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS class_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  test_id TEXT,
  username TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  correct INTEGER DEFAULT 0,
  pct INTEGER DEFAULT 0,
  subjects TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_results_mode ON results(mode);
CREATE INDEX IF NOT EXISTS idx_stats_mode_score ON user_stats(mode, best_score DESC);
CREATE INDEX IF NOT EXISTS idx_classes_teacher ON classes(teacher_username);
CREATE INDEX IF NOT EXISTS idx_members_class ON class_members(class_id);
CREATE INDEX IF NOT EXISTS idx_tests_class ON class_tests(class_id);
CREATE INDEX IF NOT EXISTS idx_results_class ON class_results(class_id);
`);

module.exports = db;
