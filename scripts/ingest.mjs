/**
 * Puts files from a local disk into the downloads catalogue.
 *
 *   npm run ingest -- "D:\rf\ctf-ankh"                    dry run, writes nothing
 *   npm run ingest -- "D:\rf\maps" --go                   do it
 *   npm run ingest -- "D:\rf\maps" --go --publish         and make them visible
 *   npm run ingest -- ./red --kind=tool --author="Volition"
 *
 * THIS IS THE BULK PATH, and since 3 September 2026 it is no longer the only
 * one: `/admin` has a browser form, `src/components/upload-admin.tsx`, and it
 * writes through `src/lib/ingest.ts`, which is this file's twin. Where the two
 * disagree the archive gets two shapes of row, so every derived rule they share
 * lives in `src/lib/ingest-rules.ts` and `src/lib/downloads.ts` rather than
 * being restated in either. The statement lists here and there are written
 * twice, and a field added to one upsert belongs in the other the same day.
 *
 * They are for different jobs. This one seeds hundreds of files recovered from
 * dead forums off a local disk, in one pass, with a dry run to read first. The
 * form is for one item at a time, put there by the person who made it, without
 * a terminal. It also has a ceiling this does not: the browser talks straight to
 * R2 where a CORS policy on the bucket allows it, and falls back to posting
 * through a serverless function, which Vercel caps at 4.5 MB. This runs from a
 * terminal and is capped by nothing, so it stays the answer for a 379 MB pack
 * while that policy is unset. The admin screens manage what either creates.
 *
 * WHAT --go COSTS, because both halves of it are the live site's.
 *
 * There is one Neon database and it is production's, so a row written here is
 * on redfaction4you.com the moment it lands. The R2 bucket is public with a
 * custom domain attached, so an object written here is world readable at
 * files.redfaction4you.com within seconds, and it stays readable if the item is
 * hidden later: hiding governs the page, never the bytes. Nothing may be fed to
 * this that is not safe to publish.
 *
 * Which is why items are created as DRAFTS unless --publish is given. A draft
 * is absent from every listing and 404s on its own detail route, which is the
 * state a bulk import somebody still has to read through should be in.
 *
 * THE FOLDER IS THE ITEM. Given a directory, everything directly inside it is
 * one entry: exactly one downloadable file, any number of images as screenshots
 * in filename order, and an optional item.json. Given a directory whose
 * immediate children are all directories, each child is one item, one level of
 * nesting only, which is the same rule the zip reader uses and for the same
 * reason: a folder of folders is a normal way to keep an archive, a folder of
 * folders of folders is somebody's whole disk. Given a plain file, that file is
 * the item.
 *
 * WHAT A RE-INGEST CHANGES, AND WHAT IT LEAVES ALONE. Running this again over
 * the same folder must update rather than duplicate, which it does by upserting
 * on (kind, slug) and by deriving every storage key from that pair, so a
 * corrected file overwrites its own object instead of orphaning it.
 *
 * The bytes decide the derived things, so files, screenshots and map_meta are
 * replaced outright on every run. Everything editorial is filled in only where
 * the row does not already have it: a description typed into /admin, a title
 * corrected by hand, an author fixed after the fact all survive a re-run,
 * because a bulk pass over three hundred folders must not be able to quietly
 * undo an evening of somebody's editing. An item.json value still wins, since
 * that is a person saying what the entry is. To change something already
 * recorded, edit it in /admin or say so in the sidecar.
 *
 * Nothing here deletes an R2 object. Removing a screenshot from a folder
 * removes its row and leaves the file in the bucket, still reachable by anybody
 * holding the URL. Genuinely withdrawing something means deleting the object.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

import { flag, option } from "./cli-flags.mjs";

import { ITEM_KINDS, SECTION_BY_KIND, categoryFromLevels } from "../src/lib/downloads.ts";
import {
  chooseDownload,
  contentTypeFor,
  isNoiseName,
  normaliseReleasedOn,
  screenshotKeyFor,
  slugFromName,
  storageKeyFor,
  titleFromName,
  validateSidecar,
} from "../src/lib/ingest-rules.ts";
import {
  inspectUpload,
  looksLikeRfl,
  looksLikeVpp,
  looksLikeZip,
} from "../src/lib/rfl/index.ts";

// Quietly, because the output of this script is a report somebody has to read.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

/*
 * storage.ts reads NEXT_PUBLIC_R2_PUBLIC_BASE once, when the module is
 * evaluated. Static imports run before any statement in this file, dotenv
 * included, so importing it at the top would read the variable before it was
 * there and publicUrl would answer null for a bucket that is configured
 * perfectly well. Everything else imported above reads no environment.
 */
