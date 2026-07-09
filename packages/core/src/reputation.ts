import type { WorldDef } from "./defs.ts";
import type { GameState } from "./state.ts";

/** What this NPC thinks of the player: the sum of deeds they know about. */
export function npcStanding(state: GameState, world: WorldDef, npcId: string): number {
  let standing = 0;
  for (const deed of state.deeds) {
    if (!deed.knownBy.includes(npcId)) {
      continue;
    }
    standing += world.deeds[deed.deedId]?.standingDelta ?? 0;
  }
  return standing;
}

/**
 * What a faction thinks: deeds known by at least one member, counted once
 * per deed. Knowledge reaches members by witnessing or gossip — this
 * replaces M2's instant-faction rule.
 */
export function factionStanding(state: GameState, world: WorldDef, factionId: string): number {
  let standing = 0;
  for (const deed of state.deeds) {
    const known = deed.knownBy.some((npcId) => world.npcs[npcId]?.factionId === factionId);
    if (!known) {
      continue;
    }
    standing += world.deeds[deed.deedId]?.standingDelta ?? 0;
  }
  return standing;
}
