import { z } from "zod";

export const packManifestSchema = z.strictObject({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, 'pack id must be lowercase snake_case (e.g. "base", "my_mod")'),
  name: z.string().min(1),
  version: z.string().min(1),
  dependencies: z.array(z.string()).default([]),
  license: z.string().min(1),
  authors: z.array(z.string().min(1)).min(1),
});

export type PackManifest = z.infer<typeof packManifestSchema>;

const objectId = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$/,
    'object ids are namespaced snake_case, e.g. "base:tavernkeeper"',
  );

export const factionSchema = z.strictObject({
  type: z.literal("faction"),
  id: objectId,
  name: z.string().min(1),
});

export const deedSchema = z.strictObject({
  type: z.literal("deed"),
  id: objectId,
  name: z.string().min(1),
  standingDelta: z.number().int(),
});

const scheduleEntrySchema = z.strictObject({
  hour: z.number().int().min(0).max(23),
  location: z.string().min(1),
});

export const itemSchema = z.strictObject({
  type: z.literal("item"),
  id: objectId,
  name: z.string().min(1),
  value: z.number().int().min(0),
});

export const crimeSchema = z.strictObject({
  type: z.literal("crime"),
  id: objectId,
  verb: z.enum(["pickpocket", "theft"]),
  deed: objectId,
});

export const npcSchema = z.strictObject({
  type: z.literal("npc"),
  id: objectId,
  name: z.string().min(1),
  faction: objectId,
  dialogue: objectId,
  schedule: z.array(scheduleEntrySchema).min(1),
  pockets: z.array(objectId).default([]),
  shop: z.strictObject({ sells: z.array(objectId).min(1) }).optional(),
  confront: z.strictObject({ standingBelow: z.number().int(), dialogue: objectId }).optional(),
});

const conditionSchema = z.strictObject({
  type: z.enum([
    "npc-standing-at-least",
    "npc-standing-below",
    "faction-standing-at-least",
    "faction-standing-below",
    "coin-at-least",
  ]),
  value: z.number().int(),
});

const effectSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("deed"), deed: objectId }),
  z.strictObject({ type: z.literal("pay"), amount: z.number().int().min(1) }),
]);

const choiceSchema = z.strictObject({
  text: z.string().min(1),
  next: z.string().min(1).optional(),
  condition: conditionSchema.optional(),
  effects: z.array(effectSchema).optional(),
});

const nodeSchema = z.strictObject({
  text: z.string().min(1),
  choices: z.array(choiceSchema).min(1),
});

export const dialogueSchema = z.strictObject({
  type: z.literal("dialogue"),
  id: objectId,
  start: z.string().min(1),
  nodes: z.record(z.string(), nodeSchema),
});

export const packObjectSchema = z.discriminatedUnion("type", [
  factionSchema,
  deedSchema,
  npcSchema,
  dialogueSchema,
  itemSchema,
  crimeSchema,
]);

export type FactionObject = z.infer<typeof factionSchema>;
export type DeedObject = z.infer<typeof deedSchema>;
export type NpcObject = z.infer<typeof npcSchema>;
export type DialogueObject = z.infer<typeof dialogueSchema>;
export type ItemObject = z.infer<typeof itemSchema>;
export type CrimeObject = z.infer<typeof crimeSchema>;
export type PackObject = z.infer<typeof packObjectSchema>;
