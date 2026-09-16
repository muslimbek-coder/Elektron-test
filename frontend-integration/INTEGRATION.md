# index.html'ni backendga ulash — qadam-baqadam

Bu qo'llanma sizning mavjud `index.html` (Bilim Dueli Pro) faylidagi qaysi funksiyalarni
qanday o'zgartirish kerakligini ko'rsatadi. Fayl juda katta (9500+ qator) bo'lgani uchun
avtomatik almashtirish xavfli — shuning uchun har bir joyni qo'lda, tekshirib almashtirishni
tavsiya qilaman. Har bir bo'lim uchun **qidiradigan matn** va **nima bilan almashtirish**
ko'rsatilgan.

## 0-qadam: skriptlarni ulash

`</head>` dan oldin yoki `index.html` oxiridagi birinchi `<script>` tegidan oldin qo'shing:

```html
<script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
<script src="api-client.js"></script>
```

`api-client.js` faylini saytingiz bilan bir papkaga qo'ying va uning ichidagi
`BACKEND_URL` qatorini o'z backend manzilingizga o'zgartiring (Render/Railway'dan olgan URL).

## 1-qadam: Ro'yxatdan o'tish / Login (localStorage → backend)

**Qidiring:** `function handleRegister(e) {` (taxminan 9152-qator atrofida)

Ichidagi localStorage bilan ishlaydigan qismni (`users.push(...)`, `saveUsers(users)`,
`localStorage.setItem(CURRENT_USER_KEY, username)`) shunga almashtiring:

```js
async function handleRegister(e) {
  e.preventDefault();
  const firstName = document.getElementById('regFirstName').value.trim();
  const lastName = document.getElementById('regLastName').value.trim();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value;
  const role = document.getElementById('regRole')?.value || 'student';

  if (!firstName || !lastName || !username || !password) {
    showAuthError("Ism, username va parolni to'ldiring!");
    return;
  }
  try {
    await BilimDueliAPI.Auth.register({ username, password, firstName, lastName, role });
    updateUserUI();
    closeAuthModal();
  } catch (err) {
    showAuthError(err.message);
  }
}
```

**Qidiring:** `function handleLogin(e) {` — xuddi shunga o'xshab:

```js
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  try {
    await BilimDueliAPI.Auth.login({ username, password });
    updateUserUI();
    closeAuthModal();
  } catch (err) {
    showAuthError(err.message);
  }
}
```

**Qidiring:** `function getCurrentUser() {` va `function logout() {`

```js
// getCurrentUser endi backenddan tekshiradi. updateUserUI() chaqirilganda
// currentUserCache dan foydalaning (pastga qarang).
let currentUserCache = null;
async function refreshCurrentUser() {
  currentUserCache = await BilimDueliAPI.Auth.me();
  return currentUserCache;
}
function getCurrentUser() {
  return currentUserCache ? currentUserCache.username : null;
}
function logout() {
  BilimDueliAPI.Auth.logout();
  currentUserCache = null;
  updateUserUI();
  showFxToast("Mehmon rejimida davom etishingiz mumkin", 'var(--gold)');
}
```

Sahifa yuklanganda (masalan `DOMContentLoaded` ichida yoki fayl oxirida) bir marta chaqiring:

```js
refreshCurrentUser().then(updateUserUI);
```

`handleProfileSave` funksiyasini xuddi shu tarzda `BilimDueliAPI.Auth.updateProfile({...})` ga
ulang (parol almashtirish uchun `oldPassword`/`newPassword` maydonlarini yuboring).

## 2-qadam: Natijalarni serverga yuborish

**Qidiring:** `function endGame() {` ichidagi

```js
if (p1.name) {
  saveLeaderboardScore(p1.name, p1.score, p1.total);
}
if (gameMode === 'pvp' && p2.name) {
  saveLeaderboardScore(p2.name, p2.score, p2.total);
}
```

Shu qatorlar o'rniga (yoki qo'shimcha) qo'shing:

```js
BilimDueliAPI.Results.submit({
  mode: gameMode,                 // 'solo' | 'pvp' | 'blitz' | 'survival' | 'exam'
  grade: currentGrade,            // sizda saqlangan joriy sinf o'zgaruvchisi nomini qo'ying
  subject: currentSubject,        // joriy fan
  score: p1.score,
  total: p1.total,
  correct: p1.correct,
  maxCombo: p1.maxCombo,
  survivalBest: p1.survivalBest,
  won: p1.score >= (p2 ? p2.score : 0),
  guestName: p1.name,             // BilimDueliAPI o'zi tizimga kirgan bo'lsa buni e'tiborsiz qoldiradi
}).catch(console.error);
```

