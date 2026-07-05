export type Direction = "north" | "south" | "east" | "west";

export interface MoveIntent {
  readonly type: "move";
  readonly direction: Direction;
}

export type Intent = MoveIntent;

export const DIRECTION_DELTAS: Record<Direction, { readonly dx: number; readonly dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};
