// Solara Bay — save / load to localStorage. Cash, story progress and the
// player's spot in the city survive a refresh.
const KEY = 'solara-bay-save-v1';

export function saveGame(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      cash: state.cash,
      missionIndex: state.missionIndex,
      x: state.x,
      z: state.z,
      health: state.health,
      savedAt: Date.now(),
    }));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
