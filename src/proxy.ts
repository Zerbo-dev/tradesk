import { NextRequest, NextResponse } from "next/server";
import { adminSessionCookieName, verifyAdminSession } from "./lib/adminAuth";

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};

function adminSecret(): string {
  return process.env.ADMIN_PANEL_SECRET || process.env.CRON_SECRET || "";
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Login lui-même reste accessible sans session.
  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }

  const token = req.cookies.get(adminSessionCookieName())?.value;
  const valid = await verifyAdminSession(token, adminSecret());

  if (valid) return NextResponse.next();

  if (pathname.startsWith("/api/admin")) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/admin/login", req.url);
  return NextResponse.redirect(loginUrl);
}
