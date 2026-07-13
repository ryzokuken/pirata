import { writeFileSync } from "node:fs";
import { buildMap, MAPS } from "./map-defs.ts";

for (const spec of MAPS) {
  const built = buildMap(spec);
  const outPath = `packages/content/packs/base/maps/${spec.id}.map.json`;
  writeFileSync(outPath, `${JSON.stringify(built.json, null, 2)}\n`);
  console.log(
    `wrote ${outPath} (${String(built.width)}x${String(built.height)}, spawn at ${String(built.spawn.x)},${String(built.spawn.y)})`,
  );
}
