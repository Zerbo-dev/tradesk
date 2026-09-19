import { NextRequest, NextResponse } from "next/server";
import { listExtraAdmins, addExtraAdmin, removeExtraAdmin } from "@/lib/admins";

export const runtime = "nodejs";

export async function GET() {
  const admins = await listExtraAdmins();
  return NextResponse.json({ ok: true, admins });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "delete") {
      const admins = await removeExtraAdmin(body.id);
      return NextResponse.json({ ok: true, admins });
    }
    const admins = await addExtraAdmin(body.chatId, body.label || "");
    return NextResponse.json({ ok: true, admins });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "erreur" },
      { status: 500 }
    );
  }
}
