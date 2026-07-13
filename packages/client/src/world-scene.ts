import { loadBaseAssets, loadBaseWorld } from "@pirata/content";
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
import { bundledPackAssets, resolvePackAssetUrl } from "./assets.ts";
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
const CHEST_FRAME = 22; // tileset frame for "chest" (gid 23 - 1); see scripts/tileset-manifest.ts
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
  private assets = loadBaseAssets();
  private pendingState: GameState | undefined;
  private playerSprite!: GameObjects.Sprite;
  private npcSprites = new Map<
    string,
    { container: GameObjects.Container; sprite: GameObjects.Sprite }
  >();
  private itemSprites: GameObjects.Image[] = [];
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
    if (!this.textures.exists("tileset")) {
      const { tileset } = this.assets;
      this.load.spritesheet("tileset", resolvePackAssetUrl(bundledPackAssets, tileset.image), {
        frameWidth: tileset.tileWidth,
        frameHeight: tileset.tileHeight,
      });
    }
    const { frame } = this.assets;
    for (const [key, character] of Object.entries(this.assets.characters)) {
      if (!this.textures.exists(key)) {
        this.load.spritesheet(key, resolvePackAssetUrl(bundledPackAssets, character.image), {
          frameWidth: frame.width,
          frameHeight: frame.height,
        });
      }
    }
  }

  private walkRow(direction: Direction): number {
    return this.assets.frame.rows[direction];
  }

  private createWalkAnimations(textureKey: string): void {
    const { walkFrames } = this.assets.frame;
    for (const direction of ["north", "west", "south", "east"] as const) {
      const key = `${textureKey}:walk:${direction}`;
      if (this.anims.exists(key)) {
        continue;
      }
      const start = this.walkRow(direction) * walkFrames;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(textureKey, {
          start: start + 1,
          end: start + walkFrames - 1,
        }),
        frameRate: 12,
        repeat: -1,
      });
    }
  }

  private idleFrame(direction: Direction): number {
    return this.walkRow(direction) * this.assets.frame.walkFrames;
  }

  private directionOf(from: { x: number; y: number }, to: { x: number; y: number }): Direction {
    if (to.x > from.x) {
      return "east";
    }
    if (to.x < from.x) {
      return "west";
    }
    if (to.y > from.y) {
      return "south";
    }
    return "north";
  }

  private spriteKeyFor(npcId: string): string {
    return this.assets.characters[npcId] !== undefined ? npcId : "player";
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

    const tilemap = this.make.tilemap({ key: this.state.mapId });
    const tileset = tilemap.addTilesetImage("lpc_base", "tileset");
    if (tileset === null) {
      throw new Error("failed to attach lpc_base tileset to tilemap");
    }
    tilemap.createLayer("ground", tileset);
    tilemap.createLayer("decor", tileset);
    tilemap.createLayer("walls", tileset);

    for (const key of Object.keys(this.assets.characters)) {
      this.createWalkAnimations(key);
    }

    const { x, y } = this.state.player.pos;
    this.playerSprite = this.add
      .sprite(x * TILE + TILE / 2, y * TILE + TILE / 2, "player", this.idleFrame("south"))
      .setOrigin(0.5, 0.75);
    this.playerSprite.setAlpha(this.state.player.sneaking ? 0.5 : 1);
    this.playerSprite.setDepth(y);

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
      case "player-moved": {
        const direction = this.directionOf(event.from, event.to);
        this.playerSprite.play(`player:walk:${direction}`, true);
        this.playerSprite.setDepth(event.to.y);
        this.tweens.add({
          targets: this.playerSprite,
          x: event.to.x * TILE + TILE / 2,
          y: event.to.y * TILE + TILE / 2,
          duration: 110,
          onComplete: () => {
            this.playerSprite.stop();
            this.playerSprite.setFrame(this.idleFrame(direction));
          },
        });
        break;
      }
      case "npc-moved": {
        const handles = this.npcSprites.get(event.npcId);
        if (handles !== undefined) {
          const direction = this.directionOf(event.from, event.to);
          handles.sprite.play(`${this.spriteKeyFor(event.npcId)}:walk:${direction}`, true);
          handles.container.setDepth(event.to.y);
          this.tweens.add({
            targets: handles.container,
            x: event.to.x * TILE + TILE / 2,
            y: event.to.y * TILE + TILE / 2,
            duration: 110,
            onComplete: () => {
              handles.sprite.stop();
              handles.sprite.setFrame(this.idleFrame(direction));
            },
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
          this.floatTextAt(to.container.x, to.container.y - 24, "psst…", "#8a93a3");
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
        this.npcSprites.get(event.npcId)?.container.destroy();
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
    const handles = this.npcSprites.get(id);
    if (handles !== undefined) {
      this.floatTextAt(handles.container.x, handles.container.y - 24, text, color);
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
      .setOrigin(0.5, 1)
      .setDepth(1000);
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
      const textureKey = this.spriteKeyFor(npc.id);
      const sprite = this.add
        .sprite(0, 0, textureKey, this.idleFrame("south"))
        .setOrigin(0.5, 0.75);
      const label = this.add
        .text(0, -TILE * 1.5, def.name, LABEL_STYLE)
        .setStroke("#101418", 3)
        .setOrigin(0.5, 1);
      const container = this.add.container(
        npc.pos.x * TILE + TILE / 2,
        npc.pos.y * TILE + TILE / 2,
        [sprite, label],
      );
      container.setDepth(npc.pos.y);
      this.npcSprites.set(npc.id, { container, sprite });
    }
  }

  private renderWorldItems(): void {
    for (const sprite of this.itemSprites) {
      sprite.destroy();
    }
    this.itemSprites = this.state.worldItems
      .filter((item) => item.mapId === this.state.mapId)
      .map((item) =>
        this.add
          .image(item.pos.x * TILE + TILE / 2, item.pos.y * TILE + TILE / 2, "tileset", CHEST_FRAME)
          .setDepth(0),
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
      this.add
        .container(portal.at.x * TILE + TILE / 2, portal.at.y * TILE + TILE / 2, [marker, label])
        .setDepth(0);
    }
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
