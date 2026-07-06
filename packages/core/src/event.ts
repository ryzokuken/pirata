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

export interface DialogueStartedEvent {
  readonly type: "dialogue-started";
  readonly npcId: string;
  readonly nodeId: string;
}

export interface DialogueAdvancedEvent {
  readonly type: "dialogue-advanced";
  readonly npcId: string;
  readonly nodeId: string;
}

export interface DialogueEndedEvent {
  readonly type: "dialogue-ended";
  readonly npcId: string;
}

export interface DeedRecordedEvent {
  readonly type: "deed-recorded";
  readonly deedId: string;
  readonly npcId: string;
}

export interface ReputationChangedEvent {
  readonly type: "reputation-changed";
  readonly npcId: string;
  readonly factionId: string;
  readonly npcStanding: number;
  readonly factionStanding: number;
}

export interface IntentRejectedEvent {
  readonly type: "intent-rejected";
  readonly reason: string;
}

export type GameEvent =
  | PlayerMovedEvent
  | MovementBlockedEvent
  | NpcMovedEvent
  | DialogueStartedEvent
  | DialogueAdvancedEvent
  | DialogueEndedEvent
  | DeedRecordedEvent
  | ReputationChangedEvent
  | IntentRejectedEvent;
