/**
 * Test manuel du sélecteur SMC (score + créneaux), sans attendre le cron.
 *
 *   npm run smc-selector-once
 *   npm run smc-selector-once -- --publish
 *   npm run smc-selector-once -- --now="2026-08-09T09:30:00Z"
 *   npm run smc-selector-once -- --threshold=80
 *
 * --now permet de simuler une heure précise (utile pour tester un créneau
 * sans attendre qu'il soit réellement 09h ou 13h UTC). Sans --now, l'heure
 * réelle du système est utilisée.
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

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  const publish = process.argv.includes("--publish");
  const debug = process.argv.includes("--debug");
  const nowArg = argValue("now");
  const thresholdArg = argValue("threshold");

  const now = nowArg ? new Date(nowArg) : new Date();
  if (isNaN(now.getTime())) {
    throw new Error(`--now invalide: "${nowArg}" (format attendu: 2026-08-09T09:30:00Z)`);
  }
  const threshold = thresholdArg ? Number(thresholdArg) : undefined;

  console.log(`Heure simulée (UTC): ${now.toISOString()}`);

  // On appelle directement analyzeXauusdScored/analyzeV100Scored pour
  // afficher le breakdown complet, en plus du tick officiel du moteur.
  const { analyzeXauusdScored, analyzeV100Scored } = await import(
    "../src/lib/smc-selector/scorer"
  );
  const { getActiveWindow, isClosingTick } = await import(
    "../src/lib/smc-selector/scheduler"
  );

  const window = getActiveWindow(now);
  console.log(
    window
      ? `Créneau actif: ${window.label} (closing tick: ${isClosingTick(now, window)})`
      : "Hors créneau — le moteur ne scannera rien à cette heure-là."
  );

  if (debug) {
    console.log("\n--- Debug réseau (preuve que Deriv répond) ---\n");
    const { fetchDerivCandles } = await import("../src/lib/feeds/deriv");
    const { structureBias } = await import("../src/lib/smc/detect");
    for (const [pair, tf] of [
      ["XAUUSD", "5m"],
      ["V100", "15m"],
    ] as const) {
      try {
        const candles = await fetchDerivCandles(pair, tf, 120);
        const bias = structureBias(candles);
        const last = candles[candles.length - 1];
        console.log(
          `${pair} ${tf}: ${candles.length} bougies reçues, dernière close=${last?.close}, biais=${bias ?? "aucun (range/indécis)"}`
        );
      } catch (err) {
        console.log(
          `${pair} ${tf}: ERREUR réseau → ${err instanceof Error ? err.message : err}`
        );
      }
    }
  }

  console.log("\n--- Scan brut (score détaillé) ---\n");
  const [xau, v100] = await Promise.all([analyzeXauusdScored(), analyzeV100Scored()]);

  for (const [pair, scored] of [
    ["XAUUSD", xau],
    ["V100", v100],
  ] as const) {
    if (!scored) {
      console.log(`${pair}: aucun setup valide détecté`);
      continue;
    }
    console.log(`${pair}: score = ${scored.score}/100`);
    console.log("  breakdown:", scored.breakdown);
    console.log("  direction:", scored.signal.direction);
    console.log("  confluence:", scored.signal.confluence);
    console.log("  fingerprint:", scored.signal.fingerprint);
  }

  console.log("\n--- Tick officiel du moteur (avec état/créneau/quota) ---\n");
  const { runSmcSelectorTick } = await import("../src/lib/smc-selector/engine");
  const tick = await runSmcSelectorTick({ now, threshold });
  console.log(JSON.stringify(tick, null, 2));

  if (publish && tick.toPublish.length) {
    const { formatSmcSignal } = await import("../src/lib/smc/format");
    const { publishSmcSignal } = await import("../src/lib/telegram");
    if (!process.env.SMC_CHANNEL_ID) {
      throw new Error("SMC_CHANNEL_ID manquant dans .env.local");
    }
    for (const setup of tick.toPublish) {
      const pub = await publishSmcSignal(await formatSmcSignal(setup.signal));
      console.log("published", setup.pair, pub);
    }
  } else if (publish) {
    console.log("\n--publish demandé mais rien à publier à ce tick.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
