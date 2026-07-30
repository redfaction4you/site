/**
 * Image generation, over whichever providers are configured.
 *
 * Separate from `generate.ts` rather than folded into it. That module is a text
 * pipeline: one prompt in, one block of prose out. This asks for a different
 * response modality and gets bytes back.
 *
 * Two providers, tried in order:
 *
 *   1. **Cloudflare Workers AI**, because it is the one with a free allowance. We
 *      already have a Cloudflare account since the files bucket lives there, so
 *      this is a token rather than a new relationship.
 *   2. **Gemini**, kept because it is where everything else in this pipeline runs
 *      and it costs nothing to leave in place. As of 30 July 2026 every image
 *      model it lists answers 429 with a free tier allowance of zero, across six
 *      independent projects, which is Google saying image generation is not
 *      included rather than saying we ran out.
 *
 * Cloudflare goes first deliberately. Putting the known-exhausted provider first
 * would spend two doomed round trips on every attempt, and ordering by "what
 * actually works" is more honest than ordering by "what we tried first".
 *
 * The same rule applies as everywhere else here: never throws, returns null on any
 * failure. An illustration is decoration on top of an archive. It must not be able
 * to cost a column, and a column with no picture is a normal outcome.
 */
import { geminiImageKeys } from "./generate";

/** Images take longer than prose, and this runs inside an ingest request. */
const TIMEOUT_MS = 60_000;

export type GeneratedImage = {
  bytes: Uint8Array;
  mimeType: string;
  /** Recorded on the column so a picture can be traced to what made it. */
  model: string;
};

/**
 * A reference image handed to the model alongside the prompt.
 *
 * Order matters: the prompt refers to these by position, so the caller builds
 * both together. See `buildComposition` in `image-prompt.ts`.
 */
export type ReferenceImage = { bytes: Uint8Array; mimeType: string };

/**
 * Whether another provider or key is worth trying. Same rule as the text chain:
 * quota, bad credentials, or an overloaded backend are all reasons this one cannot
 * serve a request that was fine. A 400 is ours.
 */
function shouldTryNext(status: number): boolean {
  return status === 429 || status === 401 || status === 403 || status >= 500;
}

/**
 * A result that is deliberately three-valued.
 *
 * `image` present means done, one way or the other. `tryNext` means this provider
 * could not serve a request that was fine. The distinction is what stops a
 * malformed prompt from burning every provider in turn.
 */
type Attempt = { image?: GeneratedImage | null; tryNext?: boolean };

/* -------------------------------------------------------------------------- */
/* Cloudflare Workers AI                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Falls back to the R2 account id, which is the same account.
 *
 * The token is separate and must be, because the R2 token is scoped to object
 * storage. Workers AI needs its own with the Workers AI permission.
 */
function cloudflareAccount(): string | null {
  return (
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || process.env.R2_ACCOUNT_ID?.trim() || null
  );
}

function cloudflareToken(): string | null {
  return process.env.CLOUDFLARE_AI_TOKEN?.trim() || null;
}

/**
 * FLUX.1 schnell by default: fast, cheap in neurons, and good enough at 1024px for
 * a picture that renders about 640 wide. Overridable because model catalogues move.
 */
const DEFAULT_CLOUDFLARE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

function cloudflareModel(): string {
  return process.env.CLOUDFLARE_AI_IMAGE_MODEL?.trim() || DEFAULT_CLOUDFLARE_MODEL;
}

/*
 * The frame the site actually renders in.
 *
 * Asked for explicitly because prose does not work: "wide landscape framing" in
 * the prompt was ignored and flux returned a square. `width` and `height` are
 * honoured exactly, while `aspect_ratio` is silently dropped, so these are the
 * parameters to use.
 *
 * It matters more than it sounds. The slot is 16:9, so a square image gets
 * centre-cropped by a third, and the first thing lost is the top of the frame,
 * which is where the one concrete detail the brief chose usually sits. A square
 * picture of a floodlit gantry arrives as a picture with the floodlights cut off.
 */
const CLOUDFLARE_WIDTH = 1024;
const CLOUDFLARE_HEIGHT = 576;

