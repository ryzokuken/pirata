import { describe, expect, it } from "vitest";
import { buildMap, MAPS } from "./map-defs.ts";
import { gid, TILES } from "./tileset-manifest.ts";

const TOWN_WALKABILITY: readonly string[] = [
  "####################################",
  "#............................#######",
  "#.#######..######............#######",
  "#.#.....#..#....#............#######",
  "#.#.....#..#....#............#######",
  "#.#.....#..##.###............#######",
  "#.##.####....................#######",
  "#............................#######",
  "#............................#######",
  "#.######......######.........#######",
  "#.#....#......#....#.........#######",
  "#.#....#......#....#.........#######",
  "#.#....#......#....#.........#######",
  "#.###.##......###.##.........#######",
  "#............................#######",
  "#............................#######",
  "#.....########...............#######",
  "#.....#......#...................###",
  "#.....#......#...............#######",
  "#.....#......#...............#######",
  "#.....###.####..................####",
  "#............................#######",
  "#............................#######",
  "####################################",
];

const COVE_WALKABILITY: readonly string[] = [
  "############################",
  "############################",
  "########............########",
  "##..................########",
  "##.#####............########",
  "##.###########.#############",
  "##.###########.#############",
  "##.###########.#############",
  "##.#.....................###",
  "##.#.....................###",
  "##.#.....................###",
  "##.#.....................###",
  "##.###########.#############",
  "##........................##",
  "#..........................#",
  "#..........................#",
  "#..........................#",
  "############################",
];

const GOLDENS: Readonly<Record<string, readonly string[]>> = {
  port_town: TOWN_WALKABILITY,
  smugglers_cove: COVE_WALKABILITY,
};

interface TileLayer {
  readonly name: string;
  readonly type: string;
  readonly data: readonly number[];
}

interface BuiltJson {
  readonly width: number;
  readonly height: number;
  readonly layers: readonly TileLayer[];
  readonly tilesets: readonly { name: string; tilecount: number }[];
}

function layer(json: BuiltJson, name: string): TileLayer {
  const found = json.layers.find(
    (candidate) => candidate.type === "tilelayer" && candidate.name === name,
  );
  if (found === undefined) {
    throw new Error(`missing tile layer ${name}`);
  }
  return found;
}

describe.each(MAPS.map((spec) => [spec.id, spec] as const))("buildMap(%s)", (id, spec) => {
  const json = buildMap(spec).json as unknown as BuiltJson;
  const { width, height } = json;

  it("preserves walkability exactly (golden)", () => {
    const walls = layer(json, "walls");
    const grid = Array.from({ length: height }, (_row, y) =>
      Array.from({ length: width }, (_col, x) =>
        (walls.data[y * width + x] ?? 0) === 0 ? "." : "#",
      ).join(""),
    );
    expect(grid).toEqual([...(GOLDENS[id] ?? [])]);
  });

  it("fills the ground layer with valid walkable-terrain gids", () => {
    const ground = layer(json, "ground");
    const allowed = new Set([
      gid("grass"),
      gid("grass_tufts"),
      gid("dirt"),
      gid("planks"),
      gid("cave_floor"),
    ]);
    expect(ground.data).toHaveLength(width * height);
    for (const value of ground.data) {
      expect(allowed.has(value)).toBe(true);
    }
  });

  it("only uses manifest gids in every layer", () => {
    for (const name of ["ground", "walls", "decor"]) {
      for (const value of layer(json, name).data) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(TILES.length);
      }
    }
  });

  it("places decor only on walkable cells", () => {
    const walls = layer(json, "walls");
    const decor = layer(json, "decor");
    decor.data.forEach((value, index) => {
      if (value !== 0 && value !== gid("barrel_top")) {
        expect(walls.data[index]).toBe(0);
      }
    });
  });

  it("keeps the tileset reference in sync with the manifest", () => {
    expect(json.tilesets[0]?.name).toBe("lpc_base");
    expect(json.tilesets[0]?.tilecount).toBe(TILES.length);
  });
});
