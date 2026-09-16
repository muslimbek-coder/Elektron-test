const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/:username/public', (req, res) => {
  const u = db.prepare(`
    SELECT username, first_name, last_name, bio, country, region, city, created_at, avatar_data_url
    FROM users WHERE username=? COLLATE NOCASE
  `).get(req.params.username);
  if (!u) return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });
  res.json({ user: u });
});

module.exports = router;
