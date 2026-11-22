// Detection helpers: line-of-sight, vision cones, hearing. Pure functions, no game state.
import { TILE } from "./levels.js";

export function cellAt(grid, tx, ty) {
  if (ty < 0 || ty >= grid.length || tx < 0 || tx >= grid[0].length) return 1;
  return grid[ty][tx];
}
export function isBlocking(grid, tx, ty) {
  const c = cellAt(grid, tx, ty);
  return c === 1 || c === 3 || c === 4; // wall, locked door, closed door
}
export function isWallCell(grid, tx, ty) { return cellAt(grid, tx, ty) === 1; }

// Sampled line-of-sight: walls and closed/locked doors block sight.
export function hasLOS(grid, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 6));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isBlocking(grid, Math.floor((x0 + dx * t) / TILE), Math.floor((y0 + dy * t) / TILE))) return false;
  }
  return true;
}
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
// Returns 0 when outside the cone/range, else 1 (close) .. ~0 (edge).
export function inCone(ox, oy, angle, half, range, px, py) {
  const dx = px - ox, dy = py - oy;
  const d = Math.hypot(dx, dy);
  if (d > range) return 0;
  if (Math.abs(angleDiff(Math.atan2(dy, dx), angle)) > half) return 0;
  return 1 - (d / range) * 0.65;
}
// Vision-cone polygon clipped by walls (for rendering).
export function conePolygon(grid, ox, oy, angle, half, range, rays = 18) {
  const pts = [{ x: ox, y: oy }];
  for (let i = 0; i <= rays; i++) {
    const a = angle - half + (2 * half * i) / rays;
    let d = range;
    for (let r = 8; r <= range; r += 8) {
      const x = ox + Math.cos(a) * r, y = oy + Math.sin(a) * r;
      if (isBlocking(grid, Math.floor(x / TILE), Math.floor(y / TILE))) { d = r; break; }
    }
    pts.push({ x: ox + Math.cos(a) * d, y: oy + Math.sin(a) * d });
  }
  return pts;
}
export function pointSegDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}
export function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
