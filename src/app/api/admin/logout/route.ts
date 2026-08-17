import { NextResponse } from "next/server";
import { adminSessionCookieName } from "@/lib/adminAuth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(adminSessionCookieName(), "", { path: "/", maxAge: 0 });
  return res;
}
