// Player controller: movement, crouch/sprint/stamina, noise, interactions, rock throws, hiding.
import { TILE } from "./levels.js";
import { isBlocking, dist, clamp } from "./detection.js";
import { sfx } from "./audio.js";

export class Player {
  constructor(spawn, world) {
    this.world = world;
    this.x = spawn.x * TILE + TILE / 2;
    this.y = spawn.y * TILE + TILE / 2;
    this.angle = Math.PI / 2;
    this.hp = 100;
    this.stamina = 100;
    this.crouch = false;
    this.sprint = false;
    this.moving = false;
    this.hidden = false;
    this.inShadow = false;
    this.hasKeycard = false;
    this.rocks = 5;
    this.rock = null; // in-flight rock {x,y,tx,ty,t}
    this.noiseT = 0;
    this.stepT = 0;
    this.hideLocker = null;
  }

  get speed() { return this.crouch ? 66 : this.sprint ? 205 : 132; }
  get noiseRadius() { return this.crouch ? 18 : this.sprint ? 135 : 48; }

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
    if (!blocked(nx, this.y)) this.x = nx;
    if (!blocked(this.x, ny)) this.y = ny;
  }

  update(dt, input) {
    const w = this.world;
    if (this.hp <= 0 || this.hidden) { this.moving = false; this.updateRock(dt); return; }
    let dx = 0, dy = 0;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;
    this.moving = dx !== 0 || dy !== 0;
    if (this.moving) {
      const len = Math.hypot(dx, dy);
      dx /= len; dy /= len;
      this.angle = Math.atan2(dy, dx);
    }
    this.sprint = !!input.sprint && this.stamina > 1 && this.moving && !this.crouch;
    if (this.sprint) this.stamina = Math.max(0, this.stamina - 24 * dt);
    else this.stamina = Math.min(100, this.stamina + 15 * dt);
    const sp = this.speed;
    this.tryMove(this.x + dx * sp * dt, this.y + dy * sp * dt);
    // Shadow check.
    const tx = Math.floor(this.x / TILE), ty = Math.floor(this.y / TILE);
    this.inShadow = ty >= 0 && ty < w.grid.length && tx >= 0 && tx < w.grid[0].length && w.grid[ty][tx] === 2;
    // Footstep noise + sounds.
    if (this.moving) {
      this.noiseT -= dt;
      if (this.noiseT <= 0) {
        this.noiseT = this.sprint ? 0.32 : this.crouch ? 0.55 : 0.42;
        w.addSound(this.x, this.y, this.noiseRadius, this.sprint ? 1.4 : 1);
        if (this.sprint) sfx.stepLoud(); else sfx.step();
      }
    }
    this.updateRock(dt);
  }

  updateRock(dt) {
    if (!this.rock) return;
    this.rock.t += dt * 2.2;
    if (this.rock.t >= 1) {
      const { tx, ty } = this.rock;
      this.world.addSound(tx, ty, 155, 1.6);
      sfx.rockLand();
      this.world.toast("Rock clatters — a guard turns to look");
      this.rock = null;
    }
  }

  throwRock() {
    if (this.rocks <= 0 || this.rock || this.hidden) return false;
    this.rocks--;
    const range = 170;
    this.rock = { x: this.x, y: this.y, tx: this.x + Math.cos(this.angle) * range, ty: this.y + Math.sin(this.angle) * range, t: 0 };
    sfx.throwRock();
    return true;
  }

  nearestInteract() {
    const w = this.world;
    const cands = [];
    for (const k of w.ents.keycards) if (!k.taken) cands.push({ kind: "keycard", x: k.x, y: k.y, ref: k });
    for (const it of w.ents.intel) if (!it.taken) cands.push({ kind: "intel", x: it.x, y: it.y, ref: it });
    for (const d of w.ents.data) if (!d.taken) cands.push({ kind: "data", x: d.x, y: d.y, ref: d });
    for (const t of w.ents.terminals) if (!t.hacked) cands.push({ kind: "terminal", x: t.x, y: t.y, ref: t });
    for (const l of w.ents.lockers) cands.push({ kind: "locker", x: l.x, y: l.y, ref: l });
    if (w.ents.informant && !w.ents.informant.rescued) cands.push({ kind: "informant", x: w.ents.informant.x, y: w.ents.informant.y, ref: w.ents.informant });
    // Doors: find adjacent door cell.
    const tx = Math.floor(this.x / TILE), ty = Math.floor(this.y / TILE);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const gx = tx + dx, gy = ty + dy;
      if (gy < 0 || gy >= w.grid.length || gx < 0 || gx >= w.grid[0].length) continue;
      const c = w.grid[gy][gx];
      if (c === 3 || c === 4) cands.push({ kind: c === 3 ? "doorLocked" : "door", x: gx * TILE + TILE / 2, y: gy * TILE + TILE / 2, ref: { gx, gy } });
    }
    cands.push({ kind: "exit", x: w.ents.exit.x * TILE + TILE / 2, y: w.ents.exit.y * TILE + TILE / 2, ref: w.ents.exit });
    let best = null, bd = 46;
    for (const c of cands) {
      const d = dist(this.x, this.y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  interact() {
    const w = this.world;
    if (this.hidden) {
      this.hidden = false;
      this.hideLocker = null;
      w.toast("You slip out of the locker");
      return true;
    }
    const it = this.nearestInteract();
    if (!it) return false;
    switch (it.kind) {
      case "keycard":
        it.ref.taken = true; this.hasKeycard = true;
        sfx.pickup(); w.toast("Keycard acquired — locked doors can now be opened");
        w.onObjective("keycard"); return true;
      case "intel":
        it.ref.taken = true; w.intelCollected++;
        sfx.pickup(); w.toast("Intel file collected (" + w.intelCollected + ")");
        w.onObjective("intel"); return true;
      case "data":
        it.ref.taken = true; sfx.pickup();
        w.toast("Classified data stolen");
        w.onObjective("data"); return true;
      case "terminal":
        it.ref.hacked = true;
        w.securityDisabled = true;
        sfx.hack(); w.toast("Security terminal hacked — cameras and lasers OFFLINE");
        w.onObjective("hack"); return true;
      case "locker":
        this.hidden = true; this.hideLocker = it.ref;
        this.x = it.ref.x; this.y = it.ref.y;
        sfx.door(); w.toast("Hidden in the locker — press E to slip out");
        return true;
      case "informant":
        it.ref.rescued = true; sfx.pickup();
        w.toast("Informant rescued — get to the exit!");
        w.onObjective("rescue"); return true;
      case "doorLocked":
        if (this.hasKeycard) {
          w.grid[it.ref.gy][it.ref.gx] = 0;
          sfx.door(); w.toast("Locked door opened with the keycard");
          w.addSound(this.x, this.y, 70, 1);
          return true;
        }
        sfx.locked(); w.toast("Locked — you need a keycard");
        return true;
      case "door": {
        w.grid[it.ref.gy][it.ref.gx] = 0;
        sfx.door(); w.addSound(this.x, this.y, 70, 1);
        w.toast("Door opened");
        return true;
      }
      case "exit":
        return w.tryExit();
      default:
        return false;
    }
  }
}
