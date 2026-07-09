import type {
  CrimeVerb,
  DeedDef,
  DialogueDef,
  DialogueNode,
  FactionDef,
  ItemDef,
  MapModel,
  NpcDef,
  WorldDef,
} from "@pirata/core";
import { ContentError } from "./loader.ts";
import type { DialogueObject, PackObject } from "./schemas.ts";

/**
 * The link pass (spec §4.4 "finalization"): index every object by id, resolve
 * every cross-reference, and fail loudly on anything dangling. The returned
 * WorldDef is the only thing core ever sees.
 */
export function finalizeWorld(options: {
  readonly objects: readonly PackObject[];
  readonly map: MapModel;
}): WorldDef {
  const factions: Record<string, FactionDef> = {};
  const deeds: Record<string, DeedDef> = {};
  const dialogues: Record<string, DialogueDef> = {};
  const npcs: Record<string, NpcDef> = {};
  const items: Record<string, ItemDef> = {};
  const crimes: Partial<Record<CrimeVerb, string>> = {};

  for (const object of options.objects) {
    switch (object.type) {
      case "faction":
        assertNewId(factions, object.id, "faction");
        factions[object.id] = { id: object.id, name: object.name };
        break;
      case "deed":
        assertNewId(deeds, object.id, "deed");
        deeds[object.id] = {
          id: object.id,
          name: object.name,
          standingDelta: object.standingDelta,
        };
        break;
      case "dialogue":
        assertNewId(dialogues, object.id, "dialogue");
        dialogues[object.id] = toDialogueDef(object);
        break;
      case "npc":
        assertNewId(npcs, object.id, "npc");
        npcs[object.id] = {
          id: object.id,
          name: object.name,
          factionId: object.faction,
          dialogueId: object.dialogue,
          schedule: object.schedule,
          pockets: object.pockets,
          ...(object.shop !== undefined ? { shop: { sells: object.shop.sells } } : {}),
          ...(object.confront !== undefined
            ? {
                confront: {
                  standingBelow: object.confront.standingBelow,
                  dialogueId: object.confront.dialogue,
                },
              }
            : {}),
        };
        break;
      case "item":
        assertNewId(items, object.id, "item");
        items[object.id] = { id: object.id, name: object.name, value: object.value };
        break;
      case "crime":
        if (crimes[object.verb] !== undefined) {
          throw new ContentError(`duplicate crime for verb "${object.verb}"`);
        }
        crimes[object.verb] = object.deed;
        break;
    }
  }

  for (const npc of Object.values(npcs)) {
    if (factions[npc.factionId] === undefined) {
      throw new ContentError(`npc "${npc.id}": unknown faction "${npc.factionId}"`);
    }
    if (dialogues[npc.dialogueId] === undefined) {
      throw new ContentError(`npc "${npc.id}": unknown dialogue "${npc.dialogueId}"`);
    }
    for (let i = 1; i < npc.schedule.length; i += 1) {
      const previous = npc.schedule[i - 1];
      const current = npc.schedule[i];
      if (previous !== undefined && current !== undefined && current.hour <= previous.hour) {
        throw new ContentError(`npc "${npc.id}": schedule hours must be strictly increasing`);
      }
    }
    for (const entry of npc.schedule) {
      if (options.map.locations[entry.location] === undefined) {
        throw new ContentError(
          `npc "${npc.id}": schedule location "${entry.location}" is not on map "${options.map.id}"`,
        );
      }
    }
    for (const itemId of npc.pockets) {
      if (items[itemId] === undefined) {
        throw new ContentError(`npc "${npc.id}": unknown item "${itemId}" in pockets`);
      }
    }
    for (const itemId of npc.shop?.sells ?? []) {
      if (items[itemId] === undefined) {
        throw new ContentError(`npc "${npc.id}": unknown item "${itemId}" in shop`);
      }
    }
    if (npc.confront !== undefined && dialogues[npc.confront.dialogueId] === undefined) {
      throw new ContentError(
        `npc "${npc.id}": unknown dialogue "${npc.confront.dialogueId}" in confront`,
      );
    }
  }

  for (const dialogue of Object.values(dialogues)) {
    if (dialogue.nodes[dialogue.start] === undefined) {
      throw new ContentError(
        `dialogue "${dialogue.id}": start node "${dialogue.start}" does not exist`,
      );
    }
    for (const [nodeId, node] of Object.entries(dialogue.nodes)) {
      if (!node.choices.some((choice) => choice.condition === undefined)) {
        throw new ContentError(
          `dialogue "${dialogue.id}" node "${nodeId}": needs at least one unconditioned choice so the player can always exit`,
        );
      }
      for (const choice of node.choices) {
        if (choice.next !== undefined && dialogue.nodes[choice.next] === undefined) {
          throw new ContentError(
            `dialogue "${dialogue.id}" node "${nodeId}": choice "${choice.text}" points to missing node "${choice.next}"`,
          );
        }
        for (const effect of choice.effects ?? []) {
          if (effect.type === "deed" && deeds[effect.deedId] === undefined) {
            throw new ContentError(
              `dialogue "${dialogue.id}" node "${nodeId}": choice "${choice.text}" references unknown deed "${effect.deedId}"`,
            );
          }
        }
      }
    }
  }

  for (const [verb, deedId] of Object.entries(crimes)) {
    if (deeds[deedId] === undefined) {
      throw new ContentError(`crime "${verb}": unknown deed "${deedId}"`);
    }
  }
  for (const placed of options.map.items) {
    if (items[placed.itemId] === undefined) {
      throw new ContentError(
        `map "${options.map.id}": unknown item "${placed.itemId}" placed at (${placed.pos.x},${placed.pos.y})`,
      );
    }
  }

  return { map: options.map, factions, npcs, dialogues, deeds, items, crimes };
}

function assertNewId(bucket: Record<string, unknown>, id: string, kind: string): void {
  if (Object.hasOwn(bucket, id)) {
    throw new ContentError(`duplicate ${kind} id "${id}"`);
  }
}

function toDialogueDef(object: DialogueObject): DialogueDef {
  const nodes: Record<string, DialogueNode> = {};
  for (const [nodeId, node] of Object.entries(object.nodes)) {
    nodes[nodeId] = {
      text: node.text,
      choices: node.choices.map((choice) => ({
        text: choice.text,
        ...(choice.next !== undefined ? { next: choice.next } : {}),
        ...(choice.condition !== undefined ? { condition: choice.condition } : {}),
        ...(choice.effects !== undefined
          ? {
              effects: choice.effects.map((effect) =>
                effect.type === "deed"
                  ? { type: "deed" as const, deedId: effect.deed }
                  : { type: "pay" as const, amount: effect.amount },
              ),
            }
          : {}),
      })),
    };
  }
  return { id: object.id, start: object.start, nodes };
}
