import { NextRequest, NextResponse } from "next/server";
import { broadcastToSubscribers } from "@/lib/subscribers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { feed: "crypto" | "smc" | "both"; message: string };
    if (!body.message?.trim()) {
      return NextResponse.json({ ok: false, error: "Message vide" }, { status: 400 });
    }

    const results: { sent: number; failed: string[] }[] = [];
    if (body.feed === "both") {
      results.push(await broadcastToSubscribers("crypto", body.message));
      results.push(await broadcastToSubscribers("smc", body.message));
    } else {
      results.push(await broadcastToSubscribers(body.feed, body.message));
    }

    const sent = results.reduce((s, r) => s + r.sent, 0);
    const failed = results.flatMap((r) => r.failed);
    return NextResponse.json({ ok: true, sent, failed });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "erreur" },
      { status: 500 }
    );
  }
}
