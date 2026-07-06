import { createGameState } from "@pirata/core";
import { describe, expect, it } from "vitest";
import { loadBaseWorld } from "./base.ts";

describe("base pack", () => {
  it("loads, links, and boots a fresh game", () => {
    const world = loadBaseWorld();
    expect(Object.keys(world.npcs)).toHaveLength(4);
    expect(Object.keys(world.factions)).toHaveLength(2);
    const state = createGameState({ seed: 1, world });
    expect(state.npcs).toContainEqual({ id: "base:tavernkeeper", pos: { x: 3, y: 3 } });
    expect(state.npcs).toContainEqual({ id: "base:merchant", pos: { x: 9, y: 3 } });
    expect(state.npcs).toContainEqual({ id: "base:harbormaster", pos: { x: 17, y: 10 } });
    expect(state.npcs).toContainEqual({ id: "base:stevedore", pos: { x: 17, y: 11 } });
  });
});
