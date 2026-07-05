import { describe, expect, it } from "vitest";
import { deserialize, SaveError, serialize } from "./save.ts";
import { createGameState } from "./state.ts";

describe("save round-trip", () => {
  it("serializes and deserializes to an identical state", () => {
    const state = createGameState({ seed: 7, mapId: "port_town", playerSpawn: { x: 3, y: 4 } });
    expect(deserialize(serialize(state))).toEqual(state);
  });

  it("rejects malformed JSON", () => {
    expect(() => deserialize("not json{")).toThrow(SaveError);
  });

  it("rejects an unsupported version", () => {
    expect(() => deserialize(JSON.stringify({ version: 999, state: {} }))).toThrow(/version 999/);
  });

  it("rejects a payload without state", () => {
    expect(() => deserialize(JSON.stringify({ version: 1 }))).toThrow(SaveError);
  });
});