const { formatBytes, publicUrl } = await import("../src/lib/storage.ts");

/* --- what was asked for --------------------------------------------------- */

/*
 * Options come from the command line AND from npm's own environment, because
 * on Windows the command line does not survive the trip.
 *
 * PowerShell's npm shim hands the whole line to npm's parser, which treats
 * `--go` and `--kind=map` as configuration it does not recognise, keeps them,
 * and forwards only the positional arguments. `npm run ingest -- maps --go`
 * arrives here as `["maps"]`, so the run that was meant to write would quietly
 * be a dry run and say so while the operator read past it. Under bash the same
 * command arrives intact. This project has been bitten by this before: for
 * weeks `vet:pages` documented `-- --base <url>`, npm ate it, and the script
 * reported a clean bill of health for production having read localhost.
 *
 * What npm swallows it publishes as `npm_config_<name>`, so that is read too,
 * and only when this process really is `npm run ingest`, so a stray variable in
 * somebody's shell cannot be what turns writing on. The resolved options are
 * printed back in the banner, which is the check that a flag was understood.
 *
 * `--kind map` with a space cannot be rescued either way: npm records the flag
 * as `true` and passes `map` on as though it were a path, and nothing can tell
 * that from a folder called map. That spelling is refused by name.
 */
/*
 * Read through `cli-flags.mjs` rather than inline, which this did at first.
 * The rescue was identical and correct, and that was the problem: the guard in
 * `cli-flags.test.mjs` only sees scripts that use the shared helper, so the one
 * script written because of this bug was the one script the check could not
 * cover. A fix its own check cannot see is half a fix.
 */
const argv = process.argv.slice(2);
const targets = [];
const badOptions = [];

let live = flag("go");
let publish = flag("publish");
let defaultKind = option("kind", "map");
let defaultAuthor = option("author", null);

for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];

  if (arg === "--go") {
    live = true;
    continue;
  }
  if (arg === "--publish") {
    publish = true;
    continue;
  }

  const equals = arg.indexOf("=");
  const name = arg.startsWith("--")
    ? equals > 0
      ? arg.slice(2, equals)
      : arg.slice(2)
    : null;

  if (name === "kind" || name === "author") {
    const value = equals > 0 ? arg.slice(equals + 1) : argv[(index += 1)];
    if (value === undefined || value === "") {
      badOptions.push(`--${name} needs a value`);
      continue;
    }
    if (name === "kind") defaultKind = value;
    else defaultAuthor = value;
    continue;
  }

  if (name !== null) {
    badOptions.push(`unknown option --${name}`);
    continue;
  }

  targets.push(arg);
}

// npm's record of a flag it saw no value for. The value is in `targets` by now,
// looking exactly like a path, so say which flag and stop.
for (const [name, value] of [
  ["kind", defaultKind],
  ["author", defaultAuthor],
]) {
  if (value === "true") {
    badOptions.push(
      `--${name} needs its value attached as --${name}=<value>. Written with a space, ` +
        `npm keeps the flag and passes the value on as though it were a path.`,
    );
  }
}

defaultKind = String(defaultKind).trim().toLowerCase();
defaultAuthor = defaultAuthor === null ? null : String(defaultAuthor).trim() || null;

