/**
 * Text generation over whichever API keys are configured.
 *
 * Every key available is tried in turn until one answers. Free tiers have daily
 * caps, so a second key is a spare tank rather than redundancy: when the first
 * is exhausted the next takes over and the writing keeps happening. The same goes
 * for an overloaded upstream. A request that is simply malformed stops the chain,
 * because that is our bug and burning a second key on it helps nobody. See
 * `shouldTryNextKey`.
 *
 * Deliberately minimal: no streaming, no tools, no conversation. One prompt in,
 * one block of prose out, or null. Every caller must handle null, because a
 * missing column is a page with one less article and a broken page is not.
 */

export type AiProvider = "gemini" | "openai" | "anthropic";

/**
 * Long enough for a few paragraphs, short enough not to hang an ingest.
 *
 * Was 30 seconds, which turned out to be optimistic. The output budget covers
 * internal reasoning, so a column spends a long time thinking before the first
 * word arrives, and a timeout looks exactly like a failed generation: the article
 * simply does not appear. One was lost to this while every key still had quota.
 *
 * The ingest route allows 300 seconds and the writing jobs are the slow part of
 * it, so there is room. Sixty is still well inside the budget even when the chain
 * has to fall through a couple of keys.
 */
const TIMEOUT_MS = 60_000;

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
 * How many numbered Gemini keys are looked for. Raise it if ten is ever not
 * enough; there is no cost to the ones that are unset.
 */
const MAX_GEMINI_KEYS = 10;

/**
 * Every Gemini key, in the order they should be tried.
 *
 * `GEMINI_API_KEY`, then `GEMINI_API_KEY_2` upwards, stopping at the first gap so
 * the order is the order they were added. Enumerated rather than listed because
 * capacity here is measured in keys: the free tier allows twenty requests per day
 * per model per project, and a night of match reports, a column and a few player
 * profiles is most of that. Adding a key should be one line in the environment
 * and no deploy.
 *
 * Worth knowing before adding one: the quota is per project, not per key. A
 * second key created inside the same Google Cloud project shares the first key's
 * twenty. New keys have to come from new projects to add anything.
 *
 * Exported because image generation is Gemini only and needs the same spare tank
 * behaviour, but cannot share `generate()`: it asks for a different response
 * modality and gets bytes back rather than prose. The key list is the part worth
 * sharing.
 */
/**
 * The key to use for image generation, when it should not be the general pool.
 *
 * Exists because of how Google bills. The free API tier lives in projects with no
 * billing account, and enabling billing on a project moves **everything that
 * project serves** onto pay as you go. Image models have no free allowance at all,
 * so a picture needs a billed project, while the text side is comfortably inside
 * the free allowance across the other keys.
 *
 * Naming one key for images keeps those separate: the billed project draws only
 * the handful of image requests a month, and every column, report, profile and
 * vision check stays on the free keys. Without this, turning on billing to get
 * pictures would quietly put all the writing on the meter too.
 *
 * Unset means images fall back to the ordinary pool, which is the right behaviour
 * when somebody has a single billed key and nothing else.
 */
export function geminiImageKeys(): string[] {
  const dedicated = process.env.GEMINI_IMAGE_API_KEY?.trim();
  return dedicated ? [dedicated] : geminiKeys();
}

export function geminiKeys(): string[] {
  const keys: string[] = [];

  const first = process.env.GEMINI_API_KEY?.trim();
  if (first) keys.push(first);

  const missing: number[] = [];

  for (let n = 2; n <= MAX_GEMINI_KEYS; n++) {
    const key = process.env[`GEMINI_API_KEY_${n}`]?.trim();
    if (!key) {
      missing.push(n);
      continue;
    }
    // A gap before a key that does exist is a typo in the numbering. Use the key
    // anyway, because quietly dropping configured capacity is the failure this
    // whole function exists to avoid, but say so: the alternative is somebody
    // wondering for a week why their fourth key does nothing.
    if (missing.length) {
      console.warn(
        `[ai] GEMINI_API_KEY_${n} is set but ${missing.map((gap) => `_${gap}`).join(", ")} ${missing.length === 1 ? "is" : "are"} not. Using it regardless.`,
      );
      missing.length = 0;
    }
    keys.push(key);
  }

  return keys;
}

