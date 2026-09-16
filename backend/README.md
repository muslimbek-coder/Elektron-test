# Bilim Dueli — Backend

Bu backend saytingizdagi (`bilimler-dueli-.zip`) localStorage'ga asoslangan
foydalanuvchi/reyting tizimini almashtirib, **markaziy** (barcha qurilmalarda bir xil)
hisoblar, reyting jadvallari, yutuqlar va **real onlayn duel** (ikki turli telefon/kompyuterdagi
o'quvchini bir-biriga ulash) imkonini beradi.

## Texnologiyalar
- Node.js + Express — REST API (ro'yxatdan o'tish, login, profil, reyting, natijalar)
- SQLite (better-sqlite3) — ma'lumotlar bazasi, bitta faylda saqlanadi
- Socket.io — onlayn foydalanuvchilar soni (presence) va real vaqtli duel
- JWT — token orqali avtorizatsiya
- bcryptjs — parollarni xavfsiz saqlash (hozirgi saytda parollar ochiq matnda saqlanadi, bu yerda xeshlanadi)

## O'rnatish (lokal test uchun)

```bash
cd backend
npm install
cp .env.example .env
# .env faylini oching va JWT_SECRET'ni o'zgartiring, CORS_ORIGIN'ga frontend manzilingizni yozing
npm start
```

Server manzili: `http://localhost:4000` (yoki .env dagi PORT).

## Muhim: qayerga deploy qilish kerak?

Frontend (`bilimler-dueli-.zip`) hozir **Vercel**da statik sayt sifatida turibdi — bu juda yaxshi va
shunday qolaversin. Lekin bu backend **doimiy ishlab turadigan** Node jarayoni talab qiladi
(Socket.io ulanishlari va SQLite fayli uchun), Vercel'ning bepul "serverless function"lari esa
har so'rovdan keyin o'chib qoladi va buning uchun mos emas.

Shu sabab backendni **alohida** joyga joylashtiring, masalan (barchasida bepul tarif bor):
- **Render.com** (Web Service, "Node" muhiti) — eng oson
- **Railway.app**
- **Fly.io**

Deploy qadamlari (Render misolida):
1. Bu `backend/` papkani alohida Git repo qiling (yoki asosiy repo ichida subfolder sifatida qoldirib, Render'da "Root Directory: backend" deb ko'rsating).
2. Render'da "New Web Service" → repo'ni bog'lang.
3. Build Command: `npm install`, Start Command: `npm start`.
4. Environment Variables bo'limida `.env.example`dagi qiymatlarni kiriting (`JWT_SECRET` ni albatta o'zgartiring, `CORS_ORIGIN` ga Vercel domeningizni yozing, masalan `https://bilimler-dueli.vercel.app`).
5. Deploy tugagach sizga `https://sizning-nom.onrender.com` kabi manzil beriladi — shu manzilni frontendga ulaysiz (pastga qarang).

> Eslatma: SQLite fayli konteyner diskida saqlanadi. Render bepul tarifida disk vaqti-vaqti bilan
> tozalanishi mumkin — chinakam productionda "Persistent Disk" (Render) yoki Postgres'ga o'tishni
> tavsiya qilaman. Hozircha o'quvchilar soni uchun SQLite yetarli va oddiy.

### Tayyor Blueprint orqali deploy

Repository ildizidagi `render.yaml` tayyor. Render'da **New + -> Blueprint** ni tanlab,
GitHub repositorysini ulang. Blueprint backendni `backend/` papkasidan ishga tushiradi,
`/var/data` persistent diskini ulaydi va `/api/health` orqali tekshiradi. Deploy vaqtida
`CORS_ORIGIN` qiymatiga frontendning haqiqiy Vercel domenini kiriting.

Deploy tugagach, berilgan `https://...onrender.com` manzilini
`frontend-integration/api-client.js` ichidagi `BACKEND_URL` qiymatiga yozing.

## API

Barcha javoblar JSON. Xatolarda `{ "error": "..." }` qaytadi.

### Avtorizatsiya
| Method | Yo'l | Tavsif |
|---|---|---|
| POST | `/api/auth/register` | `{username,password,firstName,lastName,role?,country?,region?,city?,bio?,birthDay?,birthMonth?,birthYear?}` → `{token,user}` |
| POST | `/api/auth/login` | `{username,password}` → `{token,user}` |
| GET | `/api/auth/me` | Header: `Authorization: Bearer <token>` → `{user}` |
| PUT | `/api/auth/me` | Profilni yangilash (parol almashtirish ixtiyoriy: `oldPassword`+`newPassword`) |

### Foydalanuvchi (ochiq profil)
| Method | Yo'l | Tavsif |
|---|---|---|
| GET | `/api/users/:username/public` | Boshqa o'yinchining ochiq profili |

### Natijalar va reyting
| Method | Yo'l | Tavsif |
|---|---|---|
| POST | `/api/results` | O'yin tugaganda yuboriladi. Token bo'lsa hisobga, bo'lmasa `guestName`ga yoziladi. Body: `{mode, grade?, subject?, score, total, correct, maxCombo?, survivalBest?, won?, guestName?}`. `mode`: `solo\|pvp\|blitz\|survival\|exam` |
| GET | `/api/leaderboard/:mode?limit=10` | Rejim bo'yicha TOP ro'yxat (`:mode` — yuqoridagilar yoki `overall`) |
| GET | `/api/leaderboard/:mode/me?name=...` | Mening o'rnim va statistikam shu rejimda ("Mening natijam" bo'limi uchun) |
| GET | `/api/achievements/:name` | Shu o'yinchining barcha yutuqlari (ochilgan/ochilmagan) |

### Real vaqtli (Socket.io, `io("https://backend-manzilingiz")`)
| Event (yuboriladi) | Payload | Javob eventi |
|---|---|---|
| `presence:hello` | `{name}` | — |
| `duel:queue` | `{name, grade, subject, mode:'pvp', questionCount}` | `duel:waiting` yoki `duel:matched` |
| `duel:cancel` | — | — |
| `duel:progress` | `{roomId, ...istalgan holat}` | raqibga `duel:opponentProgress` |
| `duel:finish` | `{roomId, score, correct, total, maxCombo}` | raqibga `duel:opponentFinished`, ikkalasi tugagach `duel:matchResult` |
| `duel:leaveRoom` | `{roomId}` | raqibga `duel:opponentLeft` |

Serverdan barchaga: `presence:update` → `{count, names}` (onlayn o'yinchilar soni va ro'yxati).

## Frontendni ulash

`../frontend-integration/` papkasidagi `api-client.js` va `INTEGRATION.md` fayllarga qarang —
u yerda `index.html` dagi qaysi funksiyalarni almashtirish kerakligi aniq ko'rsatilgan.
