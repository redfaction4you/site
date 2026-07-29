/**
 * A thin text generator over whichever LLM key is configured.
 *
 * Two providers because there are two keys available, and the call shape for
 * both is small enough that supporting both costs less than choosing. Selection
 * is by which key exists, with AI_PROVIDER to force one.
 *
 * Deliberately minimal: no streaming, no tools, no conversation. One prompt in,
 * one block of prose out, or null. Every caller must handle null, because a
 * missing summary is a page with one less paragraph and a broken page is not.
 */

export type AiProvider = "gemini" | "openai";

/** Long enough for a few paragraphs, short enough not to hang an ingest. */
const TIMEOUT_MS = 25_000;

/**
 * An alias rather than a pinned version, deliberately.
 *
 * Google retires specific model names to new keys: gemini-2.5-flash is still
 * listed by the models endpoint but answers 404 with "no longer available to
 * new users". A pinned name is a thing that breaks quietly one day. The alias
 * tracks whatever the current flash model is, and the report is decoration, so
 * the tradeoff runs the right way here.
 */
const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

export function configuredProvider(): AiProvider | null {
  const forced = process.env.AI_PROVIDER?.toLowerCase();
  if (forced === "gemini") return process.env.GEMINI_API_KEY ? "gemini" : null;
  if (forced === "openai") return process.env.OPENAI_API_KEY ? "openai" : null;

  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

/** Recorded alongside generated text so we know what wrote it. */
export function activeModel(): string | null {
  const provider = configuredProvider();
  if (provider === "gemini") return process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  if (provider === "openai") return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  return null;
}

async function callGemini(system: string, prompt: string): Promise<string | null> {
  const model = process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY ?? "",
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      /**
       * The budget covers internal reasoning as well as the reply.
       *
       * Current flash models spend several hundred tokens thinking before
       * writing a word, and that counts against maxOutputTokens. A budget
       * sized for three paragraphs produces a sentence and a half. Thinking
       * cannot be switched off here either: thinkingBudget 0 is rejected
       * outright and 128 was ignored in favour of 480.
       */
      generationConfig: { temperature: 0.8, maxOutputTokens: 2500 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    console.warn(`[ai] gemini ${response.status}: ${await response.text()}`);
    return null;
  }

  const body = (await response.json()) as {
    candidates?: {
      finishReason?: string;
      content?: { parts?: { text?: string }[] };
    }[];
  };

  const candidate = body.candidates?.[0];

  // Half a sentence is worse than nothing. Better to leave the report null and
  // retry on the next sync than publish prose that stops mid-word.
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    console.warn(`[ai] gemini stopped early: ${candidate.finishReason}`);
    return null;
  }

  const text = candidate?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  return text || null;
}

async function callOpenai(system: string, prompt: string): Promise<string | null> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      max_tokens: 700,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    console.warn(`[ai] openai ${response.status}: ${await response.text()}`);
    return null;
  }

  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  return body.choices?.[0]?.message?.content?.trim() || null;
}

/**
 * Runs a prompt. Returns null on any failure, including no key configured.
 *
 * Never throws: this is decoration on top of an archive, and it must not be
 * able to break an ingest or a page render.
 */
export async function generate(system: string, prompt: string): Promise<string | null> {
  const provider = configuredProvider();
  if (!provider) return null;

  try {
    const text =
      provider === "gemini"
        ? await callGemini(system, prompt)
        : await callOpenai(system, prompt);

    if (!text) return null;

    // Models like to wrap prose in markdown fences or restate the brief.
    return text
      .replace(/^```[a-z]*\n?/i, "")
      .replace(/\n?```$/i, "")
      .trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[ai] ${provider} call failed: ${reason}`);
    return null;
  }
}
