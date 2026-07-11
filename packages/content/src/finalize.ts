import {
  reachableFrom,
  type CrimeVerb,
  type DeedDef,
  type DialogueDef,
  type DialogueNode,
  type FactionDef,
  type ItemDef,
  type MapModel,
  type NpcDef,
  type RumorDef,
  type Vec2,
  type WorldDef,
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
  readonly maps: readonly MapModel[];
  readonly startMapId: string;
}): WorldDef {
  const maps: Record<string, MapModel> = {};
  for (const map of options.maps) {
    assertNewId(maps, map.id, "map");
    maps[map.id] = map;
  }
  if (maps[options.startMapId] === undefined) {
    throw new ContentError(`unknown start map "${options.startMapId}"`);
  }

  const factions: Record<string, FactionDef> = {};
  const deeds: Record<string, DeedDef> = {};
  const dialogues: Record<string, DialogueDef> = {};
  const npcs: Record<string, NpcDef> = {};
  const items: Record<string, ItemDef> = {};
  const crimes: Partial<Record<CrimeVerb, string>> = {};
  const rumors: Record<string, RumorDef> = {};

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
          mapId: object.map ?? options.startMapId,
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
          ...(object.hostile !== undefined ? { hostile: object.hostile } : {}),
          ...(object.combat !== undefined ? { combat: object.combat } : {}),
        };
        break;
      case "item":
        assertNewId(items, object.id, "item");
        items[object.id] = {
          id: object.id,
          name: object.name,
          value: object.value,
          ...(object.food !== undefined ? { food: object.food } : {}),
          ...(object.treasure !== undefined ? { treasure: object.treasure } : {}),
        };
        break;
      case "crime":
        if (crimes[object.verb] !== undefined) {
          throw new ContentError(`duplicate crime for verb "${object.verb}"`);
        }
        crimes[object.verb] = object.deed;
        break;
      case "rumor":
        assertNewId(rumors, object.id, "rumor");
        rumors[object.id] = { id: object.id, text: object.text };
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
    const map = maps[npc.mapId];
    if (map === undefined) {
      throw new ContentError(`npc "${npc.id}": unknown map "${npc.mapId}"`);
    }
    if (npc.hostile === true && npc.combat === undefined) {
      throw new ContentError(`npc "${npc.id}": hostile without combat stats`);
    }
    for (let i = 1; i < npc.schedule.length; i += 1) {
      const previous = npc.schedule[i - 1];
      const current = npc.schedule[i];
      if (previous !== undefined && current !== undefined && current.hour <= previous.hour) {
        throw new ContentError(`npc "${npc.id}": schedule hours must be strictly increasing`);
      }
    }
    for (const entry of npc.schedule) {
      if (map.locations[entry.location] === undefined) {
        throw new ContentError(
          `npc "${npc.id}": schedule location "${entry.location}" is not on map "${map.id}"`,
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
          if (effect.type === "rumor" && rumors[effect.rumorId] === undefined) {
            throw new ContentError(
              `dialogue "${dialogue.id}" node "${nodeId}": choice "${choice.text}" references unknown rumor "${effect.rumorId}"`,
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
  for (const map of Object.values(maps)) {
    for (const placed of map.items) {
      if (items[placed.itemId] === undefined) {
        throw new ContentError(
          `map "${map.id}": unknown item "${placed.itemId}" placed at (${placed.pos.x},${placed.pos.y})`,
        );
      }
    }
    for (const portal of map.portals) {
      const target = maps[portal.toMapId];
      if (target === undefined) {
        throw new ContentError(`map "${map.id}": portal to unknown map "${portal.toMapId}"`);
      }
      if (target.locations[portal.toLocation] === undefined) {
        throw new ContentError(
          `map "${map.id}": portal to unknown location "${portal.toLocation}" on map "${portal.toMapId}"`,
        );
      }
    }
  }

  for (const map of Object.values(maps)) {
    const entryPoints: Vec2[] = [];
    if (map.id === options.startMapId) {
      entryPoints.push(map.playerSpawn);
    }
    for (const source of Object.values(maps)) {
      for (const portal of source.portals) {
        if (portal.toMapId === map.id) {
          const arrival = map.locations[portal.toLocation];
          if (arrival !== undefined) {
            entryPoints.push(arrival);
          }
        }
      }
    }
    const reachable = unionReachable(map, entryPoints);
    const isReachable = (pos: Vec2): boolean => reachable[pos.y * map.width + pos.x] === true;

    for (const npc of Object.values(npcs)) {
      if (npc.mapId !== map.id) {
        continue;
      }
      for (const entry of npc.schedule) {
        const pos = map.locations[entry.location];
        if (pos !== undefined && !isReachable(pos)) {
          throw new ContentError(
            `map "${map.id}": location "${entry.location}" at (${pos.x},${pos.y}) is unreachable from the map's entry points (blocked off by walls?)`,
          );
        }
      }
    }
    for (const placed of map.items) {
      if (!isReachable(placed.pos)) {
        throw new ContentError(
          `map "${map.id}": item "${placed.itemId}" at (${placed.pos.x},${placed.pos.y}) is unreachable from the map's entry points (blocked off by walls?)`,
        );
      }
    }
    for (const portal of map.portals) {
      if (!isReachable(portal.at)) {
        throw new ContentError(
          `map "${map.id}": portal "${portal.toMapId}/${portal.toLocation}" at (${portal.at.x},${portal.at.y}) is unreachable from the map's entry points (blocked off by walls?)`,
        );
      }
    }
  }

  return {
    maps,
    startMapId: options.startMapId,
    factions,
    npcs,
    dialogues,
    deeds,
    items,
    crimes,
    rumors,
  };
}

function unionReachable(map: MapModel, entryPoints: readonly Vec2[]): readonly boolean[] {
  const union = Array.from({ length: map.width * map.height }, () => false);
  for (const entry of entryPoints) {
    const reachable = reachableFrom(map, entry);
    for (let i = 0; i < union.length; i += 1) {
      union[i] = union[i] === true || reachable[i] === true;
    }
  }
  return union;
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
              effects: choice.effects.map((effect) => {
                switch (effect.type) {
                  case "deed":
                    return { type: "deed" as const, deedId: effect.deed };
                  case "pay":
                    return { type: "pay" as const, amount: effect.amount };
                  case "rumor":
                    return { type: "rumor" as const, rumorId: effect.rumor };
                }
              }),
            }
          : {}),
      })),
    };
  }
  return { id: object.id, start: object.start, nodes };
}
