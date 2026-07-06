export const TICKS_PER_HOUR = 10;
export const HOURS_PER_DAY = 24;
export const TICKS_PER_DAY = TICKS_PER_HOUR * HOURS_PER_DAY;
export const START_HOUR = 8;

export interface Clock {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

export function clockOf(tick: number): Clock {
  const absolute = tick + START_HOUR * TICKS_PER_HOUR;
  return {
    day: Math.floor(absolute / TICKS_PER_DAY) + 1,
    hour: Math.floor((absolute % TICKS_PER_DAY) / TICKS_PER_HOUR),
    minute: (absolute % TICKS_PER_HOUR) * (60 / TICKS_PER_HOUR),
  };
}

export function hourOf(tick: number): number {
  return clockOf(tick).hour;
}
