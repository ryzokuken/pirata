import { execSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const ASSET_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|ogg|mp3|wav|flac|ttf|otf|woff2?)$/i;

const tracked = execSync("git ls-files", { encoding: "utf8" })
  .split("\n")
  .filter((file) => ASSET_EXTENSIONS.test(file));

const attribution = readFileSync("ATTRIBUTION.md", "utf8");
const missing = tracked.filter((file) => !attribution.includes(file));

const BUDGET_KB = 600;

if (missing.length > 0) {
  console.error(
    `assets missing from ATTRIBUTION.md:\n${missing.map((file) => `  ${file}`).join("\n")}`,
  );
  process.exit(1);
}

const totalBytes = tracked.reduce((sum, file) => sum + statSync(file).size, 0);
const totalKb = Math.ceil(totalBytes / 1024);
if (totalKb > BUDGET_KB) {
  console.error(
    `binary assets total ${String(totalKb)}KB, over the ${String(BUDGET_KB)}KB budget — trim or split before shipping`,
  );
  process.exit(1);
}
console.log(
  `attribution OK (${String(tracked.length)} tracked assets, ${String(totalKb)}KB / ${String(BUDGET_KB)}KB budget)`,
);
