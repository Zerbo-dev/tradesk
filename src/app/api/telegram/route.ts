import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { handleUpdate } from "@/lib/commands";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();
    const text =
      update?.message?.text || update?.channel_post?.text || "";
    const heavy = /^\/(analy[sz]e)(@|\s|$)/i.test(String(text).trim());

    if (heavy) {
      // Ack Telegram vite, continue l'analyse en arrière-plan
      waitUntil(
        handleUpdate(update).catch((err) =>
          console.error("deferred analyze error", err)
        )
      );
      return NextResponse.json({ ok: true, deferred: true });
    }

    await handleUpdate(update);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("telegram webhook error", err);
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "error",
    });
  }
}
