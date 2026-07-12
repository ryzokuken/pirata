import { describe, expect, it } from "vitest";
import type { MapModel } from "./map.ts";
import { createGameState, PLAYER_COMBAT, PLAYER_START_COIN } from "./state.ts";
import { fixtureWorld, LAIR_MAP } from "./world.fixture.ts";

describe("createGameState", () => {
  it("spawns the player with starting coin, no items, not sneaking, fed and full hp", () => {
    const state = createGameState({ seed: 7, world: fixtureWorld() });
    expect(state.tick).toBe(0);
    expect(state.player).toEqual({
      pos: { x: 1, y: 1 },
      coin: PLAYER_START_COIN,
      items: [],
      sneaking: false,
      hp: PLAYER_COMBAT.maxHp,
      hunger: 0,
    });
    expect(state.dialogue).toBeNull();
    expect(state.trade).toBeNull();
    expect(state.deeds).toEqual([]);
    expect(state.combat).toBeNull();
    expect(state.rumors).toEqual([]);
    expect(state.flags).toEqual({ fortuneMade: false });
  });

  it("seeds world items from every map, tagged with their mapId", () => {
    const state = createGameState({ seed: 7, world: fixtureWorld() });
    expect(state.worldItems).toEqual([
      { mapId: "lair", itemId: "test:loot", pos: { x: 2, y: 1 } },
      { mapId: "town", itemId: "test:trinket", pos: { x: 3, y: 3 } },
    ]);
  });

  it("seeds NPCs on their own map, with hp only for combat-capable NPCs", () => {
    const state = createGameState({ seed: 7, world: fixtureWorld() });
    expect(state.npcs).toEqual([
      { id: "test:brute", mapId: "lair", pos: { x: 3, y: 1 }, pockets: ["test:trinket"], hp: 6 },
      { id: "test:guard", mapId: "town", pos: { x: 4, y: 1 }, pockets: [] },
      { id: "test:keeper", mapId: "town", pos: { x: 4, y: 4 }, pockets: ["test:pearl"] },
      { id: "test:walker", mapId: "town", pos: { x: 6, y: 1 }, pockets: [] },
    ]);
    for (const npc of state.npcs) {
      expect(npc).not.toHaveProperty("alert");
    }
  });

  it("scopes spawn occupancy per map: NPCs on different maps may share coordinates", () => {
    // (4,1) is test:guard's tile on the town map; give the lair a location at
    // the same coordinates and spawn an NPC there too — no collision.
    const world = fixtureWorld();
    const overlappingLair: MapModel = {
      ...LAIR_MAP,
      locations: { ...LAIR_MAP.locations, d: { x: 4, y: 1 } },
    };
    const overlapping = {
      ...world,
      maps: { ...world.maps, lair: overlappingLair },
      npcs: {
        ...world.npcs,
        "test:double": {
          ...world.npcs["test:brute"]!,
          id: "test:double",
          schedule: [{ hour: 0, location: "d" }],
        },
      },
    };
    const state = createGameState({ seed: 7, world: overlapping });
    expect(state.npcs.find((npc) => npc.id === "test:guard")?.pos).toEqual({ x: 4, y: 1 });
    expect(state.npcs.find((npc) => npc.id === "test:double")?.pos).toEqual({ x: 4, y: 1 });
  });

  it("rejects two NPCs spawning on the same tile on the same map", () => {
    const world = fixtureWorld();
    const clash = {
      ...world,
      npcs: {
        ...world.npcs,
        "test:squatter": { ...world.npcs["test:walker"]!, id: "test:squatter" },
      },
    };
    expect(() => createGameState({ seed: 7, world: clash })).toThrow(/same tile/);
  });

  it("rejects a schedule location missing from the map", () => {
    const world = fixtureWorld();
    const lost = {
      ...world,
      npcs: {
        "test:lost": {
          ...world.npcs["test:keeper"]!,
          id: "test:lost",
          schedule: [{ hour: 0, location: "z" }],
        },
      },
    };
    expect(() => createGameState({ seed: 7, world: lost })).toThrow(/test:lost/);
  });
});
