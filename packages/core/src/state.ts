import type { CombatantDef, WorldDef } from "./defs.ts";
import type { MapModel } from "./map.ts";
import { scheduleTarget } from "./npc.ts";
import { seedRng, type RngState } from "./rng.ts";
import { hourOf } from "./time.ts";

export const PLAYER_START_COIN = 20;

export const PLAYER_COMBAT: CombatantDef = {
  maxHp: 12,
  attackBonus: 3,
  armorClass: 12,
  damage: { count: 1, sides: 6, bonus: 1 },
};

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface PlayerState {
  readonly pos: Vec2;
  readonly coin: number;
  readonly items: readonly string[];
  readonly sneaking: boolean;
  readonly hp: number;
  readonly hunger: number;
}

export interface NpcState {
  readonly id: string;
  readonly mapId: string;
  readonly pos: Vec2;
  readonly pockets: readonly string[];
  readonly hp?: number;
  readonly alert?: boolean;
}

export interface WorldItem {
  readonly mapId: string;
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

export interface CombatState {
  readonly enemyIds: readonly string[];
}

export interface GameFlags {
  readonly fortuneMade: boolean;
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
  readonly combat: CombatState | null;
  readonly rumors: readonly string[];
  readonly flags: GameFlags;
}

/** Resolves the map the given state currently sits on; the one accessor everything uses. */
export function currentMap(state: GameState, world: WorldDef): MapModel {
  const map = world.maps[state.mapId];
  if (map === undefined) {
    throw new Error(`state references unknown map "${state.mapId}"`);
  }
  return map;
}

function spawnMap(world: WorldDef, mapId: string): MapModel {
  const map = world.maps[mapId];
  if (map === undefined) {
    throw new Error(`world references unknown map "${mapId}"`);
  }
  return map;
}

export function createGameState(options: { seed: number; world: WorldDef }): GameState {
  const { world } = options;
  const startMap = spawnMap(world, world.startMapId);
  const hour = hourOf(0);
  const npcs: NpcState[] = [];
  const occupied = new Map<string, string>();
  occupied.set(
    `${world.startMapId}:${startMap.playerSpawn.x},${startMap.playerSpawn.y}`,
    "the player",
  );
  for (const npcId of Object.keys(world.npcs).toSorted()) {
    const def = world.npcs[npcId];
    if (def === undefined) {
      continue;
    }
    const map = spawnMap(world, def.mapId);
    const location = scheduleTarget(def, hour);
    const pos = location === undefined ? undefined : map.locations[location];
    if (pos === undefined) {
      throw new Error(
        `npc "${npcId}": schedule location "${location ?? "(none)"}" is missing from map "${map.id}"`,
      );
    }
    const key = `${def.mapId}:${pos.x},${pos.y}`;
    const holder = occupied.get(key);
    if (holder !== undefined) {
      throw new Error(`npc "${npcId}" spawns on the same tile (${pos.x},${pos.y}) as ${holder}`);
    }
    occupied.set(key, `npc "${npcId}"`);
    npcs.push({
      id: npcId,
      mapId: def.mapId,
      pos,
      pockets: def.pockets,
      ...(def.combat === undefined ? {} : { hp: def.combat.maxHp }),
    });
  }
  const worldItems: WorldItem[] = Object.keys(world.maps)
    .toSorted()
    .flatMap((mapId) =>
      spawnMap(world, mapId).items.map((item) => ({ mapId, itemId: item.itemId, pos: item.pos })),
    );
  return {
    tick: 0,
    rng: seedRng(options.seed),
    mapId: world.startMapId,
    player: {
      pos: startMap.playerSpawn,
      coin: PLAYER_START_COIN,
      items: [],
      sneaking: false,
      hp: PLAYER_COMBAT.maxHp,
      hunger: 0,
    },
    npcs,
    worldItems,
    dialogue: null,
    trade: null,
    deeds: [],
    combat: null,
    rumors: [],
    flags: { fortuneMade: false },
  };
}
