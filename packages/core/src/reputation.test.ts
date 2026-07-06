import { describe, expect, it } from "vitest";
import { factionStanding, npcStanding } from "./reputation.ts";
import { createGameState, type GameState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

const world = fixtureWorld();

function stateWithDeeds(deeds: GameState["deeds"]): GameState {
  return { ...createGameState({ seed: 1, world }), deeds };
}

describe("standing", () => {
  it("is zero with an empty ledger", () => {
    const state = stateWithDeeds([]);
    expect(npcStanding(state, world, "test:keeper")).toBe(0);
    expect(factionStanding(state, world, "test:guild")).toBe(0);
  });

  it("sums deltas of deeds the NPC witnessed", () => {
    const state = stateWithDeeds([
      { deedId: "test:praise", npcId: "test:keeper", tick: 1 },
      { deedId: "test:praise", npcId: "test:keeper", tick: 2 },
      { deedId: "test:slight", npcId: "test:keeper", tick: 3 },
    ]);
    expect(npcStanding(state, world, "test:keeper")).toBe(10);
  });

  it("keeps ledgers per NPC", () => {
    const state = stateWithDeeds([{ deedId: "test:slight", npcId: "test:walker", tick: 1 }]);
    expect(npcStanding(state, world, "test:keeper")).toBe(0);
    expect(npcStanding(state, world, "test:walker")).toBe(-10);
  });

  it("aggregates faction standing across member witnesses only", () => {
    const state = stateWithDeeds([
      { deedId: "test:praise", npcId: "test:keeper", tick: 1 },
      { deedId: "test:slight", npcId: "test:walker", tick: 2 },
    ]);
    expect(factionStanding(state, world, "test:guild")).toBe(10);
    expect(factionStanding(state, world, "test:dockers")).toBe(-10);
  });

  it("ignores deeds whose definition is unknown", () => {
    const state = stateWithDeeds([{ deedId: "test:ghost", npcId: "test:keeper", tick: 1 }]);
    expect(npcStanding(state, world, "test:keeper")).toBe(0);
  });
});
