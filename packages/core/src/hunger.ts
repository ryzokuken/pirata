export const TICKS_PER_HUNGER = 10;
export const HUNGRY_AT = 12;
export const STARVING_AT = 24;
export const HUNGER_MAX = 30;

export type HungerStage = "fed" | "hungry" | "starving";

export function hungerStage(hunger: number): HungerStage {
  if (hunger >= STARVING_AT) {
    return "starving";
  }
  return hunger >= HUNGRY_AT ? "hungry" : "fed";
}
