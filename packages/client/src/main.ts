import { AUTO, Game, Scale } from "phaser";
import { WorldScene } from "./world-scene.ts";

// Render the backing canvas at device resolution (the camera zooms to match in
// WorldScene), so hiDPI screens get native-density pixels instead of an
// upscaled 768x512 buffer — this is what keeps text labels crisp.
const dpr = window.devicePixelRatio || 1;

export const game = new Game({
  type: AUTO,
  parent: "game",
  width: 768 * dpr,
  height: 512 * dpr,
  backgroundColor: "#101418",
  pixelArt: true,
  scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH, autoRound: true },
  scene: [WorldScene],
});
