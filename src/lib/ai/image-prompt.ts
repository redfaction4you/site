/**
 * What the illustration should show, composed from validated pieces.
 *
 * The picture is built from reference images rather than imagined: the actual map
 * that was played, the actual player models, the right number of figures a side.
 * That is why almost nothing here is a description. The references carry the
 * appearance and this module only says what to do with them.
 *
 * The design rule, which is what keeps this from needing weekly tuning:
 *
 *   The final prompt is always assembled here, by code, out of facts from the
 *   match and tokens from a closed set. No model ever writes a sentence that
 *   reaches the image model.
 *
 * **The style block describes treatment only and never a setting.** It used to
 * open with "an industrial Mars mining colony", which was defensible when the
 * model was inventing a location from nothing, and is wrong now for two reasons.
 * The map screenshot is the location, so any setting described here is a second
 * opinion fighting the reference. And it was not even true: Ankh is an Egyptian
 * tomb, Huna and Relic Seeker are their own thing, and only the Warlords maps are
 * Martian at all. Anything about rock, architecture or materials belongs in the
 * screenshot, not in a sentence.
 *
 * Deliberately free of imports so `node --test` can load it directly.
 */

/**
 * What the picture is of, as a closed set.
 *
 * Each is a moment a match actually produces, and each implies where it happens,
 * which is what connects it to the map screenshots.
 */
export const MOMENTS = {
  "capture-run": {
    action:
      "a figure sprinting while carrying the enemy flag, others in pursuit behind them",
    /** A capture is scored at the capturing team's own stand. */
    area: "own-flagroom",
  },
  defence: {
    action:
      "a firefight around the flag stand, one side pushing in and the other holding",
    area: "own-flagroom",
  },
  celebration: {
    action: "the winning side gathered together after the final whistle",
    area: "mid",
  },
  readying: {
    action: "both sides spread out and moving into position before the first shot",
    area: "mid",
  },
} as const;

export type MomentKind = keyof typeof MOMENTS;

export type Team = "red" | "blue";

/** Where it happens, and the reference that shows it. */
export type Scene = {
  mapName: string;
  /** R2 key of the map screenshot, or null when the map has no references. */
  shotKey: string | null;
  area: string | null;
};

/** What happens, and who is in it. All of it from the match record. */
export type Composition = {
  moment: MomentKind;
  /** The side the moment belongs to: who is celebrating, carrying, defending. */
  subject: Team;
  redCount: number;
  blueCount: number;
  /** Whose flag is visible, if any. Null means no flag in shot. */
  flagTeam: Team | null;
  /** A short phrase from the writing. The only place prose reaches the picture. */
  mood: string;
};

/** Longest mood phrase that reaches the image model. */
export const MAX_MOOD_LENGTH = 90;

/** How many figures a side may be asked for, whatever the scoreboard says. */
export const MAX_FIGURES_PER_TEAM = 6;

/**
 * The frozen half: how the photograph is taken, never what is in front of it.
 *
 * A consistent treatment is what makes a run of these read as one publication
 * rather than a different stock library every evening.
 *
 * Phrased as what is present, never as what is forbidden. An earlier version
 * ended with "absolutely no text, lettering, numbers, logos, signage or
 * watermarks" and the first image it produced had an illuminated sign reading 22
 * hanging in the frame. Diffusion models condition on the tokens they are given
 * and handle negation poorly, so listing things to avoid is a reliable way to
 * summon them. The prohibitions live in `vision.ts`, where a text model can be
 * trusted to apply them.
 */
const TREATMENT = [
  // The photographic half. Grain and available light are what stop this looking
  // like a promotional render and make it read as a moment somebody caught.
  "Photojournalistic press photograph, as a sports desk would file it from the",
  "sideline. Available light only, matching the light already in the location.",
  "Visible film grain, shallow depth of field, slight motion blur on whatever is",
  "moving, a shutter caught mid action rather than a posed shot.",
  "Plain unmarked surfaces on equipment and armour.",
  "Wide landscape framing, filling a 16:9 frame.",
  /*
   * The fidelity half, which matters as much and is easy to leave out.
   *
   * Given a low polygon model from 2001 an image model will helpfully render a
   * modern high detail version of it, and the result stops looking like this game
   * and starts looking like a remake of it. The references already carry the right
   * level of detail, so the instruction is to match them rather than improve on
   * them. It reads oddly as a request. It is the difference between a picture of
   * Red Faction and a picture of something else.
   */
  "Match the visual fidelity of the reference images exactly. This is an early",
  "2000s game engine: simple low polygon geometry with visible flat facets, low",
  "resolution textures, hard edges, and plain unfussy surfaces. Do not add detail,",
  "do not smooth the geometry, and do not make the armour or the architecture more",
  "realistic or more modern than the references show.",
  "A photograph taken of that game, not a reimagining of it.",
].join(" ");

/** A reference image and the job it does in the composition. */
export type Reference = {
  role: "scene" | "red-character" | "blue-character" | "flag";
  key: string;
};

/**
 * Clamps a scoreboard count to something drawable.
 *
 * A match with one player a side is real and a picture of one figure is fine. A
 * malformed row claiming forty is not, and asking for forty figures produces a
 * crowd that looks nothing like a 3v3.
 */
function figures(count: number): number {
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.min(Math.round(count), MAX_FIGURES_PER_TEAM);
}

function plural(count: number): string {
  return count === 1 ? "figure" : "figures";
}

/**
 * The prompt, and the only thing stored to explain a picture after the fact.
 *
 * References are named by their position, so the order here must match the order
 * the bytes are attached. `buildComposition` returns both together for that
 * reason: they cannot be built separately and drift.
 */
