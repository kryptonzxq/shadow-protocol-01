// SHADOW PROTOCOL — core game: state, fixed-timestep loop, rendering, menus, scoring, saves.
import { TILE, MAP_W, MAP_H, LEVELS, loadLevel } from "./levels.js";
import { Guard, GUARD_STATE } from "./enemy.js";
import { Camera, Laser } from "./security.js";
import { Player } from "./player.js";
import { conePolygon, hasLOS, dist, clamp } from "./detection.js";
import { sfx, ensureAudio, toggleMute, startAlarm, stopAlarm } from "./audio.js";
import { updateHud, setObjectives, showToast, drawMinimap } from "./hud.js";

const SAVE_KEY = "shadow-protocol-save-v1";

export function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {}; } catch (e) { return {}; }
}
export function writeSave(s) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {}
}

export class Game {
  constructor(canvas, minimap) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.minimap = minimap;
    this.save = loadSave();
    this.save.unlocked = Math.max(0, Math.min(2, this.save.unlocked || 0));
    this.save.best = this.save.best || {};
    this.state = "menu"; // menu | playing | paused | complete | failed
    this.levelIndex = 0;
    this.frozen = false;
    this.input = { up: false, down: false, left: false, right: false, sprint: false };
    this.keys = {};
    this.time = 0;
    this.score = 0;
    this.alarms = 0;
    this.damageTaken = 0;
    this.intelCollected = 0;
    this.intelTotal = 0;
    this.securityDisabled = false;
    this.alarm = { active: false, timer: 0 };
    this.sounds = [];
    this.objectives = [];
    this.objDone = {};
    this.shotMode = null;
    this.acc = 0;
    this.last = 0;
    this.bindInput();
    this.buildMenu();
  }

  // ---------- level setup ----------
  loadLevel(idx) {
    this.levelIndex = idx;
    const { def, grid, ents } = loadLevel(idx);
    this.def = def;
    this.grid = grid;
    this.ents = ents;
    this.player = new Player(ents.playerSpawn, this);
    this.guards = def.guardDefs.map((gd, i) => new Guard(gd, ents.guards[i] || ents.guards[0], this));
    this.cameras = def.cameraDefs.map((cd, i) => new Camera(cd, ents.cameras[i] || ents.cameras[0], this));
    this.lasers = (def.lasers || []).map((ld) => new Laser(ld, this));
    this.sounds = [];
    this.time = 0;
    this.score = 0;
    this.alarms = 0;
    this.damageTaken = 0;
    this.intelCollected = 0;
    this.intelTotal = ents.intel.length;
    this.securityDisabled = false;
    this.alarm = { active: false, timer: 0 };
    this.objectives = def.objectives.map((o) => ({ ...o, done: false }));
    this.objDone = {};
    setObjectives(this);
    stopAlarm();
    updateHud(this);
  }

  startLevel(idx) {
    this.loadLevel(idx);
    this.state = "playing";
    this.hideOverlays();
    ensureAudio();
    sfx.click();
    this.toast(this.def.briefing);
  }

  // ---------- world services used by player/enemy/security ----------
  addSound(x, y, radius, intensity) {
    this.sounds.push({ x, y, radius, intensity, life: 0.6, heardBy: new Set() });
  }
  toast(msg) { showToast(msg); }
  onObjective(id) {
    this.objDone[id] = true;
    if (id === "intel") {
      const need = this.def.objectives.find((o) => o.id === "intel");
      if (need) {
        const total = this.intelTotal;
        if (this.intelCollected < total) { this.objDone.intel = false; }
      }
    }
    for (const o of this.objectives) {
      if (o.id === id) {
        if (id === "intel" && this.intelCollected < this.intelTotal) continue;
        o.done = true;
      }
    }
    setObjectives(this);
  }
  objectivesComplete() {
    // The "exit" objective itself is satisfied by reaching the exit; all others must be done.
    return this.objectives.filter((o) => o.id !== "exit").every((o) => o.done);
  }
  tryExit() {
    if (this.objectivesComplete()) {
      this.completeLevel();
      return true;
    }
    const left = this.objectives.filter((o) => !o.done).map((o) => o.text);
    this.toast("Exit locked — remaining: " + left.join(", "));
    sfx.locked();
    return false;
  }
  triggerAlarm(msg) {
    if (this.state !== "playing") return;
    this.alarms++;
    this.alarm = { active: true, timer: 10 };
    startAlarm();
    this.toast("⚠ ALARM — " + msg);
    sfx.alert();
    for (const g of this.guards) {
      g.lastKnown = { x: this.player.x, y: this.player.y };
      if (g.suspicion < 80) g.suspicion = 80;
      if (g.state === GUARD_STATE.PATROL || g.state === GUARD_STATE.IDLE || g.state === GUARD_STATE.RETURN || g.state === GUARD_STATE.SUSPICIOUS) g.setState(GUARD_STATE.ALERT);
    }
  }
  onGuardAlert(guard) {
    for (const g of this.guards) {
      if (g === guard) continue;
      if (dist(g.x, g.y, guard.x, guard.y) < 300) {
        if (g.suspicion < 60) g.suspicion = 60;
        g.lastKnown = guard.lastKnown ? { ...guard.lastKnown } : null;
        if (g.state === GUARD_STATE.PATROL || g.state === GUARD_STATE.IDLE) g.setState(GUARD_STATE.INVESTIGATE);
      }
    }
  }
  damagePlayer(amount, guard) {
    if (this.state !== "playing" || !this.player || this.player.hp <= 0) return;
    this.player.hp = Math.max(0, this.player.hp - amount);
    this.damageTaken += amount;
    sfx.hurt();
    if (this.player.hp <= 0) this.failLevel("You were taken down by a guard.");
  }

  // ---------- scoring ----------
  computeScore() {
    const objScore = this.objectives.filter((o) => o.done).length * 500;
    const intelScore = this.intelCollected * 150;
    const timeBonus = Math.max(0, this.def.par - Math.floor(this.time)) * 2;
    const alarmPen = this.alarms * 200;
    const dmgPen = Math.round(this.damageTaken) * 2;
    return Math.max(0, objScore + intelScore + timeBonus - alarmPen - dmgPen);
  }
  computeRank() {
    if (this.alarms === 0 && this.damageTaken === 0) return "S";
    if (this.alarms === 0) return "A";
    if (this.alarms <= 1 && this.damageTaken <= 25) return "B";
    if (this.alarms <= 2) return "C";
    return "D";
  }
  rankName(r) {
    return { S: "Ghost", A: "Silent Operator", B: "Professional", C: "Detected", D: "Failed Stealth" }[r] || "?";
  }

  completeLevel() {
    if (this.state !== "playing") return;
    for (const o of this.objectives) if (o.id === "exit") o.done = true;
    setObjectives(this);
    this.score = this.computeScore();
    const rank = this.computeRank();
    this.state = "complete";
    stopAlarm();
    sfx.success();
    const best = this.save.best[this.levelIndex];
    if (!best || this.score > best.score) this.save.best[this.levelIndex] = { score: this.score, rank };
    this.save.unlocked = Math.max(this.save.unlocked, Math.min(2, this.levelIndex + 1));
    writeSave(this.save);
    this.showEnd(true, rank);
  }
  failLevel(reason) {
    if (this.state !== "playing") return;
    this.state = "failed";
    stopAlarm();
    sfx.fail();
    this.showEnd(false, null, reason);
  }

  // ---------- menus ----------
  buildMenu() {
    const ml = document.getElementById("menu-levels");
    ml.innerHTML = "";
    LEVELS.forEach((lv, i) => {
      const b = document.createElement("button");
      const locked = i > this.save.unlocked;
      b.textContent = (locked ? "🔒 " : "") + lv.name + (this.save.best[i] ? ` · best ${this.save.best[i].score} (${this.save.best[i].rank})` : "");
      if (locked) b.className = "locked";
      else b.onclick = () => this.startLevel(i);
      ml.appendChild(b);
    });
  }
  hideOverlays() {
    for (const id of ["menu", "pause", "end"]) document.getElementById(id).classList.add("hidden");
  }
  showMenu() {
    this.state = "menu";
    stopAlarm();
    this.buildMenu();
    this.hideOverlays();
    document.getElementById("menu").classList.remove("hidden");
    // Keep a level loaded behind the menu for a live backdrop.
    if (!this.grid) this.loadLevel(0);
  }
  showPause() {
    this.state = "paused";
    document.getElementById("pause-sub").textContent = this.def.name + " · " + this.objectives.filter((o) => o.done).length + "/" + this.objectives.length + " objectives";
    this.hideOverlays();
    document.getElementById("pause").classList.remove("hidden");
  }
  showEnd(won, rank, reason) {
    document.getElementById("end-title").textContent = won ? "MISSION COMPLETE" : "MISSION FAILED";
    document.getElementById("end-sub").textContent = won ? this.def.name : (reason || "The mission failed.");
    const mins = Math.floor(this.time / 60), secs = Math.floor(this.time % 60);
    const stats = document.getElementById("end-stats");
    if (won) {
      stats.innerHTML = `<span class="rank">RANK ${rank} — ${this.rankName(rank)}</span>` +
        `Score: <b>${this.score}</b><br>Time: <b>${mins}:${String(secs).padStart(2, "0")}</b> (par ${Math.floor(this.def.par / 60)}:${String(this.def.par % 60).padStart(2, "0")})<br>` +
        `Intel: <b>${this.intelCollected}/${this.intelTotal}</b> · Alarms: <b>${this.alarms}</b> · Damage: <b>${Math.round(this.damageTaken)}</b>`;
      document.getElementById("btn-next").style.display = this.levelIndex < 2 ? "block" : "none";
    } else {
      stats.innerHTML = `Objectives: <b>${this.objectives.filter((o) => o.done).length}/${this.objectives.length}</b><br>Time survived: <b>${mins}:${String(secs).padStart(2, "0")}</b><br>Alarms: <b>${this.alarms}</b>`;
      document.getElementById("btn-next").style.display = "none";
    }
    this.hideOverlays();
    document.getElementById("end").classList.remove("hidden");
  }

  // ---------- input ----------
  bindInput() {
    const keymap = {
      KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down",
      KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right",
    };
    window.addEventListener("keydown", (e) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (keymap[e.code]) this.input[keymap[e.code]] = true;
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.input.sprint = true;
      if (e.code === "KeyC" && this.state === "playing") { this.player.crouch = !this.player.crouch; this.toast(this.player.crouch ? "Crouching — quiet and hard to see" : "Standing"); }
      if (e.code === "KeyE" && this.state === "playing") this.player.interact();
      if (e.code === "KeyQ" && this.state === "playing") this.player.throwRock();
      if (e.code === "KeyM") { const m = toggleMute(); this.toast(m ? "Sound muted" : "Sound on"); }
      if ((e.code === "KeyP" || e.code === "Escape")) {
        if (this.state === "playing") this.showPause();
        else if (this.state === "paused") { this.state = "playing"; this.hideOverlays(); }
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys[e.code] = false;
      if (keymap[e.code]) {
        const k = keymap[e.code];
        const still = Object.keys(keymap).some((code) => keymap[code] === k && this.keys[code]);
        if (!still) this.input[k] = false;
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.input.sprint = false;
    });
    document.getElementById("btn-start").onclick = () => this.startLevel(0);
    document.getElementById("btn-how").onclick = () => { document.getElementById("howto").classList.toggle("hidden"); sfx.click(); };
    document.getElementById("btn-resume").onclick = () => { this.state = "playing"; this.hideOverlays(); sfx.click(); };
    document.getElementById("btn-restart").onclick = () => this.startLevel(this.levelIndex);
    document.getElementById("btn-quit").onclick = () => this.showMenu();
    document.getElementById("btn-next").onclick = () => this.startLevel(Math.min(2, this.levelIndex + 1));
    document.getElementById("btn-retry").onclick = () => this.startLevel(this.levelIndex);
    document.getElementById("btn-menu2").onclick = () => this.showMenu();
    this.canvas.addEventListener("click", () => ensureAudio());
  }

  // ---------- simulation ----------
  update(dt) {
    if (this.state !== "playing" || this.frozen) return;
    this.time += dt;
    // Alarm timer.
    if (this.alarm.active) {
      this.alarm.timer -= dt;
      if (this.alarm.timer <= 0) { this.alarm.active = false; stopAlarm(); }
    }
    // Sound events decay.
    for (const s of this.sounds) s.life -= dt;
    this.sounds = this.sounds.filter((s) => s.life > 0);
    this.player.update(dt, this.input);
    for (const g of this.guards) g.update(dt);
    for (const c of this.cameras) c.update(dt);
    for (const l of this.lasers) l.update(dt);
    // Security disabled: cameras + lasers off.
    if (this.securityDisabled) {
      for (const c of this.cameras) c.disabled = true;
      for (const l of this.lasers) l.disabled = true;
    }
    updateHud(this);
  }

  // ---------- rendering ----------
  render() {
    const ctx = this.ctx;
    if (!this.grid) return;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // Floor.
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const c = this.grid[y][x];
        const px = x * TILE, py = y * TILE;
        if (c === 1) {
          ctx.fillStyle = "#232e33"; ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = "#31414a"; ctx.fillRect(px, py, TILE, 4);
        } else if (c === 2) {
          ctx.fillStyle = "#070b10"; ctx.fillRect(px, py, TILE, TILE);
        } else if (c === 3) {
          ctx.fillStyle = "#6b4d1f"; ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = "#a8842f"; ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
        } else if (c === 4) {
          ctx.fillStyle = "#4a5a52"; ctx.fillRect(px, py, TILE, TILE);
        } else {
          ctx.fillStyle = ((x + y) % 2 === 0) ? "#11181d" : "#10161b";
          ctx.fillRect(px, py, TILE, TILE);
        }
      }
    }
    // Exit zone.
    const ex = this.ents.exit;
    const exX = ex.x * TILE, exY = ex.y * TILE;
    ctx.fillStyle = this.objectivesComplete() ? "rgba(55,224,160,0.5)" : "rgba(55,224,160,0.18)";
    ctx.fillRect(exX, exY, TILE, TILE);
    ctx.strokeStyle = "#37e0a0"; ctx.lineWidth = 2; ctx.strokeRect(exX + 2, exY + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = "#37e0a0"; ctx.font = "bold 9px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("EXIT", exX + TILE / 2, exY + TILE / 2 + 3);
    // Lockers.
    for (const l of this.ents.lockers) {
      ctx.fillStyle = "#3a4a44"; ctx.fillRect(l.x - 11, l.y - 11, 22, 22);
      ctx.strokeStyle = "#5f8a74"; ctx.strokeRect(l.x - 11, l.y - 11, 22, 22);
      ctx.fillStyle = "#9fb8ac"; ctx.font = "9px sans-serif"; ctx.fillText("HIDE", l.x, l.y + 3);
    }
    // Terminals.
    for (const t of this.ents.terminals) {
      ctx.fillStyle = t.hacked ? "#1d3a2a" : "#1a3a4a";
      ctx.fillRect(t.x - 12, t.y - 12, 24, 24);
      ctx.fillStyle = t.hacked ? "#37e0a0" : "#4dd2ff";
      ctx.fillRect(t.x - 8, t.y - 8, 16, 10);
      ctx.fillStyle = "#9fb8ac"; ctx.font = "8px sans-serif"; ctx.fillText(t.hacked ? "OFF" : "HACK", t.x, t.y + 11);
    }
    // Pickups.
    for (const k of this.ents.keycards) if (!k.taken) {
      ctx.fillStyle = "#ffd75e";
      ctx.beginPath(); ctx.arc(k.x, k.y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#231a00"; ctx.font = "bold 9px sans-serif"; ctx.fillText("K", k.x, k.y + 3);
    }
    for (const it of this.ents.intel) if (!it.taken) {
      ctx.fillStyle = "#4dd2ff"; ctx.fillRect(it.x - 6, it.y - 8, 12, 16);
      ctx.fillStyle = "#06222e"; ctx.font = "bold 9px sans-serif"; ctx.fillText("i", it.x, it.y + 3);
    }
    for (const d of this.ents.data) if (!d.taken) {
      ctx.fillStyle = "#ff5ad0";
      ctx.beginPath(); ctx.arc(d.x, d.y, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2e001f"; ctx.font = "bold 9px sans-serif"; ctx.fillText("DATA", d.x, d.y + 3);
    }
    if (this.ents.informant && !this.ents.informant.rescued) {
      const inf = this.ents.informant;
      ctx.fillStyle = "#ff9a3d";
      ctx.beginPath(); ctx.arc(inf.x, inf.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2e1a00"; ctx.font = "bold 9px sans-serif"; ctx.fillText("!", inf.x, inf.y + 3);
    }
    // Laser beams.
    for (const l of this.lasers) {
      if (l.disabled) continue;
      ctx.strokeStyle = l.active ? "rgba(255,60,60,0.95)" : "rgba(255,60,60,0.18)";
      ctx.lineWidth = l.active ? 3 : 1;
      ctx.setLineDash(l.active ? [] : [6, 6]);
      ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
      ctx.setLineDash([]);
    }
    // Camera cones + cameras.
    for (const c of this.cameras) {
      if (!c.disabled) {
        const poly = conePolygon(this.grid, c.x, c.y, c.angle, c.half, c.range);
        ctx.fillStyle = c.suspicion > 50 ? "rgba(255,70,70,0.30)" : "rgba(255,180,84,0.20)";
        ctx.beginPath(); ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = c.disabled ? "#3a4a44" : "#ffb454";
      ctx.fillRect(c.x - 7, c.y - 7, 14, 14);
      ctx.fillStyle = "#231a00"; ctx.font = "bold 9px sans-serif"; ctx.fillText("C", c.x, c.y + 3);
    }
    // Guard vision cones.
    for (const g of this.guards) {
      const poly = conePolygon(this.grid, g.x, g.y, g.angle, g.half, g.vision);
      const hot = g.suspicion >= 75;
      ctx.fillStyle = hot ? "rgba(255,70,70,0.28)" : g.suspicion >= 25 ? "rgba(255,200,80,0.22)" : "rgba(255,220,120,0.13)";
      ctx.beginPath(); ctx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
      ctx.closePath(); ctx.fill();
    }
    // Guards.
    for (const g of this.guards) {
      ctx.fillStyle = g.state === GUARD_STATE.CHASE || g.state === GUARD_STATE.ATTACK ? "#ff3b30" : "#c94f43";
      ctx.beginPath(); ctx.arc(g.x, g.y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#ffd7d0"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.x + Math.cos(g.angle) * 15, g.y + Math.sin(g.angle) * 15); ctx.stroke();
      if (g.suspicion >= 25) {
        ctx.fillStyle = "#1a0d0d";
        ctx.fillRect(g.x - 14, g.y - 26, 28, 5);
        ctx.fillStyle = g.suspicion >= 75 ? "#ff3b30" : "#ffb454";
        ctx.fillRect(g.x - 14, g.y - 26, 28 * clamp(g.suspicion / 100, 0, 1), 5);
        ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(g.suspicion >= 75 ? "!" : "?", g.x, g.y - 30);
      }
    }
    // Rock in flight.
    if (this.player && this.player.rock) {
      const r = this.player.rock;
      const x = r.x + (r.tx - r.x) * r.t, y = r.y + (r.ty - r.y) * r.t;
      ctx.fillStyle = "#b8c4c0";
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }
    // Player.
    const p = this.player;
    if (p && !p.hidden) {
      ctx.fillStyle = p.crouch ? "#1f8f68" : "#37e0a0";
      ctx.beginPath(); ctx.arc(p.x, p.y, p.crouch ? 10 : 12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#eafff5"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(p.angle) * 16, p.y + Math.sin(p.angle) * 16); ctx.stroke();
      if (p.inShadow) {
        ctx.strokeStyle = "rgba(120,180,255,0.8)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.stroke();
      }
    }
    // Alarm vignette.
    if (this.alarm.active) {
      const pulse = 0.10 + 0.06 * Math.sin(this.time * 8);
      ctx.fillStyle = `rgba(255,40,40,${pulse})`;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    // Minimap.
    if (this.state === "playing" || this.state === "paused") drawMinimap(this.minimap, this);
  }

  // ---------- deterministic shots ----------
  setupShot(name) {
    this.shotMode = name;
    if (name === "cover") {
      this.loadLevel(0);
      this.state = "playing";
      this.player.x = 9 * TILE + 16; this.player.y = 12 * TILE + 16;
      this.player.crouch = true; this.player.angle = -Math.PI / 2;
      this.player.hasKeycard = true;
      this.ents.keycards.forEach((k) => { k.taken = true; });
      this.objDone.keycard = true;
      this.objectives.find((o) => o.id === "keycard").done = true;
      setObjectives(this);
      this.guards[0].x = 11 * TILE + 16; this.guards[0].y = 3 * TILE + 16; this.guards[0].angle = Math.PI / 2;
      this.guards[1].x = 19 * TILE + 16; this.guards[1].y = 4 * TILE + 16; this.guards[1].angle = Math.PI;
      this.guards[2].x = 16 * TILE + 16; this.guards[2].y = 12 * TILE + 16; this.guards[2].angle = 0;
      this.time = 87;
    } else if (name === "chase") {
      this.loadLevel(0);
      this.state = "playing";
      this.player.x = 15 * TILE + 16; this.player.y = 10 * TILE + 16;
      this.player.hp = 76;
      this.triggerAlarm("Guard spotted you!");
      this.guards[0].x = 12 * TILE + 16; this.guards[0].y = 10 * TILE + 16;
      this.guards[0].suspicion = 100; this.guards[0].lastKnown = { x: this.player.x, y: this.player.y };
      this.guards[0].state = GUARD_STATE.CHASE;
      this.guards[1].x = 18 * TILE + 16; this.guards[1].y = 12 * TILE + 16;
      this.guards[1].suspicion = 88; this.guards[1].lastKnown = { x: this.player.x, y: this.player.y };
      this.guards[1].state = GUARD_STATE.ALERT;
      this.time = 132;
      this.alarms = 1;
    } else if (name === "lab") {
      this.loadLevel(1);
      this.state = "playing";
      this.player.x = 13 * TILE + 16; this.player.y = 5 * TILE + 16;
      this.player.angle = Math.PI / 2;
      this.guards[0].x = 11 * TILE + 16; this.guards[0].y = 3 * TILE + 16; this.guards[0].angle = Math.PI / 2;
      this.guards[1].x = 16 * TILE + 16; this.guards[1].y = 5 * TILE + 16; this.guards[1].angle = -Math.PI / 2;
      this.time = 64;
    } else if (name === "results") {
      this.loadLevel(0);
      this.state = "playing";
      this.objectives.forEach((o) => { o.done = true; });
      this.objDone = { data: true, keycard: true, exit: true };
      this.intelCollected = 1;
      this.time = 142;
      this.alarms = 0;
      this.damageTaken = 0;
      this.completeLevel();
    }
    this.frozen = true;
    // Hide the menu overlay for gameplay shots, but NOT for "results" — its end
    // panel was just shown by completeLevel() and must stay visible.
    if (name !== "results") this.hideOverlays();
    updateHud(this);
    this.render();
  }

  // ---------- main loop ----------
  start() {
    this.showMenu();
    this.loadLevel(0);
    this.state = "menu";
    const loop = (ts) => {
      const now = ts / 1000;
      let dt = this.last ? now - this.last : 0.016;
      this.last = now;
      dt = Math.min(dt, 0.1);
      if (!this.frozen) {
        this.acc += dt;
        const step = 1 / 60;
        let n = 0;
        while (this.acc >= step && n < 5) { this.update(step); this.acc -= step; n++; }
        if (n === 5) this.acc = 0;
      }
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
