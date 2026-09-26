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

/*
 * Turning a model's reply into one chat line, or into silence.
 *
 * Models dress their lines up: a "Wisp:" or "You:" label (promptFor writes the
 * ghost's own lines that way), quotes, bold, a stage direction such as
 * *waves*, a code fence, a note to themselves such as "(no response needed)".
 * None of that may reach a player, and a model that chose silence must stay
 * silent: its SKIP, however dressed, is never said, and neither is a canned
 * line in its place. Three reviews on 26 September 2026 found the cases
 * scripts/ghost.test.mjs is built on.
 */

/**
 * "Wisp:", "You:", "**Wisp:**", "*You*:", "__Wisp__:" at the start of a line.
 * A marker pairs with the name only when it closes around the name or the
 * colon, so the *waves* in "Wisp: *waves* hey" is left whole for the
 * stage-direction strip.
 */
function namePrefix(speaker: string): RegExp {
  const name = speaker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^[\\s"'\`]*(\\*\\*|__|\\*|_)?(?:${name}|you)(?:\\1)?\\s*:\\s*(?:\\1)?[\\s\`]*`, "i");
}

/** A line in single asterisks is speech in italics if it reads like speech, an action if not. */
function readsLikeSpeech(text: string): boolean {
  return /\?/.test(text) || /\b(you|u|ya|hey|hi|yo|sup|lol|haha|gg|nice)\b/i.test(text) || text.trim().split(/\s+/).length > 4;
}

/** One line, cleaned of what models wrap around speech. Empty when nothing sayable is left. */
function cleanLine(line: string, speaker: string): string {
  const prefix = namePrefix(speaker);
  let text = line.trim();
  for (let pass = 0; pass < 6; pass += 1) {
    const before = text;
    text = text.replace(prefix, "");
    text = text.replace(/^["'`]+|["'`]+$/g, "").trim();
    text = text.replace(/^(\*\*|__)(.*)\1$/, "$2");
    const italic = text.match(/^\*([^*]+)\*$/);
    if (italic) text = readsLikeSpeech(italic[1]) ? italic[1] : "";
    text = text.replace(/^\*[^*]{1,60}\*\s+(?=\S)/, "");        // *waves* hey sam
    text = text.replace(/\s+\*[^*]{1,60}\*$/, "");              // hey sam *waves*
    text = text.replace(/([.!?,])\s*\*[^*]{1,60}\*\s*/g, "$1 "); // hey! *waves* how's it going?
    text = text.trim();
    if (text === before) break;
  }
  // Emphasis left in the middle of a line keeps its words.
  text = text.replace(/\*+/g, "");
  return asciiLine(text);
}

const FENCE = /^`{3,}[\w-]*$/;
const BARE_SKIP = /^[\s*_`"'[(:]*(skip|silence)[\s*_`"'\])!.]*$/i;
const SKIP_WORD = /^SKIP(?![A-Za-z0-9_])\s*([(,:;-].*)?$/;
const SILENT_NOTE = /^[\s*_`"'[(]*(no (reply|response)( needed)?|nothing to say|n\/a|(i )?(says?|stays?) (nothing|quiet|silent))[.!]*$/i;
const BRACKETED = /^[([][^)\]]*[)\]][.!]*$/;

/** Whether one line is the model choosing to say nothing. */
function isSkipLine(text: string): boolean {
  return BARE_SKIP.test(text) || SKIP_WORD.test(text) || SILENT_NOTE.test(text) || BRACKETED.test(text);
}

/**
 * A model's reply, decided: skip it, or say this line. An empty line with no
 * skip means nothing usable came back, and the next provider is asked.
 *
 * Lines are read in order: a label or a fence on its own line is passed over,
 * the first line with something to say is the reply, and a line that is only
 * an action or punctuation ("*stays quiet*", "...") means the model chose
 * silence, unless a later line says something after all.
 */
export function decide(raw: string, speaker: string): { skip: boolean; line: string } {
  const prefix = namePrefix(speaker);
  let silent = false;
  for (const candidate of raw.split(/\r?\n/).map((line) => asciiLine(line))) {
    if (!candidate || FENCE.test(candidate)) continue;
    const body = candidate.replace(prefix, "").trim();
    if (!body) continue;
    if (isSkipLine(body)) return { skip: true, line: "" };
    const line = cleanLine(candidate, speaker);
    if (line && isSkipLine(line)) return { skip: true, line: "" };
    if (/[A-Za-z0-9]/.test(line)) return { skip: false, line };
    silent = true;
  }
  return { skip: silent, line: "" };
}

/** The line a reply would put in the chat, or "" for none. */
export function cleanReply(raw: string, speaker: string): string {
  return decide(raw, speaker).line;
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
