# SHADOW PROTOCOL

[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/kryptonzxq/shadow-protocol-01/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/kryptonzxq/shadow-protocol-01/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

An original top-down 2D stealth action game for the [make.fun Best Stealth Game bounty](https://make.fun/bounty/best-stealth-game-20261121-1759).

You are an elite infiltrator sent into a heavily guarded secret facility. Steal classified data, disable security systems, rescue an informant, and escape without triggering an alarm.

## How to play

- **WASD / Arrows** — move
- **Shift** — sprint (fast and loud, drains stamina)
- **C** — crouch (slow, quiet, harder to see)
- **E** — interact / pick up / hack / hide in lockers / open doors
- **Q** — throw a rock to distract guards
- **P / Esc** — pause · **M** — mute

Stay out of vision cones. Walls block sight. Shadows and crouching make you harder to spot. Lockers hide you completely. Hack terminals to kill cameras and lasers. A raised alarm brings every guard to you.

## Features

- **Enemy AI finite state machine** — PATROL, IDLE, SUSPICIOUS, INVESTIGATE, ALERT, CHASE, ATTACK, SEARCH, RETURN, all driven by real perception
- **Detection system** — vision cones with line-of-sight raycasting, suspicion 0–100 with thresholds (Unaware / Suspicious / Investigating / Alert / Detected), modifiers for distance, crouching, movement, darkness
- **Hearing** — footsteps, sprinting, thrown rocks, and doors create sound events guards investigate
- **Stealth mechanics** — hiding spots (lockers, shadows), distraction throws, doors, keycards, hackable terminals, rotating security cameras, blinking laser barriers, alarms and reinforcements
- **3 levels** — Research Facility (tutorial), Underground Lab (lasers + hacking), Blacksite (rescue + high-risk extraction), each with multiple paths, cover, hiding spots, and collectible intel
- **Progression** — level select with unlocks, localStorage saves, mission success/failure screens, restart
- **Scoring** — stealth performance, time, objectives, intel, alarms, damage; final rank S Ghost / A Silent Operator / B Professional / C Detected / D Failed Stealth
- **Presentation** — atmospheric dark facility, dynamic vision cones, detection warnings, minimap, synthesized Web Audio sounds, no libraries, fully offline

## Run it

```bash
node serve.ts
# open http://localhost:8080
```

Deterministic screenshot scenes: `?shot=cover`, `?shot=chase`, `?shot=lab`, `?shot=results`.

## Tech

Vanilla JavaScript + HTML5 Canvas, ES modules, no external dependencies, no network requests. `main.ts` (Node 22, standard library only) copies `game/` and `screenshots/` to `/output` and writes `dossier.json`.

## License

MIT — see [LICENSE](LICENSE).
