import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createGameState, parseTiledMap, type MapModel } from "@pirata/core";
import { finalizeWorld } from "./finalize.ts";
import { parsePackManifest, parsePackObjects } from "./loader.ts";

const packDir = process.argv[2] ?? "packages/content/packs/base";
const manifestPath = join(packDir, "pack.json");
const manifest = parsePackManifest(JSON.parse(readFileSync(manifestPath, "utf8")), manifestPath);

const mapsDir = join(packDir, "maps");
// Sorted so the start map is deterministic across filesystems; the base pack's
// own start map ("port_town") sorts first alongside the cove either way.
const maps: MapModel[] = readdirSync(mapsDir)
  .filter((file) => file.endsWith(".map.json"))
  .toSorted()
  .map((file) => {
    const raw: unknown = JSON.parse(readFileSync(join(mapsDir, file), "utf8"));
    return parseTiledMap(file.replace(".map.json", ""), raw);
  });
const startMap = maps[0];
if (startMap === undefined) {
  console.error(`${mapsDir}: expected at least one map, found none`);
  process.exit(1);
}

const objects = readdirSync(packDir)
  .filter((file) => file.endsWith(".json") && file !== "pack.json")
  .flatMap((file) => {
    const raw: unknown = JSON.parse(readFileSync(join(packDir, file), "utf8"));
    return parsePackObjects(raw, join(packDir, file));
  });

const world = finalizeWorld({ objects, maps, startMapId: startMap.id });
createGameState({ seed: 1, world });

if (manifest.assets !== undefined) {
  const images = [
    manifest.assets.tileset.image,
    ...Object.values(manifest.assets.characters).map((character) => character.image),
  ];
  const missingFiles = images.filter((image) => !existsSync(join(packDir, image)));
  if (missingFiles.length > 0) {
    console.error(`${packDir}: asset files missing on disk:\n${missingFiles.join("\n")}`);
    process.exit(1);
  }
  for (const object of objects) {
    if (object.type === "npc" && object.sprite !== undefined) {
      if (manifest.assets.characters[object.sprite] === undefined) {
        console.error(
          `${packDir}: npc "${object.id}" sprite "${object.sprite}" has no character sheet`,
        );
        process.exit(1);
      }
    }
  }
}

console.log(
  `pack "${manifest.id}" OK: ${String(maps.length)} map(s), ${String(objects.length)} object(s), links resolve, world boots${manifest.assets !== undefined ? ", assets OK" : ""}`,
);
