/** Every PNG in the base pack, bundled eagerly by Vite; values are served URLs. */
export const bundledPackAssets = import.meta.glob("../../content/packs/base/assets/**/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const PACK_ROOT = "../../content/packs/base/";

export function resolvePackAssetUrl(
  bundle: Readonly<Record<string, string>>,
  packRelativePath: string,
): string {
  const url = bundle[`${PACK_ROOT}${packRelativePath}`];
  if (url === undefined) {
    throw new Error(`pack asset "${packRelativePath}" was not bundled (is the file committed?)`);
  }
  return url;
}
