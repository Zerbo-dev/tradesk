/** Remplace {token} par sa valeur dans un template. Token inconnu → laissé tel quel. */
export function renderTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : match
  );
}

/**
 * Défauts = format actuellement en dur (comportement inchangé tant que
 * l'admin n'a rien personnalisé).
 */
export const DEFAULT_CRYPTO_TEMPLATE = [
  "ANALYSE AUTO  {pair}  |  {timeframe}",
  "Biais    : {directionEmoji} {direction}",
  "Prix     : {price}",
  "EMA20/50 : {ema20} / {ema50}",
  "RSI      : {rsi}",
  "24h      : {changePct}%",
  "{tradeLines}",
  "Setup    : {setup}",
  "Conf.    : {confidenceStars}",
  "Pourquoi : {rationale}",
  "{signalIdLine}",
].join("\n");

export const DEFAULT_XAU_TEMPLATE = [
  "🚨 *NOUVEAU SIGNAL XAUUSD* 🚨",
  "",
  "*Paire*: XAUUSD",
  "*Direction*: {directionEmoji}",
  "*TF d'analyse*: {timeframe}",
  "*Setup*: {setup}",
  "",
  "*📍 Entry Zone*: {entryLow} - {entryHigh}",
  "*🛑 Stop Loss*: {stopLoss}",
  "*🎯 Take Profit*:",
  "  TP1: {tp1} [1R]",
  "  TP2: {tp2} [2R] *50%*",
  "  TP3: {tp3} [3R] *Close*",
  "",
  "*RR*: {rr}",
  "*Heure*: {time}",
  "",
  "_Ne pas forcer l'entrée. Attends que le prix revienne dans la zone._",
].join("\n");

export const DEFAULT_V100_TEMPLATE = [
  "🚨 *NOUVEAU SIGNAL VOLATILITY 100* 🚨",
  "",
  "*Paire*: V100",
  "*Direction*: {directionEmoji}",
  "*TF d'analyse*: {timeframe}",
  "*Setup*: {setup}",
  "",
  "*📍 Zone OTE*: {oteLow} - {oteHigh}",
  "*📍 Entry Zone*: {entryLow} - {entryHigh} *FVG/OB trouvée*",
  "*🛑 Stop Loss*: {stopLoss} {slNote}",
  "*🎯 Take Profit*:",
  "  TP1: {tp1} [1R]",
  "  TP2: {tp2} [2R] *50%*",
  "  TP3: {tp3} [3R] *Close*",
  "",
  "*RR*: {rr}",
  "*Heure*: {time}",
  "",
  "_Confluence: {confluence}_",
].join("\n");

/** Tokens disponibles par template — affichés en aide dans l'admin. */
export const TEMPLATE_TOKENS = {
  crypto: [
    "pair", "timeframe", "direction", "directionEmoji", "price", "ema20", "ema50",
    "rsi", "changePct", "entryLow", "entryHigh", "stopLoss", "tp1", "tp2",
    "tradeLines", "setup", "confidenceStars", "rationale", "signalIdLine",
  ],
  xau: [
    "direction", "directionEmoji", "timeframe", "setup", "entryLow", "entryHigh",
    "stopLoss", "tp1", "tp2", "tp3", "rr", "time",
  ],
  v100: [
    "direction", "directionEmoji", "timeframe", "setup", "oteLow", "oteHigh",
    "entryLow", "entryHigh", "stopLoss", "slNote", "tp1", "tp2", "tp3", "rr",
    "time", "confluence",
  ],
} as const;
