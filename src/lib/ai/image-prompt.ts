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
  "flag-run": {
    action:
      "a single player mid stride carrying the enemy flag, head up, running it home",
    figures: 1,
    /*
     * Deliberately not a flag room. They are between the two of them, which is
     * where a carry actually happens, and putting a stand behind somebody holding
     * a flag invites the question of which flag it is.
     */
    area: "mid",
    /** The only moment where a flag in hand makes sense. */
    carriesFlag: true,
    /*
     * Full body, and it has to be: the stride and the flag streaming behind are
     * the whole picture. Cropping to the shoulders would lose both.
     */
    framing: "full",
  },
  "capture-cheer": {
    action:
      "a single player caught mid celebration just after scoring: running, one arm " +
      "raised, mouth open in a shout, weapon low in the other hand",
    figures: 1,
    area: "own-flagroom",
    carriesFlag: false,
    // The shot a sports desk actually runs after a goal: head and shoulders,
    // face doing the work, everything else gone.
    framing: "shoulders",
  },
  "point-out": {
    action:
      "one player squared up and pointing across at an opponent who is out of focus " +
      "behind them, the gesture of somebody saying be ready",
    figures: 2,
    area: "mid",
    carriesFlag: false,
    framing: "waist",
  },
  "two-talking": {
    action:
      "two team mates stood close together in conversation, heads down, one with a " +
      "hand on the other's shoulder, the flat body language of a side that just lost",
    figures: 2,
    area: "mid",
    carriesFlag: false,
    framing: "chest",
  },
  huddle: {
    action:
      "three team mates gathered in a tight group, helmets together, talking between " +
      "matches",
    figures: 3,
    area: "mid",
    carriesFlag: false,
    framing: "chest",
  },
  "face-off": {
    action:
      "two opposing players stood a few paces apart facing each other, neither " +
      "backing off, sizing one another up",
    figures: 2,
    area: "mid",
    carriesFlag: false,
    framing: "waist",
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
  /**
   * Whose flag is being carried, and only ever for `flag-run`.
   *
   * A capture returns the flag to its stand the instant it completes, so somebody
   * celebrating a score is not holding one, and between matches nobody is either.
   * An earlier version put the enemy flag in the hand of a player cheering in
   * their own flag room, which is a picture of something that cannot happen.
   * `buildComposition` ignores this unless the moment actually carries.
   */
  flagTeam: Team | null;
  /** A short phrase from the writing. The only place prose reaches the picture. */
  mood: string;
  /**
   * Rotates the choices that have no right answer, like the crop.
   *
   * Derived from the archive day, so the same night always produces the same
   * picture while consecutive nights differ. See `rotationFor`.
   */
  variation: number;
};

/**
 * How tightly the subject is cropped.
 *
 * Varying this is most of what stops a run of these looking like the same
 * photograph every week. A long lens on a sports desk is as often shoulders up on
 * a face as it is a full figure, and the tighter crops are where the character
 * models look best: less body to get wrong, more of the thing the picture is
 * about.
 */
/**
 * Which crops each moment can take, roughly widest first.
 *
 * A list rather than one value, because the same crop every week is its own kind
 * of monotony. `buildComposition` picks from it with the day's rotation, so a
 * night is reproducible but a run of them is not identical.
 *
 * The lists are per moment because not every crop suits every picture. A carry
 * has to be full length or the stride and the flag are gone; a reaction shot can
 * be tight on the face because the face is the point.
 */
export const FRAMING_CHOICES: Record<string, string[]> = {
  "flag-run": ["full", "waist"],
  "capture-cheer": ["shoulders", "chest", "waist"],
  "point-out": ["waist", "chest"],
  "two-talking": ["chest", "shoulders", "waist"],
  huddle: ["chest", "waist"],
  "face-off": ["waist", "full", "chest"],
};

