import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvFile(file: string) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(resolve(__dirname, "../.env.local"));

async function main() {
  const { fetchDerivCandles } = await import("../src/lib/feeds/deriv");
  const { atr } = await import("../src/lib/indicators");
  const {
    structureBias,
    findOteZone,
    latestValidFvg,
    detectOrderBlocks,
    zoneInsideOrOverlap,
  } = await import("../src/lib/smc/detect");

  const [m5, m15, m30] = await Promise.all([
    fetchDerivCandles("V100", "5m", 120),
    fetchDerivCandles("V100", "15m", 100),
    fetchDerivCandles("V100", "30m", 80),
  ]);

  const bias30 = structureBias(m30);
  const bias15 = structureBias(m15);
  const price = m5[m5.length - 1].close;
  const atrVal = atr(m15, 14);

  console.log("=== DIAG V100 ===");
  console.log({ price, atr15: atrVal, bias30, bias15, match: bias30 === bias15 });

  if (!bias30 || !bias15 || bias30 !== bias15) {
    console.log("→ BLOQUÉ: biais M30 et M15 pas alignés (il faut le même sens)");
    return;
  }

  const ote = findOteZone(m15, bias30);
  console.log("OTE:", ote);
  if (!ote) {
    console.log("→ BLOQUÉ: pas de zone OTE (swing Fib 0.618-0.786)");
    return;
  }

  const nearOte =
    price <= ote.top + atrVal * 0.8 && price >= ote.bottom - atrVal * 0.8;
  console.log("Prix proche OTE?", nearOte, {
    oteTop: ote.top,
    oteBottom: ote.bottom,
    price,
  });
  if (!nearOte) {
    console.log("→ BLOQUÉ: prix trop loin de la zone OTE");
    return;
  }

  const fvgKind = bias30 === "BUY" ? "bullish" : "bearish";
  const fvg = latestValidFvg(m5, fvgKind, 30);
  const obs = detectOrderBlocks(m5, 40).filter((z) => z.kind === fvgKind);
  const fvgIn = !!(fvg && zoneInsideOrOverlap(fvg, ote));
  const obIn = obs.filter((z) => zoneInsideOrOverlap(z, ote));

  console.log({ fvg, fvgIn, obsCount: obs.length, obIn: obIn.length });

  if (!fvgIn && !obIn.length) {
    console.log("→ BLOQUÉ: aucun FVG/OB dans la zone OTE");
    return;
  }

  console.log("→ OK: setup valide possible");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
