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
  type MapModel,
  type WorldDef,
} from "@pirata/core";
import { GameObjects, Input, Scene } from "phaser";
import {
  renderClock,
  renderDialogue,
  renderInventory,
  renderReputation,
  renderTrade,
  showToast,
} from "./ui.ts";

const TILE = 32;
const MOVE_COOLDOWN_MS = 140;
const SAVE_KEY = "pirata-save";
const TILE_COLORS = [0x8a795d, 0x4d4338, 0x1d3f6e];
const FACTION_COLORS: Readonly<Record<string, number>> = {
  "base:merchants_guild": 0x7fb069,
  "base:dockworkers": 0x5b8dbe,
  "base:town_watch": 0xb1493f,
};
const CHOICE_KEYS = ["ONE", "TWO", "THREE", "FOUR", "FIVE"] as const;
const DPR = window.devicePixelRatio || 1;
const LABEL_STYLE = {
  fontFamily: "system-ui, sans-serif",
  fontSize: "11px",
  color: "#e8e0c9",
  resolution: DPR,
} as const;

function move(direction: Direction): Intent {
  return { type: "move", direction };
}

// Task 13 replaces this single-map stopgap with per-map switching on map-changed.
function startMap(world: WorldDef): MapModel {
  const map = world.maps[world.startMapId];
  if (map === undefined) {
    throw new Error(`world has no map for startMapId "${world.startMapId}"`);
  }
  return map;
}

export class WorldScene extends Scene {
  private world!: WorldDef;
  private state!: GameState;
  private playerSprite!: GameObjects.Rectangle;
  private npcSprites = new Map<string, GameObjects.Container>();
  private itemSprites: GameObjects.Arc[] = [];
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

    // Match the device-resolution canvas set up in main.ts: world coordinates
    // stay 768x512, the camera renders them at native pixel density.
    this.cameras.main.setZoom(DPR);

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
    this.playerSprite.setAlpha(this.state.player.sneaking ? 0.5 : 1);

    // The map now exceeds the 768x512 viewport, so clamp the camera to the
    // map bounds and have it track the player instead of centering statically.
    const map = startMap(this.world);
    this.cameras.main.setBounds(0, 0, map.width * TILE, map.height * TILE);
    this.cameras.main.startFollow(this.playerSprite, true, 0.15, 0.15);

    this.createNpcSprites();
    this.renderWorldItems();

    this.setUpKeys();
    this.setUpPersistence();
    this.exposeDebugHook();
    document.querySelector("#trade-close")?.addEventListener("click", () => {
      this.apply({ type: "close-trade" });
    });
    this.renderUi();
  }

  override update(time: number): void {
    if (this.state.dialogue !== null || this.state.trade !== null) {
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
      case "sneak-toggled":
        this.playerSprite.setAlpha(event.sneaking ? 0.5 : 1);
        showToast(event.sneaking ? "You move quietly." : "You straighten up.");
        break;
      case "item-taken":
        this.renderWorldItems();
        this.floatText(`+ ${this.world.items[event.itemId]?.name ?? event.itemId}`, "#9fdf7f");
        break;
      case "crime-witnessed": {
        const names = event.witnessIds.map((id) => this.world.npcs[id]?.name ?? id).join(", ");
        showToast(`${names} saw that!`);
        break;
      }
      case "pickpocket-succeeded":
        this.floatText(`+ ${this.world.items[event.itemId]?.name ?? event.itemId}`, "#9fdf7f");
        break;
      case "pickpocket-failed":
        showToast(`${this.world.npcs[event.npcId]?.name ?? event.npcId} catches your hand!`);
        break;
      case "gossip-shared": {
        const to = this.npcSprites.get(event.toNpcId);
        if (to !== undefined) {
          this.floatTextAt(to.x, to.y - 24, "psst…", "#8a93a3");
        }
        break;
      }
      case "item-bought":
        this.floatText(`-${String(event.price)}c`, "#e07a5f");
        break;
      case "item-sold":
        this.floatText(`+${String(event.price)}c`, "#9fdf7f");
        break;
      case "coin-paid":
        this.floatText(`-${String(event.amount)}c`, "#e07a5f");
        break;
      case "movement-blocked":
      case "map-changed":
      case "dialogue-started":
      case "dialogue-advanced":
      case "dialogue-ended":
      case "reputation-changed":
      case "trade-started":
      case "trade-ended":
      case "rumor-heard":
      case "ate-food":
      case "hunger-changed":
      case "npc-alerted":
      case "npc-calmed":
      case "combat-started":
      case "attack-hit":
      case "attack-missed":
      case "npc-died":
      case "combat-ended":
      case "player-defeated":
        break; // reflected by renderUi()
    }
  }

  private renderUi(): void {
    renderClock(this.state);
    renderReputation(this.state, this.world);
    renderInventory(this.state, this.world);
    renderDialogue(this.state, this.world, (index) => {
      this.apply({ type: "choose", index });
    });
    renderTrade(this.state, this.world, {
      onBuy: (index) => {
        this.apply({ type: "buy", index });
      },
      onSell: (index) => {
        this.apply({ type: "sell", index });
      },
    });
  }

  private floatDeedText(event: DeedRecordedEvent): void {
    const deed = this.world.deeds[event.deedId];
    const npc = this.world.npcs[event.npcId];
    if (deed === undefined || npc === undefined) {
      return;
    }
    const gain = deed.standingDelta >= 0;
    this.floatText(
      `${gain ? "+" : ""}${String(deed.standingDelta)} ${npc.name}`,
      gain ? "#9fdf7f" : "#e07a5f",
    );
  }

  private floatText(text: string, color: string): void {
    this.floatTextAt(this.playerSprite.x, this.playerSprite.y - 20, text, color);
  }

  private floatTextAt(x: number, y: number, text: string, color: string): void {
    const label = this.add
      .text(x, y, text, { ...LABEL_STYLE, fontSize: "12px", color })
      .setStroke("#101418", 3)
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
        .text(0, -TILE / 2, def.name, LABEL_STYLE)
        .setStroke("#101418", 3)
        .setOrigin(0.5, 1);
      const container = this.add.container(
        npc.pos.x * TILE + TILE / 2,
        npc.pos.y * TILE + TILE / 2,
        [body, label],
      );
      this.npcSprites.set(npc.id, container);
    }
  }

  private renderWorldItems(): void {
    for (const sprite of this.itemSprites) {
      sprite.destroy();
    }
    this.itemSprites = this.state.worldItems.map((item) =>
      this.add.circle(item.pos.x * TILE + TILE / 2, item.pos.y * TILE + TILE / 2, 6, 0xd9a441),
    );
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
    keyboard.on("keydown-C", () => {
      this.apply({ type: "sneak" });
    });
    keyboard.on("keydown-G", () => {
      this.apply({ type: "take" });
    });
    keyboard.on("keydown-P", () => {
      this.apply({ type: "pickpocket" });
    });
    keyboard.on("keydown-T", () => {
      this.apply({ type: "trade" });
    });
    keyboard.on("keydown-ESC", () => {
      if (this.state.trade !== null) {
        this.apply({ type: "close-trade" });
      }
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
