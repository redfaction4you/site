/**
 * Pushes the illustration reference images to R2 and writes the manifest.
 *
 *   npm run refs:push           what would happen, uploading nothing
 *   npm run refs:push -- --go   actually upload and write the manifest
 *
 * The images live in `assets/refs`, which is gitignored: they are binaries that
 * would bloat every clone forever, and the bucket is already where this project
 * serves images from. What gets committed is `src/lib/ai/image-refs.ts`, written
 * by this script, so the repo still records exactly what the reference set is
 * even though it does not carry the bytes.
 *
 * Names are normalised here rather than demanded of whoever captures the shots.
 * The files arrive as `Blue_holding_weapon_stance_Front.png` and
 * `01-blue_Flagroom.jpg` and `mid_ctfrelicseeker.jpg`, and that is a perfectly
 * reasonable way for a person to name things. Making a human match a scheme is a
 * worse use of effort than parsing a few spellings, and a rename step is one more
 * thing to get wrong every time a map is added.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const ROOT = "assets/refs";
const MANIFEST = "src/lib/ai/image-refs.ts";
const PREFIX = "refs/";
const live = process.argv.includes("--go");

/* --- reading what is there ------------------------------------------------ */

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (/\.(png|jpe?g|webp)$/i.test(entry)) found.push(path);
  }
  return found;
}

const lower = (text) => text.toLowerCase().replace(/\\/g, "/");

/** front, back, side, angle: the useful distinctions among the poses supplied. */
function facing(name) {
  if (/back|rear/.test(name)) return "back";
  if (/front|forward/.test(name)) return "front";
  if (/side/.test(name)) return "side";
  if (/angle/.test(name)) return "angle";
  return "alt";
}

/**
 * Which area of a map a screenshot shows.
 *
 * Not decoration. A capture is illustrated in the flag room of the team that
 * conceded it, so knowing which room is which is what lets the picture be about
 * the moment rather than about a random corridor. Blue and red are checked before
 * the generic areas because "blue_Flagroom" contains neither "mid" nor anything
 * else useful.
 */
function area(name) {
  // Checked first: an establishing shot of the whole level is the picture that
  // represents the map anywhere it is named, so it wins even if the filename
  // also mentions a flag room it happens to show.
  if (/overview|default|hero|establish|wide/.test(name)) return "overview";
  if (/blue.*flag/.test(name)) return "blue-flagroom";
  if (/red.*flag/.test(name)) return "red-flagroom";
  if (/flag/.test(name)) return "flagroom";
  if (/mid.*(alt|2)|alt.*mid/.test(name)) return "mid-alt";
  if (/mid|centre|center/.test(name)) return "mid";
  if (/corridor|hall|tunnel/.test(name)) return "corridor";
  if (/open|outside|outdoor/.test(name)) return "open";
  if (/base|spawn/.test(name)) return "base";

  /*
   * Unlabelled means establishing shot.
   *
   * These arrive straight out of the game as `20260711_201308_CTF-Ankhb12.jpg`,
   * which names the map and nothing else. In practice a screenshot somebody took
   * and filed under a map with no further description is the one they consider to
   * represent it, which is exactly what `overview` means here. Calling it "other"
   * would be equally a guess and would additionally be useless, since nothing
   * prefers "other" for anything.
   */
  return "overview";
}

const LABELS = join(ROOT, "poses.json");
const labels = existsSync(LABELS) ? JSON.parse(readFileSync(LABELS, "utf8")) : {};

const characters = [];
const flags = [];
const maps = new Map();
const skipped = [];

