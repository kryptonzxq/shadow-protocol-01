// Security systems: rotating cameras, blinking laser barriers, the alarm.
import { TILE } from "./levels.js";
import { hasLOS, inCone, clamp, pointSegDist } from "./detection.js";

export class Camera {
  constructor(def, spawn, world) {
    this.world = world;
    this.x = spawn.x; this.y = spawn.y;
    this.base = (def.angle || 0) * Math.PI / 180;
    this.sweep = (def.sweep || 70) * Math.PI / 180;
    this.speed = def.speed || 0.6;
    this.range = def.range || 205;
    this.half = 0.5;
    this.t = Math.random() * 6;
    this.angle = this.base;
    this.suspicion = 0;
    this.disabled = false;
  }
  update(dt) {
    this.t += dt;
    this.angle = this.base + Math.sin(this.t * this.speed) * this.sweep;
    if (this.disabled) { this.suspicion = 0; return; }
    const w = this.world, p = w.player;
    if (!p || p.hp <= 0 || p.hidden) { this.suspicion = Math.max(0, this.suspicion - 25 * dt); return; }
    const cone = inCone(this.x, this.y, this.angle, this.half, this.range, p.x, p.y);
    if (cone > 0 && hasLOS(w.grid, this.x, this.y, p.x, p.y)) {
      let vis = 1;
      if (p.crouch) vis *= 0.55;
      if (p.inShadow) vis *= 0.45;
      if (p.sprint) vis *= 1.4;
      this.suspicion = clamp(this.suspicion + 72 * cone * vis * dt, 0, 100);
      if (this.suspicion >= 100) {
        this.suspicion = 55;
        w.triggerAlarm("Camera spotted you!");
      }
    } else {
      this.suspicion = Math.max(0, this.suspicion - 25 * dt);
    }
  }
}

export class Laser {
  constructor(def, world) {
    this.world = world;
    this.x1 = def.x1 * TILE; this.y1 = def.y1 * TILE + TILE / 2;
    this.x2 = def.x2 * TILE; this.y2 = def.y2 * TILE + TILE / 2;
    // If the segment is vertical (same tile column), span the tile column.
    if (def.x1 === def.x2) { this.x1 = def.x1 * TILE + TILE / 2; this.x2 = def.x2 * TILE + TILE / 2; }
    this.period = def.period || 3;
    this.onFrac = def.onFrac || 0.6;
    this.t = Math.random() * this.period;
    this.disabled = false;
    this.cd = 0;
  }
  get active() {
    if (this.disabled) return false;
    return (this.t % this.period) < this.period * this.onFrac;
  }
  update(dt) {
    this.t += dt;
    this.cd = Math.max(0, this.cd - dt);
    if (!this.active || this.cd > 0) return;
    const p = this.world.player;
    if (!p || p.hp <= 0) return;
    if (pointSegDist(p.x, p.y, this.x1, this.y1, this.x2, this.y2) < 9) {
      this.cd = 3;
      this.world.triggerAlarm("Laser barrier tripped!");
    }
  }
}
