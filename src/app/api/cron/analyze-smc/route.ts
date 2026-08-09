import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { runSmcScan } from "@/lib/smc/engine";
import { formatSmcEmpty, formatSmcSignal } from "@/lib/smc/format";
import { publishSmcSignal } from "@/lib/telegram";

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

  if (!env.smcChannelId) {
    return {
      ok: false,
      error: "SMC_CHANNEL_ID manquant",
      published: [] as string[],
    };
  }

  const scan = await runSmcScan({
    cooldownMinutes: env.smcCooldownMinutes,
    force,
  });

  const published: string[] = [];
  const publishErrors: string[] = [...scan.errors];

  for (const signal of scan.signals) {
    try {
      const text = formatSmcSignal(signal);
      const pub = await publishSmcSignal(text);
      if (pub.errors.length) {
        publishErrors.push(...pub.errors.map((e) => `${signal.pair}: ${e}`));
      }
      if (pub.delivered) {
        published.push(`${signal.pair}:${signal.direction}`);
      } else {
        publishErrors.push(`${signal.pair}: livraison KO (vérifie le bot dans le canal SMC)`);
      }
    } catch (err) {
      publishErrors.push(
        `${signal.pair}: ${err instanceof Error ? err.message : "erreur"}`
      );
    }
  }

  // Anti-spam: empty scan message only if explicitly enabled
  if (scan.empty && env.smcPostEmpty && !force) {
    try {
      const pub = await publishSmcSignal(
        formatSmcEmpty(Math.max(60, env.smcCooldownMinutes * 60))
      );
      if (pub.errors.length) publishErrors.push(...pub.errors);
    } catch (err) {
      publishErrors.push(
        `empty: ${err instanceof Error ? err.message : "erreur"}`
      );
    }
  }

  return {
    ok: true,
    engine: "smc",
    channel: env.smcChannelId,
    published,
    skipped: scan.skipped,
    errors: publishErrors,
    count: scan.signals.length,
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
    return NextResponse.json({ force, ...result });
  } catch (err) {
    console.error("cron analyze-smc error", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
