import { NextRequest, NextResponse } from "next/server";
import { getSettings, updateSettings, type AppSettings } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const patch = (await req.json()) as Partial<AppSettings>;
    const settings = await updateSettings(patch);
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      { status: 500 }
    );
  }
}