/**
 * Every Anthropic key, in order, same numbering as the Gemini ones.
 *
 * Worth having more than one for a different reason than Gemini: these are paid
 * rather than rationed, so a second key is a second balance rather than a second
 * allowance. A key whose credit runs out answers 400 with an
 * `invalid_request_error` about credit, which is not a status the chain would
 * otherwise move on from, so the next key genuinely earns its place.
 *
 * Keys are checked for the `sk-ant-` prefix because an OpenAI key pasted into
 * `ANTHROPIC_API_KEY_2` sat there looking configured, and a key in the wrong slot
 * fails in a way that reads like the provider being down.
 */
export function anthropicKeys(): string[] {
  const raw = [
    process.env.ANTHROPIC_API_KEY,
    process.env.ANTHROPIC_API_KEY_2,
    process.env.ANTHROPIC_API_KEY_3,
    process.env.ANTHROPIC_API_KEY_4,
  ];

  const keys: string[] = [];
  for (const [index, value] of raw.entries()) {
    const key = value?.trim();
    if (!key) continue;
    if (!key.startsWith("sk-ant-")) {
      console.warn(
        `[ai] ANTHROPIC_API_KEY${index ? `_${index + 1}` : ""} does not look like an ` +
          `Anthropic key (starts "${key.slice(0, 8)}"). Ignoring it.`,
      );
      continue;
    }
    keys.push(key);
  }

  return keys;
}

/**
 * The chain, in order. Gemini first because that is where the free allowances
 * are, then OpenAI, then Anthropic.
 */
function attempts(): Attempt[] {
  const chain: Attempt[] = [];

  for (const key of geminiKeys()) {
    chain.push({ provider: "gemini", key, model: geminiModel() });
  }

  if (process.env.OPENAI_API_KEY?.trim()) {
    chain.push({
      provider: "openai",
      key: process.env.OPENAI_API_KEY.trim(),
      model: process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
    });
  }

  for (const key of anthropicKeys()) {
    chain.push({
      provider: "anthropic",
      key,
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

/**
 * Whether another key is worth trying.
 *
 * Quota (429) or bad credentials (401, 403) are the obvious cases: the request was
 * fine, this key cannot serve it. 401 matters more than it looks: one dead key
 * anywhere in the chain would otherwise stop every attempt behind it, and a key
 * that was pasted wrong is exactly the kind of thing that sits unnoticed.
 *
 * 5xx belongs here too, which it did not at first, and that cost a night's
 * column. Gemini answers 503 "This model is currently experiencing high demand"
 * fairly readily, and treating it as our bug meant one transient upstream blip
 * abandoned the write until the next sync fifteen minutes later, with the second
 * key sitting untouched. An overloaded backend is not a malformed request.
 *
 * Anything else, a 400 or a 404, really is ours, and burning a second key on the
 * same broken request helps nobody.
 */
function shouldTryNextKey(status: number): boolean {
  return status === 429 || status === 401 || status === 403 || status >= 500;
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
    return { tryNext: shouldTryNextKey(response.status) };
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
    return { tryNext: shouldTryNextKey(response.status) };
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
    return { tryNext: shouldTryNextKey(response.status) };
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
/**
 * Removes em dashes from generated prose.
 *
 * Seven system prompts say not to use them and one still reached a published
 * match report, which is the whole argument for doing this here instead: an
 * instruction is a request and this is a guarantee. Same lesson as the
 * illustrations, where listing prohibitions in the prompt put the forbidden
 * thing in the picture.
 *
 * A spaced em dash becomes a comma, which is what the sentence almost always
 * wanted. An unspaced one becomes a comma and a space so words do not fuse.
 *
 * En dashes are left alone deliberately. They are correct in a scoreline and in
 * a range, and both appear all over this site.
 */
export function withoutEmDashes(text: string): string {
  return text
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",");
}

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