for (const path of walk(ROOT)) {
  const name = lower(path);
  const file = lower(path.split(/[\\/]/).pop());
  const extension = extname(path).toLowerCase() === ".png" ? "png" : "jpg";

  const mapMatch = name.match(/refs\/maps\/([^/]+)\//);
  if (mapMatch) {
    const slug = mapMatch[1];
    if (!maps.has(slug)) maps.set(slug, []);
    maps.get(slug).push({ path, area: area(file), extension });
    continue;
  }

  const team = /blue/.test(name) ? "blue" : /red/.test(name) ? "red" : null;
  if (!team) {
    skipped.push(path);
    continue;
  }

  if (/flag/.test(name)) {
    flags.push({ path, team, facing: facing(file), extension });
    continue;
  }

  if (/character|pose|stance/.test(name)) {
    /*
     * The pose comes from `poses.json` where it exists, and from the filename
     * otherwise.
     *
     * Most of these arrive from a model viewer as `Screenshot 2026-07-30
     * 011611.png`, which says nothing about what the body is doing. `npm run
     * refs:label` looks at them and writes the answer down, because that is
     * knowable from the picture and from nothing else. Without it every unnamed
     * file classifies identically, and identical classifications used to collide
     * on a single key and silently overwrite each other.
     */
    const relativeKey = relative(ROOT, path).replace(/\\/g, "/");
    const labelled = labels[relativeKey];

    const pose = labelled?.pose ?? (/t.?pose/.test(file) ? "tpose" : "stance");
    characters.push({
      path,
      team,
      pose,
      facing: labelled?.facing ?? facing(file),
      extension,
      labelled: Boolean(labelled),
    });
    continue;
  }

  skipped.push(path);
}

/* --- naming ---------------------------------------------------------------- */

/*
 * Everything is numbered within its group.
 *
 * Not cosmetic. Thirty batch-exported screenshots all classify as the same team,
 * pose and facing, and without a counter they all resolve to one key: twenty nine
 * uploads silently overwrite each other and the bucket ends up with one file where
 * the manifest claims thirty. Counting is what makes the key unique.
 */
function numberer() {
  const seen = new Map();
  return (group) => {
    const n = (seen.get(group) ?? 0) + 1;
    seen.set(group, n);
    return String(n).padStart(2, "0");
  };
}

const nextCharacter = numberer();
const nextFlag = numberer();

const keyForCharacter = (c, n) =>
  `${PREFIX}characters/${c.team}-${c.pose}-${c.facing}-${n}.${c.extension}`;
const keyForFlag = (f, n) => `${PREFIX}flags/${f.team}-${f.facing}-${n}.${f.extension}`;
const keyForMap = (slug, s, n) =>
  `${PREFIX}maps/${slug}/${s.area}-${String(n).padStart(2, "0")}.${s.extension}`;

const uploads = [];

// Sorted first so the numbering is stable across runs: the same file keeps the
// same key when a new one is added beside it.
for (const c of characters.sort((a, b) => a.path.localeCompare(b.path))) {
  c.key = keyForCharacter(c, nextCharacter(`${c.team}-${c.pose}-${c.facing}`));
  uploads.push({ path: c.path, key: c.key });
}
for (const f of flags.sort((a, b) => a.path.localeCompare(b.path))) {
  f.key = keyForFlag(f, nextFlag(`${f.team}-${f.facing}`));
  uploads.push({ path: f.path, key: f.key });
}

const mapEntries = [];
for (const [slug, shots] of [...maps.entries()].sort()) {
  const seen = new Map();
  const listed = [];
  for (const shot of shots.sort((a, b) => a.path.localeCompare(b.path))) {
    const n = (seen.get(shot.area) ?? 0) + 1;
    seen.set(shot.area, n);
    const key = keyForMap(slug, shot, n);
    uploads.push({ path: shot.path, key });
    listed.push({ key, area: shot.area });
  }
  mapEntries.push({ slug, shots: listed });
}

/* --- report ---------------------------------------------------------------- */

console.log(`\n${uploads.length} files under ${ROOT}\n`);

const unlabelled = characters.filter((c) => !c.labelled).length;
console.log(
  `characters: ${characters.length}` +
    (unlabelled ? `, ${unlabelled} with no pose label (run npm run refs:label)` : ""),
);
const byPose = new Map();
for (const c of characters) {
  const group = `${c.team} ${c.pose}`;
  byPose.set(group, (byPose.get(group) ?? 0) + 1);
}
for (const [group, count] of [...byPose.entries()].sort()) {
  console.log(`  ${group.padEnd(18)} ${count}`);
}

console.log(`\nflags: ${flags.length}`);
console.log("\nmaps:");
for (const { slug, shots } of mapEntries) {
  console.log(`  ${slug}: ${shots.map((s) => s.area).join(", ")}`);
}
if (skipped.length) {
  console.log("\nnot recognised, and therefore not uploaded:");
  for (const path of skipped) console.log(`  ${path}`);
}

/* --- warnings that matter -------------------------------------------------- */

const problems = [];
for (const team of ["red", "blue"]) {
  const usable = characters.filter(
    (c) => c.team === team && c.pose !== "tpose" && c.pose !== "other",
  );
  if (usable.length === 0) {
    problems.push(
      `${team} has no usable action poses, only T poses. A T pose is a rig reference ` +
        `and its splayed arms carry into the generated picture.`,
    );
  }
  if (!flags.some((f) => f.team === team)) problems.push(`${team} has no flag reference.`);
}
for (const { slug, shots } of mapEntries) {
  const areas = new Set(shots.map((s) => s.area));
  if (!areas.has("blue-flagroom") || !areas.has("red-flagroom")) {
    problems.push(`${slug} is missing a flag room shot for one side.`);
  }
}
if (problems.length) {
  console.log("\nworth fixing:");
  for (const problem of problems) console.log(`  - ${problem}`);
}

/* --- upload ---------------------------------------------------------------- */

if (!live) {
  console.log("\nNothing uploaded. Re-run with -- --go to push to R2.\n");
  process.exit(0);
}

const accountId = process.env.R2_ACCOUNT_ID;
const bucket = process.env.R2_BUCKET;
if (!accountId || !process.env.R2_ACCESS_KEY_ID || !bucket) {
  console.error("R2 is not configured. Need R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.");
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

let pushed = 0;
for (const { path, key } of uploads) {
  const body = readFileSync(path);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: key.endsWith(".png") ? "image/png" : "image/jpeg",
      CacheControl: "public, max-age=86400",
    }),
  );
  pushed++;
  process.stdout.write(`\r  uploaded ${pushed}/${uploads.length}`);
}
console.log(`\n\n${pushed} objects in ${bucket} under ${PREFIX}`);

