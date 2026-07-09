import crimesJson from "@pirata/content/packs/base/crimes.json" with { type: "json" };
import deedsJson from "@pirata/content/packs/base/deeds.json" with { type: "json" };
import dialoguesJson from "@pirata/content/packs/base/dialogues.json" with { type: "json" };
import factionsJson from "@pirata/content/packs/base/factions.json" with { type: "json" };
import itemsJson from "@pirata/content/packs/base/items.json" with { type: "json" };
import townJson from "@pirata/content/packs/base/maps/port_town.map.json" with { type: "json" };
import npcsJson from "@pirata/content/packs/base/npcs.json" with { type: "json" };
import { parseTiledMap, type WorldDef } from "@pirata/core";
import { finalizeWorld } from "./finalize.ts";
import { parsePackObjects } from "./loader.ts";

/** The base game, loaded through the same pipeline any mod pack would use. */
export function loadBaseWorld(): WorldDef {
  const objects = [
    ...parsePackObjects(factionsJson, "packs/base/factions.json"),
    ...parsePackObjects(deedsJson, "packs/base/deeds.json"),
    ...parsePackObjects(itemsJson, "packs/base/items.json"),
    ...parsePackObjects(crimesJson, "packs/base/crimes.json"),
    ...parsePackObjects(npcsJson, "packs/base/npcs.json"),
    ...parsePackObjects(dialoguesJson, "packs/base/dialogues.json"),
  ];
  return finalizeWorld({ objects, map: parseTiledMap("port_town", townJson) });
}
