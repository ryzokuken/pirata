import type { GameEvent } from "./event.ts";
import { DIRECTION_DELTAS, type Intent } from "./intent.ts";
import { isBlocked, type MapModel } from "./map.ts";
import type { GameState } from "./state.ts";

export interface AdvanceResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

export function advance(state: GameState, intent: Intent, map: MapModel): AdvanceResult {
  const delta = DIRECTION_DELTAS[intent.direction];
  const from = state.player.pos;
  const to = { x: from.x + delta.dx, y: from.y + delta.dy };

  if (isBlocked(map, to.x, to.y)) {
    return {
      state: { ...state, tick: state.tick + 1 },
      events: [{ type: "movement-blocked", at: from, toward: to }],
    };
  }

  return {
    state: { ...state, tick: state.tick + 1, player: { pos: to } },
    events: [{ type: "player-moved", from, to }],
  };
}
