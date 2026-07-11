import { witnesses } from "./awareness.ts";
import type { WorldDef } from "./defs.ts";
import { visibleChoices } from "./dialogue.ts";
import type { GameEvent } from "./event.ts";
import { spreadGossip } from "./gossip.ts";
import {
  DIRECTION_DELTAS,
  type BuyIntent,
  type ChooseIntent,
  type Intent,
  type MoveIntent,
  type SellIntent,
} from "./intent.ts";
import { isBlocked } from "./map.ts";
import { advanceNpcs } from "./npc.ts";
import { factionStanding, npcStanding } from "./reputation.ts";
import { nextFloat } from "./rng.ts";
import { currentMap, type GameState, type NpcState, type Vec2 } from "./state.ts";
import { buyPrice, sellPrice, tradeRefused } from "./trade.ts";

export interface AdvanceResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export function advance(state: GameState, intent: Intent, world: WorldDef): AdvanceResult {
  switch (intent.type) {
    case "move":
      return state.dialogue === null && state.trade === null
        ? applyMove(state, intent, world)
        : rejected(state, "finish what you're doing first");
    case "wait":
      return state.dialogue === null && state.trade === null
        ? applyTick(state, state.player.pos, [], world)
        : rejected(state, "finish what you're doing first");
    case "talk":
      return applyTalk(state, world);
    case "choose":
      return applyChoose(state, intent, world);
    case "sneak":
      return state.dialogue === null && state.trade === null
        ? applySneak(state)
        : rejected(state, "not while you're occupied");
    case "take":
      return state.dialogue === null && state.trade === null
        ? applyTake(state, world)
        : rejected(state, "not while you're occupied");
    case "pickpocket":
      return state.dialogue === null && state.trade === null
        ? applyPickpocket(state, world)
        : rejected(state, "not while you're occupied");
    case "trade":
      return state.dialogue === null && state.trade === null
        ? applyTradeOpen(state, world)
        : rejected(state, "not while you're occupied");
    case "buy":
      return applyBuy(state, intent, world);
    case "sell":
      return applySell(state, intent, world);
    case "close-trade":
      return state.trade === null
        ? rejected(state, "you are not trading")
        : {
            state: { ...state, trade: null },
            events: [{ type: "trade-ended", npcId: state.trade.npcId }],
          };
  }
}

function rejected(state: GameState, reason: string): AdvanceResult {
  return { state, events: [{ type: "intent-rejected", reason }] };
}

/** Every time-consuming intent funnels here: bump the tick, let NPCs act. */
function applyTick(
  state: GameState,
  playerPos: Vec2,
  events: readonly GameEvent[],
  world: WorldDef,
  ticks = 1,
): AdvanceResult {
  let tick = state.tick;
  let npcs = state.npcs;
  let deeds = state.deeds;
  const collected: GameEvent[] = [...events];
  for (let step = 0; step < ticks; step += 1) {
    tick += 1;
    const npcResult = advanceNpcs({ npcs, playerPos, playerMapId: state.mapId, world, tick });
    npcs = npcResult.npcs;
    collected.push(...npcResult.events);
    const gossip = spreadGossip({ deeds, npcs, world });
    deeds = gossip.deeds;
    collected.push(...gossip.events);
  }
  const next: GameState = {
    ...state,
    tick,
    player: { ...state.player, pos: playerPos },
    npcs,
    deeds,
  };
  const confronter = findConfronter(next, world);
  if (confronter !== undefined) {
    const dialogue = world.dialogues[confronter.dialogueId];
    if (dialogue !== undefined) {
      collected.push({ type: "dialogue-started", npcId: confronter.npcId, nodeId: dialogue.start });
      return {
        state: { ...next, dialogue: { npcId: confronter.npcId, nodeId: dialogue.start } },
        events: collected,
      };
    }
  }
  return { state: next, events: collected };
}

function findConfronter(
  state: GameState,
  world: WorldDef,
): { npcId: string; dialogueId: string } | undefined {
  for (const npc of state.npcs) {
    if (npc.mapId !== state.mapId) {
      continue;
    }
    const confront = world.npcs[npc.id]?.confront;
    if (confront === undefined) {
      continue;
    }
    const distance = Math.max(
      Math.abs(npc.pos.x - state.player.pos.x),
      Math.abs(npc.pos.y - state.player.pos.y),
    );
    if (distance > 1) {
      continue;
    }
    if (npcStanding(state, world, npc.id) < confront.standingBelow) {
      return { npcId: npc.id, dialogueId: confront.dialogueId };
    }
  }
  return undefined;
}

