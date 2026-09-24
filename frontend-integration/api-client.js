/**
 * Bilim Dueli — backend bilan ishlash uchun tayyor modul.
 *
 * index.html ga socket.io-client skriptidan KEYIN, va bu faylni <script> orqali ulang:
 *
 *   <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
 *   <script src="api-client.js"></script>
 *
 * Bu fayl `window.BilimDueliAPI` obyektini yaratadi. index.html ichidagi eski
 * localStorage funksiyalarini shu obyekt orqali backendga ulanadigan qilib
 * almashtirasiz — aniq qaysi joylarni, qanday, INTEGRATION.md faylida yozilgan.
 */
(function () {
  // ==== 1) SOZLAMA: backend manzilini shu yerga yozing ====
  // Production backend URL (Render): https://bilim-dueli-backend-v2.onrender.com
  // Istalgan vaqtda browserdan o'zgartirish uchun global o'zgaruvchidan ham foydalanish mumkin:
  // window.BILIM_DUELI_BACKEND_URL = 'https://your-backend.example.com';
   const BACKEND_URL = (window.BILIM_DUELI_BACKEND_URL || 'https://bilim-dueli-backend-v2.onrender.com').replace(/\/$/, '');

  const TOKEN_KEY = 'bilimDueliToken';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) {}
  }

  async function apiFetch(path, options = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(BACKEND_URL + path, { ...options, headers });
    let data = null;
    try { data = await res.json(); } catch (e) { /* bo'sh javob */ }
    if (!res.ok) {
      const msg = (data && data.error) || `So'rov xato bilan tugadi (${res.status})`;
      const error = new Error(msg);
      error.status = res.status;
      throw error;
    }
    return data;
  }

  // ================= AUTH =================
  const Auth = {
    async register({ username, password, firstName, lastName, role, country, region, city, bio, birthDay, birthMonth, birthYear, teacherCode }) {
      const data = await apiFetch('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, firstName, lastName, role, country, region, city, bio, birthDay, birthMonth, birthYear, teacherCode }),
      });
      setToken(data.token);
      return data.user;
    },
    async login({ username, password }) {
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setToken(data.token);
      return data.user;
    },
    async me() {
      if (!getToken()) return null;
      try {
        const data = await apiFetch('/api/auth/me');
        return data.user;
      } catch (e) {
        setToken(null); // token yaroqsiz bo'lsa tozalab qo'yamiz
        return null;
      }
    },
    async updateProfile(patch) {
      const data = await apiFetch('/api/auth/me', { method: 'PUT', body: JSON.stringify(patch) });
      return data.user;
    },
    logout() { setToken(null); },
    isLoggedIn() { return !!getToken(); },
  };

  // ================= RESULTS & LEADERBOARD =================
  const Results = {
    // O'yin tugagach shuni chaqiring (endGame() ichida).
    // Agar foydalanuvchi tizimga kirmagan bo'lsa, guestName (masalan p1.name) yuboring.
    async submit({ mode, grade, subject, score, total, correct, maxCombo, survivalBest, won, guestName }) {
      return apiFetch('/api/results', {
        method: 'POST',
        body: JSON.stringify({ mode, grade, subject, score, total, correct, maxCombo, survivalBest, won, guestName }),
      });
    },
    async top(mode, limit = 10) {
      const data = await apiFetch(`/api/leaderboard/${mode}?limit=${limit}`);
      return data.list;
    },
    async myRank(mode, name) {
      const q = name ? `?name=${encodeURIComponent(name)}` : '';
      return apiFetch(`/api/leaderboard/${mode}/me${q}`);
    },
    async achievements(name) {
      const data = await apiFetch(`/api/achievements/${encodeURIComponent(name)}`);
      return data.achievements;
    },
  };

  // ================= CLASSES & ASSIGNED TESTS =================
  const Classes = {
    async list() {
      return apiFetch('/api/classes');
    },
    async create({ name, grade }) {
      return apiFetch('/api/classes', {
        method: 'POST',
        body: JSON.stringify({ name, grade }),
      });
    },
    async findByCode(code) {
      return apiFetch(`/api/classes/${encodeURIComponent(String(code || '').trim().toUpperCase())}`);
    },
    async join(code, childUsername) {
      return apiFetch(`/api/classes/${encodeURIComponent(String(code || '').trim().toUpperCase())}/join`, {
        method: 'POST',
        body: JSON.stringify({ childUsername: childUsername || '' }),
      });
    },
    async tests(classId) {
      return apiFetch(`/api/classes/${encodeURIComponent(classId)}/tests`);
    },
    async createTest(classId, { title, subject, questions, start, end }) {
      return apiFetch(`/api/classes/${encodeURIComponent(classId)}/tests`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          subject,
          questions,
          start: start ? new Date(start).toISOString() : '',
          end: end ? new Date(end).toISOString() : '',
        }),
      });
    },
    async remove(classId) {
      return apiFetch(`/api/classes/${encodeURIComponent(classId)}`, { method: 'DELETE' });
    },
    async results(classId) {
      return apiFetch(`/api/classes/${encodeURIComponent(classId)}/results`);
    },
    async saveResult(classId, result) {
      return apiFetch(`/api/classes/${encodeURIComponent(classId)}/results`, {
        method: 'POST',
        body: JSON.stringify(result),
      });
    },
  };

