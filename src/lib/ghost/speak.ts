/**
 * One short line of chat, from whichever model answers first.
 *
 * The ghost on each server asks the site what to say rather than holding keys
 * of its own: the keys stay in Vercel's environment and never reach the VPS.
 * The owner asked on 25 September 2026 for this to run on free services. On
 * 27 September, after the free allowance ran out in one busy evening (266
 * replies), he added: "thats why we have those other api codes because it can
 * use up free stuff", and Claude became the last resort. On 1 October, after
 * a week of Wisp asking odd questions and losing the thread: "if you need the
 * paid api to get better results, just use it". So Claude Haiku 4.5 now
 * answers first, while the ghost's own daily cap allows it (the VPS counts,
 * and says so in `allowPaid`), and the free models are the fallback:
 *
 * - Claude Haiku 4.5 on the Anthropic keys, paid. The persona, the knowledge
 *   base and the map list are the same on every reply, so they are cached for
 *   an hour and read back at a tenth of the price. `usage` says what each
 *   reply cost in tokens; the VPS logs it.
 * - Cloudflare Workers AI, Llama 3.3 70B fast: about 0.6 s, the best free replies.
 * - Cloudflare Workers AI, Llama 3.1 8B fast: about 0.75 s.
 * - Gemini flash lite across every numbered key: the free tier is about twenty
 *   requests a day per project and the default flash model answered 503
 *   "experiencing high demand", so it comes last.
 *
 * The free models get a smaller system prompt (`compact`): they cache nothing,
 * and the free allowance is counted in what goes in.
 *
 * Null means none of them produced a usable line. The ghost then says one of
 * its own lines where one fits: "hows it going?" in answer to a reply to its
 * hello, a canned line to a lone player (see ghost-rules.mjs on the VPS).
 */

import Anthropic from "@anthropic-ai/sdk";

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
 * line in its place. Four reviews on 26 September 2026 found the cases
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

/*
 * What a stage direction looks like: a third-person verb first ("waves",
 * "floats in from the shadows"), never a question. Anything else in asterisks
 * is emphasis or speech, and keeps its words.
 */
const ACTION_VERB = /^(waves|grins|nods|shrugs|laughs|chuckles|floats|drifts|smiles|winks|sighs|giggles|glides|hovers|stays|says|appears|materializes|fades|vanishes|whispers|rattles|flickers|leans|tips|pats|spins|swoops|twirls|looks|gives|raises|claps|cheers|beams|shivers|howls)\b/i;
function isAction(inner: string): boolean {
  return !/\?/.test(inner) && ACTION_VERB.test(inner.trim());
}

