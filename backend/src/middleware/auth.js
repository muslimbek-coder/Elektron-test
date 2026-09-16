const { verifyToken } = require('../utils/jwt');
const db = require('../db');

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function extractToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme === 'Bearer' && token) return token;
  return null;
}

// Token bo'lishi shart. Bo'lmasa yoki noto'g'ri bo'lsa 401 qaytaradi.
function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Avtorizatsiya talab qilinadi." });
  try {
    const payload = verifyToken(token);
    const user = getUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Foydalanuvchi topilmadi.' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Token yaroqsiz yoki muddati o'tgan." });
  }
}

// Token bo'lsa foydalanuvchini biriktiradi, bo'lmasa ham so'rovni davom ettiradi (mehmon sifatida).
function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = verifyToken(token);
    const user = getUserById(payload.sub);
    if (user) req.user = user;
  } catch (e) {
    // jim o'tkazamiz — mehmon sifatida davom etadi
  }
  next();
}

module.exports = { requireAuth, optionalAuth, getUserById };
