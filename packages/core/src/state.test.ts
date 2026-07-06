import { describe, expect, it } from "vitest";
import { createGameState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

describe("createGameState", () => {
  it("spawns the player at the map spawn with an empty ledger", () => {
    const state = createGameState({ seed: 7, world: fixtureWorld() });
    expect(state.tick).toBe(0);
    expect(state.player.pos).toEqual({ x: 1, y: 1 });
    expect(state.dialogue).toBeNull();
    expect(state.deeds).toEqual([]);
  });

  it("places NPCs at their scheduled posts for the starting hour, sorted by id", () => {
    const state = createGameState({ seed: 7, world: fixtureWorld() });
    expect(state.npcs).toEqual([
      { id: "test:keeper", pos: { x: 4, y: 4 } },
      { id: "test:walker", pos: { x: 6, y: 1 } },
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
