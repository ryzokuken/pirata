import { advance } from "./advance.ts";
import type { WorldDef } from "./defs.ts";
import type { GameEvent } from "./event.ts";
import type { Intent } from "./intent.ts";
import { createGameState, type GameState } from "./state.ts";

export interface ScenarioResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

/**
 * Headless scenario runner: fold a scripted intent sequence over a fresh
 * world and collect every emitted event. The primary verification tool for
 * behavior-level tests ("insulting the merchant sours the guild").
 */
export function runScenario(options: {
  readonly world: WorldDef;
  readonly seed: number;
  readonly intents: readonly Intent[];
}): ScenarioResult {
  let state = createGameState({ seed: options.seed, world: options.world });
  const events: GameEvent[] = [];
  for (const intent of options.intents) {
    const result = advance(state, intent, options.world);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
