/**
 * Local dry-run / force publish for SMC engine.
 *
 *   npm run analyze-smc
 *   npm run analyze-smc -- --publish
 *   npm run analyze-smc -- --publish --force
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvFile(file: string) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(resolve(__dirname, "../.env.local"));
loadEnvFile(resolve(__dirname, "../.env"));

async function main() {
  const publish = process.argv.includes("--publish");
  const force = process.argv.includes("--force");

  const { runSmcScan } = await import("../src/lib/smc/engine");
  const { formatSmcSignal, formatSmcEmpty } = await import(
    "../src/lib/smc/format"
  );

  const scan = await runSmcScan({
    cooldownMinutes: Number(process.env.SMC_COOLDOWN_MINUTES || 45),
    force,
  });

  console.log("skipped:", scan.skipped);
  console.log("errors:", scan.errors);

  if (!scan.signals.length) {
    console.log(formatSmcEmpty(60));
  }

  for (const s of scan.signals) {
    const text = formatSmcSignal(s);
    console.log("\n--- SIGNAL ---\n");
    console.log(text);
  }

  if (publish) {
    const { publishSmcSignal } = await import("../src/lib/telegram");
    if (!process.env.SMC_CHANNEL_ID) {
      throw new Error("SMC_CHANNEL_ID manquant dans .env.local");
    }
    for (const s of scan.signals) {
      const pub = await publishSmcSignal(formatSmcSignal(s));
      console.log("published", s.pair, pub);
    }
    if (!scan.signals.length) {
      console.log("rien à publier (pas de setup)");
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
