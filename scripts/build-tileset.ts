import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { unzipSync } from "fflate";
import { blitRegion, createPng, readPngBuffer, writePngFile } from "./lib/png.ts";
import { TILE, TILES, TILESET_COLUMNS } from "./tileset-manifest.ts";

const ZIP_URL = "https://opengameart.org/sites/default/files/lpc_base_assets.zip";
const ZIP_SHA256 = "69efec8a26ef20b26cfd7a8de370e87d0e667136eba2d00392dde13d2ac52465";
const ZIP_CACHE = ".cache/lpc_base_assets.zip";
const ZIP_TILES_PREFIX = "LPC Base Assets/tiles/";
const OUT_DIR = "packages/content/packs/base/assets";

async function fetchZip(): Promise<Buffer> {
  if (!existsSync(ZIP_CACHE)) {
    mkdirSync(".cache", { recursive: true });
    const response = await fetch(ZIP_URL);
    if (!response.ok) {
      throw new Error(`download failed: ${String(response.status)} ${ZIP_URL}`);
    }
    writeFileSync(ZIP_CACHE, Buffer.from(await response.arrayBuffer()));
  }
  const zip = readFileSync(ZIP_CACHE);
  const digest = createHash("sha256").update(zip).digest("hex");
  if (digest !== ZIP_SHA256) {
    throw new Error(`${ZIP_CACHE}: sha256 ${digest} != pinned ${ZIP_SHA256}; delete and retry`);
  }
  return zip;
}

const entries = unzipSync(new Uint8Array(await fetchZip()));

function entry(path: string): Buffer {
  const data = entries[path];
  if (data === undefined) {
    throw new Error(`${path} missing from ${ZIP_CACHE}`);
  }
  return Buffer.from(data);
}

const sheets = new Map(
  [...new Set(TILES.map((tile) => tile.sheet))].map((sheet) => [
    sheet,
    readPngBuffer(entry(`${ZIP_TILES_PREFIX}${sheet}`)),
  ]),
);

const rows = Math.ceil(TILES.length / TILESET_COLUMNS);
const tileset = createPng(TILESET_COLUMNS * TILE, rows * TILE);
TILES.forEach((tile, index) => {
  const sheet = sheets.get(tile.sheet);
  if (sheet === undefined) {
    throw new Error(`sheet ${tile.sheet} not loaded`);
  }
  const dx = (index % TILESET_COLUMNS) * TILE;
  const dy = Math.floor(index / TILESET_COLUMNS) * TILE;
  blitRegion(tileset, sheet, tile.sx, tile.sy, TILE, TILE, dx, dy);
});

mkdirSync(OUT_DIR, { recursive: true });
writePngFile(`${OUT_DIR}/tileset.png`, tileset);
writeFileSync(
  `${OUT_DIR}/tileset.CREDITS.txt`,
  `Tiles packed by scripts/build-tileset.ts from the LPC base assets\n(${ZIP_URL}).\nLicense: CC-BY-SA 3.0 / GPL 3.0. Original credits follow.\n\n${entry("LPC Base Assets/CREDITS.TXT").toString("utf8")}`,
);
console.log(`wrote ${OUT_DIR}/tileset.png (${String(TILES.length)} tiles) and tileset.CREDITS.txt`);
