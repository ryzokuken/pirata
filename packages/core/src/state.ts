import type { WorldDef } from "./defs.ts";
import { scheduleTarget } from "./npc.ts";
import { seedRng, type RngState } from "./rng.ts";
import { hourOf } from "./time.ts";

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface PlayerState {
  readonly pos: Vec2;
}

export interface NpcState {
  readonly id: string;
  readonly pos: Vec2;
}

export interface DialogueState {
  readonly npcId: string;
  readonly nodeId: string;
}

export interface DeedRecord {
  readonly deedId: string;
  readonly npcId: string;
  readonly tick: number;
}

export interface GameState {
  readonly tick: number;
  readonly rng: RngState;
  readonly mapId: string;
  readonly player: PlayerState;
  readonly npcs: readonly NpcState[];
  readonly dialogue: DialogueState | null;
  readonly deeds: readonly DeedRecord[];
}

export function createGameState(options: { seed: number; world: WorldDef }): GameState {
  const { world } = options;
  const hour = hourOf(0);
  const npcs: NpcState[] = [];
  const occupied = new Map<string, string>();
  occupied.set(`${world.map.playerSpawn.x},${world.map.playerSpawn.y}`, "the player");
  for (const npcId of Object.keys(world.npcs).toSorted()) {
    const def = world.npcs[npcId];
    if (def === undefined) {
      continue;
    }
    const location = scheduleTarget(def, hour);
    const pos = location === undefined ? undefined : world.map.locations[location];
    if (pos === undefined) {
      throw new Error(
        `npc "${npcId}": schedule location "${location ?? "(none)"}" is missing from map "${world.map.id}"`,
      );
    }
    const key = `${pos.x},${pos.y}`;
    const holder = occupied.get(key);
    if (holder !== undefined) {
      throw new Error(`npc "${npcId}" spawns on the same tile (${pos.x},${pos.y}) as ${holder}`);
    }
    occupied.set(key, `npc "${npcId}"`);
    npcs.push({ id: npcId, pos });
  }
  return {
    tick: 0,
    rng: seedRng(options.seed),
    mapId: world.map.id,
    player: { pos: world.map.playerSpawn },
    npcs,
    dialogue: null,
    deeds: [],
  };
}
