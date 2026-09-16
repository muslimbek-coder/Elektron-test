// Bu ro'yxat frontenddagi ACHIEVEMENTS bilan bir xil bo'lishi kerak (index.html, ~8677-qator).
// Agar frontendda yangi yutuq qo'shsangiz, shu yerga ham qo'shing.
const ACHIEVEMENTS = [
  { id: 'first_win', icon: '🥇', title: "Birinchi g'alaba", check: (s) => s.wins >= 1 },
  { id: 'wins_5', icon: '🏆', title: "5 ta g'alaba", check: (s) => s.wins >= 5 },
  { id: 'wins_10', icon: '👑', title: '10 ta g\'alaba', check: (s) => s.wins >= 10 },
  { id: 'combo_5', icon: '🔥', title: '5x Combo', check: (s) => s.bestCombo >= 5 },
  { id: 'combo_10', icon: '⚡', title: '10x Combo', check: (s) => s.bestCombo >= 10 },
  { id: 'score_100', icon: '💯', title: '100+ ball', check: (s) => s.bestScore >= 100 },
  { id: 'perfect', icon: '🎯', title: "Xatosiz o'yin", check: (s) => s.perfectGames >= 1 },
  { id: 'survive_8', icon: '❤️', title: 'Omon: 8 seriya', check: (s) => (s.bestSurvival || 0) >= 8 },
];

function checkNewAchievements(statsRow) {
  const already = JSON.parse(statsRow.achievements || '[]');
  const statForCheck = {
    wins: statsRow.wins,
    bestCombo: statsRow.best_combo,
    bestScore: statsRow.best_score,
    perfectGames: statsRow.perfect_games,
    bestSurvival: statsRow.best_survival,
  };
  const newlyUnlocked = [];
  ACHIEVEMENTS.forEach((a) => {
    if (!already.includes(a.id) && a.check(statForCheck)) {
      already.push(a.id);
      newlyUnlocked.push({ id: a.id, icon: a.icon, title: a.title });
    }
  });
  return { achievements: already, newlyUnlocked };
}

module.exports = { ACHIEVEMENTS, checkNewAchievements };
