import { describe, expect, it } from "vitest";
import { gid, TILE, TILES, TILESET_COLUMNS } from "./tileset-manifest.ts";

describe("tileset manifest", () => {
  it("assigns 1-based gids in manifest order", () => {
    expect(gid("grass")).toBe(1);
    expect(gid("cave_floor")).toBe(TILES.length);
  });

  it("rejects unknown tile names", () => {
    expect(() => gid("lava")).toThrow(/lava/);
  });

  it("has unique names and 32px-aligned source coordinates", () => {
    const names = new Set(TILES.map((tile) => tile.name));
    expect(names.size).toBe(TILES.length);
    for (const tile of TILES) {
      expect(tile.sx % TILE).toBe(0);
      expect(tile.sy % TILE).toBe(0);
    }
  });

  it("fits the declared column count", () => {
    expect(TILES.length).toBeLessThanOrEqual(TILESET_COLUMNS * 4);
  });
});
