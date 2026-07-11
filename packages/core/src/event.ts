import type { HungerStage } from "./hunger.ts";
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

export interface MapChangedEvent {
  readonly type: "map-changed";
  readonly fromMapId: string;
  readonly toMapId: string;
  readonly at: Vec2;
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

export interface SneakToggledEvent {
  readonly type: "sneak-toggled";
  readonly sneaking: boolean;
}

export interface ItemTakenEvent {
  readonly type: "item-taken";
  readonly itemId: string;
  readonly at: Vec2;
}

export interface CrimeWitnessedEvent {
  readonly type: "crime-witnessed";
  readonly deedId: string;
  readonly witnessIds: readonly string[];
}

export interface PickpocketSucceededEvent {
  readonly type: "pickpocket-succeeded";
  readonly npcId: string;
  readonly itemId: string;
}

export interface PickpocketFailedEvent {
  readonly type: "pickpocket-failed";
  readonly npcId: string;
}

export interface GossipSharedEvent {
  readonly type: "gossip-shared";
  readonly fromNpcId: string;
  readonly toNpcId: string;
  readonly deedId: string;
}

export interface CoinPaidEvent {
  readonly type: "coin-paid";
  readonly amount: number;
  readonly npcId: string;
}

export interface TradeStartedEvent {
  readonly type: "trade-started";
  readonly npcId: string;
}

export interface TradeEndedEvent {
  readonly type: "trade-ended";
  readonly npcId: string;
}

export interface ItemBoughtEvent {
  readonly type: "item-bought";
  readonly itemId: string;
  readonly price: number;
}

export interface ItemSoldEvent {
  readonly type: "item-sold";
  readonly itemId: string;
  readonly price: number;
}

export interface RumorHeardEvent {
  readonly type: "rumor-heard";
  readonly rumorId: string;
}

export interface AteFoodEvent {
  readonly type: "ate-food";
  readonly itemId: string;
}

export interface HungerChangedEvent {
  readonly type: "hunger-changed";
  readonly stage: HungerStage;
}

export interface NpcAlertedEvent {
  readonly type: "npc-alerted";
  readonly npcId: string;
}

export interface NpcCalmedEvent {
  readonly type: "npc-calmed";
  readonly npcId: string;
}

export interface CombatStartedEvent {
  readonly type: "combat-started";
  readonly enemyIds: readonly string[];
}

export type GameEvent =
  | PlayerMovedEvent
  | MovementBlockedEvent
  | NpcMovedEvent
  | MapChangedEvent
  | DialogueStartedEvent
  | DialogueAdvancedEvent
  | DialogueEndedEvent
  | DeedRecordedEvent
  | ReputationChangedEvent
  | IntentRejectedEvent
  | SneakToggledEvent
  | ItemTakenEvent
  | CrimeWitnessedEvent
  | PickpocketSucceededEvent
  | PickpocketFailedEvent
  | GossipSharedEvent
  | CoinPaidEvent
  | TradeStartedEvent
  | TradeEndedEvent
  | ItemBoughtEvent
  | ItemSoldEvent
  | RumorHeardEvent
  | AteFoodEvent
  | HungerChangedEvent
  | NpcAlertedEvent
  | NpcCalmedEvent
  | CombatStartedEvent;