async function callCloudflare(prompt: string, sized = true): Promise<Attempt> {
  const account = cloudflareAccount();
  const token = cloudflareToken();
  if (!account || !token) return { tryNext: true };

  const model = cloudflareModel();

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        prompt,
        // steps is capped low on schnell models and more of them is not better.
        steps: 6,
        ...(sized ? { width: CLOUDFLARE_WIDTH, height: CLOUDFLARE_HEIGHT } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    console.warn(
      `[ai] image cloudflare ${model} ${response.status}: ${detail.slice(0, 240)}`,
    );
    // The model name is configurable and not every image model on Workers AI
    // takes dimensions. One plain retry, because a square picture still beats no
    // picture.
    if (response.status === 400 && sized) {
      console.warn(`[ai] image cloudflare ${model} rejected dimensions, retrying square`);
      return callCloudflare(prompt, false);
    }
    return { tryNext: shouldTryNext(response.status) };
  }

  /*
   * Two response shapes, depending on the model.
   *
   * The newer image models answer JSON with base64 in `result.image`. The older
   * diffusion ones stream raw PNG bytes with an image content type. Both are
   * handled because the model name is configurable, so which one arrives is not
   * something this code gets to decide.
   */
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.startsWith("image/")) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) return { image: null };
    return { image: { bytes, mimeType: contentType.split(";")[0], model } };
  }

  const body = (await response.json()) as {
    success?: boolean;
    result?: { image?: string };
    errors?: { message?: string }[];
  };

  const encoded = body.result?.image;
  if (!encoded) {
    const why = body.errors?.map((error) => error.message).join("; ") || "no image in reply";
    console.warn(`[ai] image cloudflare ${model} returned no image: ${why.slice(0, 200)}`);
    return { image: null };
  }

  // These models return PNG or JPEG bytes; sniff rather than assume, because the
  // stored key's extension follows the real type.
  const bytes = Buffer.from(encoded, "base64");
  const mimeType =
    bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : "image/png";

  return { image: { bytes, mimeType, model } };
}

/* -------------------------------------------------------------------------- */
/* Gemini                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Preference order among Gemini image models, best first.
 *
 * Names are not pinned, for the reason described in `generate.ts`: Google retires
 * model names to new keys, and a pinned name is a thing that breaks quietly one
 * day. Instead the models endpoint is asked what exists and the first of these it
 * lists wins. Anything unrecognised but obviously an image model is used as a last
 * resort, so a future rename does not need a deploy.
 */
const PREFERRED_GEMINI = [
  "gemini-3.1-flash-image",
  "gemini-2.5-flash-image",
  "gemini-3-pro-image",
  "nano-banana-pro-preview",
  "gemini-3.1-flash-lite-image",
];

type Listed = { name: string; supportedGenerationMethods?: string[] };

/**
 * Resolved once per process rather than per call. Serverless makes that a
 * short-lived cache, which is the right length: long enough that a night's work
 * costs one lookup, short enough that a model appearing does not need a deploy.
 */
let resolved: { model: string | null; at: number } | null = null;
const RESOLVE_TTL_MS = 60 * 60 * 1000;

