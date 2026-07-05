import { AUTO, Game, Scale } from "phaser";
import { WorldScene } from "./world-scene.ts";

export const game = new Game({
  type: AUTO,
  parent: "game",
  width: 768,
  height: 512,
  backgroundColor: "#101418",
  pixelArt: true,
  scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
  scene: [WorldScene],
});
