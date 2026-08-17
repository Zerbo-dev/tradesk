import { NextResponse } from "next/server";
import { demoEnabled, getDemoAccount, getDemoPositions, isRealTradingActive } from "@/lib/demo";

export const runtime = "nodejs";

export async function GET() {
  const enabled = await demoEnabled();
  const realMode = await isRealTradingActive();

  if (!enabled) {
    return NextResponse.json({ ok: true, enabled: false, realMode, account: null, positions: [] });
  }

  try {
    const [account, positions] = await Promise.all([getDemoAccount(), getDemoPositions()]);
    return NextResponse.json({ ok: true, enabled: true, realMode, account, positions });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      enabled: true,
      realMode,
      error: err instanceof Error ? err.message : "erreur",
    });
  }
}
