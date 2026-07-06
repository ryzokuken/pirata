import { describe, expect, it } from "vitest";
import type { NpcDef } from "./defs.ts";
import { scheduleTarget } from "./npc.ts";

function npcWithSchedule(schedule: NpcDef["schedule"]): NpcDef {
  return {
    id: "test:npc",
    name: "Npc",
    factionId: "test:guild",
    dialogueId: "test:talk",
    schedule,
  };
}

describe("scheduleTarget", () => {
  const npc = npcWithSchedule([
    { hour: 6, location: "dock" },
    { hour: 20, location: "tavern" },
  ]);

  it("picks the latest entry at or before the hour", () => {
    expect(scheduleTarget(npc, 6)).toBe("dock");
    expect(scheduleTarget(npc, 12)).toBe("dock");
    expect(scheduleTarget(npc, 20)).toBe("tavern");
    expect(scheduleTarget(npc, 23)).toBe("tavern");
  });

  it("wraps to yesterday's last entry before the first hour", () => {
    expect(scheduleTarget(npc, 5)).toBe("tavern");
  });

  it("handles a single-entry schedule", () => {
    expect(scheduleTarget(npcWithSchedule([{ hour: 0, location: "bar" }]), 13)).toBe("bar");
  });

  it("returns undefined for an empty schedule", () => {
    expect(scheduleTarget(npcWithSchedule([]), 10)).toBeUndefined();
  });
});
