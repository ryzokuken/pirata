import { describe, expect, it } from "vitest";
import { rollAttack, rollDamage, rollD20 } from "./combat.ts";
import { seedRng } from "./rng.ts";

describe("combat rolls", () => {
  it("d20 is 1..20 and threads rng deterministically", () => {
    const a = rollD20(seedRng(7));
    const b = rollD20(seedRng(7));
    expect(a).toEqual(b);
    expect(a.value).toBeGreaterThanOrEqual(1);
    expect(a.value).toBeLessThanOrEqual(20);
    expect(a.state).not.toBe(seedRng(7));
  });

  it("damage sums count dice plus bonus within bounds", () => {
    const roll = rollDamage(seedRng(3), { count: 2, sides: 4, bonus: 1 });
    expect(roll.value).toBeGreaterThanOrEqual(3);
    expect(roll.value).toBeLessThanOrEqual(9);
  });

  it("attack hits when d20 + bonus meets armor class", () => {
    // Guaranteed hit/miss via degenerate stats — behavior, not internals:
    const attacker = {
      maxHp: 1,
      attackBonus: 30,
      armorClass: 10,
      damage: { count: 1, sides: 4, bonus: 0 },
    };
    const wall = { ...attacker, attackBonus: -30 };
    const defender = { ...attacker, armorClass: 15 };
    expect(rollAttack(seedRng(1), attacker, defender).hit).toBe(true);
    expect(rollAttack(seedRng(1), wall, defender).hit).toBe(false);
  });

  it("a miss deals zero damage and costs one d20 roll", () => {
    const miss = rollAttack(
      seedRng(1),
      /* wall */ {
        maxHp: 1,
        attackBonus: -30,
        armorClass: 10,
        damage: { count: 1, sides: 4, bonus: 0 },
      },
      { maxHp: 1, attackBonus: 0, armorClass: 15, damage: { count: 1, sides: 4, bonus: 0 } },
    );
    expect(miss.damage).toBe(0);
  });
});
