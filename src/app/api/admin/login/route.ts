import { NextRequest, NextResponse } from "next/server";
import {
  adminSessionCookieName,
  adminSessionMaxAgeSeconds,
  signAdminSession,
} from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const expectedPassword = process.env.ADMIN_PANEL_PASSWORD;
  const secret = process.env.ADMIN_PANEL_SECRET || process.env.CRON_SECRET;

  if (!expectedPassword || !secret) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "ADMIN_PANEL_PASSWORD (et ADMIN_PANEL_SECRET recommandé) manquant côté serveur",
      },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { password?: string };
  if (body.password !== expectedPassword) {
    return NextResponse.json({ ok: false, error: "Mot de passe incorrect" }, { status: 401 });
  }

  const token = await signAdminSession(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(adminSessionCookieName(), token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: adminSessionMaxAgeSeconds(),
  });
  return res;
}
