export async function polishAnalysis(
  apiKey: string | undefined,
  base: string,
  rationale: string
): Promise<string> {
  if (!apiKey) return base;
  try {
    const prompt =
      "Tu es un desk crypto sobre. Réécris le message Telegram ci-dessous. " +
      "Garde la structure et les chiffres. Ajoute au plus une phrase claire. " +
      "Français, zéro hype.\n\n" +
      `Contexte: ${rationale}\n\nMessage:\n${base}`;

    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" +
        encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
        }),
      }
    );
    if (!res.ok) return base;
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ||
      "";
    return text.trim() || base;
  } catch {
    return base;
  }
}
