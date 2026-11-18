// Solara Bay — the HUD: wanted stars, cash, health, ammo, speed, the objective
// banner, toasts, the phone panel and the 2D minimap (whole city, live).
import { ROADS } from './config.js';

export class HUD {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.minimap = this.el('minimap');
    this.mm = this.minimap.getContext('2d');
    this.toastTimer = null;
    this.gameMinutes = 9 * 60; // 09:00
    this.onMissionComplete = null;
  }

  setWanted(n) {
    const el = this.el('wanted');
    el.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const s = document.createElement('span');
      s.textContent = '★';
      s.className = i < n ? 'star on' : 'star';
      el.appendChild(s);
    }
    el.classList.toggle('hot', n >= 3);
  }

  setCash(cash) { this.el('cash').textContent = `$${cash.toLocaleString('en-US')}`; }
  setHealth(h) {
    const pct = Math.max(0, Math.min(100, h));
    this.el('health-fill').style.width = `${pct}%`;
    this.el('health-fill').classList.toggle('low', pct < 30);
  }
  setAmmo(ammo, mag, reloading) {
    this.el('ammo').textContent = reloading ? 'RELOADING…' : `AMMO ${ammo} / ${mag}`;
  }
  setSpeed(kmh, driving) {
    this.el('speed').style.display = driving ? 'block' : 'none';
    if (driving) this.el('speed-num').textContent = Math.round(kmh);
  }
  setObjective(text) {
    const el = this.el('objective');
    el.textContent = text;
    el.style.display = text ? 'block' : 'none';
  }
  setClock() {
    const h = Math.floor(this.gameMinutes / 60) % 24;
    const m = Math.floor(this.gameMinutes % 60);
    this.el('clock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  showPrompt(text) {
    const el = this.el('prompt');
    el.textContent = text;
    el.style.display = 'block';
  }
  hidePrompt() { this.el('prompt').style.display = 'none'; }
  setCrosshair(show) { this.el('crosshair').style.display = show ? 'block' : 'none'; }

  toast(msg) {
    const el = this.el('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 3600);
  }

  showPhone(contact, text, hint) {
    this.el('phone-contact').textContent = `📱 ${contact}`;
    this.el('phone-text').textContent = text;
    this.el('phone-hint').textContent = hint;
    this.el('phone').style.display = 'block';
  }
  hidePhone() { this.el('phone').style.display = 'none'; }

  // state: { playerX, playerZ, heading, traffic, police, parked, objective }
  drawMinimap(state) {
    const ctx = this.mm;
    const S = this.minimap.width; // 220
    const scale = S / 480; // world -240..240
    const toX = (x) => (x + 240) * scale;
    const toY = (z) => (z + 240) * scale;
    ctx.clearRect(0, 0, S, S);
    // background: city blocks
    ctx.fillStyle = '#20242c';
    ctx.fillRect(0, 0, S, S);
    // ocean + beach (south) and canal (north)
    ctx.fillStyle = '#2e7fb8';
    ctx.fillRect(0, toY(214), S, S - toY(214));
    ctx.fillStyle = '#e8d29a';
    ctx.fillRect(0, toY(200), S, toY(214) - toY(200));
    ctx.fillStyle = '#1d5f8a';
    ctx.fillRect(0, 0, S, toY(-214));
    // roads
    ctx.strokeStyle = '#5a5e68';
    ctx.lineWidth = 5;
    for (const r of ROADS) {
      ctx.beginPath(); ctx.moveTo(toX(r), toY(-210)); ctx.lineTo(toX(r), toY(210)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(toX(-210), toY(r)); ctx.lineTo(toX(210), toY(r)); ctx.stroke();
    }
    ctx.strokeStyle = '#e8c33a';
    ctx.lineWidth = 1;
    for (const r of ROADS) {
      ctx.beginPath(); ctx.moveTo(toX(r), toY(-210)); ctx.lineTo(toX(r), toY(210)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(toX(-210), toY(r)); ctx.lineTo(toX(210), toY(r)); ctx.stroke();
    }
    // parked cars (grey dots)
    ctx.fillStyle = '#8a8f98';
    for (const c of state.parked) ctx.fillRect(toX(c.x) - 1, toY(c.z) - 1, 2, 2);
    // traffic (white dots)
    ctx.fillStyle = '#ffffff';
    for (const c of state.traffic) ctx.fillRect(toX(c.x) - 1.5, toY(c.z) - 1.5, 3, 3);
    // police (flashing blue/red)
    const flash = Math.floor(performance.now() / 250) % 2 === 0;
    ctx.fillStyle = flash ? '#2244ff' : '#ff2222';
    for (const c of state.police) {
      ctx.beginPath();
      ctx.arc(toX(c.x), toY(c.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // mission objective (pulsing yellow diamond)
    if (state.objective) {
      const pulse = 5 + Math.sin(performance.now() * 0.006) * 2;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(toX(state.objective.x), toY(state.objective.z) - pulse);
      ctx.lineTo(toX(state.objective.x) + pulse, toY(state.objective.z));
      ctx.lineTo(toX(state.objective.x), toY(state.objective.z) + pulse);
      ctx.lineTo(toX(state.objective.x) - pulse, toY(state.objective.z));
      ctx.closePath();
      ctx.fill();
    }
    // player arrow (heading 0 faces +z = south = down on the map)
    const px = toX(state.playerX), py = toY(state.playerZ);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.heading + Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
