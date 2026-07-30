/**
 * What each Gemini key can actually do today.
 *
 *   npm run ai:quota            text models only
 *   npm run ai:quota -- --images  also probe image generation
 *
 * Written because the writing pipeline going quiet looks identical from the
 * outside whether the quota ran out, a key was revoked, or a model was retired,
 * and the only symptom is an article that never appears. This prints the
 * difference.
 *
 * The important number it surfaces: the free tier allows twenty requests per day
 * **per model per project**. Not per key. Two keys from the same Google Cloud
 * project share one allowance, which makes "add another key" advice actively
 * misleading unless the key comes from a new project. When a 429 names its
 * `quotaValue` that is a real allowance you have used up. When it names no value
 * at all, that model is not included in your tier and no amount of waiting helps.
 *
 * Costs one request per key per model probed, which is 5% of a day's allowance.
 * Worth knowing before running it on a match night. A 429 costs nothing, so a key
 * that is already exhausted is free to check.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const probeImages = process.argv.includes("--images");

const API = "https://generativelanguage.googleapis.com/v1beta";

/** Mirrors geminiKeys() in src/lib/ai/generate.ts. */
function keys() {
  const found = [];
  const first = process.env.GEMINI_API_KEY?.trim();
  if (first) found.push(["GEMINI_API_KEY", first]);
  for (let n = 2; n <= 10; n++) {
    const key = process.env[`GEMINI_API_KEY_${n}`]?.trim();
    if (key) found.push([`GEMINI_API_KEY_${n}`, key]);
  }
  return found;
}

/** The quota violations out of a 429 body, which is where the real numbers are. */
function quotaDetail(text) {
  try {
    const body = JSON.parse(text);
    const violations = (body.error?.details ?? []).flatMap((d) => d.violations ?? []);
    if (violations.length === 0) return body.error?.message?.slice(0, 100) ?? "";

    return violations
      .map((v) => {
        const id = (v.quotaId ?? "?")
          .replace(/^GenerateContent|^Generate/, "")
          .replace(/-FreeTier$/, "");
        // No value means no allowance: this model is not in the tier at all.
        return v.quotaValue === undefined
          ? `${id}=none`
          : `${id}=${v.quotaValue}`;
      })
      .join(" ");
  } catch {
    return text.slice(0, 100).replace(/\s+/g, " ");
  }
}

async function probe(key, model, image) {
  const body = image
    ? {
        contents: [{ role: "user", parts: [{ text: "A grey square." }] }],
        generationConfig: { responseModalities: ["IMAGE"] },
      }
    : {
        contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }],
        generationConfig: { maxOutputTokens: 2000 },
      };

  try {
    const response = await fetch(`${API}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    const text = await response.text();
    if (response.ok) return { ok: true, note: "answered" };

    return {
      ok: false,
      note:
        response.status === 429
          ? quotaDetail(text)
          : response.status === 503
            ? "overloaded upstream, transient"
            : quotaDetail(text),
      status: response.status,
    };
  } catch (error) {
    return { ok: false, note: error.message, status: 0 };
  }
}

async function imageModelFor(key) {
  const override = process.env.GEMINI_IMAGE_MODEL?.trim();
  if (override) return override;

  const response = await fetch(`${API}/models?pageSize=200`, {
    headers: { "x-goog-api-key": key },
  });
  if (!response.ok) return null;

  const body = await response.json();
  const names = (body.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));

  // Same preference order as src/lib/ai/image.ts.
  const preferred = [
    "gemini-3.1-flash-image",
    "gemini-2.5-flash-image",
    "gemini-3-pro-image",
    "nano-banana-pro-preview",
    "gemini-3.1-flash-lite-image",
  ];

  return (
    preferred.find((p) => names.includes(p)) ??
    names.find((n) => /image/.test(n) && !/veo|tts|edit/.test(n)) ??
    null
  );
}

const configured = keys();
if (configured.length === 0) {
  console.error("No Gemini keys configured. Set GEMINI_API_KEY in .env.local.");
  process.exit(1);
}

const textModel = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";

console.log(`\nText model: ${textModel}`);
console.log(`Keys configured: ${configured.length}`);
console.log(
  probeImages
    ? "Probing text and images.\n"
    : "Probing text only. Pass --images to include image generation.\n",
);

let textOk = 0;
let imageOk = 0;

for (const [name, key] of configured) {
  const text = await probe(key, textModel, false);
  if (text.ok) textOk++;
  console.log(
    `${name.padEnd(18)} text   ${text.ok ? "OK  " : String(text.status).padEnd(4)} ${text.note}`,
  );

  if (!probeImages) continue;

  const model = await imageModelFor(key);
  if (!model) {
    console.log(`${"".padEnd(18)} image  ----  no image model listed for this key`);
    continue;
  }

  const image = await probe(key, model, true);
  if (image.ok) imageOk++;
  console.log(
    `${"".padEnd(18)} image  ${image.ok ? "OK  " : String(image.status).padEnd(4)} ${model}: ${image.note}`,
  );
}

/*
 * The rest of the chain, which is easy to forget exists.
 *
 * These are last resorts and get used only once every Gemini key is spent, which
 * means a dead one goes unnoticed for weeks. `ANTHROPIC_API_KEY` sat empty and
 * then invalid without anything saying so, and an empty key is silently dropped
 * from the chain by design, so the environment looked healthier than it was.
 */
async function probeOpenai() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_tokens: 20,
      messages: [{ role: "user", content: "Reply with the single word OK." }],
    }),
  });

  return { model, status: response.status, note: response.ok ? "answered" : quotaDetail(await response.text()) };
}

async function probeAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;

  const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5-20251001";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 20,
      messages: [{ role: "user", content: "Reply with the single word OK." }],
    }),
  });

  if (response.ok) return { model, status: 200, note: "answered" };

  const text = await response.text();
  let note = text.slice(0, 120).replace(/\s+/g, " ");
  try {
    note = JSON.parse(text).error?.message ?? note;
  } catch {
    /* keep the raw body */
  }
  return { model, status: response.status, note };
}

for (const [label, probeFn] of [
  ["OPENAI_API_KEY", probeOpenai],
  ["ANTHROPIC_API_KEY", probeAnthropic],
]) {
  const result = await probeFn();
  if (!result) {
    console.log(`${label.padEnd(18)} text   ----  unset, so not in the chain at all`);
    continue;
  }
  console.log(
    `${label.padEnd(18)} text   ${result.status === 200 ? "OK  " : String(result.status).padEnd(4)} ${result.model}: ${result.note}`,
  );
}

console.log(`\n${textOk} of ${configured.length} Gemini keys can write text right now.`);
if (probeImages) {
  console.log(
    `${imageOk} of ${configured.length} Gemini keys can generate an image right now.`,
  );
}

// The rough shape of a night, for comparison against the number above. A four
// match evening with five players wants a report each, one column, and a profile
// rewrite for anyone who has played three more matches since their last one.
console.log(
  "\nA typical four match night with five players needs about eleven text\n" +
    "requests and one image request. Each project allows twenty per model per\n" +
    "day. Exhausted keys have been seen recovering within the hour, so the\n" +
    "allowance looks like a rolling window rather than a daily reset.",
);
console.log("Confirm allowances at https://aistudio.google.com/rate-limit\n");
