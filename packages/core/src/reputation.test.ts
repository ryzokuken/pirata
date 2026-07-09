import { describe, expect, it } from "vitest";
import { factionStanding, npcStanding } from "./reputation.ts";
import { createGameState, type GameState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

const world = fixtureWorld();

function stateWithDeeds(deeds: GameState["deeds"]): GameState {
  return { ...createGameState({ seed: 1, world }), deeds };
}

describe("knowledge-based standing", () => {
  it("is zero with an empty ledger", () => {
    const state = stateWithDeeds([]);
    expect(npcStanding(state, world, "test:keeper")).toBe(0);
    expect(factionStanding(state, world, "test:guild")).toBe(0);
  });

  it("counts only deeds the NPC knows about", () => {
    const state = stateWithDeeds([
      { deedId: "test:theft", tick: 1, knownBy: ["test:keeper"] },
      { deedId: "test:slight", npcId: "test:walker", tick: 2, knownBy: ["test:walker"] },
    ]);
    expect(npcStanding(state, world, "test:keeper")).toBe(-20);
    expect(npcStanding(state, world, "test:walker")).toBe(-10);
    expect(npcStanding(state, world, "test:guard")).toBe(0);
  });

  it("gives an unwitnessed deed no standing anywhere", () => {
    const state = stateWithDeeds([{ deedId: "test:theft", tick: 1, knownBy: [] }]);
    expect(npcStanding(state, world, "test:keeper")).toBe(0);
    expect(factionStanding(state, world, "test:guild")).toBe(0);
  });

  it("counts a deed once per faction however many members know", () => {
    const dockersBothKnow = stateWithDeeds([
      { deedId: "test:theft", tick: 1, knownBy: ["test:guard", "test:walker"] },
    ]);
    expect(factionStanding(dockersBothKnow, world, "test:dockers")).toBe(-20);
    expect(factionStanding(dockersBothKnow, world, "test:watch")).toBe(-20);
    expect(factionStanding(dockersBothKnow, world, "test:guild")).toBe(0);
  });

  it("ignores deeds whose definition is unknown", () => {
    const state = stateWithDeeds([{ deedId: "test:ghost", tick: 1, knownBy: ["test:keeper"] }]);
    expect(npcStanding(state, world, "test:keeper")).toBe(0);
  });
});
