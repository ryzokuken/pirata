import type { NpcDef, WorldDef } from "./defs.ts";
import type { GameEvent } from "./event.ts";
import { nextStep } from "./path.ts";
import type { NpcState, Vec2 } from "./state.ts";
import { hourOf } from "./time.ts";

/**
 * Where an NPC wants to be at the given hour: the latest schedule entry at
 * or before it. Before the day's first entry, yesterday's last entry still
 * holds (schedules wrap around midnight). Undefined only for an empty
 * schedule, which the content link pass forbids.
 */
export function scheduleTarget(npc: NpcDef, hour: number): string | undefined {
  const last = npc.schedule[npc.schedule.length - 1];
  if (last === undefined) {
    return undefined;
  }
  let target = last.location;
  for (const entry of npc.schedule) {
    if (entry.hour <= hour) {
      target = entry.location;
    }
  }
  return target;
}

export function advanceNpcs(options: {
  readonly npcs: readonly NpcState[];
  readonly playerPos: Vec2;
  readonly playerMapId: string;
  readonly world: WorldDef;
  readonly tick: number;
}): { readonly npcs: readonly NpcState[]; readonly events: readonly GameEvent[] } {
  const { world, tick, playerMapId } = options;
  const hour = hourOf(tick);
  const moved: NpcState[] = [...options.npcs];
  const events: GameEvent[] = [];
  const occupied = new Set<string>(moved.map((npc) => `${npc.mapId}:${npc.pos.x},${npc.pos.y}`));
  occupied.add(`${playerMapId}:${options.playerPos.x},${options.playerPos.y}`);

  moved.forEach((npc, index) => {
    const def = world.npcs[npc.id];
    const map = world.maps[npc.mapId];
    if (def === undefined || map === undefined) {
      return;
    }
    const location = scheduleTarget(def, hour);
    const target = location === undefined ? undefined : map.locations[location];
    if (target === undefined) {
      return;
    }
    const step = nextStep(map, npc.pos, target);
    if (step === undefined) {
      return;
    }
    const key = `${npc.mapId}:${step.x},${step.y}`;
    if (occupied.has(key)) {
      return;
    }
    occupied.delete(`${npc.mapId}:${npc.pos.x},${npc.pos.y}`);
    occupied.add(key);
    moved[index] = { ...npc, pos: step };
    events.push({ type: "npc-moved", npcId: npc.id, from: npc.pos, to: step });
  });

  return { npcs: moved, events };
}
