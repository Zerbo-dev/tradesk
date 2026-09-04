export async function polishAnalysis(
  apiKey: string | undefined,
  base: string,
  rationale: string
): Promise<string> {
  if (!apiKey) {
    console.error("Gemini: GEMINI_API_KEY absente");
    return base;
  }

  // Clear, strict prompt to avoid internal thoughts, markdown and extra commentary.
  const prompt =
    "Réécris uniquement le message Telegram suivant en français, sobre et professionnel. " +
    "Conserve la structure et tous les chiffres EXACTS (titres, paires, timeframe, valeurs). " +
    "Ajoute au plus une phrase claire et concise (si vraiment utile). " +
    "NE PAS inclure de mise en forme Markdown (**, __, `), ni d'emojis, ni de signatures, ni de métadonnées ou d'éléments internes du modèle. " +
    "Si le message est déjà correct, renvoie-le tel quel. Réponds STRICTEMENT par le message réécrit, rien d'autre.\n\n" +
    `Contexte: ${rationale}\n\nMessage:\n${base}`;

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
          contents: [{ parts: [{ text: prompt }] }],
          // Raise max tokens a bit to avoid truncation; lower temperature for determinism
          generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
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

    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch (err) {
      console.error("Gemini: réponse JSON invalide", err);
      return base;
    }

    // If model reports blocked prompt, bail out.
    if (data?.promptFeedback?.blockReason) {
      console.error("Gemini: prompt bloqué:", data.promptFeedback.blockReason);
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

    let text: string = "";
    // Prefer content.parts text if present
    if (candidate.content?.parts) {
      text = candidate.content.parts.map((p: any) => p.text || "").join("");
    } else if (typeof candidate === "string") {
      text = candidate;
    } else if (candidate.output?.[0]?.content) {
      // some shapes
      text = String(candidate.output[0].content || "");
    }

    console.log("========== GEMINI GENERATED TEXT ==========");
    console.log(text);
    console.log("============================================");

    if (!text || !text.trim()) {
      console.error("Gemini: texte généré vide");
      return base;
    }

    // Post-process: strip surrounding markdown bold, triple backticks, and internal model signatures.
    let out = text.trim();

    // Remove common markdown fences and bold markers — use [\s\S] instead of dotAll for older targets
    out = out.replace(/(^```[a-zA-Z0-9]*\s*)|(```$)/g, "");
    out = out.replace(/\*\*([\s\S]*?)\*\*/g, "$1");
    out = out.replace(/__([\s\S]*?)__/g, "$1");
    out = out.replace(/`([\s\S]*?)`/g, "$1");

    // Remove any lines that look like model/internal signatures
    out = out
      .split(/\r?\n/)
      .filter((line) => !/thoughtSignature|modelVersion|usageMetadata|\[\[.*\]\]/i.test(line))
      .join("\n")
      .trim();

    // If the model returned exactly the original message (or produced something very short), keep the base
    const normalizedBase = base.trim().replace(/\s+/g, " ");
    const normalizedOut = out.replace(/\s+/g, " ");
    if (normalizedOut.length < 20 || normalizedOut === normalizedBase) return base;

    return out;
  } catch (err) {
    const duration = Date.now() - started;

    console.error("Gemini exception");
    console.error("Gemini duration:", duration + "ms");
    console.error("Gemini error:", err instanceof Error ? err.message : err);

    return base;
  }
}
