import type { WorldDef } from "./defs.ts";
import { scheduleTarget } from "./npc.ts";
import { seedRng, type RngState } from "./rng.ts";
import { hourOf } from "./time.ts";

export const PLAYER_START_COIN = 20;

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface PlayerState {
  readonly pos: Vec2;
  readonly coin: number;
  readonly items: readonly string[];
  readonly sneaking: boolean;
}

export interface NpcState {
  readonly id: string;
  readonly pos: Vec2;
  readonly pockets: readonly string[];
}

export interface WorldItem {
  readonly itemId: string;
  readonly pos: Vec2;
}

export interface DialogueState {
  readonly npcId: string;
  readonly nodeId: string;
}

export interface TradeState {
  readonly npcId: string;
}

export interface DeedRecord {
  readonly deedId: string;
  readonly tick: number;
  readonly knownBy: readonly string[];
  readonly npcId?: string;
}

export interface GameState {
  readonly tick: number;
  readonly rng: RngState;
  readonly mapId: string;
  readonly player: PlayerState;
  readonly npcs: readonly NpcState[];
  readonly worldItems: readonly WorldItem[];
  readonly dialogue: DialogueState | null;
  readonly trade: TradeState | null;
  readonly deeds: readonly DeedRecord[];
}

export function createGameState(options: { seed: number; world: WorldDef }): GameState {
  const { world } = options;
  // Task 2 replaces this single-map stopgap with per-map spawning.
  const map = world.maps[world.startMapId]!;
  const hour = hourOf(0);
  const npcs: NpcState[] = [];
  const occupied = new Map<string, string>();
  occupied.set(`${map.playerSpawn.x},${map.playerSpawn.y}`, "the player");
  for (const npcId of Object.keys(world.npcs).toSorted()) {
    const def = world.npcs[npcId];
    if (def === undefined) {
      continue;
    }
    const location = scheduleTarget(def, hour);
    const pos = location === undefined ? undefined : map.locations[location];
    if (pos === undefined) {
      throw new Error(
        `npc "${npcId}": schedule location "${location ?? "(none)"}" is missing from map "${map.id}"`,
      );
    }
    const key = `${pos.x},${pos.y}`;
    const holder = occupied.get(key);
    if (holder !== undefined) {
      throw new Error(`npc "${npcId}" spawns on the same tile (${pos.x},${pos.y}) as ${holder}`);
    }
    occupied.set(key, `npc "${npcId}"`);
    npcs.push({ id: npcId, pos, pockets: def.pockets });
  }
  return {
    tick: 0,
    rng: seedRng(options.seed),
    mapId: map.id,
    player: { pos: map.playerSpawn, coin: PLAYER_START_COIN, items: [], sneaking: false },
    npcs,
    worldItems: map.items.map((item) => ({ itemId: item.itemId, pos: item.pos })),
    dialogue: null,
    trade: null,
    deeds: [],
  };
}
