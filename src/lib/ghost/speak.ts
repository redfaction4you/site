/**
 * One short line of chat, from whichever free model answers first.
 *
 * The ghost on each server asks the site what to say rather than holding keys
 * of its own: the keys stay in Vercel's environment and never reach the VPS.
 * The owner asked on 25 September 2026 for this to run on free services only,
 * so the paid providers the retired analyst could use (OpenAI, Anthropic) are
 * deliberately absent.
 *
 * The order is by what was measured that day, one short prompt each:
 *
 * - Cloudflare Workers AI, Llama 3.3 70B fast: about 0.6 s, the best replies.
 * - Cloudflare Workers AI, Llama 3.1 8B fast: about 0.75 s, a larger share of
 *   the free daily allowance per reply spent on less.
 * - Gemini flash lite across every numbered key: the free tier is about twenty
 *   requests a day per project and the default flash model answered 503
 *   "experiencing high demand", so it is the last resort, not the first.
 *
 * Null means none of them produced a usable line. The ghost then says one of
 * its own lines where one fits: "hows it going?" in answer to a reply to its
 * hello, a canned line to a lone player (see ghost-rules.mjs on the VPS).
 */

const TIMEOUT_MS = 12_000;

/** Red Faction chat is a 2001 bitmap font: plain ASCII, one line. */
export function asciiLine(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    // The owner forbids em dashes in anything a player reads; a comma reads
    // the same in chat.
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/\u2026/g, "...")
    // Whitespace first: a newline or tab stripped as unprintable would glue
    // the words either side of it together.
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7e]/g, "")
    // And again after, for the gap a stripped emoji leaves between two words.
    .replace(/\s+/g, " ")
    .trim();
}

/** The first non-empty line of a reply, in plain ASCII, so every later step sees straight quotes. */
function firstLine(raw: string): string {
  return asciiLine(raw.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "");
}

/**
 * "Wisp:", "You:", "**Wisp:**", "__You__:" at the start of a reply. Only a
 * doubled marker pairs with the name: a single asterisk after the colon opens
 * a stage direction, which is stripped whole, not in half.
 */
function namePrefix(speaker: string): RegExp {
  const name = speaker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^[\\s"'\`]*(\\*\\*|__)?(?:${name}|you)(?:\\1)?\\s*:\\s*(?:\\1)?[\\s\`]*`, "i");
}

/**
 * What models add around a chat line and a player should never see: quotes
 * or bold, a "Wisp:" or "You:" prefix, a stage direction like *drifts over*.
 */
export function cleanReply(raw: string, speaker: string): string {
  let text = firstLine(raw);
  text = text.replace(/^__(.*)__$/, "$1");
  text = text.replace(namePrefix(speaker), "");
  text = text.replace(/\*\*/g, "");
  text = text.replace(/^\*[^*]{1,60}\*\s*/, "");
  text = text.replace(/^["']+|["']+$/g, "");
  return asciiLine(text);
}

/**
 * Whether the model chose to say nothing. Models dress it up ("**SKIP**",
 * "SKIP (for Alex)", "*stays quiet* SKIP"), so any SKIP in capitals standing
 * as a word counts. Lowercase counts only as the whole line, so a reply such as
 * "skip that map lol" still reaches the chat.
 */
export function isSkip(raw: string, speaker: string): boolean {
  const body = firstLine(raw).replace(namePrefix(speaker), "");
  return (
    /(^|[^A-Za-z])SKIP([^A-Za-z]|$)/.test(body) ||
    /^[\s*_`"'[(]*(skip|silence)[\s*_`"'\])!.]*$/i.test(body)
  );
}

/** A model's reply, decided: skip it, or say this line (empty means unusable). */
export function decide(raw: string, speaker: string): { skip: boolean; line: string } {
  const line = cleanReply(raw, speaker);
  if (isSkip(raw, speaker) || (line !== "" && isSkip(line, speaker))) return { skip: true, line: "" };
  return { skip: false, line };
}

type Attempt =
  | { provider: "cloudflare"; model: string }
  | { provider: "gemini"; model: string; key: string };

function cloudflareAccount(): string | null {
  // The R2 account is the same Cloudflare account, which is how the retired
  // image pipeline found it too.
  return process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || process.env.R2_ACCOUNT_ID?.trim() || null;
}

function geminiKeys(): string[] {
  const keys: string[] = [];
  const first = process.env.GEMINI_API_KEY?.trim();
  if (first) keys.push(first);
  for (let n = 2; n <= 10; n++) {
    const key = process.env[`GEMINI_API_KEY_${n}`]?.trim();
    if (key) keys.push(key);
  }
  return keys;
}

function attempts(): Attempt[] {
  const list: Attempt[] = [];
  if (cloudflareAccount() && process.env.CLOUDFLARE_AI_TOKEN?.trim()) {
    list.push({ provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" });
    list.push({ provider: "cloudflare", model: "@cf/meta/llama-3.1-8b-instruct-fast" });
  }
  const gemini = process.env.GHOST_GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
  for (const key of geminiKeys()) list.push({ provider: "gemini", model: gemini, key });
  return list;
}

async function callCloudflare(system: string, prompt: string, model: string): Promise<string | null> {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccount()}/ai/run/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_AI_TOKEN?.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        max_tokens: 90,
        temperature: 0.9,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    console.warn(`[ghost] cloudflare ${model} ${response.status}`);
    return null;
  }
  const body = (await response.json()) as { result?: { response?: string } };
  return body.result?.response ?? null;
}

async function callGemini(system: string, prompt: string, model: string, key: string): Promise<string | null> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        // The budget covers the model's own reasoning as well as the reply.
        generationConfig: { temperature: 0.9, maxOutputTokens: 2000 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    console.warn(`[ghost] gemini ${model} ${response.status}`);
    return null;
  }
  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? null;
}

export type Spoken = { line: string; provider: string } | null;

/**
 * A line of at most `maxLength` characters, or null.
 *
 * A reply that comes back empty, or that the model wrapped in so much that
 * nothing sayable is left, moves on to the next provider rather than being
 * sent: silence is the scripted fallback's job, not a blank line in chat.
 */
export async function speak(
  system: string,
  prompt: string,
  speaker: string,
  maxLength: number,
): Promise<Spoken> {
  for (const attempt of attempts()) {
    try {
      const raw =
        attempt.provider === "cloudflare"
          ? await callCloudflare(system, prompt, attempt.model)
          : await callGemini(system, prompt, attempt.model, attempt.key);
      if (!raw) continue;
      const decided = decide(raw, speaker);
      if (decided.skip) return { line: "", provider: attempt.model };
      if (!decided.line) continue;
      return { line: clamp(decided.line, maxLength), provider: attempt.model };
    } catch (error) {
      console.warn(`[ghost] ${attempt.model} failed: ${error instanceof Error ? error.name : "error"}`);
    }
  }
  return null;
}

/** Cut at a word boundary with an ellipsis rather than mid-word. */
function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 3);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,.;:!?\s]+$/, "")}...`;
}
