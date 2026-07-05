import { describe, expect, it } from "vitest";
import { isBlocked, MapParseError, parseTiledMap } from "./map.ts";

function tiledFixture(): Record<string, unknown> {
  return {
    width: 3,
    height: 2,
    tilewidth: 32,
    tileheight: 32,
    layers: [
      { name: "ground", type: "tilelayer", data: [1, 1, 1, 1, 1, 1] },
      { name: "walls", type: "tilelayer", data: [2, 0, 0, 0, 0, 2] },
      {
        name: "spawns",
        type: "objectgroup",
        objects: [{ name: "player", x: 32, y: 0 }],
      },
    ],
  };
}

describe("parseTiledMap", () => {
  it("builds a MapModel with collision and spawn", () => {
    const map = parseTiledMap("test", tiledFixture());
    expect(map.width).toBe(3);
    expect(map.height).toBe(2);
    expect(map.playerSpawn).toEqual({ x: 1, y: 0 });
    expect(isBlocked(map, 0, 0)).toBe(true);
    expect(isBlocked(map, 1, 0)).toBe(false);
    expect(isBlocked(map, 2, 1)).toBe(true);
  });

  it("treats out-of-bounds as blocked", () => {
    const map = parseTiledMap("test", tiledFixture());
    expect(isBlocked(map, -1, 0)).toBe(true);
    expect(isBlocked(map, 3, 0)).toBe(true);
    expect(isBlocked(map, 0, 2)).toBe(true);
  });

  it("rejects a map without a walls layer", () => {
    const fixture = tiledFixture();
    fixture["layers"] = (fixture["layers"] as { name: string }[]).filter((l) => l.name !== "walls");
    expect(() => parseTiledMap("broken", fixture)).toThrow(MapParseError);
    expect(() => parseTiledMap("broken", fixture)).toThrow(/broken.*walls/);
  });

  it("rejects a walls layer with the wrong tile count", () => {
    const fixture = tiledFixture();
    const layers = fixture["layers"] as { name: string; data?: number[] }[];
    const walls = layers.find((l) => l.name === "walls");
    walls?.data?.pop();
    expect(() => parseTiledMap("short", fixture)).toThrow(/expected 6/);
  });

  it("rejects a map without a player spawn", () => {
    const fixture = tiledFixture();
    const layers = fixture["layers"] as { name: string; objects?: { name: string }[] }[];
    const spawns = layers.find((l) => l.name === "spawns");
    if (spawns !== undefined) spawns.objects = [];
    expect(() => parseTiledMap("nospawn", fixture)).toThrow(/player/);
  });

  it("rejects a player spawn outside the map bounds", () => {
    const fixture = tiledFixture();
    const layers = fixture["layers"] as { name: string; objects?: { x: number; y: number }[] }[];
    const spawns = layers.find((l) => l.name === "spawns");
    const player = spawns?.objects?.[0];
    if (player !== undefined) player.x = 32 * 10;
    expect(() => parseTiledMap("oob-spawn", fixture)).toThrow(/outside the map/);
  });
});
