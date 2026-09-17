const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken } = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

function findByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
}

router.post('/register', async (req, res) => {
  try {
    const {
      username, password, firstName, lastName,
      role, country, region, city, bio,
      birthDay, birthMonth, birthYear,
      teacherCode,
    } = req.body || {};

    if (!username || !password || !firstName || !lastName) {
      return res.status(400).json({ error: "Ism, familiya, username va parolni to'ldiring." });
    }
    if (String(username).trim().length < 3) {
      return res.status(400).json({ error: "Username kamida 3 belgidan iborat bo'lsin." });
    }
    if (String(password).length < 4) {
      return res.status(400).json({ error: "Parol kamida 4 belgidan iborat bo'lsin." });
    }
    if (findByUsername(username.trim())) {
      return res.status(409).json({ error: 'Bu username allaqachon mavjud!' });
    }

    let finalRole = 'student';
    if (role === 'parent') {
      finalRole = 'parent';
    } else if (role === 'teacher') {
      if (!teacherCode || teacherCode !== config.teacherInviteCode) {
        return res.status(403).json({ error: "O'qituvchi kodi noto'g'ri." });
      }
      finalRole = 'teacher';
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const info = db.prepare(`
      INSERT INTO users (username, password_hash, first_name, last_name, role, country, region, city, bio, birth_day, birth_month, birth_year, created_at)
      VALUES (@username, @password_hash, @first_name, @last_name, @role, @country, @region, @city, @bio, @birth_day, @birth_month, @birth_year, datetime('now'))
    `).run({
      username: username.trim(),
      password_hash: passwordHash,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      role: finalRole,
      country: country || null,
      region: region || null,
      city: city || null,
      bio: bio || null,
      birth_day: birthDay || null,
      birth_month: birthMonth || null,
      birth_year: birthYear || null,
    });

    const user = findByUsername(username.trim());
    const token = signToken({ username: user.username });
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Ro'yxatdan o'tishda xatolik yuz berdi." });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username va parolni kiriting.' });
    }
    const user = findByUsername(username.trim());
    if (!user) return res.status(401).json({ error: "Username yoki parol noto'g'ri!" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Username yoki parol noto'g'ri!" });

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi.' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.put('/me', requireAuth, async (req, res) => {
  try {
    const {
      firstName, lastName, username, country, region, city, bio,
      birthDay, birthMonth, birthYear, oldPassword, newPassword, avatarDataUrl,
    } = req.body || {};

    if (!firstName || !lastName || !username || !country || !region || !city) {
      return res.status(400).json({ error: "Ism, familiya, username va hududni to'ldiring." });
    }
    if (String(username).trim().length < 3) {
      return res.status(400).json({ error: "Username kamida 3 belgidan iborat bo'lsin." });
    }

    const existing = findByUsername(username.trim());
    if (existing && existing.id !== req.user.id) {
      return res.status(409).json({ error: 'Bu username band.' });
    }

    let passwordHash = req.user.password_hash;
    if (newPassword) {
      const ok = oldPassword && await bcrypt.compare(oldPassword, req.user.password_hash);
      if (!ok) return res.status(400).json({ error: "Joriy parol noto'g'ri." });
      if (String(newPassword).length < 4) {
        return res.status(400).json({ error: "Yangi parol kamida 4 belgi bo'lsin." });
      }
      passwordHash = await bcrypt.hash(newPassword, 10);
    }

    db.prepare(`
      UPDATE users SET
        first_name=@firstName, last_name=@lastName, username=@username,
        country=@country, region=@region, city=@city, bio=@bio,
        birth_day=@birthDay, birth_month=@birthMonth, birth_year=@birthYear,
        password_hash=@passwordHash,
        avatar_data_url = COALESCE(@avatarDataUrl, avatar_data_url)
      WHERE id=@id
    `).run({
      id: req.user.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      username: username.trim(),
      country, region, city,
      bio: bio || null,
      birthDay: birthDay || null,
      birthMonth: birthMonth || null,
      birthYear: birthYear || null,
      passwordHash,
      avatarDataUrl: avatarDataUrl || null,
    });

    // Foydalanuvchi nomi o'zgargan bo'lsa, eski statistikalarini yangi nomga ko'chiramiz
if (username.trim().toLowerCase() !== req.user.username.toLowerCase()) {
      db.prepare('UPDATE results SET username=@u, display_name=@u WHERE username=@old')
        .run({ u: username.trim(), old: req.user.username });
      try {
        db.prepare('UPDATE user_stats SET display_name=@u WHERE display_name=@old')
          .run({ u: username.trim(), old: req.user.username });
      } catch (e) {
        // Yangi nom bo'yicha statistika allaqachon mavjud (masalan mehmon sifatida) —
        // eski yozuvni o'chirib, mavjudini saqlab qolamiz.
        db.prepare('DELETE FROM user_stats WHERE display_name=@old').run({ old: req.user.username });
      }
    }

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    res.json({ user: publicUser(updated) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Serverda xatolik yuz berdi.' });
  }
});

module.exports = router;
