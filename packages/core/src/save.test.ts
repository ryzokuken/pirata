import { describe, expect, it } from "vitest";
import { deserialize, SaveError, serialize } from "./save.ts";
import { createGameState } from "./state.ts";
import { fixtureWorld } from "./world.fixture.ts";

describe("save round-trip", () => {
  it("serializes and deserializes to an identical state", () => {
    const state = {
      ...createGameState({ seed: 7, world: fixtureWorld() }),
      dialogue: { npcId: "test:keeper", nodeId: "hello" },
      deeds: [{ deedId: "test:praise", npcId: "test:keeper", tick: 3 }],
    };
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it("rejects malformed JSON", () => {
    expect(() => deserialize("not json{")).toThrow(SaveError);
  });

  it("rejects the M1 save version", () => {
    expect(() => deserialize(JSON.stringify({ version: 1, state: {} }))).toThrow(/version 1/);
  });

  it("rejects a payload without state", () => {
    expect(() => deserialize(JSON.stringify({ version: 2 }))).toThrow(SaveError);
  });
});
