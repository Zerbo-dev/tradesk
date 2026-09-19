import { NextResponse } from "next/server";
import { getDerivOauthStatus } from "@/lib/demo/derivAuth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const status = await getDerivOauthStatus();
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "erreur" },
      { status: 500 }
    );
  }
}