const StudentImport = {
  async importExcel(file) {
    if (!file) {
      throw new Error('Excel fayl tanlanmagan.');
    }

    const formData = new FormData();
    formData.append('file', file);

    const token = getToken();

    const headers = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(
      BACKEND_URL + '/api/student-import/excel',
      {
        method: 'POST',
        headers,
        body: formData,
      }
    );

    let data = null;

    try {
      data = await res.json();
    } catch (e) {}

    if (!res.ok) {
      throw new Error(
        (data && data.error) ||
        `Import xatosi (${res.status})`
      );
    }

    return data;
  },
};

  const Parent = {
    async results(childUsername) {
      const data = await apiFetch(`/api/parent/results/${encodeURIComponent(childUsername)}`);
      return data.results || [];
    },
  };

  // ================= SEEDED SAVOL TANLASH (duelda ikki tomon bir xil savol olishi uchun) =================
  // Bir xil `seed` bilan chaqirilsa, ikkala qurilmada ham bir xil savollar, bir xil tartibda chiqadi.
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededShuffle(array, seed) {
    const rnd = mulberry32(seed);
    const arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  // database — sizning index.html dagi global `database` obyekti.
  function pickDuelQuestions(database, grade, subject, seed, count) {
    const pool = (database[grade] || []).filter((q) => !subject || q.s === subject);
    return seededShuffle(pool, seed).slice(0, count);
  }

  // ================= ONLAYN DUEL + PRESENCE (Socket.io) =================
  function createRealtimeClient() {
    if (typeof io === 'undefined') {
      console.warn('Socket.io-client topilmadi. <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script> ni index.html ga qo\'shing.');
      return null;
    }
    const socket = io(BACKEND_URL, { transports: ['websocket', 'polling'] });
    return {
      socket,
      // Onlayn foydalanuvchilar sonini kuzatish uchun
      announcePresence(name) { socket.emit('presence:hello', { name }); },
      onPresenceUpdate(cb) { socket.on('presence:update', cb); }, // cb({count, names})

      // Duel qidirish: grade/subject/mode bo'yicha navbatga qo'shiladi
      findMatch({ name, grade, subject, mode = 'pvp', questionCount = 10 }) {
        socket.emit('duel:queue', { name, grade, subject, mode, questionCount });
      },
      cancelMatch() { socket.emit('duel:cancel'); },
      onWaiting(cb) { socket.on('duel:waiting', cb); },
      onMatched(cb) { socket.on('duel:matched', cb); }, // cb({roomId, seed, questionCount, grade, subject, opponent:{name}})

      // O'yin davomida holatni raqibga uzatish (masalan har savoldan keyin)
      sendProgress(roomId, state) { socket.emit('duel:progress', { roomId, ...state }); },
      onOpponentProgress(cb) { socket.on('duel:opponentProgress', cb); },

      finish(roomId, { score, correct, total, maxCombo }) {
        socket.emit('duel:finish', { roomId, score, correct, total, maxCombo });
      },
      onOpponentFinished(cb) { socket.on('duel:opponentFinished', cb); },
      onMatchResult(cb) { socket.on('duel:matchResult', cb); }, // cb({a,b,winner})
      onOpponentLeft(cb) { socket.on('duel:opponentLeft', cb); },
      leaveRoom(roomId) { socket.emit('duel:leaveRoom', { roomId }); },
    };
  }

window.BilimDueliAPI = {
  Auth,
  Results,
  Classes,
  StudentImport,
  Parent,

  AI: {
    async generateTest({ prompt, count, difficulty, language = 'uz' }) {
      return apiFetch('/api/ai/generate-test', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          count,
          difficulty,
          language
        })
      });
    }
  },

  pickDuelQuestions,
  realtime: createRealtimeClient(),
};
})();
