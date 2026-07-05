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
