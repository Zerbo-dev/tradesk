export async function polishAnalysis(
  apiKey: string | undefined,
  base: string,
  rationale: string
): Promise<string> {
  if (!apiKey) {
    console.error("Gemini: GEMINI_API_KEY absente");
    return base;
  }

  const prompt =
    "Tu es un desk crypto sobre. Réécris le message Telegram ci-dessous. " +
    "Garde la structure et les chiffres. Ajoute au plus une phrase claire. " +
    "Français, zéro hype.\n\n" +
    "Contexte: " +
    rationale +
    "\n\nMessage:\n" +
    base;

  const started = Date.now();

  try {
    console.log("Gemini: appel en cours...");

    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" +
        encodeURIComponent(apiKey),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    const duration = Date.now() - started;
    const responseText = await res.text();

    console.log("Gemini status:", res.status);
    console.log("Gemini duration:", duration + "ms");

    console.log("========== GEMINI RAW RESPONSE ==========");
    console.log(responseText);
    console.log("==========================================");

    if (!res.ok) {
      console.error("Gemini HTTP error:", responseText);
      return base;
    }

    let data: {
      candidates?: {
        content?: {
          parts?: {
            text?: string;
          }[];
        };
        finishReason?: string;
      }[];
      promptFeedback?: {
        blockReason?: string;
      };
    };

    try {
      data = JSON.parse(responseText);
    } catch (err) {
      console.error("Gemini: réponse JSON invalide", err);
      return base;
    }

    if (data.promptFeedback?.blockReason) {
      console.error(
        "Gemini: prompt bloqué:",
        data.promptFeedback.blockReason
      );
      return base;
    }

    const candidate = data.candidates?.[0];

    if (!candidate) {
      console.error("Gemini: aucun candidate dans la réponse");
      return base;
    }

    if (candidate.finishReason) {
      console.log("Gemini finishReason:", candidate.finishReason);
    }

    const text =
      candidate.content?.parts
        ?.map((part) => part.text || "")
        .join("") || "";

    console.log("========== GEMINI GENERATED TEXT ==========");
    console.log(text);
    console.log("============================================");

    if (!text.trim()) {
      console.error("Gemini: texte généré vide");
      return base;
    }

    console.log("Gemini: réponse reçue avec succès");

    return text.trim();
  } catch (err) {
    const duration = Date.now() - started;

    console.error("Gemini exception");
    console.error("Gemini duration:", duration + "ms");
    console.error(
      "Gemini error:",
      err instanceof Error ? err.message : err
    );

    return base;
  }
}
