import { installTerminalLogger } from './core/TerminalLogger.js';
import { Game } from './core/Game.js';

installTerminalLogger();

const game = new Game({
  container: document.getElementById('app'),
  hud: {
    speed: document.getElementById('speed'),
    gear: document.getElementById('gear'),
    rev: document.getElementById('rev'),
    revLights: Array.from(document.querySelectorAll('#revLights .rev-light')),
    shiftCue: document.getElementById('shiftCue'),
    gforce: document.getElementById('gforce'),
    lap: document.getElementById('lap'),
    mapDot: document.getElementById('mapDot'),
    tune: {
      brakeBias: document.getElementById('tuneBrakeBias'),
      wtLong: document.getElementById('tuneWtLong'),
      wtLat: document.getElementById('tuneWtLat'),
      rearDrop: document.getElementById('tuneRearDrop'),
      valBrakeBias: document.getElementById('valBrakeBias'),
      valWtLong: document.getElementById('valWtLong'),
      valWtLat: document.getElementById('valWtLat'),
      valRearDrop: document.getElementById('valRearDrop'),
    },
  },
});

game.init();
game.tick();