/** A whole line in italics is speech when it reads like chat, an action when it is one. */
function italicIsSpeech(inner: string): boolean {
  if (isAction(inner)) return false;
  return /\?/.test(inner) || /^(hey|hi|yo|sup|lol|haha|nah|yeah|yep|not much|i|im|i'm|we|u|you)\b/i.test(inner.trim());
}

/** One line, cleaned of what models wrap around speech. Empty when nothing sayable is left. */
function cleanLine(line: string, speaker: string): string {
  const prefix = namePrefix(speaker);
  const actionOrWords = (inner: string) => (isAction(inner) ? "" : inner);
  let text = line.trim();
  for (let pass = 0; pass < 6; pass += 1) {
    const before = text;
    text = text.replace(prefix, "");
    text = text.replace(/^["'`]+|["'`]+$/g, "").trim();
    text = text.replace(/^(\*\*|__)(.*)\1$/, "$2");
    const italic = text.match(/^\*([^*]+)\*$/);
    if (italic) text = italicIsSpeech(italic[1]) ? italic[1] : "";
    text = text.replace(/^\*([^*]{1,60})\*[\s,]*(?=\S)/, (_, inner: string) => (isAction(inner) ? "" : `${inner} `));
    text = text.replace(/\s*\*([^*]{1,60})\*([.!?]*)$/, (_, inner: string, end: string) => {
      const kept = actionOrWords(inner);
      return kept ? ` ${kept}${end}` : end;
    });
    text = text.replace(/\*([^*]{1,60})\*/g, (_, inner: string) => actionOrWords(inner));
    text = text.replace(/\s*,\s*,/g, ",").replace(/\s+([,.!?])/g, "$1").replace(/^[\s,]+|[\s,]+$/g, "").trim();
    if (text === before) break;
  }
  // Emphasis left over keeps its words.
  text = text.replace(/\*+/g, "");
  return asciiLine(text);
}

const FENCE = /^`{3,}[\w-]*$/;
const WRAP = "[\\s*_`\"'\\[\\](){}]";
/** A bare "skip" or "silence", in any case, as the whole line. */
const BARE_SKIP = new RegExp(`^${WRAP}*(skip|silence)${WRAP}*[.!]*$`, "i");
/** A capital SKIP leading the line, after any label, whatever reason follows it. */
const LEADING_SKIP = new RegExp(`^${WRAP}*([A-Za-z]+:\\s*)?${WRAP}*SKIP(?![A-Za-z0-9_])`);
/** A capital SKIP ending the line after a sentence, a bracket or a label. */
const TRAILING_SKIP = new RegExp(`(^|[.!?:)\\]-]\\s*)${WRAP}*SKIP${WRAP}*[.!]*$`);
/** A note to itself about staying quiet. */
const SILENT_NOTE = new RegExp(
  `^${WRAP}*(no (reply|response)( needed)?|nothing to say|n/a|(i )?(says?|stays?) (nothing|quiet|silent)|remains? (quiet|silent))${WRAP}*[.!]*$`,
  "i",
);
const BRACKETED = /^[([][^)\]]*[)\]][.!]*$/;
const EMOTICON = /^(?:[:;=8][-'^o]?[()[\]/\\|DPpO3*]|[()[\]][-'^o]?[:;=]|\^[_.-]?\^|<3|xD|XD)$/;

/** Whether one line is the model choosing to say nothing. */
function isSkipLine(text: string): boolean {
  return BARE_SKIP.test(text) || LEADING_SKIP.test(text) || TRAILING_SKIP.test(text) || SILENT_NOTE.test(text);
}

/**
 * A model's reply, decided: skip it, or say this line. An empty line with no
 * skip means nothing usable came back, and the next provider is asked.
 *
 * Lines are read in order. A label, a fence, a bracketed note or a stage
 * direction on a line of its own is passed over, and the first line with
 * something to say is the reply. A reply that is only a note about staying
 * quiet, or only punctuation ("..."), is silence. A reply that is only an
 * action ("*waves*") is unusable rather than silence: the model has not said
 * anything, so another model gets the chance to.
 */
export function decide(raw: string, speaker: string): { skip: boolean; line: string } {
  const prefix = namePrefix(speaker);
  let silent = false;
  for (const candidate of raw.split(/\r?\n/).map((line) => asciiLine(line))) {
    if (!candidate || FENCE.test(candidate)) continue;
    const body = candidate.replace(prefix, "").trim();
    if (!body) continue;
    if (isSkipLine(body)) return { skip: true, line: "" };
    if (BRACKETED.test(body)) { silent = true; continue; }
    const line = cleanLine(candidate, speaker);
    if (line && isSkipLine(line)) return { skip: true, line: "" };
    if (/[A-Za-z0-9]/.test(line) || EMOTICON.test(line)) return { skip: false, line };
    if (line || !/[A-Za-z0-9]/.test(body)) silent = true; // "...", "*": punctuation, not an action
  }
  return { skip: silent, line: "" };
}

/** The line a reply would put in the chat, or "" for none. */
export function cleanReply(raw: string, speaker: string): string {
  return decide(raw, speaker).line;
}

type Attempt =
  | { provider: "cloudflare"; model: string }
  | { provider: "gemini"; model: string; key: string }
  | { provider: "anthropic"; model: string; key: string };

/** The paid model, first while the cap allows: Anthropic's smallest current model, on each Anthropic key. */
export const PAID_MODEL = "claude-haiku-4-5";

/** A system prompt in its two shapes: cached in parts for the paid model, whole and smaller for the free ones. */
export type SystemPrompt = {
  /** The same on every reply while the rotation stands. */
  stable: string;
  /** This moment on the server. */
  live: string;
  /** All of it in one, for the free models. */
  compact: string;
};

/** What one paid reply used, in tokens. */
export type Usage = { input: number; cacheRead: number; cacheWrite: number; output: number };

function anthropicKeys(): string[] {
  return [process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_API_KEY_2]
    .map((key) => key?.trim())
    .filter((key): key is string => Boolean(key));
}

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

function attempts(allowPaid: boolean): Attempt[] {
  const list: Attempt[] = [];
  if (allowPaid) for (const key of anthropicKeys()) list.push({ provider: "anthropic", model: PAID_MODEL, key });
  if (cloudflareAccount() && process.env.CLOUDFLARE_AI_TOKEN?.trim()) {
    list.push({ provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" });
    list.push({ provider: "cloudflare", model: "@cf/meta/llama-3.1-8b-instruct-fast" });
  }
  const gemini = process.env.GHOST_GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
  for (const key of geminiKeys()) list.push({ provider: "gemini", model: gemini, key });
  return list;
}

async function callAnthropic(
  system: SystemPrompt,
  prompt: string,
  model: string,
  key: string,
): Promise<{ text: string | null; usage: Usage }> {
  // No retries: a failure here goes to the next key, then to the free models.
  const client = new Anthropic({ apiKey: key, timeout: TIMEOUT_MS, maxRetries: 0 });
  const response = await client.messages.create({
    model,
    max_tokens: 200,
    temperature: 0.7,
    // The stable part first, cached for an hour: players come and go, and a
    // conversation's replies are often more than five minutes apart.
    system: [
      { type: "text", text: system.stable, cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: system.live },
    ],
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
  const usage: Usage = {
    input: response.usage.input_tokens,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
    cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    output: response.usage.output_tokens,
  };
  return { text: text || null, usage };
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
        max_tokens: 160,
        temperature: 0.7,
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
        generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
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

/** What a player thinks of the map being played, as the model heard it. */
export type Opinion = { verdict: "like" | "dislike" | "mixed"; reason: string };

export type Spoken = {
  line: string;
  provider: string;
  notes: string[];
  lore: string[];
  opinions: Opinion[];
  /** Tokens, for a paid reply; null for a free one. */
  usage: Usage | null;
} | null;

const VERDICTS: Record<string, Opinion["verdict"]> = {
  like: "like", likes: "like", love: "like", loves: "like", good: "like",
  dislike: "dislike", dislikes: "dislike", hate: "dislike", hates: "dislike", bad: "dislike",
  mixed: "mixed", meh: "mixed", neutral: "mixed",
};

/**
 * The notes a reply carries after its chat line: "NOTE: ..." about the person,
 * "LORE: ..." about the maps, the game or the community. Taken out before the
 * reply is decided, so a note can never reach the chat. Asked for on 26
 * September 2026: "if users share info, keep it so you can reference it later
 * like a friend would". It rides on the reply's own call, so it costs nothing
 * extra.
 */
export function takeNotes(raw: string): { rest: string; notes: string[]; lore: string[]; opinions: Opinion[] } {
  const notes: string[] = [];
  const lore: string[] = [];
  const opinions: Opinion[] = [];
  const rest: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = asciiLine(line).match(/^[\s*_`"'[(-]*(note|lore|map)[\s*_]*:[\s*_`"']*(.+?)[\s*_`"')\]]*$/i);
    if (!match) { rest.push(line); continue; }
    const text = match[2].trim().slice(0, 160);
    if (text.length < 3 || /^(none|n\/a|nothing|-)\.?$/i.test(text)) continue;
    const kind = match[1].toLowerCase();
    if (kind === "map") {
      // "MAP: dislike - too dark to see anyone": the verdict, then why.
      const said = text.match(/^(\w+)\b[\s:,.-]*(.*)$/);
      const verdict = said ? VERDICTS[said[1].toLowerCase()] : undefined;
      if (verdict) opinions.push({ verdict, reason: said![2].trim().slice(0, 140) });
    } else (kind === "note" ? notes : lore).push(text);
  }
  return { rest: rest.join("\n"), notes: notes.slice(0, 3), lore: lore.slice(0, 3), opinions: opinions.slice(0, 1) };
}

/**
 * A line of at most `maxLength` characters, or null.
 *
 * A reply that comes back empty, or that the model wrapped in so much that
 * nothing sayable is left, moves on to the next provider rather than being
 * sent: silence is the scripted fallback's job, not a blank line in chat.
 */
export async function speak(
  system: SystemPrompt,
  prompt: string,
  speaker: string,
  maxLength: number,
  { allowPaid = false }: { allowPaid?: boolean } = {},
): Promise<Spoken> {
  for (const attempt of attempts(allowPaid)) {
    try {
      let raw: string | null;
      let usage: Usage | null = null;
      if (attempt.provider === "anthropic") {
        ({ text: raw, usage } = await callAnthropic(system, prompt, attempt.model, attempt.key));
      } else if (attempt.provider === "cloudflare") {
        raw = await callCloudflare(system.compact, prompt, attempt.model);
      } else {
        raw = await callGemini(system.compact, prompt, attempt.model, attempt.key);
      }
      if (!raw) continue;
      const { rest, notes, lore, opinions } = takeNotes(raw);
      const decided = decide(rest, speaker);
      if (decided.skip) return { line: "", provider: attempt.model, notes, lore, opinions, usage };
      if (!decided.line) continue;
      return { line: clamp(siteName(decided.line), maxLength), provider: attempt.model, notes, lore, opinions, usage };
    } catch (error) {
      console.warn(`[ghost] ${attempt.model} failed: ${error instanceof Error ? error.name : "error"}`);
    }
  }
  return null;
}

/**
 * The site's address spelled right. Live, 1 October, Haiku sent a player to
 * "redaction4you.com/halloween": one letter off, and somebody else's domain.
 */
export function siteName(text: string): string {
  return text.replace(/\b[a-z]*4\s?you\s?\.\s?com\b/gi, "RedFaction4You.com");
}

/**
 * Cut at the end of a sentence when one ends far enough in, otherwise at a
 * word boundary with an ellipsis, never mid-word.
 */
export function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  const fits = text.slice(0, max + 1);
  const end = Math.max(...[". ", "! ", "? "].map((mark) => fits.lastIndexOf(mark)));
  if (end >= max * 0.4) return text.slice(0, end + 1);
  const cut = text.slice(0, max - 3);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[,.;:!?\s]+$/, "")}...`;
}
