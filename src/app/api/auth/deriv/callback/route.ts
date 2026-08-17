import { NextRequest, NextResponse } from "next/server";
import { handleOauthCallback } from "@/lib/demo/derivAuth";

export const runtime = "nodejs";

function htmlPage(title: string, message: string, ok: boolean) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 560px; margin: 60px auto; text-align: center;">
  <h1 style="color:${ok ? "#16a34a" : "#dc2626"}">${title}</h1>
  <p>${message}</p>
</body></html>`;
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const error = req.nextUrl.searchParams.get("error");
  const errorDescription = req.nextUrl.searchParams.get("error_description");

  if (error) {
    return new NextResponse(
      htmlPage("Connexion refusée", errorDescription || error, false),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  if (!code || !state) {
    return new NextResponse(
      htmlPage("Paramètres manquants", "code ou state absent de la redirection.", false),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const result = await handleOauthCallback(code, state);

  if (!result.ok) {
    return new NextResponse(
      htmlPage("Échec de connexion Deriv", result.error, false),
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  return new NextResponse(
    htmlPage(
      "Compte Deriv connecté ✅",
      "Tu peux fermer cette page. Le bot peut maintenant exécuter des trades démo automatiquement — le token se rafraîchira tout seul.",
      true
    ),
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
