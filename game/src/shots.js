// Deterministic screenshot scenes: ?shot=cover | chase | lab | results
// Each sets up a frozen, fully-rendered game state for capture.
export function applyShot(game, name) {
  const known = ["cover", "chase", "lab", "results"];
  game.setupShot(known.includes(name) ? name : "cover");
}
