import { describe, expect, it } from "vitest";
import { deserialize, SaveError, serialize } from "./save.ts";
import { createGameState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

describe("save round-trip", () => {
  it("serializes and deserializes to an identical state", () => {
    const state = {
      ...createGameState({ seed: 7, world: fixtureWorld() }),
      dialogue: { npcId: "test:keeper", nodeId: "hello" },
      deeds: [
        { deedId: "test:theft", tick: 3, knownBy: ["test:keeper"] },
        { deedId: "test:praise", npcId: "test:keeper", tick: 5, knownBy: ["test:keeper"] },
      ],
    };
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it("rejects malformed JSON", () => {
    expect(() => deserialize("not json{")).toThrow(SaveError);
  });

  it("rejects the M2 save version", () => {
    expect(() => deserialize(JSON.stringify({ version: 2, state: {} }))).toThrow(/version 2/);
  });

  it("rejects a payload without state", () => {
    expect(() => deserialize(JSON.stringify({ version: 3 }))).toThrow(SaveError);
  });
});
