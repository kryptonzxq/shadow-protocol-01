// HUD: DOM readouts, objectives list, toast messages, minimap.
import { TILE, MAP_W, MAP_H } from "./levels.js";

const $ = (id) => document.getElementById(id);

export function updateHud(g) {
  const p = g.player;
  if (!p) return;
  $("hud-hp").textContent = Math.max(0, Math.ceil(p.hp));
  $("hud-stam").textContent = Math.ceil(p.stamina);
  $("hud-noise").textContent = p.hidden ? "HIDDEN" : p.moving ? (p.sprint ? "LOUD" : p.crouch ? "quiet" : "normal") : "—";
  const susp = Math.max(0, ...g.guards.map((gr) => gr.suspicion), ...g.cameras.map((c) => c.suspicion));
  $("hud-susp").textContent = Math.round(susp);
  const alarmEl = $("hud-alarm");
  alarmEl.textContent = g.alarm.active ? "TRIGGERED" : "CLEAR";
  alarmEl.classList.toggle("alarm-on", g.alarm.active);
  const t = Math.floor(g.time);
  $("hud-time").textContent = Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
  $("hud-score").textContent = g.score;
  $("level-name").textContent = g.def.name;
}

export function setObjectives(g) {
  const ul = $("obj-list");
  ul.innerHTML = "";
  for (const o of g.objectives) {
    const li = document.createElement("li");
    li.textContent = o.text;
    if (o.done) li.className = "done";
    ul.appendChild(li);
  }
}

let toastTimer = null;
export function showToast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.style.opacity = "1";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = "0"; }, 2600);
}

export function drawMinimap(canvas, g) {
  const ctx = canvas.getContext("2d");
  const cw = canvas.width, ch = canvas.height;
  const sx = cw / (MAP_W * TILE), sy = ch / (MAP_H * TILE);
  ctx.fillStyle = "#0a0f0d";
  ctx.fillRect(0, 0, cw, ch);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const c = g.grid[y][x];
      if (c === 1) { ctx.fillStyle = "#3a4a44"; ctx.fillRect(x * TILE * sx, y * TILE * sy, TILE * sx, TILE * sy); }
      else if (c === 2) { ctx.fillStyle = "#0d1a16"; ctx.fillRect(x * TILE * sx, y * TILE * sy, TILE * sx, TILE * sy); }
    }
  }
  // Exit
  ctx.fillStyle = "#37e0a0";
  ctx.fillRect(g.ents.exit.x * TILE * sx, g.ents.exit.y * TILE * sy, TILE * sx, TILE * sy);
  // Guards
  ctx.fillStyle = "#ff6a5a";
  for (const gr of g.guards) ctx.fillRect(gr.x * sx - 2, gr.y * sy - 2, 4, 4);
  // Cameras
  ctx.fillStyle = "#ffb454";
  for (const c of g.cameras) ctx.fillRect(c.x * sx - 2, c.y * sy - 2, 4, 4);
  // Player
  if (g.player && !g.player.hidden) {
    ctx.fillStyle = "#37e0a0";
    ctx.beginPath(); ctx.arc(g.player.x * sx, g.player.y * sy, 3.5, 0, Math.PI * 2); ctx.fill();
  }
}
