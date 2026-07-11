import type { CombatantDef, DamageDie } from "./defs.ts";
import { nextInt, type RngState } from "./rng.ts";

export function rollD20(rng: RngState): { value: number; state: RngState } {
  const roll = nextInt(rng, 20);
  return { value: roll.value + 1, state: roll.state };
}

export function rollDamage(rng: RngState, die: DamageDie): { value: number; state: RngState } {
  let state = rng;
  let total = die.bonus;
  for (let i = 0; i < die.count; i += 1) {
    const roll = nextInt(state, die.sides);
    total += roll.value + 1;
    state = roll.state;
  }
  return { value: total, state };
}

export function rollAttack(
  rng: RngState,
  attacker: CombatantDef,
  defender: CombatantDef,
): { hit: boolean; damage: number; state: RngState } {
  const toHit = rollD20(rng);
  if (toHit.value + attacker.attackBonus < defender.armorClass) {
    return { hit: false, damage: 0, state: toHit.state };
  }
  const damage = rollDamage(toHit.state, attacker.damage);
  return { hit: true, damage: damage.value, state: damage.state };
}
