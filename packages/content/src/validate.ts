import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createGameState, parseTiledMap, type MapModel } from "@pirata/core";
import { finalizeWorld } from "./finalize.ts";
import { parsePackManifest, parsePackObjects } from "./loader.ts";

const packDir = process.argv[2] ?? "packages/content/packs/base";
const manifestPath = join(packDir, "pack.json");
const manifest = parsePackManifest(JSON.parse(readFileSync(manifestPath, "utf8")), manifestPath);

const mapsDir = join(packDir, "maps");
const maps: MapModel[] = readdirSync(mapsDir)
  .filter((file) => file.endsWith(".map.json"))
  .map((file) => {
    const raw: unknown = JSON.parse(readFileSync(join(mapsDir, file), "utf8"));
    return parseTiledMap(file.replace(".map.json", ""), raw);
  });
const townMap = maps[0];
if (townMap === undefined || maps.length !== 1) {
  console.error(`${mapsDir}: expected exactly one map, found ${String(maps.length)}`);
  process.exit(1);
}

const objects = readdirSync(packDir)
  .filter((file) => file.endsWith(".json") && file !== "pack.json")
  .flatMap((file) => {
    const raw: unknown = JSON.parse(readFileSync(join(packDir, file), "utf8"));
    return parsePackObjects(raw, join(packDir, file));
  });

const world = finalizeWorld({ objects, map: townMap });
createGameState({ seed: 1, world });
console.log(
  `pack "${manifest.id}" OK: ${String(maps.length)} map(s), ${String(objects.length)} object(s), links resolve, world boots`,
);
