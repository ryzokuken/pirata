import townJson from "@pirata/content/packs/base/maps/port_town.map.json";
import {
  advance,
  createGameState,
  deserialize,
  parseTiledMap,
  SaveError,
  serialize,
  type Direction,
  type GameState,
  type Intent,
  type MapModel,
  type WorldDef,
} from "@pirata/core";
import { GameObjects, Input, Scene } from "phaser";

const TILE = 32;
const MOVE_COOLDOWN_MS = 140;
const SAVE_KEY = "pirata-save";
const TILE_COLORS = [0x8a795d, 0x4d4338, 0x1d3f6e];

export class WorldScene extends Scene {
  private map!: MapModel;
  private tempWorld!: WorldDef;
  private state!: GameState;
  private playerSprite!: GameObjects.Rectangle;
  private keys!: ReadonlyArray<readonly [Direction, Input.Keyboard.Key]>;
  private lastMoveAt = 0;

  constructor() {
    super("world");
  }

  preload(): void {
    this.load.tilemapTiledJSON("port_town", townJson as unknown as object);
  }

  create(): void {
    this.map = parseTiledMap("port_town", townJson);
    // Temporary M2 scaffolding: an empty world until Task 15 loads the base pack.
    this.tempWorld = { map: this.map, factions: {}, npcs: {}, dialogues: {}, deeds: {} };
    this.state = this.loadOrCreateState();

    this.createPlaceholderTileset();
    const tilemap = this.make.tilemap({ key: "port_town" });
    const tileset = tilemap.addTilesetImage("placeholder", "placeholder");
    if (tileset === null) {
      throw new Error("failed to attach placeholder tileset to tilemap");
    }
    tilemap.createLayer("ground", tileset);
    tilemap.createLayer("walls", tileset);

    const { x, y } = this.state.player.pos;
    this.playerSprite = this.add.rectangle(
      x * TILE + TILE / 2,
      y * TILE + TILE / 2,
      TILE - 8,
      TILE - 4,
      0xd9a441,
    );

    this.setUpKeys();
    this.setUpPersistence();
    this.exposeDebugHook();
  }

  override update(time: number): void {
    if (time - this.lastMoveAt < MOVE_COOLDOWN_MS) {
      return;
    }
    for (const [direction, key] of this.keys) {
      if (key.isDown) {
        this.apply({ type: "move", direction });
        this.lastMoveAt = time;
        return;
      }
    }
  }

  private apply(intent: Intent): void {
    const result = advance(this.state, intent, this.map);
    this.state = result.state;
    for (const event of result.events) {
      if (event.type === "player-moved") {
        this.tweens.add({
          targets: this.playerSprite,
          x: event.to.x * TILE + TILE / 2,
          y: event.to.y * TILE + TILE / 2,
          duration: 110,
        });
      }
    }
  }

  private createPlaceholderTileset(): void {
    const graphics = this.add.graphics();
    TILE_COLORS.forEach((color, index) => {
      graphics.fillStyle(color, 1);
      graphics.fillRect(index * TILE, 0, TILE, TILE);
    });
    graphics.generateTexture("placeholder", TILE * TILE_COLORS.length, TILE);
    graphics.destroy();
  }

  private loadOrCreateState(): GameState {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved !== null) {
      try {
        return deserialize(saved);
      } catch (error) {
        if (error instanceof SaveError) {
          console.warn(`ignoring saved game: ${error.message}`);
        } else {
          throw error;
        }
      }
    }
    return createGameState({ seed: Date.now() >>> 0, world: this.tempWorld });
  }

  private setUpKeys(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) {
      throw new Error("keyboard input is unavailable");
    }
    this.keys = [
      ["north", keyboard.addKey(Input.Keyboard.KeyCodes.UP)],
      ["north", keyboard.addKey(Input.Keyboard.KeyCodes.W)],
      ["south", keyboard.addKey(Input.Keyboard.KeyCodes.DOWN)],
      ["south", keyboard.addKey(Input.Keyboard.KeyCodes.S)],
      ["west", keyboard.addKey(Input.Keyboard.KeyCodes.LEFT)],
      ["west", keyboard.addKey(Input.Keyboard.KeyCodes.A)],
      ["east", keyboard.addKey(Input.Keyboard.KeyCodes.RIGHT)],
      ["east", keyboard.addKey(Input.Keyboard.KeyCodes.D)],
    ];
  }

  private setUpPersistence(): void {
    window.addEventListener("beforeunload", () => {
      localStorage.setItem(SAVE_KEY, serialize(this.state));
    });
  }

  private exposeDebugHook(): void {
    // eslint-disable-next-line no-underscore-dangle -- __pirata is the documented Window debug-hook name (global.d.ts)
    window.__pirata = {
      getState: () => this.state,
      dispatch: (intent) => {
        this.apply(intent);
      },
    };
  }
}
