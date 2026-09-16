const { v4: uuidv4 } = require('uuid');
const db = require('../db');

// socket.id -> { name }
const onlineUsers = new Map();
// kutish navbati: { socket, name, grade, subject, mode }
let waitingQueue = [];
// roomId -> { players: [{id,name,socket}], grade, subject, mode, results: {} }
const rooms = new Map();

function broadcastPresence(io) {
  const names = [...onlineUsers.values()].map((u) => u.name);
  io.emit('presence:update', { count: onlineUsers.size, names: names.slice(0, 50) });
}

function removeFromQueue(socketId) {
  waitingQueue = waitingQueue.filter((w) => w.socket.id !== socketId);
}

function saveDuelResult(displayName, r) {
  db.prepare(`
    INSERT INTO results (display_name, username, mode, grade, subject, score, total, correct, max_combo, won)
    VALUES (?, NULL, 'pvp', ?, ?, ?, ?, ?, ?, ?)
  `).run(displayName, r.grade || null, r.subject || null, r.score || 0, r.total || 0, r.correct || 0, r.maxCombo || 0, r.won ? 1 : 0);
}

function attachSocketHandlers(io) {
  io.on('connection', (socket) => {
    // --- Presence ---
    socket.on('presence:hello', ({ name } = {}) => {
      onlineUsers.set(socket.id, { name: String(name || 'Mehmon').slice(0, 40) });
      broadcastPresence(io);
    });

    // --- Duel: navbatga qo'shilish ---
    // payload: { name, grade, subject, mode: 'pvp', questionCount }
    socket.on('duel:queue', (payload = {}) => {
      const me = {
        socket,
        name: String(payload.name || 'Mehmon').slice(0, 40),
        grade: String(payload.grade || ''),
        subject: String(payload.subject || ''),
        mode: payload.mode || 'pvp',
        questionCount: Math.min(Math.max(parseInt(payload.questionCount, 10) || 10, 1), 50),
      };

      removeFromQueue(socket.id); // avvalgi navbatdan chiqarib qo'yamiz (agar bo'lsa)

      const opponentIdx = waitingQueue.findIndex(
        (w) => w.grade === me.grade && w.subject === me.subject && w.mode === me.mode
      );

      if (opponentIdx === -1) {
        waitingQueue.push(me);
        socket.emit('duel:waiting');
        return;
      }

      const opponent = waitingQueue.splice(opponentIdx, 1)[0];
      const roomId = uuidv4();
      const seed = Math.floor(Math.random() * 2 ** 31);
      const questionCount = Math.min(me.questionCount, opponent.questionCount);

      socket.join(roomId);
      opponent.socket.join(roomId);

      rooms.set(roomId, {
        grade: me.grade,
        subject: me.subject,
        mode: me.mode,
        players: [
          { id: socket.id, name: me.name },
          { id: opponent.socket.id, name: opponent.name },
        ],
        results: {},
      });

      socket.emit('duel:matched', {
        roomId, seed, questionCount, grade: me.grade, subject: me.subject,
        opponent: { name: opponent.name },
      });
      opponent.socket.emit('duel:matched', {
        roomId, seed, questionCount, grade: me.grade, subject: me.subject,
        opponent: { name: me.name },
      });
    });

    socket.on('duel:cancel', () => removeFromQueue(socket.id));

    // Musobaqa davomida jonli holatni raqibga uzatish (ball, savol raqami va h.k.)
    socket.on('duel:progress', ({ roomId, ...state } = {}) => {
      if (!roomId || !rooms.has(roomId)) return;
      socket.to(roomId).emit('duel:opponentProgress', { ...state });
    });

    // O'yinchi tugatganda
    socket.on('duel:finish', ({ roomId, score, correct, total, maxCombo } = {}) => {
      const room = rooms.get(roomId);
      if (!room) return;
      const me = room.players.find((p) => p.id === socket.id);
      if (!me) return;
      room.results[socket.id] = { name: me.name, score: score || 0, correct: correct || 0, total: total || 0, maxCombo: maxCombo || 0 };
      socket.to(roomId).emit('duel:opponentFinished', room.results[socket.id]);

      if (Object.keys(room.results).length === room.players.length) {
        const [aId, bId] = room.players.map((p) => p.id);
        const a = room.results[aId];
        const b = room.results[bId];
        const winner = a.score === b.score ? null : (a.score > b.score ? a.name : b.name);

        saveDuelResult(a.name, { ...a, grade: room.grade, subject: room.subject, won: winner === a.name });
        saveDuelResult(b.name, { ...b, grade: room.grade, subject: room.subject, won: winner === b.name });

        io.to(roomId).emit('duel:matchResult', { a, b, winner });
        io.socketsLeave(roomId);
        rooms.delete(roomId);
      }
    });

    socket.on('duel:leaveRoom', ({ roomId } = {}) => {
      const room = rooms.get(roomId);
      if (!room) return;
      socket.to(roomId).emit('duel:opponentLeft');
      rooms.delete(roomId);
    });

    socket.on('disconnect', () => {
      onlineUsers.delete(socket.id);
      removeFromQueue(socket.id);
      // agar faol xonada bo'lsa, raqibga xabar beramiz
      for (const [roomId, room] of rooms.entries()) {
        if (room.players.some((p) => p.id === socket.id)) {
          socket.to(roomId).emit('duel:opponentLeft');
          rooms.delete(roomId);
        }
      }
      broadcastPresence(io);
    });
  });
}

module.exports = { attachSocketHandlers };
