import { describe, expect, it } from "vitest";
import { nextStep, reachableFrom } from "./path.ts";
import { mapFromAscii } from "./world.fixture.ts";

const open = mapFromAscii(["#####", "#...#", "#.#.#", "#...#", "#####"]);

describe("nextStep", () => {
  it("steps directly toward an adjacent target", () => {
    expect(nextStep(open, { x: 1, y: 1 }, { x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
  });

  it("routes around walls (golden first step)", () => {
    // Both routes around the center wall are 4 steps; the fixed neighbor
    // order (N,E,S,W) must deterministically pick east.
    expect(nextStep(open, { x: 1, y: 1 }, { x: 3, y: 3 })).toEqual({ x: 2, y: 1 });
  });

  it("returns undefined when already at the target", () => {
    expect(nextStep(open, { x: 1, y: 1 }, { x: 1, y: 1 })).toBeUndefined();
  });

  it("returns undefined for a blocked target", () => {
    expect(nextStep(open, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeUndefined();
  });

  it("returns undefined when the target is unreachable", () => {
    const sealed = mapFromAscii(["#####", "#.#.#", "#####"]);
    expect(nextStep(sealed, { x: 1, y: 1 }, { x: 3, y: 1 })).toBeUndefined();
  });

  it("is deterministic", () => {
    const a = nextStep(open, { x: 1, y: 1 }, { x: 3, y: 3 });
    const b = nextStep(open, { x: 1, y: 1 }, { x: 3, y: 3 });
    expect(a).toEqual(b);
  });
});

describe("reachableFrom", () => {
  it("marks every floor tile reachable and every wall tile not", () => {
    const grid = reachableFrom(open, { x: 1, y: 1 });
    for (let y = 0; y < open.height; y += 1) {
      for (let x = 0; x < open.width; x += 1) {
        const index = y * open.width + x;
        expect(grid[index]).toBe(!open.blocked[index]);
      }
    }
  });

  it("marks a sealed side room unreachable while the open side stays reachable", () => {
    // Left room (cols 1-3) is open and holds the spawn. The column at x=5 is
    // walled off on both sides (x=4 and x=6) with no door — a sealed room.
    const map = mapFromAscii(["#######", "#...#.#", "#...#.#", "#...#.#", "#######"]);
    const grid = reachableFrom(map, { x: 1, y: 1 });
    expect(grid[1 * map.width + 5]).toBe(false);
    expect(grid[2 * map.width + 5]).toBe(false);
    expect(grid[3 * map.width + 5]).toBe(false);
    expect(grid[1 * map.width + 1]).toBe(true);
    expect(grid[2 * map.width + 2]).toBe(true);
    expect(grid[3 * map.width + 3]).toBe(true);
  });

  it("marks everything unreachable when start is on a blocked tile", () => {
    const grid = reachableFrom(open, { x: 0, y: 0 });
    expect(grid.every((reachable) => !reachable)).toBe(true);
  });
});