function usage() {
  console.error(`
Usage: npm run ingest -- <path>... [--go] [--publish] [--kind=<kind>] [--author=<name>]

  <path>       a folder that is one item, a folder of such folders, or a file
  --go         actually upload and write. Without it nothing is touched.
  --publish    publish rather than leaving drafts
  --kind=      ${ITEM_KINDS.join(" | ")}   (default map)
  --author=    author to record where no item.json says otherwise

  Attach every value with an equals sign. npm drops a flag written with a
  space and hands its value on as though it were one of the paths.
`);
}

if (badOptions.length) {
  for (const problem of badOptions) console.error(problem);
  usage();
  process.exit(1);
}

if (targets.length === 0) {
  usage();
  process.exit(1);
}

if (!ITEM_KINDS.includes(defaultKind)) {
  console.error(`--kind must be one of: ${ITEM_KINDS.join(", ")}. Got "${defaultKind}".`);
  process.exit(1);
}

/* --- what is configured --------------------------------------------------- */

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Checked .env.local, then .env.");
  process.exit(1);
}
const sql = neon(databaseUrl);

const bucket = process.env.R2_BUCKET;
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const storageReady = Boolean(accountId && accessKeyId && secretAccessKey && bucket);

/*
 * Unconfigured storage is checked here as well as per item, and stops the run
 * rather than refusing three hundred folders one at a time for the same reason.
 * The per-item guard below stays, because a function that writes to a bucket
 * should not be depending on its caller having checked.
 */
if (live && !storageReady) {
  console.error(
    "\nR2 is not configured, so there is nowhere to put the files and nothing was read.\n" +
      "Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET in .env.local.\n",
  );
  process.exit(1);
}

const s3 = storageReady
  ? new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    })
  : null;

/* --- the banner ----------------------------------------------------------- */

console.log("");
// Printed back rather than assumed, because a flag npm ate is invisible
// otherwise and the one that matters most is --go.
console.log(
  `options: kind=${defaultKind}  author=${defaultAuthor ?? "(none)"}  ` +
    `go=${live ? "yes" : "no"}  publish=${publish ? "yes" : "no"}`,
);
console.log("");
if (live) {
  console.log(`LIVE. Writing to ${new URL(databaseUrl).host} and to the ${bucket} bucket.`);
  console.log("Both are production's. Rows land on redfaction4you.com as they are written,");
  console.log("and objects are world readable at the bucket's public domain within seconds.");
  console.log(
    publish
      ? "--publish: these go straight onto the shelves, visible to everybody."
      : "Items are created as drafts, invisible on the site until somebody publishes them.",
  );
} else {
  console.log("Dry run. Nothing is uploaded and no row is changed.");
  console.log("This reads the files and the catalogue to say what --go would do.");
  console.log("--go writes to the production database and to a public bucket.");
}
if (!publicUrl("catalogue/probe")) {
  console.log(
    "NEXT_PUBLIC_R2_PUBLIC_BASE is unset, so the site will report downloads as unavailable",
  );
  console.log("however well the upload goes. That is a separate variable from the four above.");
}
console.log("");

/* --- finding the items ---------------------------------------------------- */

/**
 * Immediate children of a directory, split into files and directories.
 *
 * Symlinks are read as whatever they point at, which is what somebody
 * reorganising an archive with junctions would expect.
 */
function childrenOf(directory) {
  const files = [];
  const directories = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    let info;
    try {
      info = statSync(path);
    } catch {
      continue;
    }
    if (info.isDirectory()) directories.push(path);
    else if (info.isFile()) files.push(path);
  }
  return { files, directories };
}

function itemFromDirectory(directory) {
  const { files } = childrenOf(directory);
  const sidecar = join(directory, "item.json");
  return {
    label: basename(directory),
    source: directory,
    files,
    sidecarPath: existsSync(sidecar) ? sidecar : null,
  };
}

