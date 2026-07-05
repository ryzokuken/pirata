import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTiledMap } from "@pirata/core";
import { parsePackManifest } from "./loader.ts";

const packDir = process.argv[2] ?? "packages/content/packs/base";
const manifestPath = join(packDir, "pack.json");
const manifest = parsePackManifest(JSON.parse(readFileSync(manifestPath, "utf8")), manifestPath);

const mapsDir = join(packDir, "maps");
const mapFiles = readdirSync(mapsDir).filter((file) => file.endsWith(".map.json"));
if (mapFiles.length === 0) {
  console.error(`${mapsDir}: no .map.json files found`);
  process.exit(1);
}
for (const file of mapFiles) {
  const raw: unknown = JSON.parse(readFileSync(join(mapsDir, file), "utf8"));
  parseTiledMap(file.replace(".map.json", ""), raw);
}
console.log(`pack "${manifest.id}" OK: ${String(mapFiles.length)} map(s) validated`);