function applyMove(state: GameState, intent: MoveIntent, world: WorldDef): AdvanceResult {
  const delta = DIRECTION_DELTAS[intent.direction];
  const from = state.player.pos;
  const to = { x: from.x + delta.dx, y: from.y + delta.dy };
  // NPCs on other maps must not block movement here.
  const occupiedByNpc = state.npcs.some(
    (npc) => npc.mapId === state.mapId && npc.pos.x === to.x && npc.pos.y === to.y,
  );
  const ticks = state.player.sneaking ? 2 : 1;
  // Task 4 adds portal handling.
  const map = currentMap(state, world);
  if (isBlocked(map, to.x, to.y) || occupiedByNpc) {
    return applyTick(
      state,
      from,
      [{ type: "movement-blocked", at: from, toward: to }],
      world,
      ticks,
    );
  }
  return applyTick(state, to, [{ type: "player-moved", from, to }], world, ticks);
}

function applySneak(state: GameState): AdvanceResult {
  const sneaking = !state.player.sneaking;
  return {
    state: { ...state, player: { ...state.player, sneaking } },
    events: [{ type: "sneak-toggled", sneaking }],
  };
}

function applyTake(state: GameState, world: WorldDef): AdvanceResult {
  const at = state.player.pos;
  const index = state.worldItems.findIndex(
    (item) => item.mapId === state.mapId && item.pos.x === at.x && item.pos.y === at.y,
  );
  const item = state.worldItems[index];
  if (item === undefined) {
    return rejected(state, "there is nothing here to take");
  }
  const deedId = world.crimes.theft;
  if (deedId === undefined) {
    return rejected(state, "this world knows no law against taking things");
  }
  const knownBy = witnesses(state, world, at);
  const events: GameEvent[] = [{ type: "item-taken", itemId: item.itemId, at }];
  if (knownBy.length > 0) {
    events.push({ type: "crime-witnessed", deedId, witnessIds: knownBy });
  }
  const next: GameState = {
    ...state,
    player: { ...state.player, items: [...state.player.items, item.itemId] },
    worldItems: state.worldItems.filter((_, i) => i !== index),
    deeds: [...state.deeds, { deedId, tick: state.tick, knownBy }],
  };
  return applyTick(next, at, events, world);
}

const PICKPOCKET_CHANCE = 0.5;
const PICKPOCKET_SNEAK_CHANCE = 0.8;

function applyPickpocket(state: GameState, world: WorldDef): AdvanceResult {
  const victim = adjacentNpc(state);
  if (victim === undefined) {
    return rejected(state, "no one within reach");
  }
  const deedId = world.crimes.pickpocket;
  if (deedId === undefined) {
    return rejected(state, "this world knows no law against light fingers");
  }
  const itemId = victim.pockets[0];
  if (itemId === undefined) {
    return rejected(state, "their pockets are empty");
  }

  const roll = nextFloat(state.rng);
  const chance = state.player.sneaking ? PICKPOCKET_SNEAK_CHANCE : PICKPOCKET_CHANCE;
  const bystanders = witnesses(state, world, state.player.pos);
  const events: GameEvent[] = [];
  let player = state.player;
  let npcs = state.npcs;
  let knownBy: readonly string[];
  if (roll.value < chance) {
    knownBy = bystanders.filter((id) => id !== victim.id);
    player = { ...player, items: [...player.items, itemId] };
    npcs = npcs.map((npc) =>
      npc.id === victim.id ? { ...npc, pockets: npc.pockets.slice(1) } : npc,
    );
    events.push({ type: "pickpocket-succeeded", npcId: victim.id, itemId });
  } else {
    knownBy = [...new Set([...bystanders, victim.id])].toSorted();
    events.push({ type: "pickpocket-failed", npcId: victim.id });
  }
  if (knownBy.length > 0) {
    events.push({ type: "crime-witnessed", deedId, witnessIds: knownBy });
  }
  const next: GameState = {
    ...state,
    rng: roll.state,
    player,
    npcs,
    deeds: [...state.deeds, { deedId, npcId: victim.id, tick: state.tick, knownBy }],
  };
  return applyTick(next, state.player.pos, events, world);
}

function applyTradeOpen(state: GameState, world: WorldDef): AdvanceResult {
  const npc = adjacentNpc(state);
  const def = npc === undefined ? undefined : world.npcs[npc.id];
  if (npc === undefined || def?.shop === undefined) {
    return rejected(state, "no one within reach keeps a shop");
  }
  if (tradeRefused(state, world, npc.id)) {
    return rejected(state, `${def.name} wants nothing to do with you`);
  }
  return {
    state: { ...state, trade: { npcId: npc.id } },
    events: [{ type: "trade-started", npcId: npc.id }],
  };
}

