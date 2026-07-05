import { seedRng, type RngState } from "./rng.ts";

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export interface PlayerState {
  readonly pos: Vec2;
}

export interface GameState {
  readonly tick: number;
  readonly rng: RngState;
  readonly mapId: string;
  readonly player: PlayerState;
}

export function createGameState(options: {
  seed: number;
  mapId: string;
  playerSpawn: Vec2;
}): GameState {
  return {
    tick: 0,
    rng: seedRng(options.seed),
    mapId: options.mapId,
    player: { pos: options.playerSpawn },
  };
}
