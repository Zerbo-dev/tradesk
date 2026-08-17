import { NextResponse } from "next/server";
import { buildAuthorizationUrl } from "@/lib/demo/derivAuth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const url = await buildAuthorizationUrl();
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "error" },
      { status: 500 }
    );
  }
}
