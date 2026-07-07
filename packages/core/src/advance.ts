import type { WorldDef } from "./defs.ts";
import { visibleChoices } from "./dialogue.ts";
import type { GameEvent } from "./event.ts";
import { DIRECTION_DELTAS, type ChooseIntent, type Intent, type MoveIntent } from "./intent.ts";
import { isBlocked } from "./map.ts";
import { advanceNpcs } from "./npc.ts";
import { factionStanding, npcStanding } from "./reputation.ts";
import type { GameState, NpcState, Vec2 } from "./state.ts";

export interface AdvanceResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export function advance(state: GameState, intent: Intent, world: WorldDef): AdvanceResult {
  switch (intent.type) {
    case "move":
      return state.dialogue === null
        ? applyMove(state, intent, world)
        : rejected(state, "finish the conversation first");
    case "wait":
      return state.dialogue === null
        ? applyTick(state, state.player.pos, [], world)
        : rejected(state, "finish the conversation first");
    case "talk":
      return applyTalk(state, world);
    case "choose":
      return applyChoose(state, intent, world);
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
): AdvanceResult {
  const tick = state.tick + 1;
  const npcResult = advanceNpcs({ npcs: state.npcs, playerPos, world, tick });
  return {
    state: { ...state, tick, player: { ...state.player, pos: playerPos }, npcs: npcResult.npcs },
    events: [...events, ...npcResult.events],
  };
}

function applyMove(state: GameState, intent: MoveIntent, world: WorldDef): AdvanceResult {
  const delta = DIRECTION_DELTAS[intent.direction];
  const from = state.player.pos;
  const to = { x: from.x + delta.dx, y: from.y + delta.dy };
  const occupiedByNpc = state.npcs.some((npc) => npc.pos.x === to.x && npc.pos.y === to.y);
  if (isBlocked(world.map, to.x, to.y) || occupiedByNpc) {
    return applyTick(state, from, [{ type: "movement-blocked", at: from, toward: to }], world);
  }
  return applyTick(state, to, [{ type: "player-moved", from, to }], world);
}

function applyTalk(state: GameState, world: WorldDef): AdvanceResult {
  if (state.dialogue !== null) {
    return rejected(state, "already in a conversation");
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

function adjacentNpc(state: GameState): NpcState | undefined {
  const { x, y } = state.player.pos;
  for (const delta of Object.values(DIRECTION_DELTAS)) {
    const found = state.npcs.find(
      (npc) => npc.pos.x === x + delta.dx && npc.pos.y === y + delta.dy,
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
  let deeds = state.deeds;
  // Stub: only "deed" effects are handled here; Task 10 adds atomic "pay" handling
  // once PlayerState carries coin (Task 3).
  for (const effect of choice.effects ?? []) {
    if (effect.type === "deed") {
      deeds = [...deeds, { deedId: effect.deedId, npcId, tick: state.tick, knownBy: [npcId] }];
      events.push({ type: "deed-recorded", deedId: effect.deedId, npcId });
    }
  }

  const withDeeds: GameState = { ...state, deeds };
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