`updatePlayerStats(...)` chaqiruvi ham xuddi shu joyda turadi — uni backend endi
o'zi hisoblab beradi (`newlyUnlocked` javobida qaytadi), shu bilan `renderNewAchvToast`
ga backend javobidagi `newlyUnlocked` massivini bering.

## 3-qadam: Reyting oynasi (`openLeaderboard`)

**Qidiring:** `function openLeaderboard(){` — `loadLeaderboard()` dan o'qish o'rniga:

```js
async function openLeaderboard(mode = gameMode || 'solo') {
  const list = await BilimDueliAPI.Results.top(mode, 10);
  const container = document.getElementById('leaderboardList');
  if (list.length === 0) {
    container.innerHTML = '<p class="lb-empty">Hali hech kim o\'ynamagan. Birinchi bo\'ling!</p>';
  } else {
    container.innerHTML = list.map((p) => `
      <div class="lb-row">
        <div class="lb-rank">${p.rank}</div>
        <div class="lb-info">
          <div class="lb-name">${escapeHtml(p.name)}</div>
          <div class="lb-meta">${p.wins} g'alaba · ${p.games} o'yin · Combo ${p.bestCombo}</div>
        </div>
        <div class="lb-score">${p.bestScore}</div>
      </div>
    `).join('');
  }
  document.getElementById('leaderboardOverlay').classList.add('open');

  // "Mening natijam" bo'limi uchun:
  const me = await BilimDueliAPI.Results.myRank(mode, getCurrentUser() || p1.name);
  // me.found ? me.rank / me.stats — shu ma'lumotni alohida bloqqa chiqaring.
}
```

Endi har bir rejim (solo/pvp/blitz/survival/exam) uchun alohida jadval kerak bo'lsa,
reyting oynasida rejim tanlovchi tugmalar qo'shib, bosilganda `openLeaderboard('blitz')`
kabi chaqiring.

## 4-qadam: Haqiqiy onlayn duel (ikki turli qurilma)

Hozirgi "pvp" rejimi bitta qurilmada ikki kishi navbat bilan o'ynaydi. Ikki turli
telefonda/kompyuterda o'ynash uchun yangi rejim qo'shing, masalan "onlayn duel" tugmasi:

```js
const rt = BilimDueliAPI.realtime;

function startOnlineDuelSearch(grade, subject) {
  rt.announcePresence(getCurrentUser() || p1.name);
  rt.findMatch({ name: getCurrentUser() || p1.name, grade, subject, questionCount: 10 });
  showSearchingOverlay(); // o'zingizning "raqib qidirilyapti..." ekraningiz
}

rt.onWaiting(() => { /* "Raqib qidirilmoqda..." matnini ko'rsating */ });

rt.onMatched(({ roomId, seed, questionCount, grade, subject, opponent }) => {
  currentRoomId = roomId;
  // Ikkala tomon HAM bir xil savollarni oladi, chunki seed bir xil:
  const questions = BilimDueliAPI.pickDuelQuestions(database, grade, subject, seed, questionCount);
  startDuelWithQuestions(questions, opponent.name); // o'zingizning o'yin boshlash funksiyangiz
});

// Har savoldan keyin raqibga progress yuborish (masalan javob berilganda):
function onMyAnswer(index, myScore, myCorrectCount) {
  rt.sendProgress(currentRoomId, { index, score: myScore, correct: myCorrectCount });
}
rt.onOpponentProgress(({ index, score, correct }) => {
  updateOpponentSideUI(score, correct); // ekranda raqib tarafini yangilang
});

// O'yin tugaganda:
function onDuelFinished(myScore, myCorrect, total, myMaxCombo) {
  rt.finish(currentRoomId, { score: myScore, correct: myCorrect, total, maxCombo: myMaxCombo });
}
rt.onMatchResult(({ a, b, winner }) => {
  showDuelResultScreen(a, b, winner); // natija ekranini ko'rsating
});
rt.onOpponentLeft(() => {
  showFxToast("Raqib o'yindan chiqib ketdi", 'var(--gold)');
});
```

Onlayn foydalanuvchilar sonini ko'rsatish uchun (masalan bosh sahifada "🟢 128 kishi onlayn"):

```js
rt.onPresenceUpdate(({ count, names }) => {
  document.getElementById('onlineCount').textContent = count;
});
```

## Eslatma

- `database` obyekti (savollar bazasi) frontendning o'zida qolaveradi — backendga
  ko'chirish shart emas, chunki `seed` orqali ikkala qurilma bir xil savollarni mustaqil
  tanlab oladi.
- Agar kelajakda savollarni ham markazlashtirib, admin panel orqali qo'shish/tahrirlash
  xohlasangiz, aytib qo'ying — bu backendga oson qo'shiladigan keyingi qadam bo'ladi.
