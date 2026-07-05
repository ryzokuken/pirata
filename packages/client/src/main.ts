import { AUTO, Game, Scale, Scene } from "phaser";

class BootScene extends Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    this.add.text(384, 256, "Pirata — M0", { color: "#d9a441", fontSize: "32px" }).setOrigin(0.5);
  }
}

export const game = new Game({
  type: AUTO,
  parent: "game",
  width: 768,
  height: 512,
  backgroundColor: "#101418",
  pixelArt: true,
  scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_BOTH },
  scene: [BootScene],
});
