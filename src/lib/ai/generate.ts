/**
 * Text generation over whichever API keys are configured.
 *
 * Every key available is tried in turn until one answers. Free tiers have daily
 * caps, so a second key is a spare tank rather than redundancy: when the first
 * is exhausted the next takes over and the writing keeps happening. A key that
 * fails for any other reason stops the chain, because that is our bug and
 * burning a second key on the same broken request helps nobody.
 *
 * Deliberately minimal: no streaming, no tools, no conversation. One prompt in,
 * one block of prose out, or null. Every caller must handle null, because a
 * missing column is a page with one less article and a broken page is not.
 */

export type AiProvider = "gemini" | "openai" | "anthropic";

/** Long enough for a few paragraphs, short enough not to hang an ingest. */
const TIMEOUT_MS = 30_000;

/**
 * An alias rather than a pinned version, deliberately.
 *
 * Google retires model names to new keys: gemini-2.5-flash is still listed by
 * the models endpoint but answers 404 with "no longer available to new users".
 * A pinned name is a thing that breaks quietly one day.
 */
const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

type Attempt = { provider: AiProvider; key: string; model: string };

function geminiModel() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

/**
 * The chain, in order. Gemini first because that is where the spare keys are,
 * then OpenAI, then Anthropic.
 */
function attempts(): Attempt[] {
  const chain: Attempt[] = [];

  for (const key of [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ]) {
    if (key?.trim()) {
      chain.push({ provider: "gemini", key: key.trim(), model: geminiModel() });
    }
  }

  if (process.env.OPENAI_API_KEY?.trim()) {
    chain.push({
      provider: "openai",
      key: process.env.OPENAI_API_KEY.trim(),
      model: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    });
  }

  if (process.env.ANTHROPIC_API_KEY?.trim()) {
    chain.push({
      provider: "anthropic",
      key: process.env.ANTHROPIC_API_KEY.trim(),
      model: process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
    });
  }

  const forced = process.env.AI_PROVIDER?.toLowerCase().trim();
  if (forced) return chain.filter((a) => a.provider === forced);

  return chain;
}

export function configuredProvider(): AiProvider | null {
  return attempts()[0]?.provider ?? null;
}

/** Recorded alongside generated text so we know what wrote it. */
export function activeModel(): string | null {
  return attempts()[0]?.model ?? null;
}

/** Quota or a disabled key: worth trying the next one. Anything else is ours. */
function isQuotaError(status: number): boolean {
  return status === 429 || status === 403;
}

type Result = { text?: string | null; tryNext?: boolean };

/**
 * The Gemini output budget covers internal reasoning as well as the reply.
 * Current flash models spend well over a thousand tokens thinking before
 * writing a word, and that counts against the limit. Thinking cannot be turned
 * off either: thinkingBudget 0 is rejected and 128 was ignored in favour of 480.
 */
const GEMINI_MAX_OUTPUT = 8000;

async function callGemini(system: string, prompt: string, a: Attempt): Promise<Result> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${a.model}:generateContent`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": a.key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.85, maxOutputTokens: GEMINI_MAX_OUTPUT },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    console.warn(`[ai] gemini ${response.status}: ${detail.slice(0, 240)}`);
    return { tryNext: isQuotaError(response.status) };
  }

  const body = (await response.json()) as {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  };

  const candidate = body.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    console.warn(`[ai] gemini stopped early: ${candidate.finishReason}`);
    return { text: null };
  }

  const text = candidate?.content?.parts?.map((p) => p.text ?? "").join("").trim();
  return { text: text || null };
}

async function callOpenai(system: string, prompt: string, a: Attempt): Promise<Result> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${a.key}`,
    },
    body: JSON.stringify({
      model: a.model,
      temperature: 0.85,
      max_tokens: 1200,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    console.warn(`[ai] openai ${response.status}: ${detail.slice(0, 240)}`);
    return { tryNext: isQuotaError(response.status) };
  }

  const body = (await response.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string } }[];
  };

  const choice = body.choices?.[0];
  if (choice?.finish_reason === "length") {
    console.warn("[ai] openai stopped early: length");
    return { text: null };
  }

  return { text: choice?.message?.content?.trim() || null };
}

async function callAnthropic(
  system: string,
  prompt: string,
  a: Attempt,
): Promise<Result> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": a.key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: a.model,
      max_tokens: 1200,
      temperature: 0.85,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    console.warn(`[ai] anthropic ${response.status}: ${detail.slice(0, 240)}`);
    return { tryNext: isQuotaError(response.status) };
  }

  const body = (await response.json()) as {
    stop_reason?: string;
    content?: { type?: string; text?: string }[];
  };

  if (body.stop_reason === "max_tokens") {
    console.warn("[ai] anthropic stopped early: max_tokens");
    return { text: null };
  }

  const text = body.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();

  return { text: text || null };
}

/**
 * Runs a prompt through the chain. Returns null on any failure, including no
 * key configured. Never throws: this is decoration on top of an archive, and it
 * must not be able to break an ingest or a page render.
 */
export async function generate(system: string, prompt: string): Promise<string | null> {
  const chain = attempts();

  for (const [index, attempt] of chain.entries()) {
    try {
      const result =
        attempt.provider === "gemini"
          ? await callGemini(system, prompt, attempt)
          : attempt.provider === "openai"
            ? await callOpenai(system, prompt, attempt)
            : await callAnthropic(system, prompt, attempt);

      if (result.text !== undefined) {
        if (!result.text) return null;
        // Models like to wrap prose in fences or restate the brief.
        return result.text
          .replace(/^```[a-z]*\n?/i, "")
          .replace(/\n?```$/i, "")
          .trim();
      }

      if (result.tryNext && index < chain.length - 1) {
        console.warn(
          `[ai] ${attempt.provider} unavailable, falling through to ${chain[index + 1].provider}`,
        );
        continue;
      }
      return null;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[ai] ${attempt.provider} threw: ${reason}`);
      if (index === chain.length - 1) return null;
    }
  }

  return null;
}
