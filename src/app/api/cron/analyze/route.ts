import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { runAllAnalyses } from "@/lib/analysis";
import { formatAnalysis } from "@/lib/format";
import { publishAnalysis } from "@/lib/telegram";
import { setMeta, updateSignal } from "@/lib/db";
import { autoResolveOpenSignals } from "@/lib/autoResolve";
import { demoEnabled, isRealTradingActive } from "@/lib/demo";
import {
  executeDemoForAnalysis,
  syncDemoClosedTrades,
} from "@/lib/demoExecutor";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const env = getEnv();
  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const query = req.nextUrl.searchParams.get("secret") || "";
  return bearer === env.cronSecret || query === env.cronSecret;
}

async function run(force = false) {
  const env = getEnv();
  const settings = await getSettings();
  const demoActive = await demoEnabled();

  // 1) Sync clôtures compte démo (si activé)
  const demoSync = demoActive
    ? await syncDemoClosedTrades({ notify: true })
    : { closed: 0, details: [] as string[] };

  // 2) Clôture papier (bougies) — fallback / complément
  const resolved = await autoResolveOpenSignals({
    expireHours: settings.autoExpireHours,
    notify: true,
    timeframe: "15m",
  });

  // 3) Nouvelles analyses
  const results = await runAllAnalyses(
    settings.analyzePairs,
    settings.analyzeTimeframe,
    force ? 0 : settings.analyzeCooldownMinutes
  );
  const published: number[] = [];
  const skipped: { pair: string; reason: string }[] = [];
  const errors: string[] = [];
  const demoOrders: string[] = [];

  for (const a of results) {
    if (a.skipped) {
      skipped.push({ pair: a.pair, reason: a.skipped });
      continue;
    }
    try {
      // Pas de Gemini sur le cron (évite timeout). Texte direct.
      let text = await formatAnalysis(a);

      // 3b) Exécution démo/réelle sur LONG/SHORT
      if (demoActive && (a.direction === "LONG" || a.direction === "SHORT")) {
        try {
          const demo = await executeDemoForAnalysis(a);
          const realMode = await isRealTradingActive();
          if (demo.ok) {
            demoOrders.push(demo.detail);
            text += realMode
              ? `\n\n🔴 ORDRE RÉEL (argent véritable)\n${demo.detail}`
              : `\n\n💰 DEMO ORDER\n${demo.detail}`;
          } else if (demo.detail !== "demo off" && demo.detail !== "neutral skip") {
            demoOrders.push(`${a.pair}: ${demo.detail}`);
            text += realMode ? `\n\n⚠️ RÉEL: ${demo.detail}` : `\n\n⚠️ DEMO: ${demo.detail}`;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "demo error";
          demoOrders.push(`${a.pair}: ${msg}`);
          text += `\n\n⚠️ DEMO ERROR: ${msg}`;
        }
      }

      const pub = await publishAnalysis(text, { dm: true });
      if (pub.errors.length) errors.push(...pub.errors.map((e) => `${a.pair}: ${e}`));
      if (pub.delivered && a.signalId) {
        if (pub.channelMessageId) {
          await updateSignal(a.signalId, {
            channel_message_id: pub.channelMessageId,
          });
        }
        published.push(a.signalId);
      } else if (!pub.delivered) {
        errors.push(`${a.pair}: aucune livraison (canal+dm KO)`);
      }
    } catch (err) {
      errors.push(
        `${a.pair}: ${err instanceof Error ? err.message : "erreur"}`
      );
    }
  }

  await setMeta("last_analyze_at", new Date().toISOString());
  return {
    published,
    skipped,
    errors,
    resolved,
    demoEnabled: demoActive,
    demoSync,
    demoOrders,
    count: results.length,
    channel: env.signalsChannelId || null,
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!authorized(req)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const force =
      req.nextUrl.searchParams.get("force") === "1" ||
      req.nextUrl.searchParams.get("force") === "true";
    const result = await run(force);
    return NextResponse.json({ ok: true, force, ...result });
  } catch (err) {
    console.error("cron analyze error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
