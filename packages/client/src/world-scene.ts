import { loadBaseWorld } from "@pirata/content";
import townJson from "@pirata/content/packs/base/maps/port_town.map.json";
import {
  advance,
  createGameState,
  deserialize,
  SaveError,
  serialize,
  type DeedRecordedEvent,
  type Direction,
  type GameEvent,
  type GameState,
  type Intent,
  type WorldDef,
} from "@pirata/core";
import { GameObjects, Input, Scene } from "phaser";
import { renderClock, renderDialogue, renderReputation, showToast } from "./ui.ts";

const TILE = 32;
const MOVE_COOLDOWN_MS = 140;
const SAVE_KEY = "pirata-save";
const TILE_COLORS = [0x8a795d, 0x4d4338, 0x1d3f6e];
const FACTION_COLORS: Readonly<Record<string, number>> = {
  "base:merchants_guild": 0x7fb069,
  "base:dockworkers": 0x5b8dbe,
};
const CHOICE_KEYS = ["ONE", "TWO", "THREE", "FOUR", "FIVE"] as const;

function move(direction: Direction): Intent {
  return { type: "move", direction };
}

export class WorldScene extends Scene {
  private world!: WorldDef;
  private state!: GameState;
  private playerSprite!: GameObjects.Rectangle;
  private npcSprites = new Map<string, GameObjects.Container>();
  private polledKeys!: ReadonlyArray<readonly [Intent, Input.Keyboard.Key]>;
  private lastMoveAt = 0;

  constructor() {
    super("world");
  }

  preload(): void {
    this.load.tilemapTiledJSON("port_town", townJson as unknown as object);
  }

  create(): void {
    this.world = loadBaseWorld();
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
    this.createNpcSprites();

    this.setUpKeys();
    this.setUpPersistence();
    this.exposeDebugHook();
    this.renderUi();
  }

  override update(time: number): void {
    if (this.state.dialogue !== null) {
      return;
    }
    if (time - this.lastMoveAt < MOVE_COOLDOWN_MS) {
      return;
    }
    for (const [intent, key] of this.polledKeys) {
      if (key.isDown) {
        this.apply(intent);
        this.lastMoveAt = time;
        return;
      }
    }
  }

  private apply(intent: Intent): void {
    const result = advance(this.state, intent, this.world);
    this.state = result.state;
    for (const event of result.events) {
      this.renderEvent(event);
    }
    this.renderUi();
  }

  private renderEvent(event: GameEvent): void {
    switch (event.type) {
      case "player-moved":
        this.tweens.add({
          targets: this.playerSprite,
          x: event.to.x * TILE + TILE / 2,
          y: event.to.y * TILE + TILE / 2,
          duration: 110,
        });
        break;
      case "npc-moved": {
        const sprite = this.npcSprites.get(event.npcId);
        if (sprite !== undefined) {
          this.tweens.add({
            targets: sprite,
            x: event.to.x * TILE + TILE / 2,
            y: event.to.y * TILE + TILE / 2,
            duration: 110,
          });
        }
        break;
      }
      case "deed-recorded":
        this.floatDeedText(event);
        break;
      case "intent-rejected":
        showToast(event.reason);
        break;
      case "movement-blocked":
      case "dialogue-started":
      case "dialogue-advanced":
      case "dialogue-ended":
      case "reputation-changed":
        break; // reflected by renderUi()
    }
  }

  private renderUi(): void {
    renderClock(this.state);
    renderReputation(this.state, this.world);
    renderDialogue(this.state, this.world, (index) => {
      this.apply({ type: "choose", index });
    });
  }

  private floatDeedText(event: DeedRecordedEvent): void {
    const deed = this.world.deeds[event.deedId];
    const npc = this.world.npcs[event.npcId];
    if (deed === undefined || npc === undefined) {
      return;
    }
    const gain = deed.standingDelta >= 0;
    const label = this.add
      .text(
        this.playerSprite.x,
        this.playerSprite.y - 20,
        `${gain ? "+" : ""}${String(deed.standingDelta)} ${npc.name}`,
        { fontSize: "12px", color: gain ? "#9fdf7f" : "#e07a5f" },
      )
      .setOrigin(0.5, 1);
    this.tweens.add({
      targets: label,
      y: label.y - 18,
      alpha: 0,
      duration: 900,
      onComplete: () => {
        label.destroy();
      },
    });
  }

  private createNpcSprites(): void {
    for (const npc of this.state.npcs) {
      const def = this.world.npcs[npc.id];
      if (def === undefined) {
        continue;
      }
      const body = this.add.rectangle(
        0,
        0,
        TILE - 10,
        TILE - 6,
        FACTION_COLORS[def.factionId] ?? 0xcccccc,
      );
      const label = this.add
        .text(0, -TILE / 2, def.name, { fontSize: "10px", color: "#e8e0c9" })
        .setOrigin(0.5, 1);
      const container = this.add.container(
        npc.pos.x * TILE + TILE / 2,
        npc.pos.y * TILE + TILE / 2,
        [body, label],
      );
      this.npcSprites.set(npc.id, container);
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
    return createGameState({ seed: Date.now() >>> 0, world: this.world });
  }

  private setUpKeys(): void {
    const keyboard = this.input.keyboard;
    if (keyboard === null) {
      throw new Error("keyboard input is unavailable");
    }
    this.polledKeys = [
      [move("north"), keyboard.addKey(Input.Keyboard.KeyCodes.UP)],
      [move("north"), keyboard.addKey(Input.Keyboard.KeyCodes.W)],
      [move("south"), keyboard.addKey(Input.Keyboard.KeyCodes.DOWN)],
      [move("south"), keyboard.addKey(Input.Keyboard.KeyCodes.S)],
      [move("west"), keyboard.addKey(Input.Keyboard.KeyCodes.LEFT)],
      [move("west"), keyboard.addKey(Input.Keyboard.KeyCodes.A)],
      [move("east"), keyboard.addKey(Input.Keyboard.KeyCodes.RIGHT)],
      [move("east"), keyboard.addKey(Input.Keyboard.KeyCodes.D)],
      [{ type: "wait" }, keyboard.addKey(Input.Keyboard.KeyCodes.SPACE)],
    ];
    keyboard.on("keydown-E", () => {
      this.apply({ type: "talk" });
    });
    CHOICE_KEYS.forEach((name, index) => {
      keyboard.on(`keydown-${name}`, () => {
        if (this.state.dialogue !== null) {
          this.apply({ type: "choose", index });
        }
      });
    });
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
