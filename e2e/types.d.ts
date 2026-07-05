import type { GameState, Intent } from "@pirata/core";

declare global {
  interface Window {
    __pirata?: {
      getState: () => GameState;
      dispatch: (intent: Intent) => void;
    };
  }
}
