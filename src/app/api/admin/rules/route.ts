import { NextRequest, NextResponse } from "next/server";
import { getRules, setRules, getMeta, setMeta } from "@/lib/db";
import { runLearner, currentLossStreak } from "@/lib/learner";

export const runtime = "nodejs";

const DEFAULTS: Record<string, number> = {
  learning_enabled: 1,
  min_confidence: 3,
  max_trades_per_day: 8,
  pause_after_loss_streak: 3,
  pause_hours: 6,
  risk_pct_default: 1,
  risk_pct_after_drawdown: 0.5,
};

export async function GET() {
  try {
    const rules = await getRules();
    const merged = { ...DEFAULTS, ...rules };
    const pausedUntil = await getMeta("paused_until");
    const lossStreak = await currentLossStreak();
    return NextResponse.json({ ok: true, rules: merged, pausedUntil, lossStreak });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "erreur" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { patch?: Record<string, number>; action?: string };

    if (body.action === "run") {
      const report = await runLearner(30);
      const rules = await getRules();
      return NextResponse.json({ ok: true, report, rules: { ...DEFAULTS, ...rules } });
    }
    if (body.action === "unpause") {
      await setMeta("paused_until", "");
      return NextResponse.json({ ok: true });
    }
    if (body.patch) {
      await setRules(body.patch);
    }
    const rules = await getRules();
    return NextResponse.json({ ok: true, rules: { ...DEFAULTS, ...rules } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "erreur" },
      { status: 500 }
    );
  }
}
