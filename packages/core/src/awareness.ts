import { isBlocked, type MapModel } from "./map.ts";
import type { WorldDef } from "./defs.ts";
import type { GameState, Vec2 } from "./state.ts";
import { hourOf } from "./time.ts";

export const BASE_PERCEPTION = 5;
export const NIGHT_PERCEPTION = 2;
export const NIGHT_STARTS = 21;
export const NIGHT_ENDS = 5;

export function perceptionRadius(hour: number, sneaking: boolean): number {
  const base = hour >= NIGHT_STARTS || hour < NIGHT_ENDS ? NIGHT_PERCEPTION : BASE_PERCEPTION;
  return sneaking ? Math.ceil(base / 2) : base;
}

/**
 * Bresenham line between tile centers; sight is clear when no intermediate
 * tile is blocked (endpoints never block their own line).
 */
export function lineOfSight(map: MapModel, from: Vec2, to: Vec2): boolean {
  let x = from.x;
  let y = from.y;
  const dx = Math.abs(to.x - x);
  const dy = -Math.abs(to.y - y);
  const sx = x < to.x ? 1 : -1;
  const sy = y < to.y ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    if (x === to.x && y === to.y) {
      return true;
    }
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += sx;
    }
    if (doubled <= dx) {
      error += dx;
      y += sy;
    }
    if (x === to.x && y === to.y) {
      return true;
    }
    if (isBlocked(map, x, y)) {
      return false;
    }
  }
}

/** NPC ids (sorted) that can see an act at `at` right now. */
export function witnesses(state: GameState, world: WorldDef, at: Vec2): readonly string[] {
  // Task 2 replaces this with currentMap(state, world); Task 3 filters by npc.mapId.
  const map = world.maps[state.mapId]!;
  const radius = perceptionRadius(hourOf(state.tick), state.player.sneaking);
  const seen: string[] = [];
  for (const npc of state.npcs) {
    const distance = Math.max(Math.abs(npc.pos.x - at.x), Math.abs(npc.pos.y - at.y));
    if (distance > radius) {
      continue;
    }
    if (!lineOfSight(map, npc.pos, at)) {
      continue;
    }
    seen.push(npc.id);
  }
  return seen.toSorted();
}
