// Level definitions: ASCII maps (30x20, tile 32px) + guard patrols, cameras, lasers, objectives.
// Parser normalizes ragged rows and treats out-of-bounds as wall, so maps are robust.
export const TILE = 32;
export const MAP_W = 30;
export const MAP_H = 20;

const L1 = [
"##############################",
"#P....#........#.......#...I..#",
"#.....#...K....#...*...#......#",
"#.....d........D.......D......#",
"#.....#........#.......#......#",
"#..H..#....G...#...G...#......#",
"#.....#........#.......#......#",
"#.....#........#.......#......#",
"###.######.########.######.####",
"#............................#",
"#..C.....#........H.....#.....#",
"#........#...............#..X.#",
"#........#...............#....#",
"#.T......#....G..........#....#",
"#........#...............#....#",
"#........#...............#....#",
"#............................#",
"#.....,,,,...................#",
"#.....,,,,...................#",
"##############################",
];

const L2 = [
"##############################",
"#P......#....K.....#....I....#",
"#.......#....G.....#.........#",
"#...H...#..........#.........#",
"#.......d.....T....D....*....#",
"#.......#..........#.........#",
"#..C....#....G.....#....G....#",
"#.......#..........#.........#",
"#.......#..........#.........#",
"#..........................#",
"####.##########.########.####",
"#..........................#",
"#....I.....#......#.....X...#",
"#..........#......#.........#",
"#....G.....#..H...#....C....#",
"#..........#......#.........#",
"#..........#......#.........#",
"#.....,,,,,................#",
"#.....,,,,,................#",
"##############################",
];

const L3 = [
"##############################",
"#P....#......#.......#....R...#",
"#.....#..G...#...G...#........#",
"#..H..d......D.......D....I...#",
"#.....#..K...#.......#........#",
"#.....#..C...#...*...#....G...#",
"#.....#......#.......#........#",
"##.#####.######.#######.#######",
"#............................#",
"#....G......#......C......X...#",
"#...........#...............#",
"#....I......#......H........#",
"#...........#...............#",
"#..T........#......G........#",
"#...........#...............#",
"#.....,,,,..................#",
"#.....,,,,..................#",
"##############################",
"##############################",
"##############################",
];

function parseMap(rows) {
  const grid = [];
  const ents = {
    playerSpawn: { x: 1, y: 1 }, exit: { x: 28, y: 10 }, keycards: [], intel: [],
    data: [], terminals: [], lockers: [], cameras: [], guards: [], informant: null, shadows: [],
  };
  for (let y = 0; y < MAP_H; y++) {
    const row = (rows[y] || "").padEnd(MAP_W, "#").slice(0, MAP_W);
    const grow = [];
    for (let x = 0; x < MAP_W; x++) {
      const c = row[x];
      let cell = 0;
      if (c === "#") cell = 1;
      else if (c === ",") cell = 2;
      else if (c === "D") cell = 3;
      else if (c === "d") cell = 4;
      else cell = 0;
      grow.push(cell);
      const px = x * TILE + TILE / 2, py = y * TILE + TILE / 2;
      if (c === "P") ents.playerSpawn = { x, y };
      else if (c === "X") ents.exit = { x, y };
      else if (c === "K") ents.keycards.push({ x: px, y: py, taken: false });
      else if (c === "I") ents.intel.push({ x: px, y: py, taken: false });
      else if (c === "*") ents.data.push({ x: px, y: py, taken: false });
      else if (c === "T") ents.terminals.push({ x: px, y: py, hacked: false });
      else if (c === "H") ents.lockers.push({ x: px, y: py });
      else if (c === "C") ents.cameras.push({ x: px, y: py });
      else if (c === "G") ents.guards.push({ x, y });
      else if (c === "R") ents.informant = { x: px, y: py, rescued: false };
      else if (c === ",") ents.shadows.push({ x, y });
    }
    grid.push(grow);
  }
  return { grid, ents };
}

