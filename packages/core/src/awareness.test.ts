import { describe, expect, it } from "vitest";
import { lineOfSight, perceptionRadius, witnesses } from "./awareness.ts";
import { createGameState } from "./state.ts";
import { fixtureWorld, mapFromAscii } from "./world.fixture.ts";

const world = fixtureWorld();

describe("lineOfSight", () => {
  const map = mapFromAscii(["#####", "#...#", "#.#.#", "#...#", "#####"]);

  it("sees along an open row", () => {
    expect(lineOfSight(map, { x: 1, y: 1 }, { x: 3, y: 1 })).toBe(true);
  });

  it("is blocked by a wall between", () => {
    expect(lineOfSight(map, { x: 1, y: 2 }, { x: 3, y: 2 })).toBe(false);
  });

  it("a wall square on the diagonal blocks sight", () => {
    expect(lineOfSight(map, { x: 1, y: 1 }, { x: 3, y: 3 })).toBe(false);
  });

  it("always sees adjacent tiles", () => {
    expect(lineOfSight(map, { x: 1, y: 1 }, { x: 2, y: 1 })).toBe(true);
    expect(lineOfSight(map, { x: 2, y: 1 }, { x: 3, y: 2 })).toBe(true);
  });
});

describe("perceptionRadius (golden values)", () => {
  it("is 5 by day, 2 at night", () => {
    expect(perceptionRadius(12, false)).toBe(5);
    expect(perceptionRadius(21, false)).toBe(2);
    expect(perceptionRadius(4, false)).toBe(2);
    expect(perceptionRadius(5, false)).toBe(5);
  });

  it("is halved (ceil) while sneaking", () => {
    expect(perceptionRadius(12, true)).toBe(3);
    expect(perceptionRadius(23, true)).toBe(1);
  });
});

describe("witnesses", () => {
  it("the keeper sees the act on the diagonal-adjacent trinket tile", () => {
    const state = createGameState({ seed: 1, world });
    expect(witnesses(state, world, { x: 3, y: 3 })).toEqual(["test:keeper"]);
  });

  it("walls hide the act from the guard and the walker", () => {
    const state = createGameState({ seed: 1, world });
    const seen = witnesses(state, world, { x: 3, y: 3 });
    expect(seen).not.toContain("test:guard");
    expect(seen).not.toContain("test:walker");
  });

  it("everyone in the open street sees the player by day", () => {
    const state = createGameState({ seed: 1, world });
    expect(witnesses(state, world, { x: 5, y: 1 })).toEqual(["test:guard", "test:walker"]);
  });

  it("sneaking shrinks the circle", () => {
    const state = createGameState({ seed: 1, world });
    const sneaking = { ...state, player: { ...state.player, sneaking: true } };
    // radius 3 still covers (5,1)->guard(4,1) and walker(6,1); move out to distance 4
    expect(witnesses(sneaking, world, { x: 1, y: 3 })).toEqual([]);
  });

  it("ignores an NPC on another map even when its raw coordinates are adjacent", () => {
    const state = createGameState({ seed: 1, world });
    // The lair brute spawns at (3,1); (3,1) is open floor on the town map
    // too, so an act there would be adjacent by coordinates alone.
    expect(witnesses(state, world, { x: 3, y: 1 })).not.toContain("test:brute");
  });
});
