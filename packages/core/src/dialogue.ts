import type { DialogueChoice, DialogueCondition, DialogueNode, WorldDef } from "./defs.ts";
import { factionStanding, npcStanding } from "./reputation.ts";
import type { GameState } from "./state.ts";

export function currentNode(state: GameState, world: WorldDef): DialogueNode | undefined {
  if (state.dialogue === null) {
    return undefined;
  }
  const npc = world.npcs[state.dialogue.npcId];
  if (npc === undefined) {
    return undefined;
  }
  return world.dialogues[npc.dialogueId]?.nodes[state.dialogue.nodeId];
}

/**
 * The choices the player may pick right now, in authored order. `choose`
 * intents index into THIS array — core and client must both use it.
 */
export function visibleChoices(state: GameState, world: WorldDef): readonly DialogueChoice[] {
  const node = currentNode(state, world);
  if (node === undefined || state.dialogue === null) {
    return [];
  }
  const npcId = state.dialogue.npcId;
  return node.choices.filter(
    (choice) =>
      choice.condition === undefined || conditionMet(choice.condition, state, world, npcId),
  );
}

function conditionMet(
  condition: DialogueCondition,
  state: GameState,
  world: WorldDef,
  npcId: string,
): boolean {
  switch (condition.type) {
    case "npc-standing-at-least":
      return npcStanding(state, world, npcId) >= condition.value;
    case "npc-standing-below":
      return npcStanding(state, world, npcId) < condition.value;
    case "faction-standing-at-least":
    case "faction-standing-below": {
      const factionId = world.npcs[npcId]?.factionId;
      if (factionId === undefined) {
        return false;
      }
      const standing = factionStanding(state, world, factionId);
      return condition.type === "faction-standing-at-least"
        ? standing >= condition.value
        : standing < condition.value;
    }
  }
}
