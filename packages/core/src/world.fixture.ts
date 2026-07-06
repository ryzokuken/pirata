import type { MapModel } from "./map.ts";
import type { Vec2 } from "./state.ts";

/**
 * Builds a MapModel from ASCII art for tests.
 * Legend: '#' wall, '.' floor, 'P' player spawn, any lowercase letter a
 * walkable named location (the letter is the location name).
 */
export function mapFromAscii(rows: readonly string[]): MapModel {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const blocked: boolean[] = [];
  const locations: Record<string, Vec2> = {};
  let spawn = { x: 1, y: 1 };
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      blocked.push(ch === "#");
      if (ch === "P") {
        spawn = { x, y };
      }
      if (ch >= "a" && ch <= "z") {
        locations[ch] = { x, y };
      }
    });
  });
  return { id: "fixture", width, height, blocked, playerSpawn: spawn, locations };
}
