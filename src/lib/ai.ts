export async function polishAnalysis(
  apiKey: string | undefined,
  base: string,
  rationale: string
): Promise<string> {
  if (!apiKey) {
    console.error("GEMINI_API_KEY absente");
    return base;
  }

  try {
    const prompt =
      "Tu es un desk crypto sobre. Réécris le message Telegram ci-dessous. " +
      "Garde la structure et les chiffres. Ajoute au plus une phrase claire. " +
      "Français, zéro hype.\n\n" +
      `Contexte: ${rationale}\n\nMessage:\n${base}`;

    const started = Date.now();

    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" +
        encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    const responseText = await res.text();

    console.log("Gemini status:", res.status);
    console.log("Gemini duration:", `${Date.now() - started}ms`);

    if (!res.ok) {
      console.error("Gemini error:", responseText);
      return base;
    }

    const data = JSON.parse(responseText) as {
      candidates?: {
        content?: {
          parts?: {
            text?: string;
          }[];
        };
      }[];
    };

    const text =
      data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || "")
        .join("") || "";

    if (!text.trim()) {
      console.error("Gemini: réponse vide", responseText);
      return base;
    }

    console.log("Gemini: analyse reformulée avec succès");

    return text.trim();
  } catch (err) {
    console.error("Gemini exception:", err);
    return base;
  }
}