function promptFor(
  scene: Scene,
  composition: Composition,
  references: Reference[],
): string {
  const lines: string[] = [
    "Compose a single photograph from the supplied reference images.",
    "",
  ];

  references.forEach((reference, index) => {
    const n = index + 1;
    if (reference.role === "scene") {
      lines.push(
        `Reference ${n} is the location. Use this environment exactly: its`,
        "architecture, materials, colours and lighting. Do not relocate the scene",
        "anywhere else and do not redecorate it. The camera may be somewhere else in",
        "the same room.",
      );
    } else if (reference.role === "red-character") {
      lines.push(
        `Reference ${n} is the character model for the red team. Every red figure`,
        "must be this exact model: same armour, same helmet and visor, same red",
        "colouring. Do not invent a different soldier.",
        // The renders come out of a model viewer with the weapon attachment
        // stripped, so the hands are empty and the fingers are still curled round
        // a grip. Left unsaid, that produces a firefight full of people miming.
        "The reference was captured without its weapon, so the hands look empty:",
        "give each figure a weapon to hold, matching the worn industrial look of",
        "the armour, held the way the hands are already shaped.",
      );
    } else if (reference.role === "blue-character") {
      lines.push(
        `Reference ${n} is the character model for the blue team. Every blue figure`,
        "must be this exact model, in blue, armed the same way.",
      );
    } else {
      lines.push(`Reference ${n} is the flag. Use this exact object.`);
    }
  });

  lines.push("");

  const red = figures(composition.redCount);
  const blue = figures(composition.blueCount);
  lines.push(
    `Show exactly ${red} ${plural(red)} in red and ${blue} ${plural(blue)} in blue, and nobody else.`,
  );

  lines.push(`The moment: ${MOMENTS[composition.moment].action}.`);

  if (composition.flagTeam) {
    const carrier = composition.subject;
    lines.push(
      `The ${composition.flagTeam} flag is in shot, carried by a figure in ${carrier}.`,
    );
  }

  const mood = composition.mood.trim().slice(0, MAX_MOOD_LENGTH).trim();
  if (mood) lines.push(`The feeling to aim for: ${mood}.`);

  lines.push("", TREATMENT);

  return lines.join("\n");
}

/**
 * Picks the map screenshot that suits the moment.
 *
 * A capture is scored at the capturing side's own stand, so the picture belongs in
 * that room rather than in whichever corridor happened to be photographed first.
 * Falls back through the areas that exist rather than insisting: a map with only a
 * mid shot still gets a picture.
 */
export function chooseShot(
  shots: { area: string; key: string }[],
  moment: MomentKind,
  subject: Team,
  rotation: number,
): { area: string; key: string } | null {
  if (shots.length === 0) return null;

  const wanted = MOMENTS[moment].area;
  const preference =
    wanted === "own-flagroom"
      ? [`${subject}-flagroom`, "flagroom", "mid", "mid-alt"]
      : ["mid", "mid-alt", `${subject}-flagroom`, "flagroom"];

  for (const area of preference) {
    const matching = shots.filter((shot) => shot.area === area);
    // Rotate among equally good shots so a map played weekly is not always the
    // same photograph, while staying reproducible from the day it illustrates.
    if (matching.length) return matching[rotation % matching.length];
  }

  return shots[rotation % shots.length];
}

/**
 * Everything the image call needs: the references in order, and the prompt that
 * refers to them by that order.
 */
export function buildComposition(
  scene: Scene,
  composition: Composition,
  available: {
    redCharacter: string | null;
    blueCharacter: string | null;
    flag: string | null;
  },
): { prompt: string; references: Reference[] } {
  const references: Reference[] = [];

  if (scene.shotKey) references.push({ role: "scene", key: scene.shotKey });
  if (available.redCharacter && figures(composition.redCount) > 0) {
    references.push({ role: "red-character", key: available.redCharacter });
  }
  if (available.blueCharacter && figures(composition.blueCount) > 0) {
    references.push({ role: "blue-character", key: available.blueCharacter });
  }
  if (composition.flagTeam && available.flag) {
    references.push({ role: "flag", key: available.flag });
  }

  return { prompt: promptFor(scene, composition, references), references };
}

/**
 * Coerces whatever a model answered into a usable composition.
 *
 * Never fails. Only the moment and the mood are ever a model's to choose; the
 * counts and the flag come from the match record and are passed through
 * untouched. An invented moment falls back rather than reaching the image model.
 */
export function validateMoment(answer: unknown, fallback: MomentKind): MomentKind {
  const raw = (answer ?? {}) as Record<string, unknown>;
  const moment = typeof raw.moment === "string" ? raw.moment.trim().toLowerCase() : "";
  return moment in MOMENTS ? (moment as MomentKind) : fallback;
}

/** Strips a mood phrase down to something that cannot steer the composition. */
export function cleanMood(value: unknown): string {
  if (typeof value !== "string") return "";
  // Newlines would let a long answer smuggle instructions past the length cap.
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_MOOD_LENGTH);
}

/**
 * Where the picture lives.
 *
 * One object per night, keyed by the day, so the key is derivable and a night can
 * never accumulate a pile of orphaned images. The extension follows what the
 * provider actually returned rather than what we hoped for: a PNG served as `.jpg`
 * works, until something downstream trusts the extension over the content type.
 */
export function imageKeyFor(archiveDay: string, mimeType: string): string {
  const extension =
    mimeType === "image/jpeg"
      ? "jpg"
      : mimeType === "image/webp"
        ? "webp"
        : mimeType === "image/png"
          ? "png"
          : "bin";

  return `news/${archiveDay}.${extension}`;
}

/** What the caption has to say, in one place so it cannot be phrased two ways. */
export const IMAGE_CAPTION = "Illustration, generated";
