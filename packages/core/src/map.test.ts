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
      {
        name: "locations",
        type: "objectgroup",
        objects: [{ name: "market", x: 32, y: 32 }],
      },
      {
        name: "items",
        type: "objectgroup",
        objects: [{ name: "test:coin_pouch", x: 32, y: 32 }],
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

describe("parseTiledMap locations", () => {
  it("reads named locations in tile coordinates", () => {
    const map = parseTiledMap("test", tiledFixture());
    expect(map.locations).toEqual({ market: { x: 1, y: 1 } });
  });

  it("defaults to no locations when the layer is absent", () => {
    const fixture = tiledFixture();
    fixture["layers"] = (fixture["layers"] as { name: string }[]).filter(
      (layer) => layer.name !== "locations",
    );
    expect(parseTiledMap("test", fixture).locations).toEqual({});
  });

  it("rejects duplicate location names", () => {
    const fixture = tiledFixture();
    const layers = fixture["layers"] as { name: string; objects?: object[] }[];
    const locations = layers.find((layer) => layer.name === "locations");
    locations?.objects?.push({ name: "market", x: 64, y: 32 });
    expect(() => parseTiledMap("dupe", fixture)).toThrow(/duplicate location "market"/);
  });

  it("rejects a location on a blocked tile", () => {
    const fixture = tiledFixture();
    const layers = fixture["layers"] as {
      name: string;
      objects?: { name: string; x: number; y: number }[];
    }[];
    const locations = layers.find((layer) => layer.name === "locations");
    locations?.objects?.push({ name: "bad", x: 0, y: 0 });
    expect(() => parseTiledMap("blocked", fixture)).toThrow(/"bad".*not on walkable ground/);
  });

  it("rejects a location outside the map", () => {
    const fixture = tiledFixture();
    const layers = fixture["layers"] as {
      name: string;
      objects?: { name: string; x: number; y: number }[];
    }[];
    const locations = layers.find((layer) => layer.name === "locations");
    locations?.objects?.push({ name: "far", x: 32 * 10, y: 0 });
    expect(() => parseTiledMap("oob", fixture)).toThrow(/"far".*outside the map/);
  });

  it("accepts a location named after an Object.prototype property", () => {
    const fixture = tiledFixture();
    const layers = fixture["layers"] as {
      name: string;
      objects?: { name: string; x: number; y: number }[];
    }[];
    const locations = layers.find((layer) => layer.name === "locations");
    locations?.objects?.splice(0, 1, { name: "hasOwnProperty", x: 32, y: 32 });
    expect(parseTiledMap("proto", fixture).locations).toEqual({
      hasOwnProperty: { x: 1, y: 1 },
    });
  });
});

describe("parseTiledMap items", () => {
  it("reads placed items in tile coordinates", () => {
    const map = parseTiledMap("test", tiledFixture());
    expect(map.items).toEqual([{ itemId: "test:coin_pouch", pos: { x: 1, y: 1 } }]);
  });

  it("defaults to no items when the layer is absent", () => {
    const fixture = tiledFixture();
    fixture["layers"] = (fixture["layers"] as { name: string }[]).filter(
      (layer) => layer.name !== "items",
    );
    expect(parseTiledMap("test", fixture).items).toEqual([]);
  });

  it("allows duplicate item placements", () => {
    const fixture = tiledFixture();
    const layers = fixture["layers"] as { name: string; objects?: object[] }[];
    layers
      .find((layer) => layer.name === "items")
      ?.objects?.push({
        name: "test:coin_pouch",
        x: 64,
        y: 0,
      });
    expect(parseTiledMap("test", fixture).items).toHaveLength(2);
  });

  it("rejects an item on a blocked tile", () => {
    const fixture = tiledFixture();
    const layers = fixture["layers"] as { name: string; objects?: object[] }[];
    layers
      .find((layer) => layer.name === "items")
      ?.objects?.push({
        name: "test:anchor",
        x: 0,
        y: 0,
      });
    expect(() => parseTiledMap("blocked", fixture)).toThrow(/"test:anchor".*not on walkable/);
  });
});