/** Everything named on the command line, expanded into items. */
function collectItems() {
  const items = [];
  const seenSources = new Set();

  for (const target of targets) {
    const path = resolve(target);

    let info;
    try {
      info = statSync(path);
    } catch (error) {
      // The name, not the path: a full Windows path in the first column pads
      // every other row out to its width and the whole table stops being
      // readable. The reason names the path in full.
      items.push({ label: basename(path) || target, source: path, unreadable: describe(error) });
      continue;
    }

    if (info.isFile()) {
      items.push({ label: basename(path), source: path, files: [path], sidecarPath: null });
      continue;
    }

    if (!info.isDirectory()) {
      items.push({
        label: basename(path) || target,
        source: path,
        unreadable: `${path} is not a file or a directory`,
      });
      continue;
    }

    const { files, directories } = childrenOf(path);

    /*
     * A folder of folders is a batch, and one whose children are all folders is
     * the only shape that can be read as one without ambiguity. Add a loose
     * file beside them and the question becomes whether that file is the item's
     * download or a stray, which is exactly the kind of guess chooseDownload
     * refuses to make, so the whole folder is treated as one item and the
     * subdirectories are left alone.
     *
     * Packaging does not count towards that, though. A folder of two hundred map
     * folders that Windows has left a Thumbs.db in is still a folder of two
     * hundred map folders, and reading it as a single item would refuse the one
     * thing it is and skip every entry inside it without a word.
     */
    const loose = files.filter((path) => !isNoiseName(path));
    const batch = directories.length > 0 && loose.length === 0;
    for (const child of batch ? directories : [path]) {
      items.push(itemFromDirectory(child));
    }
  }

  return items.filter((item) => {
    if (seenSources.has(item.source)) return false;
    seenSources.add(item.source);
    return true;
  });
}

/* --- small helpers -------------------------------------------------------- */

function describe(error) {
  return error instanceof Error ? error.message : String(error);
}

