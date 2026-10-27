import "./style.css";
import { installTerminalLogger } from "./core/TerminalLogger.js";
import { Game } from "./core/Game.js";
installTerminalLogger();
try {
  const game = new Game({ container: document.getElementById("app") });
  game.init();
  game.tick();
} catch (error) {
  console.error("[Game:startup-error]", error);
  document.getElementById("corner-cue").textContent =
    "Graphics could not start. Check the terminal for details.";
}
