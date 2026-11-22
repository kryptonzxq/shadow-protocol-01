// SHADOW PROTOCOL boot: create the game, apply a deterministic ?shot= scene if asked.
import { Game } from "./game.js";
import { applyShot } from "./shots.js";

const game = new Game(document.getElementById("game"), document.getElementById("minimap"));
const params = new URLSearchParams(window.location.search);
const shot = params.get("shot");
game.start();
if (shot) {
  applyShot(game, shot);
  document.getElementById("hint").textContent = "SHADOW PROTOCOL — screenshot scene: " + shot;
}
window.__game = game;