async function discoverGeminiModel(key: string): Promise<string | null> {
  const override = process.env.GEMINI_IMAGE_MODEL?.trim();
  if (override) return override;

  if (resolved && Date.now() - resolved.at < RESOLVE_TTL_MS) return resolved.model;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
      {
        headers: { "x-goog-api-key": key },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      console.warn(`[ai] model list ${response.status}`);
      return null;
    }

    const body = (await response.json()) as { models?: Listed[] };
    const names = (body.models ?? [])
      .filter((model) => model.supportedGenerationMethods?.includes("generateContent"))
      .map((model) => model.name.replace(/^models\//, ""));

    const pick =
      PREFERRED_GEMINI.find((candidate) => names.includes(candidate)) ??
      names.find((name) => /image/.test(name) && !/veo|tts|edit/.test(name)) ??
      null;

    if (!pick) console.warn("[ai] no image model available to this key");

    resolved = { model: pick, at: Date.now() };
    return pick;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[ai] model list failed: ${reason}`);
    return null;
  }
}

type Part = { inlineData?: { mimeType?: string; data?: string }; text?: string };

async function callGemini(
  prompt: string,
  key: string,
  model: string,
  aspectRatio: boolean,
  references: ReferenceImage[],
): Promise<Attempt & { retryFlat?: boolean }> {
  /*
   * References first, prompt last.
   *
   * The prompt names them by position ("Reference 1 is the location"), so they
   * have to precede it and stay in the order the caller built them in. Putting
   * the instruction after the images also reads better to the model: here are the
   * things, now here is what to do with them.
   */
  const requestParts: Part[] = [
    ...references.map((reference) => ({
      inlineData: {
        mimeType: reference.mimeType,
        data: Buffer.from(reference.bytes).toString("base64"),
      },
    })),
    { text: prompt },
  ];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: requestParts }],
        generationConfig: {
          // Without this the model replies with a description of the picture it
          // would have made, which is a very confusing thing to debug.
          responseModalities: ["IMAGE"],
          ...(aspectRatio ? { imageConfig: { aspectRatio: "16:9" } } : {}),
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    console.warn(`[ai] image gemini ${model} ${response.status}: ${detail.slice(0, 240)}`);
    // A 400 with the aspect ratio present is most likely the aspect ratio: not
    // every image model accepts imageConfig. Worth one plain retry before giving
    // up, since a wrongly shaped picture still beats no picture.
    if (response.status === 400 && aspectRatio) return { retryFlat: true };
    return { tryNext: shouldTryNext(response.status) };
  }

  const body = (await response.json()) as {
    candidates?: { finishReason?: string; content?: { parts?: Part[] } }[];
  };

  const candidate = body.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const inline = parts.find((part) => part.inlineData?.data)?.inlineData;

  if (!inline?.data) {
    // A refusal, a safety block, or a model that answered in prose. All three are
    // our problem rather than the key's, so do not burn the next one.
    const said = parts
      .map((part) => part.text ?? "")
      .join(" ")
      .trim();
    console.warn(
      `[ai] image gemini ${model} returned no image (${candidate?.finishReason ?? "no reason"})` +
        (said ? `: ${said.slice(0, 160)}` : ""),
    );
    return { image: null };
  }

  return {
    image: {
      bytes: Buffer.from(inline.data, "base64"),
      mimeType: inline.mimeType || "image/png",
      model,
    },
  };
}

async function geminiChain(
  prompt: string,
  references: ReferenceImage[],
): Promise<Attempt> {
  const keys = geminiImageKeys();
  if (keys.length === 0) return { tryNext: true };

  for (const [index, key] of keys.entries()) {
    const model = await discoverGeminiModel(key);
    if (!model) return { image: null };

    let result = await callGemini(prompt, key, model, true, references);
    if (result.retryFlat) {
      result = await callGemini(prompt, key, model, false, references);
    }

    if (result.image !== undefined) return { image: result.image };

    if (result.tryNext && index < keys.length - 1) {
      console.warn("[ai] image key exhausted, trying the next one");
      continue;
    }
    return { tryNext: Boolean(result.tryNext) };
  }

  return { tryNext: true };
}

/* -------------------------------------------------------------------------- */

/** Whether anything at all could make an image. Unconfigured is a normal state. */
export function imageGenerationConfigured(): boolean {
  return Boolean(
    (cloudflareAccount() && cloudflareToken()) || geminiImageKeys().length > 0,
  );
}

/**
 * Runs a prompt through the providers until one answers with bytes.
 *
 * A provider that cannot serve the request hands over to the next. A provider that
 * answers badly ends it, because a prompt that one model refused is not a prompt
 * the next one should be asked to spend an allowance on.
 *
 * **References are Gemini only, and that is measured rather than assumed.**
 * Cloudflare's FLUX.2 endpoints accept a multipart upload and return 200, then
 * ignore it: a reference of vivid green and magenta, 20 percent marker pixels,
 * produced outputs containing 0.00 percent of either, across flux-2-klein-4b and
 * flux-2-dev and three field names. So when a composition has references,
 * Cloudflare is skipped rather than asked to produce a picture that would quietly
 * ignore the map and the player models. With no references it is still the better
 * provider, because it is the one with a free allowance.
 */
export async function generateImage(
  prompt: string,
  references: ReferenceImage[] = [],
): Promise<GeneratedImage | null> {
  const providers: [string, () => Promise<Attempt>][] = [];

  if (references.length === 0) {
    providers.push(["cloudflare", () => callCloudflare(prompt, true)]);
  }
  providers.push(["gemini", () => geminiChain(prompt, references)]);

  for (const [index, [name, run]] of providers.entries()) {
    try {
      const result = await run();
      if (result.image !== undefined) return result.image;

      if (index < providers.length - 1) {
        console.warn(`[ai] image ${name} unavailable, falling through`);
        continue;
      }
      return null;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[ai] image ${name} threw: ${reason}`);
      if (index === providers.length - 1) return null;
    }
  }

  return null;
}
