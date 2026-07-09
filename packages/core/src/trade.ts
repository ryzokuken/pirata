import type { WorldDef } from "./defs.ts";
import { factionStanding } from "./reputation.ts";
import type { GameState } from "./state.ts";

export const TRADE_REFUSE_AT = -20;
export const TRADE_FRIENDLY_AT = 25;

interface PriceBand {
  readonly buy: number;
  readonly sell: number;
}

const WARY: PriceBand = { buy: 1.5, sell: 0.25 };
const NORMAL: PriceBand = { buy: 1, sell: 0.5 };
const FRIENDLY: PriceBand = { buy: 0.8, sell: 0.6 };

function band(state: GameState, world: WorldDef, npcId: string): PriceBand {
  const factionId = world.npcs[npcId]?.factionId;
  const standing = factionId === undefined ? 0 : factionStanding(state, world, factionId);
  if (standing >= TRADE_FRIENDLY_AT) {
    return FRIENDLY;
  }
  if (standing < 0) {
    return WARY;
  }
  return NORMAL;
}

/** Prices are a consequence: the shopkeeper's faction remembers (spec §4.3). */
export function tradeRefused(state: GameState, world: WorldDef, npcId: string): boolean {
  const factionId = world.npcs[npcId]?.factionId;
  if (factionId === undefined) {
    return true;
  }
  return factionStanding(state, world, factionId) <= TRADE_REFUSE_AT;
}

export function buyPrice(
  state: GameState,
  world: WorldDef,
  npcId: string,
  itemId: string,
): number | undefined {
  const value = world.items[itemId]?.value;
  return value === undefined ? undefined : Math.ceil(value * band(state, world, npcId).buy);
}

export function sellPrice(
  state: GameState,
  world: WorldDef,
  npcId: string,
  itemId: string,
): number | undefined {
  const value = world.items[itemId]?.value;
  return value === undefined ? undefined : Math.floor(value * band(state, world, npcId).sell);
}
