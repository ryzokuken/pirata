import { isBlocked, type MapModel } from "./map.ts";
import type { Vec2 } from "./state.ts";

const STEP_ORDER: readonly Vec2[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/**
 * First step of a shortest path from `from` to `to`, or undefined when
 * already there or unreachable. Deterministic: BFS with a fixed neighbor
 * order. Ignores entities on purpose — callers decide what "occupied" means.
 */
export function nextStep(map: MapModel, from: Vec2, to: Vec2): Vec2 | undefined {
  if (from.x === to.x && from.y === to.y) {
    return undefined;
  }
  if (isBlocked(map, to.x, to.y) || isBlocked(map, from.x, from.y)) {
    return undefined;
  }

  const distances = Array.from({ length: map.width * map.height }, () => -1);
  distances[to.y * map.width + to.x] = 0;
  const queue: Vec2[] = [to];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    if (current === undefined) {
      break;
    }
    const currentDistance = distances[current.y * map.width + current.x] ?? 0;
    for (const step of STEP_ORDER) {
      const next = { x: current.x + step.x, y: current.y + step.y };
      if (isBlocked(map, next.x, next.y)) {
        continue;
      }
      const index = next.y * map.width + next.x;
      if (distances[index] !== -1) {
        continue;
      }
      distances[index] = currentDistance + 1;
      queue.push(next);
    }
  }

  const fromDistance = distances[from.y * map.width + from.x] ?? -1;
  if (fromDistance === -1) {
    return undefined;
  }
  for (const step of STEP_ORDER) {
    const next = { x: from.x + step.x, y: from.y + step.y };
    if (isBlocked(map, next.x, next.y)) {
      continue;
    }
    if (distances[next.y * map.width + next.x] === fromDistance - 1) {
      return next;
    }
  }
  return undefined;
}

/**
 * Every tile reachable from `start` by 4-directional walking, as a
 * width*height boolean grid. Ignores entities — this is static geometry.
 */
export function reachableFrom(map: MapModel, start: Vec2): readonly boolean[] {
  const reachable = Array.from({ length: map.width * map.height }, () => false);
  if (isBlocked(map, start.x, start.y)) {
    return reachable;
  }

  reachable[start.y * map.width + start.x] = true;
  const queue: Vec2[] = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    if (current === undefined) {
      break;
    }
    for (const step of STEP_ORDER) {
      const next = { x: current.x + step.x, y: current.y + step.y };
      if (isBlocked(map, next.x, next.y)) {
        continue;
      }
      const index = next.y * map.width + next.x;
      if (reachable[index] === true) {
        continue;
      }
      reachable[index] = true;
      queue.push(next);
    }
  }
  return reachable;
}
