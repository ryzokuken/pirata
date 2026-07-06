import type { MapModel } from "./map.ts";

export interface FactionDef {
  readonly id: string;
  readonly name: string;
}

export interface ScheduleEntry {
  readonly hour: number;
  readonly location: string;
}

export interface NpcDef {
  readonly id: string;
  readonly name: string;
  readonly factionId: string;
  readonly dialogueId: string;
  readonly schedule: readonly ScheduleEntry[];
}

export type DialogueCondition =
  | { readonly type: "npc-standing-at-least"; readonly value: number }
  | { readonly type: "npc-standing-below"; readonly value: number }
  | { readonly type: "faction-standing-at-least"; readonly value: number }
  | { readonly type: "faction-standing-below"; readonly value: number };

export interface DialogueEffect {
  readonly type: "deed";
  readonly deedId: string;
}

export interface DialogueChoice {
  readonly text: string;
  readonly next?: string;
  readonly condition?: DialogueCondition;
  readonly effects?: readonly DialogueEffect[];
}

export interface DialogueNode {
  readonly text: string;
  readonly choices: readonly DialogueChoice[];
}

export interface DialogueDef {
  readonly id: string;
  readonly start: string;
  readonly nodes: Readonly<Record<string, DialogueNode>>;
}

export interface DeedDef {
  readonly id: string;
  readonly name: string;
  readonly standingDelta: number;
}

export interface WorldDef {
  readonly map: MapModel;
  readonly factions: Readonly<Record<string, FactionDef>>;
  readonly npcs: Readonly<Record<string, NpcDef>>;
  readonly dialogues: Readonly<Record<string, DialogueDef>>;
  readonly deeds: Readonly<Record<string, DeedDef>>;
}
