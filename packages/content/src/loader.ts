import { packManifestSchema, type PackManifest } from "./schemas.ts";

export class ContentError extends Error {}

export function parsePackManifest(raw: unknown, source: string): PackManifest {
  const result = packManifestSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new ContentError(`${source}: invalid pack manifest\n${details}`);
  }
  return result.data;
}
