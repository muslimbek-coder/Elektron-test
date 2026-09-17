const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function normalizeQuestion(question) {
  if (!question || typeof question !== 'object') return null;
  const q = String(question.q || '').trim();
  const options = Array.isArray(question.o) ? question.o.map((v) => String(v || '').trim()).slice(0, 4) : [];
  const answer = String(question.a || '').trim();
  if (!q || options.length < 2 || !answer) return null;
  return {
    q,
    a: answer,
    o: options,
    e: String(question.e || '').trim(),
    s: String(question.s || '').trim() || 'Fan',
  };
}

function classShape(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    code: row.code,
    name: row.name,
    grade: Number(row.grade) || 1,
    teacherUsername: row.teacher_username,
    createdAt: row.created_at,
  };
}

function membershipShape(row) {
  if (!row) return null;
  return {
    classId: String(row.class_id),
    username: row.username,
    role: row.role || 'student',
    childUsername: row.child_username || '',
  };
}

function testShape(row) {
  if (!row) return null;
  const questions = (() => {
    try {
      const parsed = JSON.parse(row.questions || '[]');
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(normalizeQuestion).filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  })();

  return {
    id: String(row.id),
    classId: String(row.class_id),
    title: row.title,
    subject: row.subject || 'Fan',
    teacherUsername: row.teacher_username,
    questions,
    createdAt: row.created_at,
  };
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

router.get('/classes', requireAuth, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT DISTINCT c.*
      FROM classes c
      LEFT JOIN class_members cm ON cm.class_id = c.id
      WHERE c.teacher_username = ? COLLATE NOCASE OR cm.username = ? COLLATE NOCASE
      ORDER BY c.created_at DESC
    `).all(req.user.username, req.user.username);
    const memberships = db.prepare('SELECT * FROM class_members WHERE username = ? COLLATE NOCASE').all(req.user.username);
    res.json({
      classes: rows.map(classShape),
      members: memberships.map(membershipShape).filter(Boolean),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Sinflar olishda xatolik yuz berdi.' });
  }
});

router.post('/classes', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Faqat o\'qituvchi sinf yarata oladi.' });
    }
    const { name, grade } = req.body || {};
    const finalName = String(name || '').trim();
    const finalGrade = Number(grade) || 1;

    if (!finalName) {
      return res.status(400).json({ error: 'Sinf nomini kiriting.' });
    }

    let code = randomCode();
    while (db.prepare('SELECT 1 FROM classes WHERE code = ?').get(code)) {
      code = randomCode();
    }

    const info = db.prepare(`
      INSERT INTO classes (code, name, grade, teacher_username)
      VALUES (@code, @name, @grade, @teacherUsername)
    `).run({
      code,
      name: finalName,
      grade: finalGrade,
      teacherUsername: req.user.username,
    });

    const row = db.prepare('SELECT * FROM classes WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ class: classShape(row) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Sinf yaratishda xatolik yuz berdi.' });
  }
});

router.get('/classes/:code', (req, res) => {
  try {
    const code = String(req.params.code || '').trim().toUpperCase();
    const row = db.prepare('SELECT * FROM classes WHERE code = ? COLLATE NOCASE').get(code);
    if (!row) return res.status(404).json({ error: 'Kod topilmadi.' });
    res.json({ class: classShape(row) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Kod tekshirishda xatolik yuz berdi.' });
  }
});

router.post('/classes/:code/join', requireAuth, (req, res) => {
  try {
    const code = String(req.params.code || '').trim().toUpperCase();
    const { childUsername } = req.body || {};
    const cls = db.prepare('SELECT * FROM classes WHERE code = ? COLLATE NOCASE').get(code);

    if (!cls) return res.status(404).json({ error: 'Kod topilmadi.' });

    const user = req.user.username;
    if (req.user.role !== 'student') {
      return res.status(403).json({ error: 'Faqat o\'quvchi sinfga qo\'shilishi mumkin.' });
    }
    const role = 'student';

    if (childUsername) {
      return res.status(403).json({ error: 'Ota-ona kod orqali sinfga qo\'shilmaydi.' });
    }

    db.prepare(`
      INSERT INTO class_members (class_id, username, role, child_username)
      VALUES (@classId, @username, @role, @childUsername)
      ON CONFLICT(class_id, username) DO UPDATE SET
        role=excluded.role,
        child_username=excluded.child_username
    `).run({
      classId: cls.id,
      username: user,
      role,
      childUsername: childUsername ? String(childUsername).trim() : null,
    });

    const members = db.prepare('SELECT * FROM class_members WHERE class_id = ?').all(cls.id);
    res.json({
      class: classShape(cls),
      member: membershipShape(members.find((m) => m.username === user) || null),
      members: members.map(membershipShape).filter(Boolean),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Sinfga qo\'shilishda xatolik yuz berdi.' });
  }
});

router.delete('/classes/:classId', requireAuth, (req, res) => {
  try {
    const classId = Number(req.params.classId);
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
    if (!cls) return res.status(404).json({ error: 'Sinf topilmadi.' });
    if (req.user.role !== 'teacher' || cls.teacher_username.toLowerCase() !== req.user.username.toLowerCase()) {
      return res.status(403).json({ error: 'Faqat sinf o\'qituvchisi o\'chira oladi.' });
    }
    const remove = db.transaction(() => {
      db.prepare('DELETE FROM class_results WHERE class_id = ?').run(classId);
      db.prepare('DELETE FROM class_tests WHERE class_id = ?').run(classId);
      db.prepare('DELETE FROM class_members WHERE class_id = ?').run(classId);
      db.prepare('DELETE FROM classes WHERE id = ?').run(classId);
    });
    remove();
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Sinfni o\'chirishda xatolik yuz berdi.' });
  }
});

router.get('/parent/results/:childUsername', requireAuth, (req, res) => {
  try {
    if (req.user.role !== 'parent') return res.status(403).json({ error: 'Faqat ota-ona farzand natijasini ko\'ra oladi.' });
    const childUsername = String(req.params.childUsername || '').trim();
    if (!childUsername) return res.status(400).json({ error: 'Farzand username\'ini kiriting.' });
    const child = db.prepare('SELECT username FROM users WHERE username = ? COLLATE NOCASE').get(childUsername);
    if (!child) return res.status(404).json({ error: 'Farzand username topilmadi.' });
    const rows = db.prepare('SELECT * FROM class_results WHERE username = ? COLLATE NOCASE ORDER BY created_at DESC').all(child.username);
    res.json({ results: rows.map((row) => ({
      id: String(row.id), classId: String(row.class_id), testId: row.test_id,
      username: row.username, score: Number(row.score) || 0, total: Number(row.total) || 0,
      correct: Number(row.correct) || 0, pct: Number(row.pct) || 0,
      subjects: (() => { try { return JSON.parse(row.subjects || '{}'); } catch (e) { return {}; } })(), date: row.created_at,
    })) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Farzand natijalarini olishda xatolik yuz berdi.' });
  }
});

router.get('/classes/:classId/tests', requireAuth, (req, res) => {
  try {
    const classId = Number(req.params.classId);
    if (!classId) return res.status(400).json({ error: 'classId noto\'g\'ri.' });

    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
    if (!cls) return res.status(404).json({ error: 'Sinf topilmadi.' });

    const isTeacher = cls.teacher_username.toLowerCase() === req.user.username.toLowerCase();
    const isMember = db.prepare(
      'SELECT 1 FROM class_members WHERE class_id=? AND username=? COLLATE NOCASE'
    ).get(classId, req.user.username);
    if (!isTeacher && !isMember) {
      return res.status(403).json({ error: 'Bu sinf testlarini ko\'rishga ruxsat yo\'q.' });
    }

    const rows = db.prepare('SELECT * FROM class_tests WHERE class_id = ? ORDER BY created_at DESC').all(classId);
    res.json({ tests: rows.map(testShape) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Sinf testlarini olishda xatolik yuz berdi.' });
  }
});

router.post('/classes/:classId/tests', requireAuth, (req, res) => {
  try {
    const classId = Number(req.params.classId);
    const { title, subject, questions } = req.body || {};
    if (!classId || !title || !Array.isArray(questions) || !questions.length) {
      return res.status(400).json({ error: 'Test ma\'lumotlari to\'liq emas.' });
    }

    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
    if (!cls) return res.status(404).json({ error: 'Sinf topilmadi.' });

    const isTeacher = req.user.role === 'teacher' && cls.teacher_username.toLowerCase() === req.user.username.toLowerCase();
    if (!isTeacher) return res.status(403).json({ error: 'Test yaratishga ruxsat yo\'q.' });

    const normalizedQuestions = questions.map(normalizeQuestion).filter(Boolean);
    if (!normalizedQuestions.length) {
      return res.status(400).json({ error: 'Kamida bitta to\'liq savol kerak.' });
    }

    const info = db.prepare(`
      INSERT INTO class_tests (class_id, title, subject, teacher_username, questions)
      VALUES (@classId, @title, @subject, @teacherUsername, @questions)
    `).run({
      classId,
      title: String(title).trim(),
      subject: String(subject || 'Fan').trim(),
      teacherUsername: req.user.username,
      questions: JSON.stringify(normalizedQuestions),
    });

    const row = db.prepare('SELECT * FROM class_tests WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ test: testShape(row) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Test saqlashda xatolik yuz berdi.' });
  }
});

router.get('/classes/:classId/results', requireAuth, (req, res) => {
  try {
    const classId = Number(req.params.classId);
    const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
    if (!cls) return res.status(404).json({ error: 'Sinf topilmadi.' });
    if (req.user.role !== 'teacher' || cls.teacher_username.toLowerCase() !== req.user.username.toLowerCase()) {
      return res.status(403).json({ error: 'Natijalarni ko\'rishga ruxsat yo\'q.' });
    }
    const rows = db.prepare('SELECT * FROM class_results WHERE class_id = ? ORDER BY created_at DESC').all(classId);
    res.json({ results: rows.map((row) => ({
      id: String(row.id),
      classId: String(row.class_id),
      testId: row.test_id,
      username: row.username,
      score: Number(row.score) || 0,
      correct: Number(row.correct) || 0,
      total: Number(row.total) || 0,
      pct: Number(row.pct) || 0,
      subjects: (() => { try { return JSON.parse(row.subjects || '{}'); } catch (e) { return {}; } })(),
      date: row.created_at,
    })) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Natijalarni olishda xatolik yuz berdi.' });
  }
});

router.post('/classes/:classId/results', requireAuth, (req, res) => {
  try {
    const classId = Number(req.params.classId);
    const { testId, score, total, correct, pct, subjects } = req.body || {};
    if (!classId) return res.status(400).json({ error: 'classId noto\'g\'ri.' });

    const isMember = db.prepare(
      'SELECT 1 FROM class_members WHERE class_id=? AND username=? COLLATE NOCASE'
    ).get(classId, req.user.username);
    if (!isMember) {
      return res.status(403).json({ error: 'Siz bu sinf a\'zosi emassiz.' });
    }

    const info = db.prepare(`
      INSERT INTO class_results (class_id, test_id, username, score, total, correct, pct, subjects)
      VALUES (@classId, @testId, @username, @score, @total, @correct, @pct, @subjects)
    `).run({
      classId,
      testId: testId ? String(testId) : null,
      username: req.user.username,
      score: Number(score) || 0,
      total: Number(total) || 0,
      correct: Number(correct) || 0,
      pct: Number(pct) || 0,
      subjects: JSON.stringify(subjects || {}),
    });

    const row = db.prepare('SELECT * FROM class_results WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ result: {
      id: String(row.id),
      classId: String(row.class_id),
      testId: row.test_id,
      username: row.username,
      score: Number(row.score) || 0,
      total: Number(row.total) || 0,
      correct: Number(row.correct) || 0,
      pct: Number(row.pct) || 0,
      subjects: (() => { try { return JSON.parse(row.subjects || '{}'); } catch (e) { return {}; } })(),
      date: row.created_at,
    } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Natija saqlashda xatolik yuz berdi.' });
  }
});

module.exports = router;
