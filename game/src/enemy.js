// Enemy guard: finite state machine driven by real perception (vision + hearing).
// States: PATROL, IDLE, SUSPICIOUS, INVESTIGATE, ALERT, CHASE, ATTACK, SEARCH, RETURN.
import { TILE } from "./levels.js";
import { hasLOS, inCone, angleDiff, clamp, dist } from "./detection.js";
import { sfx } from "./audio.js";

export const GUARD_STATE = {
  PATROL: "PATROL", IDLE: "IDLE", SUSPICIOUS: "SUSPICIOUS", INVESTIGATE: "INVESTIGATE",
  ALERT: "ALERT", CHASE: "CHASE", ATTACK: "ATTACK", SEARCH: "SEARCH", RETURN: "RETURN",
};

function tileCenter(tx, ty) { return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 }; }

export class Guard {
  constructor(def, spawn, world) {
    this.world = world;
    const s = tileCenter(spawn.x, spawn.y);
    this.x = s.x; this.y = s.y;
    this.route = (def.route || [[spawn.x, spawn.y]]).map(([tx, ty]) => tileCenter(tx, ty));
    this.wp = 0;
    this.angle = Math.PI / 2;
    this.speed = def.speed || 55;
    this.vision = def.vision || 225;
    this.half = def.half || 0.6;
    this.hearing = 165;
    this.state = GUARD_STATE.PATROL;
    this.suspicion = 0;
    this.pause = def.pause || 1.2;
    this.pauseT = 0;
    this.lastKnown = null;
    this.searchT = 0;
    this.searchR = 0;
    this.attackCd = 0;
    this.loseT = 0;
    this.scanT = 0;
    this.scanDir = 1;
    this.alarmRaised = false;
  }

  // Visibility of the player right now: 0 = invisible, 1 = fully visible.
  visibilityFactor(player) {
    if (player.hidden) return 0;
    let v = 1;
    if (player.crouch) v *= 0.5;
    if (player.sprint) v *= 1.5;
    else if (player.moving) v *= 1;
    else v *= 0.8;
    if (player.inShadow) v *= 0.45;
    return v;
  }

  perceive(dt) {
    const w = this.world, p = w.player;
    if (!p || p.hp <= 0) return;
    const cone = inCone(this.x, this.y, this.angle, this.half, this.vision, p.x, p.y);
    if (cone > 0 && hasLOS(w.grid, this.x, this.y, p.x, p.y)) {
      const vis = this.visibilityFactor(p);
      if (vis > 0) {
        const rate = 62 * cone * vis;
        this.suspicion = clamp(this.suspicion + rate * dt, 0, 100);
        this.lastKnown = { x: p.x, y: p.y };
        this.loseT = 0;
      }
    } else {
      this.suspicion = clamp(this.suspicion - 20 * dt, 0, 100);
      this.loseT += dt;
    }
  }

  hear() {
    const w = this.world;
    for (const s of w.sounds) {
      if (s.heardBy && s.heardBy.has(this)) continue;
      if (dist(this.x, this.y, s.x, s.y) <= Math.max(this.hearing, s.radius)) {
        if (!s.heardBy) s.heardBy = new Set();
        s.heardBy.add(this);
        if (this.state === GUARD_STATE.PATROL || this.state === GUARD_STATE.IDLE || this.state === GUARD_STATE.RETURN) {
          this.lastKnown = { x: s.x, y: s.y };
          this.setState(GUARD_STATE.INVESTIGATE);
        } else if (this.suspicion < 60) {
          this.suspicion = Math.min(60, this.suspicion + 25);
          this.lastKnown = { x: s.x, y: s.y };
        }
      }
    }
  }

  setState(st) {
    if (this.state === st) return;
    const prev = this.state;
    this.state = st;
    if (st === GUARD_STATE.ALERT && prev !== GUARD_STATE.CHASE) sfx.suspicious();
    if (st === GUARD_STATE.CHASE && prev !== GUARD_STATE.CHASE) {
      sfx.alert();
      this.world.onGuardAlert(this);
    }
    if (st === GUARD_STATE.SEARCH) { this.searchT = 0; this.searchR = 60; }
    if (st === GUARD_STATE.INVESTIGATE) this.searchT = 0;
  }