const FRAMING: Record<string, string> = {
  full: "Framed head to toe, the whole figure in shot.",
  waist:
    "Framed from the waist up, closer than a full length shot and tighter on what " +
    "they are doing.",
  chest: "Framed from the chest up, close enough to read posture and expression.",
  shoulders:
    "Framed head and shoulders, a tight portrait crop filling the frame, the way a " +
    "sports desk runs a reaction shot.",
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
  /*
   * Named glass, because these models respond to it.
   *
   * "Shallow depth of field" is a hint and gets interpreted loosely. A focal
   * length and an aperture are a specification, and the training data behind them
   * is full of actual sports photography shot exactly that way. 400mm at f/2.8 is
   * what somebody covering a match from the sideline is holding, and it is the
   * combination that produces a background with no readable edges in it at all.
   *
   * That blur is doing real work beyond looking right. The location only has to
   * carry the correct palette and light, not the correct geometry, which is the
   * one thing the model reliably gets wrong. A wash of the right colours reads as
   * the right place; a sharp drawing of the wrong walls does not.
   */
  "Shot on a 400mm f/2.8 telephoto from the sideline at full aperture, the way a",
  "sports photographer covers a match. Strongly compressed perspective. The",
  "subject is sharp and fills much of the frame.",
  "The background is completely out of focus: a smooth continuous wash of colour",
  "and soft light with no readable edges, no legible shapes and nothing in it a",
  "viewer could identify. Round bokeh on any highlight. Focus falls off",
  "immediately behind the subject.",
  "Available light only, matching the light and colour of the location.",
  "Visible film grain and the slight imperfection of a real frame caught quickly.",
  "Wide landscape framing, filling a 16:9 frame.",
  /*
   * The fidelity half. Given a low polygon model from 2001 an image model will
   * helpfully render a modern high detail version, and the result stops looking
   * like this game and starts looking like a remake of it.
   */
  "Match the visual fidelity of the reference images exactly. This is an early",
  "2000s game engine: simple low polygon geometry with visible flat facets, low",
  "resolution textures, hard edges, and plain unfussy surfaces. Do not add detail,",
  "do not smooth the geometry, and do not make the armour more realistic or more",
  "modern than the references show.",
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
    // "Photograph taken in", not "compose from". Composition invites the model to
    // build a new scene that merely resembles the references. This asks it to
    // point a camera at a place that already exists.
    "A single photograph taken on location in the place shown below, with the",
    "figures described added to it.",
    "",
  ];

  references.forEach((reference, index) => {
    const n = index + 1;
    if (reference.role === "scene") {
      /*
       * Phrased as an edit of a photograph that already exists, not as a scene to
       * build from a description of one.
       *
       * This used to end "the camera may be somewhere else in the same room",
       * added so a flag room close-up could be reframed into an action shot. It
       * reads as permission to rebuild the space, and that is what came back: the
       * right materials and palette and the signature props, arranged into a
       * courtyard that was not the level. The model treats several references as
       * things to compose freely unless it is told one of them is the ground
       * truth, so this one is now described as a finished plate to add figures to.
       */
      lines.push(
        `Reference ${n} is the location, and it is there for its colours, materials`,
        "and light rather than its layout. Almost all of it will be far out of focus",
        "behind the subject, so it does not need to be reproduced: take the palette,",
        "the tone of the light, the sky if there is one, and the general character of",
        "the surfaces, and let them dissolve into the blur. Do not carefully rebuild",
        "its architecture, and do not replace it with somewhere that looks nothing",
        "like it.",
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
      lines.push(
        `Reference ${n} is the flag being carried. Use this exact object, held in`,
        "one hand and streaming behind them as they run.",
      );
    }
  });

  lines.push("");

  /*
   * How many people are in frame, which is the moment's business rather than the
   * squad's.
   *
   * This used to demand the full squad on both sides, back when the picture was a
   * wide action shot. A telephoto portrait of one player celebrating does not
   * claim to show everybody who played, any more than a photograph of a striker
   * claims the other ten were absent. What it must never do is show more people
   * than were actually there, so the moment's appetite is capped by the real
   * count.
   */
  const moment = MOMENTS[composition.moment];
  const carrying = moment.carriesFlag && composition.flagTeam !== null;
  const onSide = figures(
    composition.subject === "red" ? composition.redCount : composition.blueCount,
  );
  const other = figures(
    composition.subject === "red" ? composition.blueCount : composition.redCount,
  );

  const subjectCount = Math.max(1, Math.min(moment.figures, onSide || 1));
  const needsOpponent =
    composition.moment === "face-off" || composition.moment === "point-out";

  if (needsOpponent && other > 0) {
    lines.push(
      `In frame: one player in ${composition.subject} as the subject, and one in ` +
        `${composition.subject === "red" ? "blue" : "red"} behind them. Nobody else.`,
    );
  } else {
    lines.push(
      `In frame: ${subjectCount} ${plural(subjectCount)} in ${composition.subject}, ` +
        "and nobody else.",
    );
  }

  lines.push(`The moment: ${moment.action}.`);

  // Varied per night rather than fixed per moment, so a run of these does not
  // look like the same photograph with different players in it.
  const choices = FRAMING_CHOICES[composition.moment] ?? [moment.framing];
  const crop = choices[Math.abs(composition.variation) % choices.length];
  lines.push(FRAMING[crop] ?? FRAMING.full);

  if (carrying) {
    lines.push(
      "No flag stand is visible behind them: they are between the two bases, not",
      "at either one.",
    );
  } else {
    lines.push(
      "No flag anywhere in shot. A capture returns it to its stand the moment it",
      "completes, and between matches nobody is carrying one.",
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

  /*
   * Only the sides actually in frame.
   *
   * This used to attach both character models whenever both teams had played,
   * which is true of every match and beside the point: a solo celebration frames
   * one player. An unused reference is not free. The model has been handed a blue
   * soldier and told to use the references, so it puts a blue soldier in, and the
   * count line then contradicts the picture.
   */
  const opponentInFrame =
    composition.moment === "face-off" || composition.moment === "point-out";
  const subjectIsRed = composition.subject === "red";

  const redInFrame =
    (subjectIsRed || opponentInFrame) && figures(composition.redCount) > 0;
  const blueInFrame =
    (!subjectIsRed || opponentInFrame) && figures(composition.blueCount) > 0;

  if (available.redCharacter && redInFrame) {
    references.push({ role: "red-character", key: available.redCharacter });
  }
  if (available.blueCharacter && blueInFrame) {
    references.push({ role: "blue-character", key: available.blueCharacter });
  }
  if (MOMENTS[composition.moment].carriesFlag && composition.flagTeam && available.flag) {
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

/*
 * The visible caption under the illustration used to live here, as
 * `IMAGE_CAPTION = "AI interpretation"`. It was removed from the page at the
 * user's request, so the constant went with it rather than sitting unused and
 * looking like it was still doing something.
 *
 * What still labels the picture is in `column-image.tsx`: the alt text calls it
 * a generated illustration and the figure's title says it is not a photograph of
 * the match. The model that made it stays on the row in `image_model`.
 */