function trimmedOrNull(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

/**
 * A text[] literal, written out rather than handed to the driver as an array.
 *
 * Tag lists are short and this is the one column on the write path that is not
 * text, a number or jsonb. Building the literal and casting it says exactly
 * what reaches Postgres, instead of depending on how a given driver version
 * chooses to serialise a JavaScript array.
 */
function pgTextArray(values) {
  const escaped = values.map(
    (value) => `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
  );
  return `{${escaped.join(",")}}`;
}

/**
 * Uploads one object. Returns null when R2 took it, and the reason when it did
 * not, so the caller can name it in a refusal.
 *
 * The prefix check is the same reasoning r2.ts uses to refuse `backups/`: this
 * script's business is the catalogue and nothing else, and the encrypted
 * database backups live in the same bucket.
 */
async function put(key, body, contentType) {
  if (!key.startsWith("catalogue/")) return `${key} is not under catalogue/`;
  if (!s3 || !bucket) return "R2 is not configured";
  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=86400",
      }),
    );
    return null;
  } catch (error) {
    return describe(error);
  }
}

/* --- one item ------------------------------------------------------------- */

/** Slugs claimed during this run, so two folders cannot land on one address. */
const claimed = new Map();

function refused(item, reason) {
  return { label: item.label, refusal: reason };
}

async function ingest(item) {
  if (item.unreadable) return refused(item, item.unreadable);

  const names = item.files.map((path) => basename(path));
  const pathOf = new Map(names.map((name, index) => [name, item.files[index]]));

  /* the sidecar, if there is one */

  let sidecar = {};
  if (item.sidecarPath) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(item.sidecarPath, "utf8"));
    } catch (error) {
      return refused(item, `item.json will not parse: ${describe(error)}`);
    }
    const problems = validateSidecar(parsed);
    if (problems.length) return refused(item, `item.json: ${problems.join("; ")}`);
    sidecar = parsed;
  }

  /* which file is the download */

  const chosen = chooseDownload(names);
  if (chosen.problem) return refused(item, chosen.problem);

  /* where it goes */

  const kind = trimmedOrNull(sidecar.kind)?.toLowerCase() ?? defaultKind;
  if (!ITEM_KINDS.includes(kind)) {
    return refused(item, `item.json kind "${kind}" is not one of ${ITEM_KINDS.join(", ")}`);
  }
  const section = SECTION_BY_KIND[kind];

  /*
   * A sidecar slug goes through the same normaliser as a filename, with a
   * sentinel extension on the end so that baseName has something to strip other
   * than a dot the person meant to keep: without it a slug written as "2.0
   * final" would be read as the file "2" with the extension ".0 final" and the
   * item would live at /maps/2 forever.
   */
  const wanted = trimmedOrNull(sidecar.slug);
  const slug = wanted ? slugFromName(`${wanted}.slug`) : slugFromName(chosen.file);
  if (!slug) {
    return refused(
      item,
      `no usable slug from "${wanted ?? chosen.file}". An item cannot live at an empty address.`,
    );
  }

  /*
   * Two folders resolving to one slug is the upsert-by-slug trap, which has
   * already cost this project a row: saving a new thing whose slug landed on an
   * existing one silently replaced it and still reported success. Within a
   * single run it is catchable, so it is caught.
   */
  const address = `${kind}/${slug}`;
  const earlier = claimed.get(address);
  if (earlier) {
    return refused(item, `slug "${slug}" was already taken by ${earlier} in this run`);
  }
  claimed.set(address, item.label);

  /* the bytes */

  const downloadPath = pathOf.get(chosen.file);
  let buffer;
  try {
    buffer = readFileSync(downloadPath);
  } catch (error) {
    return refused(item, `cannot read ${chosen.file}: ${describe(error)}`);
  }
  // Copied out of the Buffer rather than passed through it, so the readers get
  // a view starting at zero whatever Node's allocation pool did.
  const bytes = new Uint8Array(buffer);
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  /*
   * The sniff is a gate, not an optimisation. inspectUpload throws on a
   * container it does not recognise, and a .v3d model or a .tga texture is
   * recognised by none of the three, which is most of the Assets shelf. Asking
   * first is what lets an asset through.
   */
  const notes = [];
  let inspection = null;
  if (looksLikeRfl(bytes) || looksLikeVpp(bytes) || looksLikeZip(bytes)) {
    try {
      // The filename matters for a bare .rfl and only there: the level's game
      // type lives in its name prefix and nowhere else inside the file.
      inspection = inspectUpload(bytes, chosen.file);
    } catch (error) {
      // Readable container, unreadable contents. The file is still a real
      // download and is still worth keeping, so this costs the compatibility
      // row rather than the entry, and says so loudly enough to be looked at.
      notes.push(`looked like a known container but did not parse: ${describe(error)}`);
    }
  }
  for (const warning of inspection?.warnings ?? []) notes.push(warning);

  const levels = (inspection?.levels ?? []).map((level) => ({
    path: level.path,
    version: level.header.version,
    levelName: level.header.levelName,
  }));

  /*
   * The category a person wrote wins, and is refused outright when the shelf
   * does not offer it: a typo stored here files the item under a facet no chip
   * links to, which is invisible rather than broken. A derived category is
   * dropped in the same situation instead of refused, because the derivation is
   * ours rather than theirs, and a mod that happens to ship CTF levels would
   * otherwise be rejected for a reading that was correct.
   */
  const offered = new Set(section.categories.map((entry) => entry.id));
  const stated = trimmedOrNull(sidecar.category)?.toLowerCase() ?? null;
  if (stated && !offered.has(stated)) {
    return refused(
      item,
      offered.size === 0
        ? `${section.title} has no categories, so "${stated}" cannot be one`
        : `category "${stated}" is not one of ${[...offered].join(", ")} for ${section.title}`,
    );
  }
  const derivedRaw = categoryFromLevels(levels.map((level) => level.path));
  const derived = derivedRaw && offered.has(derivedRaw) ? derivedRaw : null;
  const category = stated ?? derived;

  /* everything else the row carries */

  const title = trimmedOrNull(sidecar.title);
  const summary = trimmedOrNull(sidecar.summary);
  const description = trimmedOrNull(sidecar.description);
  const releaseVersion = trimmedOrNull(sidecar.releaseVersion);
  const releasedOn = normaliseReleasedOn(sidecar.releasedOn);
  const authorName = trimmedOrNull(sidecar.authorName) ?? defaultAuthor;
  const tags = Array.isArray(sidecar.tags)
    ? sidecar.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)
    : null;
  const updates = Array.isArray(sidecar.updates) ? sidecar.updates : null;

  const downloadKey = storageKeyFor(kind, slug, chosen.file);
  const shots = chosen.images.map((name, position) => ({
    name,
    path: pathOf.get(name),
    key: screenshotKeyFor(kind, slug, position, name),
    position,
  }));

  /* what is already there */

  let existing;
  try {
    [existing] = await sql`
      select items.id, items.status, files.sha256 as file_sha
      from items
      left join files on files.item_id = items.id and files.is_primary
      where items.kind = ${kind} and items.slug = ${slug}
      limit 1`;
  } catch (error) {
    return refused(item, `could not read the catalogue: ${describe(error)}`);
  }

  const action = existing ? "update" : "create";
  const detail = !existing ? "" : existing.file_sha === sha256 ? " (same file)" : " (new file)";
  const verb = live ? `${action}d` : `would ${action}`;

  const row = {
    label: item.label,
    action,
    kind,
    category: category ?? "-",
    levels: inspection ? String(levels.length) : "-",
    size: formatBytes(buffer.byteLength),
    shots: String(shots.length),
    outcome: `${verb}${detail}  ${section.route}/${slug}`,
    notes,
  };

  if (!live) return row;

  /* upload before writing, and abort the item if anything is refused */

  const failedDownload = await put(downloadKey, buffer, contentTypeFor(chosen.file));
  if (failedDownload) return refused(item, `upload of ${downloadKey} failed: ${failedDownload}`);

  for (const shot of shots) {
    let image;
    try {
      image = readFileSync(shot.path);
    } catch (error) {
      return refused(item, `cannot read ${shot.name}: ${describe(error)}`);
    }
    const failed = await put(shot.key, image, contentTypeFor(shot.name));
    if (failed) return refused(item, `upload of ${shot.key} failed: ${failed}`);
  }

  /*
   * Objects are in the bucket before any row points at them, which is the safe
   * direction of the two. An object nothing references is a few kilobytes going
   * spare; a row referencing an object that is not there is a download button
   * that hands somebody a 404, and the site cannot tell.
   */

  const itemId = existing?.id ?? randomUUID();
  const statements = [];

  /*
   * The upsert. Every editorial field is coalesced rather than assigned, so a
   * re-run fills gaps and never overwrites what a person put there, and the
   * sidecar still wins because its value is the one being coalesced first. The
   * derived title is only ever an insert-time placeholder for the same reason:
   * "ctf ankh b12" must not replace a title somebody wrote out properly.
   */
  statements.push(sql`
    insert into items (
      id, kind, slug, title, summary, description, author_name, status,
      released_on, category, release_version, tags, created_at, updated_at, published_at
    )
    values (
      ${itemId}, ${kind}, ${slug}, ${title || titleFromName(chosen.file) || slug},
      ${summary}, ${description}, ${authorName},
      ${publish ? "published" : "draft"},
      ${releasedOn}::date, ${category}, ${releaseVersion},
      coalesce(${tags === null ? null : pgTextArray(tags)}::text[], '{}'::text[]),
      now(), now(),
      ${publish ? new Date().toISOString() : null}::timestamptz
    )
    on conflict (kind, slug) do update set
      title = coalesce(${title}, items.title),
      summary = coalesce(${summary}, items.summary),
      description = coalesce(${description}, items.description),
      author_name = coalesce(${authorName}, items.author_name),
      released_on = coalesce(${releasedOn}::date, items.released_on),
      release_version = coalesce(${releaseVersion}, items.release_version),
      tags = coalesce(${tags === null ? null : pgTextArray(tags)}::text[], items.tags),
      category = coalesce(${stated}, items.category, ${derived}),
      status = case when ${publish ? "t" : "f"}::boolean then 'published' else items.status end,
      published_at = case
        when ${publish ? "t" : "f"}::boolean and items.published_at is null then now()
        else items.published_at
      end,
      updated_at = now()`);

  /*
   * The file row is upserted on its storage key rather than deleted and
   * recreated, because files.id is what /api/download/[fileId] is addressed by
   * and a link pasted into Discord should not stop counting because somebody
   * re-ran the import. Anything else this item used to offer goes first.
   */
  statements.push(
    sql`delete from files where item_id = ${itemId} and storage_key <> ${downloadKey}`,
  );
  statements.push(sql`
    insert into files (id, item_id, storage_key, filename, size_bytes, sha256, content_type, is_primary)
    values (${randomUUID()}, ${itemId}, ${downloadKey}, ${chosen.file},
            ${buffer.byteLength}, ${sha256}, ${contentTypeFor(chosen.file)}, true)
    on conflict (storage_key) do update set
      item_id = excluded.item_id,
      filename = excluded.filename,
      size_bytes = excluded.size_bytes,
      sha256 = excluded.sha256,
      content_type = excluded.content_type,
      is_primary = true`);

  // Screenshots are keyed by position and the folder decides the order, so the
  // set is replaced whole. Their ids appear in no URL; the storage key is the
  // address of a picture.
  statements.push(sql`delete from screenshots where item_id = ${itemId}`);
  for (const shot of shots) {
    statements.push(sql`
      insert into screenshots (id, item_id, storage_key, caption, position)
      values (${randomUUID()}, ${itemId}, ${shot.key}, null, ${shot.position})`);
  }

  // Compatibility is read from the bytes on every run, so a fixed parser
  // corrects old rows simply by being run again. An item that no longer reads
  // as a container loses the row rather than keeping a stale one.
  statements.push(sql`delete from map_meta where item_id = ${itemId}`);
  /*
   * A row per item that contains levels, which is what the table is for, plus
   * the shelves that carry compatibility at all: a map or a mod holding no
   * levels is worth recording precisely because somebody should look at it,
   * while a tool that is a readable zip is a tool and the empty finding says
   * nothing anybody would read.
   */
  if (inspection && (levels.length > 0 || section.hasLevels)) {
    statements.push(sql`
      insert into map_meta (item_id, rfl_version, plays_on, detection_confidence, levels, warnings, detected_at)
      values (${itemId}, ${inspection.rflVersion},
              ${JSON.stringify(inspection.playsOn)}::jsonb,
              ${inspection.confidence},
              ${JSON.stringify(levels)}::jsonb,
              ${JSON.stringify(inspection.warnings)}::jsonb,
              now())`);
  }

  /*
   * The changelog is replaced only when the sidecar has one to give. A folder
   * that says nothing about updates leaves the entries alone, because those are
   * as likely to have been typed into /admin as to have come from here, and
   * inserting without replacing would duplicate every one of them on the second
   * run.
   */
  if (updates) {
    statements.push(sql`delete from item_updates where item_id = ${itemId}`);
    for (const update of updates) {
      const releasedAt = update.releasedAt
        ? new Date(update.releasedAt).toISOString()
        : null;
      statements.push(sql`
        insert into item_updates (id, item_id, release_version, title, body, released_at, created_at)
        values (${randomUUID()}, ${itemId},
                ${trimmedOrNull(update.releaseVersion)}, ${update.title.trim()},
                ${trimmedOrNull(update.body)},
                coalesce(${releasedAt}::timestamptz, now()), now())`);
    }
  }

  /*
   * One transaction, so the item is never briefly without its file. neon-http
   * cannot hold an interactive transaction across awaits, which is why this is
   * a list of statements rather than a series of awaited writes: the match
   * ingest learned that the hard way, when a delete and an insert either side
   * of an await left a match with no players and a page rendered in the gap.
   */
  try {
    await sql.transaction(statements);
  } catch (error) {
    return refused(
      item,
      `files are in the bucket but the row was not written: ${describe(error)}`,
    );
  }

  return row;
}

/* --- the run -------------------------------------------------------------- */

const items = collectItems();
if (items.length === 0) {
  console.error("Nothing to ingest: none of those paths held a file or a folder.\n");
  process.exit(1);
}

// Hashing a few hundred files and uploading them is minutes of silence, so a
// terminal gets a counter. A pipe gets nothing: a redrawn line saved to a log
// is just the same line a hundred times over.
const progress = (text) => {
  if (process.stdout.isTTY) process.stdout.write(`\r${text.slice(0, 100).padEnd(100)}`);
};

const rows = [];
for (const [index, item] of items.entries()) {
  progress(`  reading ${index + 1}/${items.length}  ${item.label}`);
  try {
    rows.push(await ingest(item));
  } catch (error) {
    // One bad folder must never take the batch with it, however it went wrong.
    rows.push(refused(item, `unexpected failure: ${describe(error)}`));
  }
}
progress("");
if (process.stdout.isTTY) process.stdout.write("\r");

/* --- the report ----------------------------------------------------------- */

const COLUMNS = [
  ["item", "label"],
  ["kind", "kind"],
  ["category", "category"],
  ["levels", "levels"],
  ["size", "size"],
  ["shots", "shots"],
  [live ? "what happened" : "what would happen", "outcome"],
];

const printable = rows.map((row) =>
  row.refusal
    ? {
        label: row.label,
        kind: "-",
        category: "-",
        levels: "-",
        size: "-",
        shots: "-",
        outcome: `REFUSED  ${row.refusal}`,
      }
    : row,
);

const widths = COLUMNS.map(([head, key]) =>
  Math.max(head.length, ...printable.map((row) => row[key].length)),
);

// The last column runs long by design: it carries the address on a good row and
// the whole reason on a refused one, and truncating a reason is how a refusal
// becomes a mystery.
const render = (values) =>
  values
    .map((value, column) => (column === values.length - 1 ? value : value.padEnd(widths[column])))
    .join("  ")
    .trimEnd();

console.log(render(COLUMNS.map(([head]) => head)));
console.log(render(COLUMNS.map((_, column) => "-".repeat(widths[column]))));
for (const row of printable) console.log(render(COLUMNS.map(([, key]) => row[key])));

const noted = rows.filter((row) => row.notes?.length);
if (noted.length) {
  console.log("\nworth a look:");
  for (const row of noted) {
    for (const note of row.notes) console.log(`  ${row.label}: ${note}`);
  }
}

/* --- the summary ---------------------------------------------------------- */

const refusals = rows.filter((row) => row.refusal).length;
const created = rows.filter((row) => row.action === "create").length;
const updated = rows.filter((row) => row.action === "update").length;

console.log(
  `\n${rows.length} item${rows.length === 1 ? "" : "s"}: ` +
    (live
      ? `${created} created, ${updated} updated, ${refusals} refused.`
      : `${created} to create, ${updated} to update, ${refusals} refused.`),
);

if (!live) {
  console.log("Nothing was written: no object uploaded, no row changed.");
  console.log("Re-run with --go to do it, and --go --publish to publish rather than draft.\n");
} else if (publish) {
  console.log("These are published and on the site now.\n");
} else {
  console.log("These are drafts. They are invisible on the site until published in /admin.\n");
}

// Non-zero when anything was refused, so a scripted batch notices.
process.exit(refusals > 0 ? 1 : 0);
