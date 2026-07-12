import { loadBaseWorld } from "@pirata/content";
import coveJson from "@pirata/content/packs/base/maps/smugglers_cove.map.json";
import townJson from "@pirata/content/packs/base/maps/port_town.map.json";
import {
  advance,
  createGameState,
  currentMap,
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
  hideDefeatBanner,
  renderClock,
  renderCombat,
  renderDialogue,
  renderInventory,
  renderJournal,
  renderReputation,
  renderStatus,
  renderTrade,
  showDefeatBanner,
  showFortuneBanner,
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

/** `smugglers_cove` -> `Smugglers Cove`. Presentation-only; the map id itself stays a rule concern. */
function prettifyMapId(mapId: string): string {
  return mapId
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Data threaded through `scene.restart()` so the in-memory state survives the reload. */
interface WorldSceneData {
  readonly state?: GameState;
}

export class WorldScene extends Scene {
  private world!: WorldDef;
  private state!: GameState;
  private pendingState: GameState | undefined;
  private playerSprite!: GameObjects.Rectangle;
  private npcSprites = new Map<string, GameObjects.Container>();
  private itemSprites: GameObjects.Arc[] = [];
  private polledKeys!: ReadonlyArray<readonly [Intent, Input.Keyboard.Key]>;
  private lastMoveAt = 0;
  private defeated = false;

  constructor() {
    super("world");
  }

  init(data: WorldSceneData = {}): void {
    this.pendingState = data.state;
  }

  preload(): void {
    if (!this.cache.tilemap.exists("port_town")) {
      this.load.tilemapTiledJSON("port_town", townJson as unknown as object);
    }
    if (!this.cache.tilemap.exists("smugglers_cove")) {
      this.load.tilemapTiledJSON("smugglers_cove", coveJson as unknown as object);
    }
  }

  create(): void {
    this.world = loadBaseWorld();
    // `scene.restart()` re-runs create() on this same Scene instance (Phaser
    // looks the scene up by key rather than constructing a new one), so a
    // restart triggered by map-changed/player-defeated hands the state back
    // in through init()'s data payload instead of reloading from storage.
    this.state = this.pendingState ?? this.loadOrCreateState();
    this.pendingState = undefined;
    this.npcSprites = new Map();
    this.itemSprites = [];

    // Match the device-resolution canvas set up in main.ts: world coordinates
    // stay 768x512, the camera renders them at native pixel density.
    this.cameras.main.setZoom(DPR);

    this.createPlaceholderTileset();
    const tilemap = this.make.tilemap({ key: this.state.mapId });
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
    const map = currentMap(this.state, this.world);
    this.cameras.main.setBounds(0, 0, map.width * TILE, map.height * TILE);
    this.cameras.main.startFollow(this.playerSprite, true, 0.15, 0.15);

    this.createNpcSprites();
    this.renderWorldItems();
    this.renderPortalMarkers(map);

    this.setUpKeys();
    this.setUpPersistence();
    this.exposeDebugHook();
    document.querySelector("#trade-close")?.addEventListener("click", () => {
      this.apply({ type: "close-trade" });
    });
    this.renderUi();
  }

  override update(time: number): void {
    if (this.state.dialogue !== null || this.state.trade !== null || this.defeated) {
      return;
    }
    if (time - this.lastMoveAt < MOVE_COOLDOWN_MS) {
      return;
    }
    for (const [intent, key] of this.polledKeys) {
      if (!key.isDown) {
        continue;
      }
      if (this.state.combat !== null && intent.type !== "move") {
        continue;
      }
      this.apply(
        this.state.combat !== null && intent.type === "move"
          ? { type: "flee", direction: intent.direction }
          : intent,
      );
      this.lastMoveAt = time;
      return;
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
      case "map-changed":
        showToast(`You arrive in ${prettifyMapId(event.toMapId)}.`);
        this.scene.restart({ state: this.state } satisfies WorldSceneData);
        break;
      case "rumor-heard":
        showToast("You note it in your journal.");
        break;
      case "ate-food":
        this.floatText(`Ate ${this.world.items[event.itemId]?.name ?? event.itemId}`, "#9fdf7f");
        break;
      case "hunger-changed":
        if (event.stage !== "fed") {
          showToast(`You are growing ${event.stage}.`);
        }
        break;
      case "npc-alerted":
        showToast(`${this.world.npcs[event.npcId]?.name ?? event.npcId} spots you!`);
        break;
      case "npc-calmed":
        showToast(`${this.world.npcs[event.npcId]?.name ?? event.npcId} loses interest.`);
        break;
      case "combat-started": {
        const names = event.enemyIds.map((id) => this.world.npcs[id]?.name ?? id).join(", ");
        showToast(`Steel is drawn! ${names}`);
        break;
      }
      case "attack-hit":
        this.floatOverCombatant(event.targetId, `-${String(event.damage)}`, "#e07a5f");
        break;
      case "attack-missed":
        this.floatOverCombatant(event.targetId, "Miss!", "#8a93a3");
        break;
      case "npc-died": {
        const name = this.world.npcs[event.npcId]?.name ?? event.npcId;
        this.npcSprites.get(event.npcId)?.destroy();
        this.npcSprites.delete(event.npcId);
        showToast(`${name} falls!`);
        break;
      }
      case "combat-ended":
        showToast(event.outcome === "victory" ? "The fight is over." : "You break away.");
        break;
      case "player-defeated":
        this.defeated = true;
        showDefeatBanner();
        this.scene.restart({ state: this.state } satisfies WorldSceneData);
        break;
      case "fortune-made":
        showFortuneBanner();
        break;
      case "movement-blocked":
      case "dialogue-started":
      case "dialogue-advanced":
      case "dialogue-ended":
      case "reputation-changed":
      case "trade-started":
      case "trade-ended":
        break; // reflected by renderUi()
    }
  }

  private floatOverCombatant(id: string, text: string, color: string): void {
    if (id === "player") {
      this.floatText(text, color);
      return;
    }
    const sprite = this.npcSprites.get(id);
    if (sprite !== undefined) {
      this.floatTextAt(sprite.x, sprite.y - 24, text, color);
    }
  }

  private renderUi(): void {
    renderClock(this.state);
    renderStatus(this.state);
    renderReputation(this.state, this.world);
    renderInventory(this.state, this.world, (index) => {
      this.apply({ type: "eat", index });
    });
    renderJournal(this.state, this.world);
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
    renderCombat(this.state, this.world, (index) => {
      this.apply({ type: "attack", index });
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
      if (npc.mapId !== this.state.mapId) {
        continue;
      }
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
    this.itemSprites = this.state.worldItems
      .filter((item) => item.mapId === this.state.mapId)
      .map((item) =>
        this.add.circle(item.pos.x * TILE + TILE / 2, item.pos.y * TILE + TILE / 2, 6, 0xd9a441),
      );
  }

  /**
   * Marks each portal on the current map with a triangle on its tile and a
   * floating destination label, so exits read as exits instead of unmarked
   * street tiles. Rebuilt on every create(), so a scene restart (map change)
   * naturally re-renders the markers for the new map.
   */
  private renderPortalMarkers(map: MapModel): void {
    for (const portal of map.portals) {
      const marker = this.add.triangle(0, 0, 8, 0, 0, 16, 16, 16, 0xd9a441, 0.75);
      // The town portal sits one tile from the top edge, so an above-marker
      // label would render off the top of the map; flip it below there.
      const labelBelow = portal.at.y <= 1;
      const label = this.add
        .text(
          0,
          labelBelow ? TILE / 2 : -TILE / 2,
          `⇢ ${prettifyMapId(portal.toMapId)}`,
          LABEL_STYLE,
        )
        .setStroke("#101418", 3)
        .setOrigin(0.5, labelBelow ? 0 : 1);
      this.add.container(portal.at.x * TILE + TILE / 2, portal.at.y * TILE + TILE / 2, [
        marker,
        label,
      ]);
    }
  }

  private createPlaceholderTileset(): void {
    if (this.textures.exists("placeholder")) {
      return;
    }
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
    // "Any key" dismisses the defeat banner; a key bound to an action below
    // consumes the dismissal instead of also firing that action.
    keyboard.on("keydown", () => {
      this.consumeDefeatBanner();
    });
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
      if (!this.consumeDefeatBanner()) {
        this.apply({ type: "talk" });
      }
    });
    keyboard.on("keydown-C", () => {
      if (!this.consumeDefeatBanner()) {
        this.apply({ type: "sneak" });
      }
    });
    keyboard.on("keydown-G", () => {
      if (!this.consumeDefeatBanner()) {
        this.apply({ type: "take" });
      }
    });
    keyboard.on("keydown-P", () => {
      if (!this.consumeDefeatBanner()) {
        this.apply({ type: "pickpocket" });
      }
    });
    keyboard.on("keydown-T", () => {
      if (!this.consumeDefeatBanner()) {
        this.apply({ type: "trade" });
      }
    });
    keyboard.on("keydown-ESC", () => {
      if (!this.consumeDefeatBanner() && this.state.trade !== null) {
        this.apply({ type: "close-trade" });
      }
    });
    CHOICE_KEYS.forEach((name, index) => {
      keyboard.on(`keydown-${name}`, () => {
        if (!this.consumeDefeatBanner() && this.state.dialogue !== null) {
          this.apply({ type: "choose", index });
        }
      });
    });
  }

  private consumeDefeatBanner(): boolean {
    if (!this.defeated) {
      return false;
    }
    this.defeated = false;
    hideDefeatBanner();
    return true;
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