export const LEVELS = [
  {
    id: 0, name: "LEVEL 1 — RESEARCH FACILITY",
    briefing: "Tutorial infiltration. Steal the research data, grab the keycard, slip out the exit.",
    map: L1,
    guardDefs: [
      { spawn: 0, route: [[11, 5], [11, 2], [13, 2], [13, 5]], pause: 1.4, speed: 52, vision: 225, half: 0.62 },
      { spawn: 1, route: [[19, 5], [19, 2], [21, 2], [21, 5]], pause: 1.4, speed: 52, vision: 225, half: 0.62 },
      { spawn: 2, route: [[14, 13], [14, 10], [20, 10], [20, 13]], pause: 1.2, speed: 52, vision: 225, half: 0.62 },
    ],
    cameraDefs: [{ idx: 0, angle: 90, sweep: 70, speed: 0.55, range: 205 }],
    lasers: [],
    objectives: [
      { id: "data", text: "Steal the research data" },
      { id: "keycard", text: "Find the keycard" },
      { id: "exit", text: "Reach the exit unseen" },
    ],
    par: 150,
  },
  {
    id: 1, name: "LEVEL 2 — UNDERGROUND LAB",
    briefing: "Tighter security. Hack the terminal to kill cameras and lasers, steal the lab data, grab both intel.",
    map: L2,
    guardDefs: [
      { spawn: 0, route: [[10, 2], [10, 5], [13, 5], [13, 2]], pause: 1.2, speed: 58, vision: 235, half: 0.6 },
      { spawn: 1, route: [[14, 6], [14, 3], [17, 3], [17, 6]], pause: 1.0, speed: 58, vision: 235, half: 0.6 },
      { spawn: 2, route: [[24, 6], [24, 3], [26, 3], [26, 6]], pause: 1.2, speed: 58, vision: 235, half: 0.6 },
      { spawn: 3, route: [[8, 14], [8, 12], [12, 12], [12, 14]], pause: 1.4, speed: 56, vision: 230, half: 0.6 },
    ],
    cameraDefs: [
      { idx: 0, angle: 0, sweep: 80, speed: 0.7, range: 210 },
      { idx: 1, angle: 180, sweep: 80, speed: 0.7, range: 210 },
    ],
    lasers: [
      { x1: 1, y1: 9, x2: 28, y2: 9, period: 3.4, onFrac: 0.62 },
      { x1: 20, y1: 12, x2: 20, y2: 17, period: 2.8, onFrac: 0.55 },
    ],
    objectives: [
      { id: "hack", text: "Hack the security terminal" },
      { id: "data", text: "Steal the lab data" },
      { id: "intel", text: "Collect 2 intel files" },
      { id: "exit", text: "Reach the exit" },
    ],
    par: 210,
  },
  {
    id: 2, name: "LEVEL 3 — BLACKSITE",
    briefing: "High-risk extraction. Rescue the informant, steal the blacksite data, get out alive.",
    map: L3,
    guardDefs: [
      { spawn: 0, route: [[8, 2], [8, 5], [11, 5], [11, 2]], pause: 1.0, speed: 64, vision: 250, half: 0.58 },
      { spawn: 1, route: [[16, 2], [16, 5], [19, 5], [19, 2]], pause: 1.0, speed: 64, vision: 250, half: 0.58 },
      { spawn: 2, route: [[25, 5], [25, 2], [27, 2], [27, 5]], pause: 0.9, speed: 64, vision: 250, half: 0.58 },
      { spawn: 3, route: [[5, 9], [5, 13], [9, 13], [9, 9]], pause: 1.0, speed: 62, vision: 245, half: 0.58 },
      { spawn: 4, route: [[20, 13], [20, 10], [24, 10], [24, 13]], pause: 1.0, speed: 62, vision: 245, half: 0.58 },
    ],
    cameraDefs: [
      { idx: 0, angle: 45, sweep: 90, speed: 0.85, range: 220 },
      { idx: 1, angle: 225, sweep: 90, speed: 0.85, range: 220 },
    ],
    lasers: [
      { x1: 1, y1: 8, x2: 28, y2: 8, period: 3.0, onFrac: 0.6 },
      { x1: 15, y1: 10, x2: 15, y2: 16, period: 2.6, onFrac: 0.5 },
    ],
    objectives: [
      { id: "rescue", text: "Rescue the informant" },
      { id: "data", text: "Steal the blacksite data" },
      { id: "exit", text: "Reach the exit" },
    ],
    par: 240,
  },
];

export function loadLevel(id) {
  const def = LEVELS[id];
  const { grid, ents } = parseMap(def.map);
  return { def, grid, ents };
}
