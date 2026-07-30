/**
 * The illustration for one night's column: composed, made, checked, stored.
 *
 * The order is the design:
 *
 *   1. Pick the match and the moment from the record (`match-pick.ts`). No model.
 *   2. Pick the map screenshot that suits it (`image-prompt.ts`). No model.
 *   3. Ask a text model for one mood phrase (`image-brief.ts`). The only prose.
 *   4. Assemble the prompt from those pieces, by code (`image-prompt.ts`).
 *   5. Draw it from the references (`image.ts`).
 *   6. Check it before anything is stored (`vision.ts`). A failure means no picture.
 *
 * Almost everything is decided from the match record rather than imagined, which
 * is what makes the picture about the night that actually happened: the real map,
 * the real player models, the real number of figures a side, and a flag in shot
 * only when one was genuinely moving.
 */
import { canWriteToStorage, putPublicObject } from "@/lib/r2";
import { publicUrl } from "@/lib/storage";
import { buildMoodPhrase } from "./image-brief";
import { CHARACTERS, FLAGS, shotsForMap } from "./image-refs";
import {
  type Composition,
  type MomentKind,
  buildComposition,
  chooseShot,
  imageKeyFor,
} from "./image-prompt";
import { type ReferenceImage, generateImage, imageGenerationConfigured } from "./image";
import { type PickableMatch, pickMatch, pickMoment, rotationFor } from "./match-pick";
import type { NightFacts, WrittenColumn } from "./night-column";
import { checkImage } from "./vision";

/** What gets stored on the column row. */
export type ColumnImage = {
  imageKey: string;
  imagePrompt: string;
  imageModel: string;
};

/**
 * Smallest plausible photograph, in bytes. A provider answering with a few
 * hundred has returned a blank or a near-solid colour, and it is cheaper to
 * reject that here than to spend a vision request confirming it.
 */
const MIN_IMAGE_BYTES = 8_000;

/**
 * Which pose suits which moment, best first.
 *
 * The point of labelling the poses is being able to do this: a capture run wants a
 * sprinting figure, a defensive stand wants a crouch, a celebration wants somebody
 * upright. Handing over a static pose and asking for a sprint gets a sprint drawn
 * around a standing body.
 *
 * `death` appears only in the defensive picture, where somebody going down in a
 * firefight is the moment. It is deliberately never used for a celebration.
 */
const POSE_PREFERENCE: Record<MomentKind, string[]> = {
  // Mid stride with the flag: a running body and nothing else will do.
  "flag-run": ["run", "walk", "jump", "stance", "aim"],
  // Mid celebration, so a running body reads best; a jump works too.
  "capture-cheer": ["run", "jump", "walk", "stance", "aim"],
  // Squared up and gesturing: an upright, weight-settled pose.
  "point-out": ["stance", "aim", "idle", "walk", "crouch"],
  // Stood talking, so nothing mid stride.
  "two-talking": ["idle", "stance", "walk", "crouch", "aim"],
  huddle: ["idle", "stance", "crouch", "walk", "aim"],
  "face-off": ["stance", "aim", "idle", "walk", "run"],
};

/** Three quarter views show the most of a model; a back view the least. */
const FACING_RANK: Record<string, number> = {
  angle: 0,
  front: 1,
  side: 2,
  alt: 3,
  back: 4,
};

/**
 * Picks the character reference that best fits the moment.
 *
 * A T pose is only ever a last resort. It is a rig reference rather than a person
 * doing something, and its splayed arms and dead neutral posture carry into
 * whatever it conditions.
 */
function characterFor(
  team: "red" | "blue",
  moment: MomentKind,
  rotation: number,
): string | null {
  const mine = CHARACTERS.filter((character) => character.team === team);
  if (mine.length === 0) return null;

  const wanted = POSE_PREFERENCE[moment];

  for (const pose of wanted) {
    const matching = mine
      .filter((character) => character.pose === pose)
      .sort(
        (a, b) => (FACING_RANK[a.facing] ?? 9) - (FACING_RANK[b.facing] ?? 9),
      );
    // Rotate among the equally good ones so a map played weekly is not always the
    // identical figure, while staying reproducible from the day it illustrates.
    if (matching.length) return matching[rotation % matching.length].key;
  }

  // Nothing suitable: anything that is not a rig reference beats one that is.
  const usable = mine.filter((character) => character.pose !== "tpose");
  return (usable.length ? usable : mine)[rotation % (usable.length || mine.length)].key;
}

function flagFor(team: "red" | "blue"): string | null {
  const mine = FLAGS.filter((flag) => flag.team === team);
  if (mine.length === 0) return null;
  return (mine.find((flag) => flag.facing === "front") ?? mine[0]).key;
}

/**
 * Fetches a reference out of the bucket.
 *
 * Over the public URL rather than through the S3 client, because that is the same
 * path a reader's browser takes: if this fails, the image was not going to render
 * on the site either, and the failure is worth seeing here first.
 */
