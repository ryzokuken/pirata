import type { NpcDef } from "./defs.ts";

/**
 * Where an NPC wants to be at the given hour: the latest schedule entry at
 * or before it. Before the day's first entry, yesterday's last entry still
 * holds (schedules wrap around midnight). Undefined only for an empty
 * schedule, which the content link pass forbids.
 */
export function scheduleTarget(npc: NpcDef, hour: number): string | undefined {
  const last = npc.schedule[npc.schedule.length - 1];
  if (last === undefined) {
    return undefined;
  }
  let target = last.location;
  for (const entry of npc.schedule) {
    if (entry.hour <= hour) {
      target = entry.location;
    }
  }
  return target;
}
