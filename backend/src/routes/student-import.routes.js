const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Excel faylni vaqtincha RAM'da saqlaymiz
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];

    if (allowed.includes(file.mimetype) || /\.(xlsx|xls)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Faqat Excel (.xlsx yoki .xls) fayl yuklash mumkin.'));
    }
  },
});

// Faqat teacher ishlata oladi
function requireTeacher(req, res, next) {
  if (!req.user || String(req.user.role).toLowerCase() !== 'teacher') {
    return res.status(403).json({
      error: 'Bu funksiya faqat o‘qituvchi uchun.',
    });
  }

  next();
}

// Username uchun ism/familiyani tozalash
function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ʻ|ʼ|’|‘|`/g, "'")
    .replace(/sh/g, 'sh')
    .replace(/ch/g, 'ch')
    .replace(/o'/g, 'o')
    .replace(/g'/g, 'g')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

// Tasodifiy parol yaratish
function generatePassword() {
  return crypto.randomBytes(6).toString('base64url').slice(0, 8);
}

// Username takrorlanmasligini tekshirish
function generateUniqueUsername(firstName, lastName, birthYear) {
  const first = normalizeName(firstName) || 'student';
  const last = normalizeName(lastName) || 'user';
  const year = String(birthYear || '').trim();

  let base = `${first}.${last}${year}`;
  let username = base;
  let counter = 2;

  while (
    db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username)
  ) {
    username = `${base}_${counter}`;
    counter++;
  }

  return username;
}

// Excel'dagi ustun nomini topish
function findColumn(row, possibleNames) {
  const keys = Object.keys(row);

  for (const key of keys) {
    const normalizedKey = String(key)
      .trim()
      .toLowerCase()
      .replace(/['"`ʻʼ’‘]/g, '');

    for (const name of possibleNames) {
      if (normalizedKey === name) {
        return key;
      }
    }
  }

  return null;
}

// POST /api/student-import/excel
router.post(
  '/excel',
  requireAuth,
  requireTeacher,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'Excel fayl tanlanmagan.',
        });
      }

      const workbook = XLSX.read(req.file.buffer, {
        type: 'buffer',
      });

      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        return res.status(400).json({
          error: 'Excel faylda varaq topilmadi.',
        });
      }

      const worksheet = workbook.Sheets[firstSheetName];

      const rows = XLSX.utils.sheet_to_json(worksheet, {
        defval: '',
      });

      if (!rows.length) {
        return res.status(400).json({
          error: 'Excel fayl bo‘sh.',
        });
      }

      const firstNameKey = findColumn(rows[0], [
        'ism',
        'firstname',
        'first name',
        'name',
      ]);

      const lastNameKey = findColumn(rows[0], [
        'familiya',
        'familya',
        'lastname',
        'last name',
        'surname',
      ]);

      const birthYearKey = findColumn(rows[0], [
        'tugilgan yil',
        'tugilgan_yil',
        'tugilgan yil',
        'birthyear',
        'birth year',
        'year',
      ]);

      if (!firstNameKey || !lastNameKey || !birthYearKey) {
        return res.status(400).json({
          error:
            'Excel ustunlari topilmadi. Kerakli ustunlar: Ism, Familiya, TugilganYil.',
        });
      }

      const createdStudents = [];
      const skippedRows = [];

      const insertStudent = db.prepare(`
        INSERT INTO users (
          username,
          password_hash,
          first_name,
          last_name,
          role,
          birth_year
        )
        VALUES (?, ?, ?, ?, 'student', ?)
      `);

      const importStudents = db.transaction((students) => {
        for (const student of students) {
          const firstName = String(student[firstNameKey] || '').trim();
          const lastName = String(student[lastNameKey] || '').trim();
          const birthYear = String(student[birthYearKey] || '').trim();

          if (!firstName || !lastName || !birthYear) {
            skippedRows.push({
              row: student,
              reason: 'Ism, familiya yoki tug‘ilgan yil yetishmaydi.',
            });
            continue;
          }

          const username = generateUniqueUsername(
            firstName,
            lastName,
            birthYear
          );

          const password = generatePassword();

          const passwordHash = bcrypt.hashSync(password, 10);

          insertStudent.run(
            username,
            passwordHash,
            firstName,
            lastName,
            birthYear
          );

          createdStudents.push({
            firstName,
            lastName,
            birthYear,
            username,
            password,
          });
        }
      });

      importStudents();

      return res.json({
        ok: true,
        message: `${createdStudents.length} ta o‘quvchi yaratildi.`,
        students: createdStudents,
        skipped: skippedRows,
      });
    } catch (error) {
      console.error('Student Excel import error:', error);

      return res.status(500).json({
        error: error.message || 'Excel import qilishda xatolik yuz berdi.',
      });
    }
  }
);

module.exports = router;