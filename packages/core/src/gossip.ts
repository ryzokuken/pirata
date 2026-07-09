import { lineOfSight } from "./awareness.ts";
import type { GameEvent } from "./event.ts";
import type { MapModel } from "./map.ts";
import type { DeedRecord, NpcState } from "./state.ts";

export const GOSSIP_RANGE = 2;

/**
 * One gossip pass: every NPC pair in conversation range (Chebyshev ≤ 2 with
 * line of sight) merges deed knowledge, both directions. Deterministic: pairs
 * in array order, knownBy kept sorted. Knowledge travels because schedules
 * co-locate people — no rates, no rng.
 */
export function spreadGossip(options: {
  readonly deeds: readonly DeedRecord[];
  readonly npcs: readonly NpcState[];
  readonly map: MapModel;
}): { readonly deeds: readonly DeedRecord[]; readonly events: readonly GameEvent[] } {
  const { npcs, map } = options;
  const events: GameEvent[] = [];
  const known = options.deeds.map((deed) => new Set(deed.knownBy));

  for (const [i, a] of npcs.entries()) {
    for (const b of npcs.slice(i + 1)) {
      const distance = Math.max(Math.abs(a.pos.x - b.pos.x), Math.abs(a.pos.y - b.pos.y));
      if (distance > GOSSIP_RANGE || !lineOfSight(map, a.pos, b.pos)) {
        continue;
      }
      options.deeds.forEach((deed, index) => {
        const set = known[index];
        if (set === undefined) {
          return;
        }
        if (set.has(a.id) && !set.has(b.id)) {
          set.add(b.id);
          events.push({
            type: "gossip-shared",
            fromNpcId: a.id,
            toNpcId: b.id,
            deedId: deed.deedId,
          });
        } else if (set.has(b.id) && !set.has(a.id)) {
          set.add(a.id);
          events.push({
            type: "gossip-shared",
            fromNpcId: b.id,
            toNpcId: a.id,
            deedId: deed.deedId,
          });
        }
      });
    }
  }

  if (events.length === 0) {
    return { deeds: options.deeds, events };
  }
  const deeds = options.deeds.map((deed, index) => {
    const set = known[index];
    if (set === undefined || set.size === deed.knownBy.length) {
      return deed;
    }
    return { ...deed, knownBy: [...set].toSorted() };
  });
  return { deeds, events };
}
