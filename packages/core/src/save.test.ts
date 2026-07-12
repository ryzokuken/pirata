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

  it("round-trips combat, rumors, and hunger", () => {
    const state = {
      ...createGameState({ seed: 7, world: fixtureWorld() }),
      player: {
        ...createGameState({ seed: 7, world: fixtureWorld() }).player,
        hp: 4,
        hunger: 18,
      },
      combat: { enemyIds: ["test:brute"] },
      rumors: ["test:whisper"],
    };
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it("rejects malformed JSON", () => {
    expect(() => deserialize("not json{")).toThrow(SaveError);
  });

  it("rejects the M3 save version", () => {
    expect(() => deserialize(JSON.stringify({ version: 3, state: {} }))).toThrow(/version 3/);
  });

  it("rejects a payload without state", () => {
    expect(() => deserialize(JSON.stringify({ version: 4 }))).toThrow(SaveError);
  });
});
