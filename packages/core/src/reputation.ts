import type { WorldDef } from "./defs.ts";
import type { GameState } from "./state.ts";

export function npcStanding(state: GameState, world: WorldDef, npcId: string): number {
  let standing = 0;
  for (const deed of state.deeds) {
    if (deed.npcId !== npcId) {
      continue;
    }
    standing += world.deeds[deed.deedId]?.standingDelta ?? 0;
  }
  return standing;
}

/**
 * M2 rule: a witnessed deed is known to the witness's whole faction
 * immediately. M3 replaces this with gossip propagation over in-game time.
 */
export function factionStanding(state: GameState, world: WorldDef, factionId: string): number {
  let standing = 0;
  for (const deed of state.deeds) {
    if (world.npcs[deed.npcId]?.factionId !== factionId) {
      continue;
    }
    standing += world.deeds[deed.deedId]?.standingDelta ?? 0;
  }
  return standing;
}
