import {
  packManifestSchema,
  packObjectSchema,
  type PackManifest,
  type PackObject,
} from "./schemas.ts";

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

export function parsePackObjects(raw: unknown, source: string): readonly PackObject[] {
  if (!Array.isArray(raw)) {
    throw new ContentError(`${source}: expected a JSON array of content objects`);
  }
  return raw.map((entry, index) => {
    const result = packObjectSchema.safeParse(entry);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
        .join("\n");
      throw new ContentError(`${source}[${index}]: invalid content object\n${details}`);
    }
    return result.data;
  });
}
