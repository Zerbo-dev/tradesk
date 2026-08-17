import { createHash, randomBytes } from "crypto";
import { getMeta, setMeta } from "../db";
import { getEnv } from "../env";

const AUTH_URL = "https://auth.deriv.com/oauth2/auth";
const TOKEN_URL = "https://auth.deriv.com/oauth2/token";

const PENDING_KEY = "deriv_oauth_pending_v1";
const TOKENS_KEY = "deriv_oauth_tokens_v1";

/** Marge de sécurité avant expiration pour déclencher un refresh anticipé. */
const REFRESH_MARGIN_MS = 60_000;

type PendingEntry = { codeVerifier: string; createdAt: number };
type PendingMap = Record<string, PendingEntry>;

type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
};

function base64Url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function requireRedirectUri(): string {
  const uri = getEnv().derivOauthRedirectUri;
  if (!uri) {
    throw new Error(
      "DERIV_OAUTH_REDIRECT_URI manquant — doit correspondre exactement à l'URI enregistrée sur le dashboard Deriv (ex: https://tondomaine.vercel.app/api/auth/deriv/callback)"
    );
  }
  return uri;
}

/**
 * Étape 1 : génère state + PKCE, stocke le verifier (clé = state) et
 * renvoie l'URL d'autorisation Deriv vers laquelle rediriger l'utilisateur.
 */
export async function buildAuthorizationUrl(): Promise<string> {
  const env = getEnv();
  const redirectUri = requireRedirectUri();

  const state = base64Url(randomBytes(24));
  const codeVerifier = base64Url(randomBytes(48));
  const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());

  const raw = await getMeta(PENDING_KEY);
  const pending: PendingMap = raw ? JSON.parse(raw) : {};
  // purge des entrées > 10 min (une tentative OAuth ne doit pas traîner)
  const now = Date.now();
  for (const [k, v] of Object.entries(pending)) {
    if (now - v.createdAt > 10 * 60_000) delete pending[k];
  }
  pending[state] = { codeVerifier, createdAt: now };
  await setMeta(PENDING_KEY, JSON.stringify(pending));

  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.derivAppId,
    redirect_uri: redirectUri,
    scope: env.derivOauthScope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${AUTH_URL}?${params.toString()}`;
}

/**
 * Étape 2 : appelée par la route callback avec `code` + `state` reçus de
 * Deriv. Vérifie le state, échange le code contre les tokens, les stocke.
 */
export async function handleOauthCallback(
  code: string,
  state: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const raw = await getMeta(PENDING_KEY);
  const pending: PendingMap = raw ? JSON.parse(raw) : {};
  const entry = pending[state];
  if (!entry) {
    return { ok: false, error: "state inconnu ou expiré — relance le login" };
  }
  delete pending[state];
  await setMeta(PENDING_KEY, JSON.stringify(pending));

  const env = getEnv();
  const redirectUri = requireRedirectUri();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.derivAppId,
    code,
    redirect_uri: redirectUri,
    code_verifier: entry.codeVerifier,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !data.access_token) {
    return {
      ok: false,
      error: data.error_description || data.error || `HTTP ${res.status}`,
    };
  }

  const tokens: StoredTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || "",
    expiresAt: Date.now() + (data.expires_in ?? 300) * 1000,
  };
  await setMeta(TOKENS_KEY, JSON.stringify(tokens));

  return { ok: true };
}

async function refreshAccessToken(refreshToken: string): Promise<StoredTokens> {
  const env = getEnv();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: env.derivAppId,
    refresh_token: refreshToken,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !data.access_token) {
    throw new Error(
      `Deriv refresh token échoué: ${data.error_description || data.error || res.status} — relance /api/auth/deriv/start`
    );
  }

  const tokens: StoredTokens = {
    accessToken: data.access_token,
    // Deriv peut faire tourner (rotate) le refresh_token ; on garde
    // l'ancien si aucun nouveau n'est renvoyé.
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 300) * 1000,
  };
  await setMeta(TOKENS_KEY, JSON.stringify(tokens));
  return tokens;
}

/**
 * Renvoie un access_token valide, en le rafraîchissant automatiquement
 * si besoin. Lève une erreur explicite si aucun login OAuth n'a jamais
 * été effectué.
 */
export async function getValidDerivAccessToken(): Promise<string> {
  const raw = await getMeta(TOKENS_KEY);
  if (!raw) {
    throw new Error(
      "Deriv OAuth: aucun token stocké — ouvre /api/auth/deriv/start dans un navigateur une fois pour te connecter"
    );
  }
  const tokens = JSON.parse(raw) as StoredTokens;

  if (Date.now() < tokens.expiresAt - REFRESH_MARGIN_MS) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) {
    throw new Error(
      "Deriv OAuth: access_token expiré et aucun refresh_token disponible — relance /api/auth/deriv/start"
    );
  }
  const refreshed = await refreshAccessToken(tokens.refreshToken);
  return refreshed.accessToken;
}

export async function hasDerivOauthSession(): Promise<boolean> {
  const raw = await getMeta(TOKENS_KEY);
  return Boolean(raw);
}