  moveToward(tx, ty, speed, dt) {
    const dx = tx - this.x, dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) return true;
    const nx = this.x + (dx / d) * speed * dt;
    const ny = this.y + (dy / d) * speed * dt;
    this.angle = Math.atan2(dy, dx);
    return this.tryMove(nx, ny);
  }
  tryMove(nx, ny) {
    const w = this.world, r = 12;
    const blocked = (x, y) => {
      for (const [cx, cy] of [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]]) {
        const tx = Math.floor(cx / TILE), ty = Math.floor(cy / TILE);
        if (ty < 0 || ty >= w.grid.length || tx < 0 || tx >= w.grid[0].length) return true;
        const c = w.grid[ty][tx];
        if (c === 1 || c === 3 || c === 4) return true;
      }
      return false;
    };
    let moved = false;
    if (!blocked(nx, this.y)) { this.x = nx; moved = true; }
    if (!blocked(this.x, ny)) { this.y = ny; moved = true; }
    return moved;
  }

  update(dt) {
    const w = this.world, p = w.player;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.perceive(dt);
    this.hear();
    const s = this.suspicion;
    // Suspicion-driven transitions (real conditions only).
    if (s >= 100) {
      if (this.state !== GUARD_STATE.CHASE && this.state !== GUARD_STATE.ATTACK) {
        this.setState(GUARD_STATE.CHASE);
        if (!this.alarmRaised) { this.alarmRaised = true; w.triggerAlarm("Guard spotted you!"); }
      }
    } else if (s >= 75) {
      if (this.state === GUARD_STATE.PATROL || this.state === GUARD_STATE.IDLE || this.state === GUARD_STATE.SUSPICIOUS || this.state === GUARD_STATE.RETURN) this.setState(GUARD_STATE.ALERT);
    } else if (s >= 50) {
      if (this.state === GUARD_STATE.PATROL || this.state === GUARD_STATE.IDLE || this.state === GUARD_STATE.SUSPICIOUS) this.setState(GUARD_STATE.INVESTIGATE);
    } else if (s >= 25) {
      if (this.state === GUARD_STATE.PATROL || this.state === GUARD_STATE.IDLE) this.setState(GUARD_STATE.SUSPICIOUS);
    } else if (s < 25 && (this.state === GUARD_STATE.SUSPICIOUS)) {
      this.setState(GUARD_STATE.PATROL);
    }

    switch (this.state) {
      case GUARD_STATE.PATROL: {
        const t = this.route[this.wp];
        if (this.moveToward(t.x, t.y, this.speed, dt) || dist(this.x, this.y, t.x, t.y) < 6) {
          if (dist(this.x, this.y, t.x, t.y) < 6) {
            this.wp = (this.wp + 1) % this.route.length;
            this.state = GUARD_STATE.IDLE; this.pauseT = this.pause;
          }
        }
        break;
      }
      case GUARD_STATE.IDLE: {
        this.pauseT -= dt;
        this.scanT += dt * this.scanDir;
        this.angle += 0.9 * dt * this.scanDir;
        if (this.scanT > 1.1) { this.scanDir *= -1; this.scanT = 0; }
        if (this.pauseT <= 0) this.state = GUARD_STATE.PATROL;
        break;
      }
      case GUARD_STATE.SUSPICIOUS: {
        if (this.lastKnown) {
          const a = Math.atan2(this.lastKnown.y - this.y, this.lastKnown.x - this.x);
          this.angle += angleDiff(a, this.angle) * Math.min(1, dt * 5);
        }
        break;
      }
      case GUARD_STATE.INVESTIGATE: {
        if (!this.lastKnown) { this.setState(GUARD_STATE.RETURN); break; }
        if (this.moveToward(this.lastKnown.x, this.lastKnown.y, this.speed * 1.7, dt) || dist(this.x, this.y, this.lastKnown.x, this.lastKnown.y) < 10) {
          if (dist(this.x, this.y, this.lastKnown.x, this.lastKnown.y) < 10) {
            this.searchT += dt;
            this.angle += 1.6 * dt;
            if (this.searchT > 2.2) { this.setState(GUARD_STATE.RETURN); }
          }
        }
        break;
      }
      case GUARD_STATE.ALERT: {
        if (this.lastKnown) {
          this.moveToward(this.lastKnown.x, this.lastKnown.y, this.speed * 2.1, dt);
          if (dist(this.x, this.y, this.lastKnown.x, this.lastKnown.y) < 14) this.setState(GUARD_STATE.SEARCH);
        } else this.setState(GUARD_STATE.SEARCH);
        break;
      }
      case GUARD_STATE.CHASE: {
        if (!p || p.hp <= 0) { this.setState(GUARD_STATE.SEARCH); break; }
        const d = dist(this.x, this.y, p.x, p.y);
        if (d < 30) {
          this.state = GUARD_STATE.ATTACK;
        } else {
          const tgt = this.lastKnown && this.loseT < 1.5 ? { x: p.x, y: p.y } : this.lastKnown;
          if (tgt) this.moveToward(tgt.x, tgt.y, this.speed * 2.6, dt);
          if (this.loseT > 4) this.setState(GUARD_STATE.SEARCH);
        }
        break;
      }
      case GUARD_STATE.ATTACK: {
        if (!p || p.hp <= 0) { this.setState(GUARD_STATE.SEARCH); break; }
        const d = dist(this.x, this.y, p.x, p.y);
        this.angle = Math.atan2(p.y - this.y, p.x - this.x);
        if (d < 34 && this.attackCd <= 0) {
          this.attackCd = 0.9;
          w.damagePlayer(12, this);
        } else if (d >= 40) {
          this.state = GUARD_STATE.CHASE;
        }
        break;
      }
      case GUARD_STATE.SEARCH: {
        this.searchT += dt;
        this.searchR = Math.min(220, 60 + this.searchT * 26);
        const a = this.searchT * 1.1;
        const tx = (this.lastKnown ? this.lastKnown.x : this.x) + Math.cos(a) * this.searchR * 0.6;
        const ty = (this.lastKnown ? this.lastKnown.y : this.y) + Math.sin(a) * this.searchR * 0.6;
        this.moveToward(tx, ty, this.speed * 1.5, dt);
        if (this.searchT > 6) { this.suspicion = 0; this.alarmRaised = false; this.setState(GUARD_STATE.RETURN); }
        break;
      }
      case GUARD_STATE.RETURN: {
        let best = this.route[0], bd = Infinity;
        for (const t of this.route) { const d = dist(this.x, this.y, t.x, t.y); if (d < bd) { bd = d; best = t; } }
        if (this.moveToward(best.x, best.y, this.speed * 1.5, dt) || bd < 8) {
          if (bd < 8) { this.wp = this.route.indexOf(best); this.setState(GUARD_STATE.PATROL); }
        }
        break;
      }
    }
  }
}
