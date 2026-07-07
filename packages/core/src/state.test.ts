import { describe, expect, it } from "vitest";
import { createGameState, PLAYER_START_COIN } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

describe("createGameState", () => {
  it("spawns the player with starting coin, no items, not sneaking", () => {
    const state = createGameState({ seed: 7, world: fixtureWorld() });
    expect(state.tick).toBe(0);
    expect(state.player).toEqual({
      pos: { x: 1, y: 1 },
      coin: PLAYER_START_COIN,
      items: [],
      sneaking: false,
    });
    expect(state.dialogue).toBeNull();
    expect(state.trade).toBeNull();
    expect(state.deeds).toEqual([]);
  });

  it("seeds world items from the map and pockets from NPC defs", () => {
    const state = createGameState({ seed: 7, world: fixtureWorld() });
    expect(state.worldItems).toEqual([{ itemId: "test:trinket", pos: { x: 3, y: 3 } }]);
    expect(state.npcs).toEqual([
      { id: "test:guard", pos: { x: 4, y: 1 }, pockets: [] },
      { id: "test:keeper", pos: { x: 4, y: 4 }, pockets: ["test:pearl"] },
      { id: "test:walker", pos: { x: 6, y: 1 }, pockets: [] },
    ]);
  });

  it("rejects two NPCs spawning on the same tile", () => {
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
