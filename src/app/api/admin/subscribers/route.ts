import { NextRequest, NextResponse } from "next/server";
import {
  listSubscribers,
  addSubscriber,
  updateSubscriber,
  removeSubscriber,
} from "@/lib/subscribers";

export const runtime = "nodejs";

export async function GET() {
  const subs = await listSubscribers();
  return NextResponse.json({ ok: true, subscribers: subs });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "delete") {
      const subs = await removeSubscriber(body.id);
      return NextResponse.json({ ok: true, subscribers: subs });
    }
    if (body.action === "update") {
      const subs = await updateSubscriber(body.id, body.patch);
      return NextResponse.json({ ok: true, subscribers: subs });
    }
    await addSubscriber(body);
    const subs = await listSubscribers();
    return NextResponse.json({ ok: true, subscribers: subs });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "erreur" },
      { status: 500 }
    );
  }
}