/* --- manifest -------------------------------------------------------------- */

const fingerprint = createHash("sha256")
  .update(uploads.map((u) => u.key).sort().join("\n"))
  .digest("hex")
  .slice(0, 12);

const characterLines = characters
  .sort((a, b) => a.key.localeCompare(b.key))
  .map((c) => `  { team: "${c.team}", pose: "${c.pose}", facing: "${c.facing}", key: "${c.key}" },`)
  .join("\n");

const flagLines = flags
  .sort((a, b) => a.key.localeCompare(b.key))
  .map((f) => `  { team: "${f.team}", facing: "${f.facing}", key: "${f.key}" },`)
  .join("\n");

const mapLines = mapEntries
  .map(
    ({ slug, shots }) =>
      `  "${slug}": [\n` +
      shots.map((s) => `    { area: "${s.area}", key: "${s.key}" },`).join("\n") +
      `\n  ],`,
  )
  .join("\n");

writeFileSync(
  MANIFEST,
  `/**
 * What reference images exist in the bucket.
 *
 * GENERATED by \`npm run refs:push\`. Edit the files in \`assets/refs\` and run it
 * again rather than editing this by hand, or the manifest and the bucket drift
 * apart and the drift shows up as a missing picture weeks later.
 *
 * The images themselves are not in the repo; this is the record of what they are.
 * Set fingerprint ${fingerprint}.
 *
 * \`MAP_ALIASES\` is the one part worth editing by hand: it maps the map names the
 * server actually reports onto the folders here, so variants that share their
 * geometry share their screenshots.
 */

export type CharacterRef = {
  team: "red" | "blue";
  /**
   * What the body is doing, so the pose can be matched to the moment: a capture
   * run wants \`run\`, a defensive stand wants \`crouch\`, a celebration wants
   * somebody upright. Labelled by \`npm run refs:label\`, which looks at the
   * picture, because a batch export from a model viewer says nothing in its
   * filename.
   *
   * \`tpose\` is a rig reference rather than a person doing something, and its
   * splayed arms carry into whatever it conditions. Used only as a last resort.
   */
  pose:
    | "stance"
    | "aim"
    | "walk"
    | "run"
    | "crouch"
    | "death"
    | "jump"
    | "idle"
    | "tpose"
    | "other";
  facing: "front" | "back" | "side" | "angle" | "alt";
  key: string;
};

export type FlagRef = {
  team: "red" | "blue";
  facing: "front" | "back" | "side" | "angle" | "alt";
  key: string;
};

export type MapShot = { area: string; key: string };

export const CHARACTERS: CharacterRef[] = [
${characterLines}
];

export const FLAGS: FlagRef[] = [
${flagLines}
];

export const MAP_SHOTS: Record<string, MapShot[]> = {
${mapLines}
};

/**
 * Map names as the server reports them, mapped onto the folders above.
 *
 * Hand maintained. An unknown map is not an error: the illustration falls back to
 * having no scene reference, which is a worse picture rather than no picture.
 */
export const MAP_ALIASES: Record<string, string> = {
  "ankh b12": "ankh-b12",
  "huna b8": "huna-b8",
  "dark warlords": "dark-warlords",
  "relic seeker": "relic-seeker",
  "warlords pro (no amp)": "warlords-pro",
  "warlords pro (no fog)": "warlords-pro",
};

/** Looks up a map's screenshots by the name the server reported. */
export function shotsForMap(mapName: string): MapShot[] {
  const slug = MAP_ALIASES[mapName.trim().toLowerCase()];
  return slug ? (MAP_SHOTS[slug] ?? []) : [];
}
`,
  "utf8",
);

console.log(`manifest written to ${MANIFEST}\n`);
