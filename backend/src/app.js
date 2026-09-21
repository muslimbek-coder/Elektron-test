const express = require('express');
const cors = require('cors');
const config = require('./config');

const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const leaderboardRoutes = require('./routes/leaderboard.routes');
const classesRoutes = require('./routes/classes.routes');
const aiRoutes = require('./routes/ai.routes');

const app = express();
app.set('trust proxy', 1);

app.use(cors({ origin: config.corsOrigins, credentials: true }));
app.use(express.json({ limit: '2mb' })); // 2mb -> avatar rasm data-url uchun

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('/api/debug-env', (req, res) => {
  res.json({
    matching_keys: Object.keys(process.env).filter((k) => k.toUpperCase().includes('TEACHER')),
    raw_value: JSON.stringify(process.env.TEACHER_INVITE_CODE),
    config_value: JSON.stringify(config.teacherInviteCode),
  });
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Juda ko'p urinish. 15 daqiqadan keyin qayta urinib ko'ring." },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api', classesRoutes);
app.use('/api', leaderboardRoutes); // /api/results, /api/leaderboard/:mode, /api/achievements/:name
app.use('/api/ai', aiRoutes);

app.use((req, res) => res.status(404).json({ error: 'Topilmadi.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Serverda kutilmagan xatolik.' });
});

const newLocal = module.exports = app;