import { array, assert, constantFrom, property } from "fast-check";
import { describe, expect, it } from "vitest";
import { advance } from "./advance.ts";
import type { Direction } from "./intent.ts";
import { isBlocked, type MapModel } from "./map.ts";
import type { GameState } from "./state.ts";

function mapFromAscii(rows: readonly string[]): MapModel {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const blocked: boolean[] = [];
  let spawn = { x: 1, y: 1 };
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      blocked.push(ch === "#");
      if (ch === "P") spawn = { x, y };
    });
  });
  return { id: "fixture", width, height, blocked, playerSpawn: spawn, locations: {} };
}

const map = mapFromAscii(["#####", "#P..#", "#.#.#", "#####"]);

function freshState(): GameState {
  return {
    tick: 0,
    rng: 42,
    mapId: map.id,
    player: { pos: map.playerSpawn },
    npcs: [],
    dialogue: null,
    deeds: [],
  };
}

describe("advance: move", () => {
  it("moves the player into an open tile and reports it", () => {
    const result = advance(freshState(), { type: "move", direction: "east" }, map);
    expect(result.state.player.pos).toEqual({ x: 2, y: 1 });
    expect(result.state.tick).toBe(1);
    expect(result.events).toEqual([
      { type: "player-moved", from: { x: 1, y: 1 }, to: { x: 2, y: 1 } },
    ]);
  });

  it("blocks movement into a wall, still advancing the tick", () => {
    const result = advance(freshState(), { type: "move", direction: "north" }, map);
    expect(result.state.player.pos).toEqual({ x: 1, y: 1 });
    expect(result.state.tick).toBe(1);
    expect(result.events).toEqual([
      { type: "movement-blocked", at: { x: 1, y: 1 }, toward: { x: 1, y: 0 } },
    ]);
  });

  it("does not mutate the input state", () => {
    const state = freshState();
    advance(state, { type: "move", direction: "east" }, map);
    expect(state.player.pos).toEqual({ x: 1, y: 1 });
    expect(state.tick).toBe(0);
  });
});

const directions: readonly Direction[] = ["north", "south", "east", "west"];

describe("advance: properties", () => {
  it("is deterministic for any intent sequence", () => {
    assert(
      property(array(constantFrom(...directions), { maxLength: 200 }), (moves) => {
        const run = (): string => {
          let state = freshState();
          for (const direction of moves) {
            state = advance(state, { type: "move", direction }, map).state;
          }
          return JSON.stringify(state);
        };
        expect(run()).toBe(run());
      }),
    );
  });

  it("never places the player on a blocked tile", () => {
    assert(
      property(array(constantFrom(...directions), { maxLength: 200 }), (moves) => {
        let state = freshState();
        for (const direction of moves) {
          state = advance(state, { type: "move", direction }, map).state;
          expect(isBlocked(map, state.player.pos.x, state.player.pos.y)).toBe(false);
        }
      }),
    );
  });
});
