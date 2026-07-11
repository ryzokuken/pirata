export type Direction = "north" | "south" | "east" | "west";

export interface MoveIntent {
  readonly type: "move";
  readonly direction: Direction;
}

export interface WaitIntent {
  readonly type: "wait";
}

export interface TalkIntent {
  readonly type: "talk";
}

export interface ChooseIntent {
  readonly type: "choose";
  readonly index: number;
}

export interface SneakIntent {
  readonly type: "sneak";
}

export interface TakeIntent {
  readonly type: "take";
}

export interface PickpocketIntent {
  readonly type: "pickpocket";
}

export interface TradeIntent {
  readonly type: "trade";
}

export interface BuyIntent {
  readonly type: "buy";
  readonly index: number;
}

export interface SellIntent {
  readonly type: "sell";
  readonly index: number;
}

export interface CloseTradeIntent {
  readonly type: "close-trade";
}

export interface EatIntent {
  readonly type: "eat";
  readonly index: number;
}

export type Intent =
  | MoveIntent
  | WaitIntent
  | TalkIntent
  | ChooseIntent
  | SneakIntent
  | TakeIntent
  | PickpocketIntent
  | TradeIntent
  | BuyIntent
  | SellIntent
  | CloseTradeIntent
  | EatIntent;

export const DIRECTION_DELTAS: Record<Direction, { readonly dx: number; readonly dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};