function applyBuy(state: GameState, intent: BuyIntent, world: WorldDef): AdvanceResult {
  if (state.trade === null) {
    return rejected(state, "you are not trading");
  }
  const npcId = state.trade.npcId;
  const itemId = world.npcs[npcId]?.shop?.sells[intent.index];
  const price = itemId === undefined ? undefined : buyPrice(state, world, npcId, itemId);
  if (itemId === undefined || price === undefined) {
    return rejected(state, `there is no ware ${intent.index}`);
  }
  if (price > state.player.coin) {
    return rejected(state, "you cannot afford that");
  }
  return {
    state: {
      ...state,
      player: {
        ...state.player,
        coin: state.player.coin - price,
        items: [...state.player.items, itemId],
      },
    },
    events: [{ type: "item-bought", itemId, price }],
  };
}

function applySell(state: GameState, intent: SellIntent, world: WorldDef): AdvanceResult {
  if (state.trade === null) {
    return rejected(state, "you are not trading");
  }
  const itemId = state.player.items[intent.index];
  const price =
    itemId === undefined ? undefined : sellPrice(state, world, state.trade.npcId, itemId);
  if (itemId === undefined || price === undefined) {
    return rejected(state, `you carry no item ${intent.index}`);
  }
  return {
    state: {
      ...state,
      player: {
        ...state.player,
        coin: state.player.coin + price,
        items: state.player.items.filter((_, i) => i !== intent.index),
      },
    },
    events: [{ type: "item-sold", itemId, price }],
  };
}

function applyTalk(state: GameState, world: WorldDef): AdvanceResult {
  if (state.dialogue !== null) {
    return rejected(state, "already in a conversation");
  }
  if (state.trade !== null) {
    return rejected(state, "not while you're occupied");
  }
  const npc = adjacentNpc(state);
  if (npc === undefined) {
    return rejected(state, "no one within reach to talk to");
  }
  const def = world.npcs[npc.id];
  const dialogue = def === undefined ? undefined : world.dialogues[def.dialogueId];
  if (dialogue === undefined) {
    return rejected(state, `"${npc.id}" has nothing to say`);
  }
  return {
    state: { ...state, dialogue: { npcId: npc.id, nodeId: dialogue.start } },
    events: [{ type: "dialogue-started", npcId: npc.id, nodeId: dialogue.start }],
  };
}

// NPCs on other maps must not be reachable for interaction.
function adjacentNpc(state: GameState): NpcState | undefined {
  const { x, y } = state.player.pos;
  for (const delta of Object.values(DIRECTION_DELTAS)) {
    const found = state.npcs.find(
      (npc) =>
        npc.mapId === state.mapId && npc.pos.x === x + delta.dx && npc.pos.y === y + delta.dy,
    );
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function applyChoose(state: GameState, intent: ChooseIntent, world: WorldDef): AdvanceResult {
  if (state.dialogue === null) {
    return rejected(state, "not in a conversation");
  }
  const npcId = state.dialogue.npcId;
  const choice = visibleChoices(state, world)[intent.index];
  if (choice === undefined) {
    return rejected(state, `there is no choice ${intent.index}`);
  }

  const events: GameEvent[] = [];
  const effects = choice.effects ?? [];
  const totalPay = effects.reduce(
    (sum, effect) => (effect.type === "pay" ? sum + effect.amount : sum),
    0,
  );
  if (totalPay > state.player.coin) {
    return rejected(state, "you cannot pay that");
  }
  let deeds = state.deeds;
  for (const effect of effects) {
    if (effect.type === "deed") {
      deeds = [...deeds, { deedId: effect.deedId, npcId, tick: state.tick, knownBy: [npcId] }];
      events.push({ type: "deed-recorded", deedId: effect.deedId, npcId });
    } else if (effect.type === "pay") {
      events.push({ type: "coin-paid", amount: effect.amount, npcId });
    }
    // Task 5 implements the "rumor" effect.
  }
  const player =
    totalPay === 0 ? state.player : { ...state.player, coin: state.player.coin - totalPay };

  const withDeeds: GameState = { ...state, player, deeds };
  const factionId = world.npcs[npcId]?.factionId;
  if (deeds !== state.deeds && factionId !== undefined) {
    events.push({
      type: "reputation-changed",
      npcId,
      factionId,
      npcStanding: npcStanding(withDeeds, world, npcId),
      factionStanding: factionStanding(withDeeds, world, factionId),
    });
  }

  if (choice.next === undefined) {
    events.push({ type: "dialogue-ended", npcId });
    return { state: { ...withDeeds, dialogue: null }, events };
  }
  events.push({ type: "dialogue-advanced", npcId, nodeId: choice.next });
  return { state: { ...withDeeds, dialogue: { npcId, nodeId: choice.next } }, events };
}
