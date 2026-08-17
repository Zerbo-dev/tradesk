/**
 * Test isolé du token Deriv — ne dépend d'aucun autre fichier du repo.
 *
 * Usage:
 *   node test-deriv-token.mjs VOTRE_TOKEN_ICI
 *
 * (Node 22+ a WebSocket natif, pas besoin d'installer quoi que ce soit.)
 */
const token = process.argv[2];
if (!token) {
  console.error("Usage: node test-deriv-token.mjs VOTRE_TOKEN_ICI");
  process.exit(1);
}

const ws = new WebSocket("wss://ws.derivws.com/websockets/v3?app_id=1089");

const timer = setTimeout(() => {
  console.error("TIMEOUT — pas de réponse après 10s (réseau/pare-feu ?)");
  process.exit(1);
}, 10_000);

ws.addEventListener("open", () => {
  console.log("Connexion WebSocket ouverte, envoi authorize...");
  ws.send(JSON.stringify({ authorize: token }));
});

ws.addEventListener("message", (ev) => {
  clearTimeout(timer);
  const data = JSON.parse(String(ev.data));
  console.log("\n--- Réponse brute Deriv ---\n");
  console.log(JSON.stringify(data, null, 2));

  if (data.error) {
    console.log("\n❌ TOKEN INVALIDE:", data.error.message);
    console.log("→ Régénère un token sur https://app.deriv.com/account/api-token");
    console.log("  en étant bien sur ton compte DEMO, avec le scope 'Trade'.");
  } else if (data.authorize?.loginid) {
    console.log("\n✅ TOKEN VALIDE");
    console.log("loginid:", data.authorize.loginid);
    console.log("is_virtual (1=demo):", data.authorize.is_virtual);
    console.log("balance:", data.authorize.balance, data.authorize.currency);
  }
  ws.close();
  process.exit(0);
});

ws.addEventListener("error", (ev) => {
  clearTimeout(timer);
  console.error("Erreur WebSocket:", ev);
  process.exit(1);
});
