/**
 * Checking a generated image before it is published.
 *
 * This is the gate that makes an unattended illustration safe to put on a front
 * page. An image model cannot be trusted to have obeyed "no lettering" or "no
 * recognisable faces" however plainly it was told, and nobody is reviewing these
 * before they go live. So the image goes back to a text model, which is reliable
 * at answering direct questions about what it can see, and a failure means the
 * column publishes with no picture at all.
 *
 * Three questions, and the first two are the reason this module exists rather
 * than being a nice-to-have:
 *
 *   - Legible text. Generated lettering is always subtly wrong, and a garbled word
 *     inside a picture on an archive whose whole value is that it can be trusted
 *     is worse than no picture. Carved ornament is exempt: these maps are Egyptian
 *     tombs and Mesoamerican temples whose walls are covered in glyphs, and
 *     rejecting those would mean Ankh could never be illustrated at all.
 *   - A photorealistic human face. The people in these matches are real and did not
 *     agree to be depicted. The game's own low polygon faces are fine and expected;
 *     what must not appear is anything that reads as a photograph of a person.
 *   - Whether it matches the brief at all, which catches the mangled ones.
 *
 * Costs one text request against a budget that has room. Never throws: an
 * unavailable check is treated as a failed check, because publishing an unchecked
 * synthetic photograph is the outcome this exists to prevent.
 */
import { geminiKeys } from "./generate";

/**
 * Generous, because the payload is the whole picture.
 *
 * A generated image is a couple of megabytes, which is a third larger again as
 * base64 in a JSON body. At 45 seconds four of five keys timed out on the first
 * real check and it only passed because the fifth answered, which is too close to
 * the gate failing closed on a perfectly good picture.
 */
const TIMEOUT_MS = 120_000;

/** Vision needs a multimodal model. The text default is one; allow an override. */
function visionModel(): string {
  return (
    process.env.GEMINI_VISION_MODEL?.trim() ||
    process.env.GEMINI_MODEL?.trim() ||
    "gemini-flash-latest"
  );
}

const SYSTEM = `You are checking a generated illustration before it is published beside a
written match report. Answer only about what is actually visible in the image.

Reply with JSON and nothing else, in exactly this form:

{"legibleText": true|false, "face": true|false, "matchesBrief": true|false, "problem": "<short reason or empty>"}

- legibleText: true if any modern lettering, words, digits, signage, logos,
  captions or watermarks are visible anywhere, even partially, even if they are
  nonsense. This is about anything that reads as writing put on top of the scene
  or claiming to inform the viewer.
  It is NOT true for decorative carving that belongs to the architecture:
  hieroglyphs, glyph friezes, engraved ornament, runes, patterned stonework. These
  maps are Egyptian tombs and Mesoamerican temples and their walls are covered in
  carved ornament. That is the building, not a caption.
- face: true only if a figure looks like a photograph of a REAL person: lifelike
  skin, real hair, photographic facial detail. The figures here are low polygon
  video game characters and their blocky faces are expected and fine, however
  clearly you can see them. This check exists so no real human is depicted, not
  to police the game's own models.
- matchesBrief: true if the image is broadly the scene described in the brief. A
  different composition is fine. Something incoherent, garbled, mangled, or of a
  completely different subject is not.
- problem: a few words naming the worst issue, or an empty string if there is none.

Do not use em dashes.`;

export type ImageVerdict = {
  ok: boolean;
  /** Why it was rejected, for the log. Empty when it passed. */
  problem: string;
};

type Part = { text?: string };

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function ask(
  key: string,
  bytes: Uint8Array,
  mimeType: string,
  brief: string,
): Promise<{ verdict?: ImageVerdict; tryNext?: boolean }> {
  const model = visionModel();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [
          {
            role: "user",
            parts: [
              { text: `The brief the image was made from:\n\n${brief}` },
              {
                inlineData: {
                  mimeType,
                  data: Buffer.from(bytes).toString("base64"),
                },
              },
            ],
          },
        ],
        // Low temperature: this is a judgement, not a piece of writing.
        generationConfig: { temperature: 0, maxOutputTokens: 4000 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    console.warn(`[ai] vision ${response.status}: ${detail.slice(0, 200)}`);
    const retryable =
      response.status === 429 ||
      response.status === 401 ||
      response.status === 403 ||
      response.status >= 500;
    return { tryNext: retryable };
  }

  const body = (await response.json()) as {
    candidates?: { finishReason?: string; content?: { parts?: Part[] } }[];
  };

  const candidate = body.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  const parsed = extractJson(text);
  if (!parsed) {
    // An unparseable answer is not a pass. Same reasoning as an unavailable
    // check: we do not know what is in the picture, so it does not go up.
    console.warn(
      `[ai] vision answer unusable (${candidate?.finishReason ?? "no reason"}): ${text.slice(0, 120)}`,
    );
    return { verdict: { ok: false, problem: "check returned nothing usable" } };
  }

  const problem = typeof parsed.problem === "string" ? parsed.problem.trim() : "";

  if (parsed.legibleText === true) {
    return { verdict: { ok: false, problem: problem || "legible text in the image" } };
  }
  if (parsed.face === true) {
    return {
      verdict: { ok: false, problem: problem || "a photorealistic human face" },
    };
  }
  if (parsed.matchesBrief === false) {
    return { verdict: { ok: false, problem: problem || "does not match the brief" } };
  }

  return { verdict: { ok: true, problem: "" } };
}

/**
 * Whether this image may be published. Fails closed.
 *
 * No keys, no answer, a timeout, a refusal: all of them are a rejection rather
 * than a pass, because the alternative is an unchecked synthetic photograph on
 * the front page.
 */
export async function checkImage(
  bytes: Uint8Array,
  mimeType: string,
  brief: string,
): Promise<ImageVerdict> {
  const keys = geminiKeys();
  if (keys.length === 0) {
    return { ok: false, problem: "no key available to check the image" };
  }

  for (const [index, key] of keys.entries()) {
    try {
      const result = await ask(key, bytes, mimeType, brief);
      if (result.verdict) return result.verdict;

      if (result.tryNext && index < keys.length - 1) continue;
      return { ok: false, problem: "the check could not be run" };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[ai] vision threw: ${reason}`);
      if (index === keys.length - 1) {
        return { ok: false, problem: "the check failed" };
      }
    }
  }

  return { ok: false, problem: "the check could not be run" };
}
