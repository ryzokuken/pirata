import type { Vec2 } from "./state.ts";

export interface PlayerMovedEvent {
  readonly type: "player-moved";
  readonly from: Vec2;
  readonly to: Vec2;
}

export interface MovementBlockedEvent {
  readonly type: "movement-blocked";
  readonly at: Vec2;
  readonly toward: Vec2;
}

export interface NpcMovedEvent {
  readonly type: "npc-moved";
  readonly npcId: string;
  readonly from: Vec2;
  readonly to: Vec2;
}

export type GameEvent = PlayerMovedEvent | MovementBlockedEvent | NpcMovedEvent;
