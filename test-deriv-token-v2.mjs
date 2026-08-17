/**
 * Test isolé du token Deriv sur la NOUVELLE API (REST Bearer + OTP).
 * Remplace test-deriv-token.mjs (qui testait l'ancien flux `authorize`
 * sur WS, désormais obsolète).
 *
 * Usage:
 *   node test-deriv-token-v2.mjs VOTRE_TOKEN_ICI [APP_ID]
 *
 * APP_ID est optionnel, défaut 1089 (comme dans le bot).
 */
const token = process.argv[2];
const appId = process.argv[3] || "1089";

if (!token) {
  console.error("Usage: node test-deriv-token-v2.mjs VOTRE_TOKEN_ICI [APP_ID]");
  process.exit(1);
}

async function main() {
  console.log("1) GET /trading/v1/options/accounts ...\n");

  const res = await fetch("https://api.derivws.com/trading/v1/options/accounts", {
    headers: {
      "Deriv-App-ID": appId,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const raw = await res.json().catch(() => ({}));
  console.log("Status HTTP:", res.status);
  console.log(JSON.stringify(raw, null, 2));

  if (!res.ok || raw.error) {
    console.log("\n❌ Le token est rejeté par la NOUVELLE API aussi.");
    console.log("→ Régénère un token sur https://app.deriv.com/account/api-token");
    console.log("  en étant bien connecté sur ton compte DEMO, scope 'Trade' (ou 'Admin').");
    process.exit(1);
  }

  const accounts = Array.isArray(raw.data) ? raw.data : [raw.data];
  const demo = accounts.find((a) => a?.account_type === "demo");

  if (!demo) {
    console.log("\n⚠️ Le token est valide mais AUCUN compte demo n'est visible.");
    console.log("Comptes trouvés:", accounts.map((a) => a?.account_type));
    process.exit(1);
  }

  console.log("\n✅ TOKEN VALIDE (nouvelle API)");
  console.log("account_id:", demo.account_id);
  console.log("balance:", demo.balance, demo.currency);

  console.log("\n2) POST .../otp (récupération URL WebSocket) ...\n");
  const otpRes = await fetch(
    `https://api.derivws.com/trading/v1/options/accounts/${demo.account_id}/otp`,
    {
      method: "POST",
      headers: {
        "Deriv-App-ID": appId,
        Authorization: `Bearer ${token}`,
      },
    }
  );
  const otpRaw = await otpRes.json().catch(() => ({}));
  console.log("Status HTTP:", otpRes.status);
  console.log(JSON.stringify(otpRaw, null, 2));

  if (otpRes.ok && otpRaw.data?.url) {
    console.log("\n✅ URL WebSocket OTP obtenue avec succès.");
    console.log("Le provider Deriv rewrité est opérationnel de bout en bout.");
  } else {
    console.log("\n❌ Échec récupération OTP — voir erreur ci-dessus.");
  }
}

main().catch((err) => {
  console.error("Erreur:", err);
  process.exit(1);
});
