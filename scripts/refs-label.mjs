/**
 * Labels the character reference poses by looking at them.
 *
 *   npm run refs:label
 *
 * Pose references arrive from a model viewer as `Screenshot 2026-07-30 011611.png`,
 * thirty at a time, which is what a batch export looks like and is not worth
 * renaming by hand. The team is knowable from the folder, but the pose is not
 * knowable from anything except the picture, so a vision model reads them.
 *
 * The answers are written to `assets/refs/poses.json` and that file is the record.
 * Only unlabelled files are sent, so this is cheap to re-run when more arrive and
 * costs nothing for the ones already known. Delete an entry to have it relabelled.
 *
 * Why bother: the pose is matched to the moment being illustrated. A capture run
 * wants a running figure, a defensive stand wants a crouch, a celebration wants
 * somebody upright. Handing the image model a T pose and asking for a sprint gets a
 * sprint with the stiff splayed posture of a rig reference.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const ROOT = "assets/refs";
const LABELS = join(ROOT, "poses.json");
const BATCH = 6;

/** The closed set. Anything else a model answers is coerced to "other". */
const POSES = [
  "stance",
  "aim",
  "walk",
  "run",
  "crouch",
  "death",
  "jump",
  "idle",
  "tpose",
  "other",
];
const FACINGS = ["front", "back", "side", "angle"];

const SYSTEM = `You are labelling reference renders of a video game character model so
they can be matched to the right kind of action shot.

You will be given several images, numbered from 1. For each one, say what the body
is doing and which way it faces.

Reply with JSON and nothing else:

{"labels": [{"n": 1, "pose": "run", "facing": "side"}, ...]}

pose must be exactly one of: ${POSES.join(", ")}
  stance  standing braced, weight settled, ready but not moving
  aim      pointing a weapon, arms extended forward
  walk     mid stride, upright, unhurried
  run      mid stride, leaning into it, clearly sprinting
  crouch   crouched, kneeling, or low to the ground
  death    limp, collapsing, falling, or lying down
  jump     airborne, both feet off the ground
  idle     standing straight with arms down, doing nothing
  tpose    arms held straight out sideways in a rig reference pose
  other    none of the above

facing must be exactly one of: ${FACINGS.join(", ")}
  front the chest and face are toward the camera
  back  the camera is behind them
  side  a profile view
  angle three quarter view, between front and side

Judge the body, not the colour. Do not describe the character, do not explain, and
do not skip an image. Return one entry per image, in order.`;

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (/\.(png|jpe?g)$/i.test(entry)) found.push(path);
  }
  return found;
}

const existing = existsSync(LABELS) ? JSON.parse(readFileSync(LABELS, "utf8")) : {};

const candidates = walk(ROOT)
  .filter((path) => /character/i.test(path))
  .map((path) => relative(ROOT, path).replace(/\\/g, "/"))
  .filter((key) => !existing[key])
  .sort();

if (candidates.length === 0) {
  console.log(`\nEverything under ${ROOT} is already labelled in ${LABELS}.\n`);
  process.exit(0);
}

console.log(`\n${candidates.length} unlabelled character references.\n`);

const keys = [];
const first = process.env.GEMINI_API_KEY?.trim();
if (first) keys.push(first);
for (let n = 2; n <= 10; n++) {
  const key = process.env[`GEMINI_API_KEY_${n}`]?.trim();
  if (key) keys.push(key);
}
if (keys.length === 0) {
  console.error("No Gemini keys configured.");
  process.exit(1);
}

const model = process.env.GEMINI_VISION_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function labelBatch(batch) {
  const parts = [
    { text: `Label these ${batch.length} images, numbered 1 to ${batch.length}.` },
    ...batch.map((key) => ({
      inlineData: {
        mimeType: key.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
        data: readFileSync(join(ROOT, key)).toString("base64"),
      },
    })),
  ];

  for (const apiKey of keys) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: "user", parts }],
          generationConfig: { temperature: 0, maxOutputTokens: 8000 },
        }),
        signal: AbortSignal.timeout(120_000),
      },
    );

    // Same fallthrough rule as the rest of the pipeline.
    if ([429, 401, 403].includes(response.status) || response.status >= 500) continue;

    const text = await response.text();
    if (!response.ok) {
      console.log(`  HTTP ${response.status}: ${text.slice(0, 160)}`);
      return null;
    }

    const body = JSON.parse(text);
    const answer = (body.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    const parsed = extractJson(answer);
    if (!parsed || !Array.isArray(parsed.labels)) {
      console.log(`  unusable answer: ${answer.slice(0, 160)}`);
      return null;
    }
    return parsed.labels;
  }

  console.log("  every key was rate limited");
  return null;
}

let labelled = 0;

for (let i = 0; i < candidates.length; i += BATCH) {
  const batch = candidates.slice(i, i + BATCH);
  const labels = await labelBatch(batch);
  if (!labels) {
    console.log(`  batch starting at ${i + 1} failed, leaving it unlabelled`);
    continue;
  }

  for (const entry of labels) {
    const index = Number(entry?.n) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= batch.length) continue;

    const pose = POSES.includes(String(entry.pose)) ? String(entry.pose) : "other";
    const facing = FACINGS.includes(String(entry.facing)) ? String(entry.facing) : "angle";

    existing[batch[index]] = { pose, facing };
    labelled++;
    console.log(`  ${batch[index].padEnd(52)} ${pose}/${facing}`);
  }

  // Written after every batch, so a rate limit halfway through does not lose the
  // work already paid for.
  writeFileSync(LABELS, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
}

console.log(`\n${labelled} labelled, written to ${LABELS}`);
console.log("Run `npm run refs:push -- --go` to upload with the new names.\n");
