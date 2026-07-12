import type { MapModel } from "./map.ts";

export interface FactionDef {
  readonly id: string;
  readonly name: string;
}

export interface ScheduleEntry {
  readonly hour: number;
  readonly location: string;
}

export interface ItemDef {
  readonly id: string;
  readonly name: string;
  readonly value: number;
  readonly food?: { readonly nutrition: number };
  readonly treasure?: boolean;
}

export interface DamageDie {
  readonly count: number;
  readonly sides: number;
  readonly bonus: number;
}

export interface CombatantDef {
  readonly maxHp: number;
  readonly attackBonus: number;
  readonly armorClass: number;
  readonly damage: DamageDie;
}

export interface RumorDef {
  readonly id: string;
  readonly text: string;
}

export type CrimeVerb = "pickpocket" | "theft";

export interface ShopDef {
  readonly sells: readonly string[];
}

export interface ConfrontDef {
  readonly standingBelow: number;
  readonly dialogueId: string;
}

export interface NpcDef {
  readonly id: string;
  readonly name: string;
  readonly factionId: string;
  readonly dialogueId: string;
  readonly mapId: string;
  readonly schedule: readonly ScheduleEntry[];
  readonly pockets: readonly string[];
  readonly shop?: ShopDef;
  readonly confront?: ConfrontDef;
  readonly combat?: CombatantDef;
  readonly hostile?: boolean;
}

export type DialogueCondition =
  | { readonly type: "npc-standing-at-least"; readonly value: number }
  | { readonly type: "npc-standing-below"; readonly value: number }
  | { readonly type: "faction-standing-at-least"; readonly value: number }
  | { readonly type: "faction-standing-below"; readonly value: number }
  | { readonly type: "coin-at-least"; readonly value: number };

export type DialogueEffect =
  | { readonly type: "deed"; readonly deedId: string }
  | { readonly type: "pay"; readonly amount: number }
  | { readonly type: "rumor"; readonly rumorId: string };

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
  readonly maps: Readonly<Record<string, MapModel>>;
  readonly startMapId: string;
  readonly factions: Readonly<Record<string, FactionDef>>;
  readonly npcs: Readonly<Record<string, NpcDef>>;
  readonly dialogues: Readonly<Record<string, DialogueDef>>;
  readonly deeds: Readonly<Record<string, DeedDef>>;
  readonly items: Readonly<Record<string, ItemDef>>;
  readonly crimes: Readonly<Partial<Record<CrimeVerb, string>>>;
  readonly rumors: Readonly<Record<string, RumorDef>>;
}
