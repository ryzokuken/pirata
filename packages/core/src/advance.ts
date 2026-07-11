import { canPerceive, perceptionRadius, witnesses } from "./awareness.ts";
import type { WorldDef } from "./defs.ts";
import { visibleChoices } from "./dialogue.ts";
import type { GameEvent } from "./event.ts";
import { spreadGossip } from "./gossip.ts";
import { HUNGER_MAX, hungerStage, TICKS_PER_HUNGER } from "./hunger.ts";
import {
  DIRECTION_DELTAS,
  type BuyIntent,
  type ChooseIntent,
  type EatIntent,
  type Intent,
  type MoveIntent,
  type SellIntent,
} from "./intent.ts";
import { isBlocked } from "./map.ts";
import { advanceNpcs } from "./npc.ts";
import { factionStanding, npcStanding } from "./reputation.ts";
import { nextFloat } from "./rng.ts";
import { currentMap, type CombatState, type GameState, type NpcState, type Vec2 } from "./state.ts";
import { hourOf } from "./time.ts";
import { buyPrice, sellPrice, tradeRefused } from "./trade.ts";

export interface AdvanceResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/** Alert clears once the player is farther than this or leaves the NPC's map. */
export const CHASE_RANGE = 10;

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
    case "eat":
      return state.dialogue === null && state.trade === null && state.combat === null
        ? applyEat(state, intent, world)
        : rejected(state, "not while you're occupied");
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
  options: { ticks?: number; playerMapId?: string } = {},
): AdvanceResult {
  const { ticks = 1, playerMapId = state.mapId } = options;
  const sneaking = state.player.sneaking;
  let tick = state.tick;
  let npcs = state.npcs;
  let deeds = state.deeds;
  let hunger = state.player.hunger;
  let hp = state.player.hp;
  let combat = state.combat;
  const collected: GameEvent[] = [...events];
  for (let step = 0; step < ticks; step += 1) {
    tick += 1;
    const npcResult = advanceNpcs({ npcs, playerPos, playerMapId, world, tick });
    npcs = npcResult.npcs;
    collected.push(...npcResult.events);
    const gossip = spreadGossip({ deeds, npcs, world });
    deeds = gossip.deeds;
    collected.push(...gossip.events);
    if (tick % TICKS_PER_HUNGER === 0) {
      const stageBefore = hungerStage(hunger);
      hunger = Math.min(HUNGER_MAX, hunger + 1);
      const stageAfter = hungerStage(hunger);
      if (stageAfter === "starving") {
        hp = Math.max(1, hp - 1);
      }
      if (stageAfter !== stageBefore) {
        collected.push({ type: "hunger-changed", stage: stageAfter });
      }
    }
    const aggro = updateAggro({ npcs, playerPos, playerMapId, sneaking, world, tick });
    npcs = aggro.npcs;
    collected.push(...aggro.events);
    if (combat === null) {
      const started = tryStartCombat(npcs, playerPos, playerMapId);
      if (started !== undefined) {
        combat = started.combat;
        collected.push(started.event);
      }
    }
  }
  const next: GameState = {
    ...state,
    tick,
    mapId: playerMapId,
    player: { ...state.player, pos: playerPos, hunger, hp },
    npcs,
    deeds,
    combat,
  };
  if (combat !== null) {
    return { state: next, events: collected };
  }
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

/**
 * Alert/calm hostile NPCs on the player's map: same perception math as
 * `witnesses` decides who spots the player. Alert clears once the player
 * leaves the NPC's map or drifts beyond `CHASE_RANGE`; short lapses in line
 * of sight while still in range do not calm a chasing hostile.
 */
function updateAggro(options: {
  readonly npcs: readonly NpcState[];
  readonly playerPos: Vec2;
  readonly playerMapId: string;
  readonly sneaking: boolean;
  readonly world: WorldDef;
  readonly tick: number;
}): { readonly npcs: readonly NpcState[]; readonly events: readonly GameEvent[] } {
  const { npcs, playerPos, playerMapId, sneaking, world, tick } = options;
  const radius = perceptionRadius(hourOf(tick), sneaking);
  const events: GameEvent[] = [];
  const updated = npcs.map((npc) => {
    if (world.npcs[npc.id]?.hostile !== true) {
      return npc;
    }
    const onPlayerMap = npc.mapId === playerMapId;
    const map = onPlayerMap ? world.maps[npc.mapId] : undefined;
    if (map !== undefined && canPerceive(map, radius, npc.pos, playerPos)) {
      if (npc.alert !== true) {
        events.push({ type: "npc-alerted", npcId: npc.id });
      }
      return { ...npc, alert: true };
    }
    if (npc.alert !== true) {
      return npc;
    }
    const distance = onPlayerMap
      ? Math.max(Math.abs(npc.pos.x - playerPos.x), Math.abs(npc.pos.y - playerPos.y))
      : Number.POSITIVE_INFINITY;
    if (onPlayerMap && distance <= CHASE_RANGE) {
      return npc;
    }
    events.push({ type: "npc-calmed", npcId: npc.id });
    const { alert: _alert, ...calmed } = npc;
    return calmed;
  });
  return { npcs: updated, events };
}

/** Combat starts once an alerted hostile is Chebyshev-adjacent to the player. */
function tryStartCombat(
  npcs: readonly NpcState[],
  playerPos: Vec2,
  playerMapId: string,
): { combat: CombatState; event: GameEvent } | undefined {
  const enemyIds = npcs
    .filter((npc) => npc.mapId === playerMapId && npc.alert === true)
    .filter(
      (npc) => Math.max(Math.abs(npc.pos.x - playerPos.x), Math.abs(npc.pos.y - playerPos.y)) <= 1,
    )
    .map((npc) => npc.id)
    .toSorted();
  if (enemyIds.length === 0) {
    return undefined;
  }
  return { combat: { enemyIds }, event: { type: "combat-started", enemyIds } };
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
  const map = currentMap(state, world);
  const blockedMove = (): AdvanceResult =>
    applyTick(state, from, [{ type: "movement-blocked", at: from, toward: to }], world, {
      ticks,
    });
  if (isBlocked(map, to.x, to.y) || occupiedByNpc) {
    return blockedMove();
  }
  const portal = map.portals.find(
    (candidate) => candidate.at.x === to.x && candidate.at.y === to.y,
  );
  if (portal === undefined) {
    return applyTick(state, to, [{ type: "player-moved", from, to }], world, { ticks });
  }
  const targetMap = world.maps[portal.toMapId];
  const arrival = targetMap?.locations[portal.toLocation];
  if (targetMap === undefined || arrival === undefined) {
    throw new Error(
      `map "${state.mapId}": portal to "${portal.toMapId}/${portal.toLocation}" is invalid`,
    );
  }
  const arrivalBlocked = state.npcs.some(
    (npc) => npc.mapId === portal.toMapId && npc.pos.x === arrival.x && npc.pos.y === arrival.y,
  );
  if (arrivalBlocked) {
    return blockedMove();
  }
  const events: GameEvent[] = [
    { type: "player-moved", from, to },
    { type: "map-changed", fromMapId: state.mapId, toMapId: portal.toMapId, at: arrival },
  ];
  return applyTick(state, arrival, events, world, { ticks, playerMapId: portal.toMapId });
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

function applyEat(state: GameState, intent: EatIntent, world: WorldDef): AdvanceResult {
  const itemId = state.player.items[intent.index];
  const food = itemId === undefined ? undefined : world.items[itemId]?.food;
  if (itemId === undefined || food === undefined) {
    return rejected(state, "you cannot eat that");
  }
  const next: GameState = {
    ...state,
    player: {
      ...state.player,
      items: state.player.items.filter((_, i) => i !== intent.index),
      hunger: Math.max(0, state.player.hunger - food.nutrition),
    },
  };
  return applyTick(next, state.player.pos, [{ type: "ate-food", itemId }], world);
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
  let rumors = state.rumors;
  for (const effect of effects) {
    if (effect.type === "deed") {
      deeds = [...deeds, { deedId: effect.deedId, npcId, tick: state.tick, knownBy: [npcId] }];
      events.push({ type: "deed-recorded", deedId: effect.deedId, npcId });
    } else if (effect.type === "pay") {
      events.push({ type: "coin-paid", amount: effect.amount, npcId });
    } else if (effect.type === "rumor" && !rumors.includes(effect.rumorId)) {
      rumors = [...rumors, effect.rumorId];
      events.push({ type: "rumor-heard", rumorId: effect.rumorId });
    }
  }
  const player =
    totalPay === 0 ? state.player : { ...state.player, coin: state.player.coin - totalPay };

  const withEffects: GameState = { ...state, player, deeds, rumors };
  const factionId = world.npcs[npcId]?.factionId;
  if (deeds !== state.deeds && factionId !== undefined) {
    events.push({
      type: "reputation-changed",
      npcId,
      factionId,
      npcStanding: npcStanding(withEffects, world, npcId),
      factionStanding: factionStanding(withEffects, world, factionId),
    });
  }

  if (choice.next === undefined) {
    events.push({ type: "dialogue-ended", npcId });
    return { state: { ...withEffects, dialogue: null }, events };
  }
  events.push({ type: "dialogue-advanced", npcId, nodeId: choice.next });
  return { state: { ...withEffects, dialogue: { npcId, nodeId: choice.next } }, events };
}