async function loadReference(key: string): Promise<ReferenceImage | null> {
  const url = publicUrl(key);
  if (!url) return null;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
    if (!response.ok) {
      console.warn(`[ai] reference ${key} came back ${response.status}`);
      return null;
    }

    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type")?.split(";")[0] || "image/png",
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[ai] reference ${key} failed: ${reason}`);
    return null;
  }
}

/**
 * Generates, checks and stores the picture for a night, or returns null.
 *
 * Null is the ordinary outcome and every caller treats it as one. Nothing here is
 * allowed to throw.
 */
export async function makeColumnImage(
  facts: NightFacts,
  column: WrittenColumn,
): Promise<ColumnImage | null> {
  /*
   * Said out loud, because this was the one path that returned null in silence.
   *
   * Diagnosing it from outside meant reading an `images: 0` with no log line
   * anywhere and inferring backwards. Every other exit here explains itself and
   * this one is the likeliest of the lot, since it is what an unconfigured
   * deployment does.
   */
  if (!imageGenerationConfigured()) {
    console.warn(
      "[ai] no image for the column: no image provider configured. " +
        "Set GEMINI_IMAGE_API_KEY, or CLOUDFLARE_AI_TOKEN for the no-reference path.",
    );
    return null;
  }

  // No point spending a generation on bytes with nowhere to live. Checked before
  // the model call because image capacity is the scarcest thing in this pipeline.
  if (!canWriteToStorage()) {
    console.warn("[ai] no image for the column: R2 is not configured for writing");
    return null;
  }

  const match = pickMatch(facts.matches);
  if (!match) {
    console.warn(
      `[ai] no image for ${facts.archiveDay}: none of its ${facts.matches.length} matches had a scoreboard to pick from`,
    );
    return null;
  }

  const shots = shotsForMap(match.mapName);
  if (shots.length === 0) {
    /*
     * No screenshots for this map, so there is nothing to set the scene in.
     *
     * Skipped rather than generated without one. An invented location would be
     * wrong: these maps are an Egyptian tomb, a Martian mining base and several
     * other things that share nothing, so a model with no reference has no way to
     * be right and every reason to be confidently wrong.
     */
    console.warn(
      `[ai] no map references for "${match.mapName}", skipping the illustration. ` +
        `Add screenshots and a MAP_ALIASES entry in image-refs.ts.`,
    );
    return null;
  }

  const picked = pickMoment(match);
  const rotation = rotationFor(facts.archiveDay);
  const shot = chooseShot(shots, picked.moment, picked.subject, rotation);

  const composition: Composition = {
    moment: picked.moment,
    subject: picked.subject,
    redCount: match.redPlayers,
    blueCount: match.bluePlayers,
    flagTeam: picked.flagTeam,
    mood: await buildMoodPhrase(column),
    variation: rotation,
  };

  const { prompt, references } = buildComposition(
    { mapName: match.mapName, shotKey: shot?.key ?? null, area: shot?.area ?? null },
    composition,
    {
      redCharacter: characterFor("red", picked.moment, rotation),
      blueCharacter: characterFor("blue", picked.moment, rotation),
      flag: picked.flagTeam ? flagFor(picked.flagTeam) : null,
    },
  );

  console.log(
    `[ai] illustration for ${facts.archiveDay}: ${match.mapName} ${picked.moment}, ` +
      `${match.redPlayers}v${match.bluePlayers}, ${references.length} references`,
  );

  const loaded: ReferenceImage[] = [];
  for (const reference of references) {
    const image = await loadReference(reference.key);
    // A missing reference changes what the numbered prompt refers to, so this is
    // all or nothing rather than a partial composition describing images that are
    // not there.
    if (!image) {
      console.warn(`[ai] illustration skipped: ${reference.key} could not be loaded`);
      return null;
    }
    loaded.push(image);
  }

  const image = await generateImage(prompt, loaded);
  if (!image) return null;

  if (image.bytes.byteLength < MIN_IMAGE_BYTES) {
    console.warn(
      `[ai] image for ${facts.archiveDay} rejected: only ${image.bytes.byteLength} bytes`,
    );
    return null;
  }

  /*
   * The gate. Fails closed: an unavailable check is a rejection, not a pass.
   *
   * Publishing an unchecked synthetic photograph on a page whose whole value is
   * that its information can be trusted is the outcome this module is shaped to
   * avoid, and a column with no picture costs nothing by comparison.
   */
  const verdict = await checkImage(image.bytes, image.mimeType, prompt);
  if (!verdict.ok) {
    console.warn(`[ai] image for ${facts.archiveDay} rejected: ${verdict.problem}`);
    return null;
  }

  const key = imageKeyFor(facts.archiveDay, image.mimeType);
  const stored = await putPublicObject(key, image.bytes, image.mimeType);
  if (!stored) return null;

  console.log(
    `[ai] image for ${facts.archiveDay}: ${image.bytes.byteLength} bytes from ${image.model}, checked and stored`,
  );

  return { imageKey: key, imagePrompt: prompt, imageModel: image.model };
}

/** Re-exported so `night-column.ts` can describe what it gathers. */
export type { PickableMatch };
