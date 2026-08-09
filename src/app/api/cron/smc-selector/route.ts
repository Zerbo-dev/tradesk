import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { runSmcSelectorTick } from "@/lib/smc-selector/engine";
import { formatSmcSignal } from "@/lib/smc/format";
import { publishSmcSignal } from "@/lib/telegram";

export const runtime = "nodejs";
export const maxDuration = 60;

// Seuil de publication immédiate — ajustable sans toucher au code.
const DEFAULT_THRESHOLD = 85;

function authorized(req: NextRequest): boolean {
  const env = getEnv();
  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const query = req.nextUrl.searchParams.get("secret") || "";
  return bearer === env.cronSecret || query === env.cronSecret;
}

async function run() {
  const env = getEnv();

  if (!env.smcChannelId) {
    return { ok: false, error: "SMC_CHANNEL_ID manquant", published: [] as string[] };
  }

  const thresholdRaw = process.env.SMC_SELECTOR_THRESHOLD;
  const threshold = thresholdRaw ? Number(thresholdRaw) : DEFAULT_THRESHOLD;

  const tick = await runSmcSelectorTick({ threshold });

  const published: string[] = [];
  const publishErrors: string[] = [];

  for (const setup of tick.toPublish) {
    try {
      const text = formatSmcSignal(setup.signal);
      const pub = await publishSmcSignal(text);
      if (pub.errors.length) {
        publishErrors.push(...pub.errors.map((e) => `${setup.pair}: ${e}`));
      }
      if (pub.delivered) {
        published.push(`${setup.pair}:${setup.signal.direction}:${setup.score}`);
      } else {
        publishErrors.push(`${setup.pair}: livraison KO (vérifie le bot dans le canal SMC)`);
      }
    } catch (err) {
      publishErrors.push(`${setup.pair}: ${err instanceof Error ? err.message : "erreur"}`);
    }
  }

  return {
    ok: true,
    engine: "smc-selector",
    channel: env.smcChannelId,
    window: tick.window,
    threshold: tick.threshold,
    published,
    results: tick.results,
    errors: publishErrors,
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!authorized(req)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const result = await run();
    return NextResponse.json(result);
  } catch (err) {
    console.error("cron smc-selector error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
