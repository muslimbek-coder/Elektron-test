const express = require('express');
const db = require('../db');
const { optionalAuth } = require('../middleware/auth');
const { checkNewAchievements, ACHIEVEMENTS } = require('../achievements');

const router = express.Router();

const ALLOWED_MODES = ['solo', 'pvp', 'blitz', 'survival', 'exam'];

function sanitizeName(name) {
  return String(name || "O'yinchi").trim().slice(0, 40) || "O'yinchi";
}

function upsertStats(displayName, mode, patch) {
  const row = db.prepare('SELECT * FROM user_stats WHERE display_name=? AND mode=?').get(displayName, mode)
    || { display_name: displayName, mode, games: 0, wins: 0, best_score: 0, best_combo: 0, best_survival: 0, perfect_games: 0, achievements: '[]' };

  row.games += 1;
  if (patch.won) row.wins += 1;
  if (patch.score > row.best_score) row.best_score = patch.score;
  if (patch.maxCombo > row.best_combo) row.best_combo = patch.maxCombo;
  if (patch.survivalBest > (row.best_survival || 0)) row.best_survival = patch.survivalBest;
  if (patch.total > 0 && patch.correct === patch.total) row.perfect_games = (row.perfect_games || 0) + 1;

  const { achievements, newlyUnlocked } = checkNewAchievements(row);
  row.achievements = JSON.stringify(achievements);

  db.prepare(`
    INSERT INTO user_stats (display_name, mode, games, wins, best_score, best_combo, best_survival, perfect_games, achievements, updated_at)
    VALUES (@display_name, @mode, @games, @wins, @best_score, @best_combo, @best_survival, @perfect_games, @achievements, datetime('now'))
    ON CONFLICT(display_name, mode) DO UPDATE SET
      games=excluded.games, wins=excluded.wins, best_score=excluded.best_score,
      best_combo=excluded.best_combo, best_survival=excluded.best_survival,
      perfect_games=excluded.perfect_games, achievements=excluded.achievements,
      updated_at=excluded.updated_at
  `).run(row);

  return { row, newlyUnlocked };
}

// O'yin natijasini yuborish. Tizimga kirgan bo'lsa req.user dan, aks holda body.guestName dan foydalaniladi.
router.post('/results', optionalAuth, (req, res) => {
  try {
    const {
      mode, grade, subject, score = 0, total = 0, correct = 0,
      maxCombo = 0, survivalBest = 0, won = false, guestName,
    } = req.body || {};

    if (!mode || !ALLOWED_MODES.includes(mode)) {
      return res.status(400).json({ error: `mode noto'g'ri. Ruxsat etilganlar: ${ALLOWED_MODES.join(', ')}` });
    }

    const displayName = req.user ? req.user.username : sanitizeName(guestName);
    const isGuest = req.user ? 0 : 1;

    if (isGuest) {
      const clash = db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').get(displayName);
      if (clash) {
        return res.status(409).json({ error: 'Bu ism band — ro\'yxatdan o\'tgan foydalanuvchi nomi bilan mehmon sifatida o\'ynab bo\'lmaydi.' });
      }
    }
    const patch = { score: Number(score) || 0, total: Number(total) || 0, correct: Number(correct) || 0, maxCombo: Number(maxCombo) || 0, survivalBest: Number(survivalBest) || 0, won: !!won };

    db.prepare(`
      INSERT INTO results (display_name, username, mode, grade, subject, score, total, correct, max_combo, survival_best, won)
      VALUES (@displayName, @username, @mode, @grade, @subject, @score, @total, @correct, @maxCombo, @survivalBest, @won)
    `).run({
      displayName,
      username: isGuest ? null : displayName,
      mode, grade: grade || null, subject: subject || null,
      score: patch.score, total: patch.total, correct: patch.correct,
      maxCombo: patch.maxCombo, survivalBest: patch.survivalBest, won: patch.won ? 1 : 0,
    });

    // Rejim bo'yicha va umumiy (overall) statistika yangilanadi
    const perMode = upsertStats(displayName, mode, patch);
    const overall = upsertStats(displayName, 'overall', patch);

    res.status(201).json({
      displayName,
      stats: {
        mode: { ...perMode.row, achievements: JSON.parse(perMode.row.achievements) },
        overall: { ...overall.row, achievements: JSON.parse(overall.row.achievements) },
      },
      newlyUnlocked: overall.newlyUnlocked,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi.' });
  }
});

// Reyting jadvali: /api/leaderboard/solo?limit=10  (mode='overall' ham ishlaydi)
router.get('/leaderboard/:mode', (req, res) => {
  const mode = req.params.mode;
  if (mode !== 'overall' && !ALLOWED_MODES.includes(mode)) {
    return res.status(400).json({ error: `mode noto'g'ri.` });
  }
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const rows = db.prepare(`
    SELECT display_name as name, games, wins, best_score as bestScore, best_combo as bestCombo,
           best_survival as bestSurvival, perfect_games as perfectGames, achievements
    FROM user_stats WHERE mode=? ORDER BY best_score DESC, wins DESC LIMIT ? OFFSET ?
  `).all(mode, limit, offset);
  res.json({
    mode,
    list: rows.map((r, i) => ({ rank: offset + i + 1, ...r, achievements: JSON.parse(r.achievements || '[]') })),
  });
});

// Muayyan o'yinchining shu rejimdagi o'rni va statistikasi ("Mening natijam")
router.get('/leaderboard/:mode/me', optionalAuth, (req, res) => {
  const mode = req.params.mode;
  const name = req.user ? req.user.username : req.query.name;
  if (!name) return res.status(400).json({ error: "name parametri yoki avtorizatsiya kerak." });

  const row = db.prepare('SELECT * FROM user_stats WHERE display_name=? COLLATE NOCASE AND mode=?').get(name, mode);
  if (!row) return res.json({ mode, name, found: false });

  const better = db.prepare(`
  SELECT COUNT(*) as c FROM user_stats
  WHERE mode=? AND (best_score > ? OR (best_score = ? AND wins > ?))
`).get(mode, row.best_score, row.best_score, row.wins);
  res.json({
    mode,
    found: true,
    rank: better.c + 1,
    stats: { ...row, achievements: JSON.parse(row.achievements || '[]') },
  });
});

router.get('/achievements/:name', (req, res) => {
  const row = db.prepare('SELECT achievements FROM user_stats WHERE display_name=? COLLATE NOCASE AND mode=?').get(req.params.name, 'overall');
  const unlocked = row ? JSON.parse(row.achievements || '[]') : [];
  res.json({
    name: req.params.name,
    achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, icon: a.icon, title: a.title, unlocked: unlocked.includes(a.id) })),
  });
});

module.exports = router;
