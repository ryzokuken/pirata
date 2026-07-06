import type { GameState } from "./state.ts";

export const SAVE_VERSION = 2;

export class SaveError extends Error {}

interface SaveFile {
  readonly version: number;
  readonly state: GameState;
}

export function serialize(state: GameState): string {
  const file: SaveFile = { version: SAVE_VERSION, state };
  return JSON.stringify(file);
}

export function deserialize(payload: string): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (cause) {
    throw new SaveError("save file is not valid JSON", { cause });
  }
  const file = parsed as Partial<SaveFile>;
  if (file.version !== SAVE_VERSION) {
    throw new SaveError(
      `save file version ${String(file.version)} is not supported (expected ${SAVE_VERSION})`,
    );
  }
  if (file.state === undefined) {
    throw new SaveError("save file has no state");
  }
  return file.state;
}
