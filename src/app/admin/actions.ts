"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import { adminState, forgetAdmin, rememberAdmin } from "@/lib/admin-key";
import { db } from "@/lib/db";
import {
  featurePieces,
  files,
  items,
  itemUpdates,
  mapPacks,
  matchPlayers,
  playerIdentities,
  type MapPackEntry,
} from "@/lib/db/schema";
import { SECTION_BY_KIND, categoryOf } from "@/lib/downloads";
import { normaliseReleasedOn } from "@/lib/ingest-rules";
import { IDENTITY_KEY } from "@/lib/matches/identities";
import { checkDisplayName } from "@/lib/matches/display-name";
import { isLevelFilename, MAP_PACKS_CACHE_TAG } from "@/lib/map-packs";
import {
  buildFeatureFacts,
  saveFeature,
  writeFeature,
  type FeatureSubject,
} from "@/lib/ai/feature";
import { activeModel } from "@/lib/ai/generate";
import { announceFeature } from "@/lib/ai/discord";
import { COLUMNIST_NAME } from "@/lib/ai/opinion";

/**
 * Everything on the admin page goes through here, and every action re-checks
 * the key.
 *
 * A server action is a public endpoint whatever page it was rendered from, so
 * guarding the page and not the action would leave the write open to anybody who
 * found its identifier. The check is cheap and it belongs on the thing that
 * writes.
 */
async function allowed(): Promise<boolean> {
  return (await adminState()).state === "allowed";
}

/** Unlocks this browser. The only place the key is ever accepted. */
export async function unlock(formData: FormData): Promise<void> {
  const offered = String(formData.get("key") ?? "");
  const state = await adminState(offered);

  if (state.state !== "allowed") {
    redirect("/admin?wrong=1");
  }

  await rememberAdmin();
  // Straight to the plain URL, so the key is not left in the address bar or in
  // history for the next person to use this machine.
  redirect("/admin");
}

export async function lock(): Promise<void> {
  await forgetAdmin();
  redirect("/admin");
}

/**
 * Sets what a person is called, across the whole archive.
 *
 * Writes only the name. The grouping is the identity the server sent and is not
 * editable here: this page decides what to call somebody, not who they are.
 */
export async function setDisplayName(formData: FormData): Promise<void> {
  if (!(await allowed())) redirect("/admin");

  const identityKey = String(formData.get("identityKey") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim().slice(0, 40);
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;

  if (!identityKey) redirect("/admin?problem=1");

  if (!displayName) {
    // Clearing it is how you go back to the most used name, which is the right
    // answer for anybody whose names were never confusing.
    await db.delete(playerIdentities).where(eq(playerIdentities.identityKey, identityKey));
  } else {
    /*
     * A name that cannot be found is not a name.
     *
     * A player page is reached by name — `getPlayer` filters on `playedBy` and
     * calls `notFound()` when nothing matches — so a display name nobody played
     * under gives somebody a label on every board and a 404 behind every link
     * to it. This accepted any forty characters until 9 August. See
     * `display-name.ts` for the two rules and why the second one exists.
     */
    const used = await db
      .select({ key: IDENTITY_KEY, name: matchPlayers.name })
      // counts-everything: naming somebody is not a total, the same reason
      // `canonicalNames` reads every row. A name used only in a match that did
      // not count is still a name their page can be reached by.
      .from(matchPlayers)
      .groupBy(IDENTITY_KEY, matchPlayers.name);

    const verdict = checkDisplayName(displayName, identityKey, used);
    if (verdict !== "ok") redirect(`/admin?problem=name-${verdict}`);
  }

  if (displayName) {
    await db
      .insert(playerIdentities)
      .values({ identityKey, displayName, note })
      .onConflictDoUpdate({
        target: playerIdentities.identityKey,
        set: { displayName, note, updatedAt: new Date() },
      });
  }

  /*
   * A name reaches almost every page: the boards, the players list, every
   * scoreboard, every pairing, every match. Revalidating the whole tree is
   * blunt and correct, and this runs a few times a year.
   */
  revalidatePath("/", "layout");
  redirect("/admin?saved=1");
}

/**
 * Says that two of the server's identities are the same person.
 *
 * The server groups by connection, which is right far more often than names are
 * and is wrong in one direction this can fix: one person on a changing address,
 * a VPN or a second machine arrives as two people, with their record split
 * between them. Somebody who knows says so here and every total, board, pairing
 * and article adds up as one from then on.
 *
 * **It cannot fix the other direction.** Two people behind one connection share
 * an identity and nothing here can separate them, because the archive holds
 * nothing that distinguishes them.
 *
 * The merge is a decision, not a deletion. Both identities keep every row they
 * ever had; only the grouping changes, so unmerging puts everything back
 * exactly as it was.
 */
export async function mergeIdentities(formData: FormData): Promise<void> {
  if (!(await allowed())) redirect("/admin");

  const source = String(formData.get("source") ?? "").trim();
  const target = String(formData.get("target") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;

  // Merging something into itself would make it its own answer, and the
  // resolution in `identities.ts` would loop a reader rather than the database.
  if (!source || !target) redirect("/admin?problem=merge-incomplete");
  if (source === target) redirect("/admin?problem=merge-same");

  const rows = await db
    .select({
      identityKey: playerIdentities.identityKey,
      displayName: playerIdentities.displayName,
      mergedInto: playerIdentities.mergedInto,
    })
    .from(playerIdentities);

  const mergedInto = new Map(rows.map((row) => [row.identityKey, row.mergedInto]));

  /*
   * Flattened here, because it is resolved only once when read.
   *
   * `IDENTITY_KEY` follows `merged_into` exactly one step, so a chain would
   * quietly strand somebody halfway: merge A into B when B already points at C
   * and A ends up grouped under B, which is nobody. Following the target to its
   * end before writing means this column always holds a final answer, and the
   * read path stays a single subquery rather than a recursive one.
   *
   * The loop is bounded by the number of rows, so a cycle written by some
   * earlier bug cannot hang this.
   */
  let end = target;
  const seen = new Set<string>([source]);
  while (mergedInto.get(end) && !seen.has(end)) {
    seen.add(end);
    end = mergedInto.get(end)!;
  }

  // Following the target led back to the source, so this merge would make a
  // ring. Refused rather than half-applied.
  if (end === source) redirect("/admin?problem=merge-ring");

  const existing = rows.find((row) => row.identityKey === source);

  /*
   * The merged-away row keeps a real name, not an empty string.
   *
   * `display_name` is not null, so a merge has to put something there, and the
   * first version put "". Nothing reads it for display any more — `DISPLAY_NAME`
   * looks up the resolved key — but a row saying a person is called nothing is a
   * trap for the next thing that reads this table, and one already existed:
   * `vet:names` compared against it and reported nineteen pages showing a name
   * belonging to somebody "the site calls ''".
   *
   * The name they actually played under is both true and the useful thing to see
   * in the undo list.
   */
  const [played] = await db
    .select({ name: sql<string | null>`mode() within group (order by ${matchPlayers.name})` })
    // counts-everything: naming somebody is not a total, the same reason
    // `canonicalNames` reads every row. Somebody whose only appearance was in a
    // match that did not count still played under a name, and the row recording
    // that they are somebody else needs to say which name.
    .from(matchPlayers)
    .where(eq(sql`coalesce(${matchPlayers.identityKey}, lower(${matchPlayers.name}))`, source));

  await db
    .insert(playerIdentities)
    .values({
      identityKey: source,
      displayName: existing?.displayName || played?.name || source.slice(0, 12),
      mergedInto: end,
      note,
    })
    .onConflictDoUpdate({
      target: playerIdentities.identityKey,
      set: { mergedInto: end, note, updatedAt: new Date() },
    });

  /*
   * Anything already pointing at the source now points at the same end.
   *
   * Without this, merging A into B when C already pointed at A leaves C aimed
   * at an identity that is no longer a person, and C's record vanishes from
   * both. Repointing keeps the invariant this whole function protects: every
   * `merged_into` names a key that is nobody's `merged_into`.
   */
  await db
    .update(playerIdentities)
    .set({ mergedInto: end, updatedAt: new Date() })
    .where(eq(playerIdentities.mergedInto, source));

  revalidatePath("/", "layout");
  redirect("/admin?saved=1");
}

/** Undoes a merge. Every row stays where it was, so this is fully reversible. */
export async function unmergeIdentity(formData: FormData): Promise<void> {
  if (!(await allowed())) redirect("/admin");

  const identityKey = String(formData.get("identityKey") ?? "").trim();
  if (!identityKey) redirect("/admin?problem=1");

  await db
    .update(playerIdentities)
    .set({ mergedInto: null, updatedAt: new Date() })
    .where(eq(playerIdentities.identityKey, identityKey));

  revalidatePath("/", "layout");
  redirect("/admin?saved=1");
}

/*
 * Map packs: define a themed set of maps, switch one on, and the deathmatch
 * server follows within a few minutes.
 *
 * Nothing here talks to the VPS. The site records what should be true and the
 * applier on that machine polls for it, which is the only direction that works
 * — Vercel cannot open a connection to a home server. Since 1 September that
 * poll is nightly at 04:00 Pacific rather than every five minutes: packs change
 * a few times a season, and the round-the-clock poll was one of the things
 * keeping the Neon compute permanently awake. The admin page says so, and a
 * pack can be landed sooner by starting the "RF4U DM Map Pack" task by hand.
 */

/** A URL-safe slug from a pack's name, since nobody wants to type one. */
function packSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * The maps textarea, one map per line.
 *
 * A form rather than a repeating widget: a pack is twenty filenames and the
 * fastest way to enter twenty filenames is to paste twenty lines. Each is
 * `filename | title | author | url`, and everything after the filename is
 * optional, so a bare list of filenames is a valid pack.
 */
function parseMaps(raw: string): MapPackEntry[] {
  const entries: MapPackEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [filename, title, author, url] = trimmed.split("|").map((part) => part.trim());
    if (!filename) continue;
    entries.push({
      filename,
      ...(title ? { title } : {}),
      ...(author ? { author } : {}),
      ...(url ? { url } : {}),
    });
  }
  return entries;
}

export async function saveMapPack(formData: FormData): Promise<void> {
  if (!(await allowed())) redirect("/admin");

  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const slug = String(formData.get("slug") ?? "").trim() || packSlug(name);
  const maps = parseMaps(String(formData.get("maps") ?? ""));

  if (!name || !slug) redirect("/admin?problem=pack-name");

  /*
   * Every filename is checked before it is stored. A typo here becomes a map
   * the server cannot load, and the server's answer to that is worse than a
   * rejected form: it drops the entry and the rotation quietly shortens.
   *
   * The offending lines are named. Refusing a twenty line paste without saying
   * which line is wrong leaves somebody comparing two columns of filenames by
   * eye, which is the same work the check just did.
   */
  if (maps.length === 0) redirect("/admin?problem=pack-empty");

  const bad = maps.filter((entry) => !isLevelFilename(entry.filename));
  if (bad.length > 0) {
    // Four is enough to see the pattern — usually a missing `.rfl` on all of
    // them — without building a URL out of a whole pack.
    const named = bad
      .slice(0, 4)
      .map((entry) => entry.filename)
      .join(", ");
    redirect(
      `/admin?problem=pack-filenames&bad=${encodeURIComponent(named)}` +
        `${bad.length > 4 ? `&more=${bad.length - 4}` : ""}`,
    );
  }

  /*
   * A new pack may not land on an existing one.
   *
   * The write is an upsert on the slug and the slug is derived from the name,
   * so "Halloween" saved twice, or "Halloween 2026" beside "halloween-2026",
   * silently replaced the first pack's maps, blurb and server name and then
   * said "Saved". It was the only way to lose data on this page. Editing an
   * existing pack posts its slug in a hidden field, which is how the two are
   * told apart.
   */
  const editing = String(formData.get("slug") ?? "").trim().length > 0;
  if (!editing) {
    const [clash] = await db
      .select({ name: mapPacks.name })
      .from(mapPacks)
      .where(eq(mapPacks.slug, slug))
      .limit(1);
    if (clash) redirect("/admin?problem=pack-exists");
  }

  const values = {
    slug,
    name,
    blurb: String(formData.get("blurb") ?? "").trim().slice(0, 600) || null,
    serverName: String(formData.get("serverName") ?? "").trim().slice(0, 80) || null,
    welcomeMessage:
      String(formData.get("welcomeMessage") ?? "").trim().slice(0, 300) || null,
    maps,
    updatedAt: new Date(),
  };

  await db
    .insert(mapPacks)
    .values(values)
    .onConflictDoUpdate({ target: mapPacks.slug, set: values });

  // The VPS polls a cached read; without this, an edited pack would sit behind
  // the cache for up to an hour instead of landing on the next five-minute poll.
  revalidateTag(MAP_PACKS_CACHE_TAG);
  revalidatePath("/", "layout");
  redirect("/admin?saved=1");
}

/**
 * Switches a pack on, and every other one off.
 *
 * Both in one batch, because the partial unique index means the database will
 * refuse a second active pack outright — clearing first is not tidiness, it is
 * the only order that works.
 */
export async function activateMapPack(formData: FormData): Promise<void> {
  if (!(await allowed())) redirect("/admin");

  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) redirect("/admin?problem=1");

  /*
   * Refused rather than applied to nothing.
   *
   * Without this, a slug that does not exist clears the active flag, matches no
   * row, and reports "Saved": switching a pack on would have switched the
   * current one off instead, which is the least expected outcome on the page.
   */
  const [exists] = await db
    .select({ slug: mapPacks.slug })
    .from(mapPacks)
    .where(eq(mapPacks.slug, slug))
    .limit(1);
  if (!exists) redirect("/admin?problem=pack-missing");

  /*
   * One batch, which this said it was and was not.
   *
   * It was a clear awaited and then a set awaited, so between the two **no pack
   * was active** — and the VPS polls `/api/rf4u/map-pack/active` every five
   * minutes, so that window is reachable. Exactly the shape of the ingest bug
   * of 6 August, where a delete awaited then an insert awaited left a match with
   * no players about fifteen hundred times a day.
   *
   * `db.batch`, not `db.transaction`: `neon-http` cannot hold an interactive
   * transaction across awaits, the same reason `matches/ingest.ts` uses it.
   */
  await db.batch([
    db.update(mapPacks).set({ active: false }).where(eq(mapPacks.active, true)),
    db
      .update(mapPacks)
      .set({ active: true, activatedAt: new Date(), updatedAt: new Date() })
      .where(eq(mapPacks.slug, slug)),
  ]);

  revalidateTag(MAP_PACKS_CACHE_TAG);
  revalidatePath("/", "layout");
  redirect("/admin?saved=1");
}

/**
 * Switches the active pack off, leaving the server exactly as it is.
 *
 * Deliberately not "restore the default rotation": this system knows what it
 * set and not what was there before it, and inventing a default would be the
 * one action here capable of wiping a rotation somebody curated by hand. To go
 * back to a stock list, make it a pack and switch that on.
 */
export async function deactivateMapPacks(): Promise<void> {
  if (!(await allowed())) redirect("/admin");
  await db.update(mapPacks).set({ active: false }).where(eq(mapPacks.active, true));
  revalidateTag(MAP_PACKS_CACHE_TAG);
  revalidatePath("/", "layout");
  redirect("/admin?saved=1");
}

/**
 * Deletes a pack, and refuses to delete the one that is on.
 *
 * Nothing tells the server to stop running a rotation that has already been
 * applied, so deleting the active pack leaves the DM server playing it while
 * the site forgets it exists: `/server` goes back to saying no themed pack is
 * running, over a server that is running one, and there is no record of what it
 * is. Switching it off first is the same two clicks and leaves the site honest.
 */
export async function deleteMapPack(formData: FormData): Promise<void> {
  if (!(await allowed())) redirect("/admin");
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) redirect("/admin?problem=1");

  const [pack] = await db
    .select({ active: mapPacks.active })
    .from(mapPacks)
    .where(eq(mapPacks.slug, slug))
    .limit(1);
  if (pack?.active) redirect("/admin?problem=pack-active");

  await db.delete(mapPacks).where(eq(mapPacks.slug, slug));
  revalidateTag(MAP_PACKS_CACHE_TAG);
  revalidatePath("/", "layout");
  redirect("/admin?saved=1");
}

/**
 * Commissions a feature: a longer piece about one subject.
 *
 * Deliberately a person's decision rather than a scheduled job. "Which of
 * tonight's things deserves a whole article" is a judgement, and handing it to
 * the model would produce a feature every night about whatever was largest,
 * which is what the nightly column already does.
 *
 * Generation takes a while and costs model quota, so this writes the piece
 * before redirecting rather than queueing it: the page comes back when the
 * piece exists, or with a problem if it did not verify.
 *
 * It is never announced. `feature_pieces.posted_at` is swept by nothing —
 * publishing one to Discord is its own decision, not a side effect of writing.
 */
export async function commissionFeature(formData: FormData): Promise<void> {
  if (!(await allowed())) redirect("/admin");

  const kind = String(formData.get("kind") ?? "").trim();
  let subject: FeatureSubject | null = null;

  if (kind === "pairing" || kind === "rivalry") {
    const a = String(formData.get("a") ?? "").trim();
    const b = String(formData.get("b") ?? "").trim();
    if (a && b && a !== b) subject = { kind, a, b };
  } else if (kind === "player") {
    const name = String(formData.get("name") ?? "").trim();
    if (name) subject = { kind: "player", name };
  } else if (kind === "match") {
    const ref = String(formData.get("matchRef") ?? "").trim();
    const [archiveDay, sourceMatchId] = ref.split("/");
    if (archiveDay && sourceMatchId && Number.isFinite(Number(sourceMatchId))) {
      subject = { kind: "match", archiveDay, sourceMatchId: Number(sourceMatchId) };
    }
  }

  /*
   * Three different failures, said apart.
   *
   * All three used to redirect to `?problem=1`, which nothing on the page
   * rendered, so a commission that failed was indistinguishable from a button
   * that did nothing — and that is exactly how it was reported on 9 August.
   * They need different answers from whoever pressed it: fix the names, pick a
   * different subject, or try again.
   */
  if (!subject) redirect("/admin?problem=feature-input");

  const facts = await buildFeatureFacts(subject);
  if (!facts) redirect("/admin?problem=feature-no-record");

  const piece = await writeFeature(facts);
  if (!piece) redirect("/admin?problem=feature-unwritten");

  await saveFeature(piece, facts, activeModel());

  revalidatePath("/", "layout");
  redirect(`/analyst/features/${piece.slug}`);
}

/**
 * Deletes a feature.
 *
 * The missing half of commissioning one. A piece that came back thin, or about
 * the wrong pair, could be written and published and then only unpicked by
 * hand in the database — and the page that wrote it did not even list what it
 * had written.
 *
 * Safe in a way deleting an opinion piece is not: `feature_pieces` is swept by
 * nothing, so removing a row cannot cause anything to be re-posted to Discord.
 * The same deletion on `opinion_pieces` would have the next sync write a
 * replacement and announce it.
 */
/**
 * Posts a feature to the community Discord, once, because somebody said so.
 *
 * The one action on this page that reaches outside the site. Everything else
 * here changes what a page says and can be undone; **a Discord message cannot
 * be unsent**, so this refuses a piece that already has a `posted_at` rather
 * than trusting a double click, and the button becomes a date afterwards.
 *
 * Deliberately not a sweep. `night_columns` and `opinion_pieces` are swept up
 * and posted by the next sync whenever `posted_at` is null, which is why
 * regenerating one of those republishes it. `feature_pieces` is swept by
 * nothing, and this is the only thing that will ever post one.
 *
 * **A local run posts to the real channel.** There is one webhook and it is the
 * community's, set in `.env.local` as well as in production. Pressing this on a
 * dev server is not a rehearsal.
 */
export async function announceFeatureNow(formData: FormData): Promise<void> {
  if (!(await allowed())) redirect("/admin");

  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) redirect("/admin?problem=1");

  const [piece] = await db
    .select({
      slug: featurePieces.slug,
      headline: featurePieces.headline,
      standfirst: featurePieces.standfirst,
      body: featurePieces.body,
      subjects: featurePieces.subjects,
      matchRefs: featurePieces.matchRefs,
      postedAt: featurePieces.postedAt,
    })
    .from(featurePieces)
    .where(eq(featurePieces.slug, slug));

  if (!piece) redirect("/admin?problem=feature-missing");
  if (piece.postedAt) redirect("/admin?problem=feature-posted");

  const result = await announceFeature({
    slug: piece.slug,
    headline: piece.headline,
    // Nullable in the schema, though the writer never stores one without it.
    standfirst: piece.standfirst ?? "",
    body: piece.body,
    subjects: Array.isArray(piece.subjects) ? (piece.subjects as string[]) : [],
    matchCount: Array.isArray(piece.matchRefs) ? piece.matchRefs.length : 0,
    columnist: COLUMNIST_NAME,
  });

  /*
   * Stamped only when Discord said yes.
   *
   * `unknown` means the request failed in a way that leaves no answer — the
   * message may or may not have arrived. Not stamping is the safer of the two
   * wrong answers here: it leaves the button pressable, and a second copy in a
   * channel is a smaller problem than a piece everybody believes was posted and
   * never was, which is the failure this site spent five days on.
   */
  if (result === "sent") {
    await db
      .update(featurePieces)
      .set({ postedAt: new Date() })
      .where(eq(featurePieces.slug, slug));

    revalidatePath("/", "layout");
    redirect("/admin?saved=posted");
  }

  redirect(`/admin?problem=feature-announce-${result}`);
}

export async function deleteFeature(formData: FormData): Promise<void> {
  if (!(await allowed())) redirect("/admin");

  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) redirect("/admin?problem=1");

  await db.delete(featurePieces).where(eq(featurePieces.slug, slug));

  revalidatePath("/", "layout");
  redirect("/admin?saved=1");
}

/*
 * The downloads catalogue.
 *
 * The ingest CLI writes drafts and nothing else, deliberately: it stores bytes,
 * hashes them and reads what it can out of the file, and every judgement that
 * needs a person is left for one. These six actions are that person's half of
 * the upload path. Without them an ingested map has a row, has its object in the
 * bucket, and is visible on no page anywhere.
 *
 * Two facts run through all of them and neither is obvious from the buttons.
 *
 * **These actions govern the page, not the bytes.** The R2 bucket is public and
 * served from a custom domain, and `publicUrl()` is a pure function of the
 * storage key, so hiding an item or deleting its row leaves the object exactly
 * as fetchable as it was to anybody holding the URL. `/api/download/[fileId]`
 * does enforce status, so the two routes to a file genuinely differ, but the
 * direct one is the one already pasted into Discord. This is written on
 * `ITEM_STATUSES` in the schema and it is said out loud on the admin page,
 * because a comment has never stopped anybody believing that Delete deletes.
 *
 * **`updatedAt` means the item's content changed.** Editing it bumps the column
 * and adding a changelog entry bumps it; publishing and unpublishing do not,
 * because those change who can see the item rather than what it says, and
 * "Recently updated" is a shelf a reader sorts by expecting new work.
 */

/**
 * The tags box, comma separated.
 *
 * Lowercased, because the tag filter is a link carrying the tag verbatim: `CTF`
 * stored beside `ctf` is two chips for one idea, each finding half the shelf,
 * and nothing on either page would look wrong. Deduplicated, and capped in both
 * directions for the same reason a slug is capped, since this ends up in a URL.
 */
function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const tag = part.trim().toLowerCase().slice(0, 32);
    if (tag) seen.add(tag);
  }
  return [...seen].slice(0, 12);
}

/**
 * Publishes an item: a draft nobody has seen, or something previously pulled.
 *
 * **It refuses an item with no file.** `files` is where the download comes from,
 * so publishing without one produces a detail page whose download panel has
 * nothing to offer, and the shelf counts a map that cannot be had. That is a
 * broken promise rather than an empty state, and it is the one dead end this can
 * detect from here.
 *
 * It cannot detect the other one. A `files` row records that something was
 * stored at a key; it is not proof the object is still in the bucket, and
 * nothing in this file reads R2. The section on the admin page says so, because
 * a refusal that only covers half the failure invites the belief that it covers
 * all of it.
 *
 * `publishedAt` is stamped once and never restamped. Every listing sorts
 * "Newest" on that column, so restamping would push a map from 2003 to the top
 * of the shelf for having been briefly hidden and put back.
 */
export async function publishItem(formData: FormData): Promise<void> {
  if (!(await allowed())) redirect("/admin");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/admin?problem=item-missing");

  const [item] = await db
    .select({ publishedAt: items.publishedAt })
    .from(items)
    .where(eq(items.id, id))
    .limit(1);
  if (!item) redirect("/admin?problem=item-missing");

  const [counted] = await db
    .select({ files: sql<number>`count(*)::int` })
    .from(files)
    .where(eq(files.itemId, id));
  if ((counted?.files ?? 0) === 0) redirect("/admin?problem=item-no-file");

  await db
    .update(items)
    .set({
      status: "published",
      // Only when it has never been live. See the note above.
      ...(item.publishedAt ? {} : { publishedAt: new Date() }),
    })
    .where(eq(items.id, id));

  revalidatePath("/", "layout");
  redirect("/admin?saved=1");
}

/**
 * Pulls a published item, to `hidden` and deliberately not back to `draft`.
 *
 * The two states are different facts. `draft` means nobody outside has seen it
 * yet; `hidden` means it was live, was read, and was taken down. Sending a
 * pulled item back to `draft` would destroy the only record that it was ever
 * public and would drop it into the work queue at the top of the admin page,
 * where it looks like something waiting to be checked for the first time.
 *
 * **It stops the page and not the file.** The object stays in a public bucket
 * under a URL that has not changed.
 */
export async function unpublishItem(formData: FormData): Promise<void> {
  if (!(await allowed())) redirect("/admin");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/admin?problem=item-missing");

  const [item] = await db
    .select({ status: items.status })
    .from(items)
    .where(eq(items.id, id))
    .limit(1);
  if (!item) redirect("/admin?problem=item-missing");

  /*
   * Refused rather than applied to a draft.
   *
   * A stale page is the only way to reach this with something that was never
   * live, and marking such a row `hidden` would assert that it once was, which
   * is the one thing the state is for. The button is not offered on a draft.
   */
  if (item.status !== "published") redirect("/admin?problem=item-not-published");

  await db.update(items).set({ status: "hidden" }).where(eq(items.id, id));

  revalidatePath("/", "layout");
  redirect("/admin?saved=1");
}

/**
 * Edits the fields a person decides, which is most of what the CLI cannot.
 *
 * Ingest derives a title from a filename and a category from a level prefix,
 * and both are placeholders it is honest about: `ctfwlpro` is not a title and a
 * level with no prefix has no category at all. This is where a person fixes
 * that.
 *
 * **The slug is not editable here, and adding it would be a data-loss bug.** It
 * is the item's permanent address and half of the `(kind, slug)` unique key, so
 * editing it breaks every link already pasted and, written as an upsert, would
 * land on and replace whatever else holds the new slug. That is exactly what
 * `saveMapPack` above had to be fixed for. Re-ingest under the right name
 * instead.
 *
 * `description` is not edited here either, for a duller reason: this is a row in
 * a list of hundreds and a markdown body does not belong in one. Nothing posts
 * that field, and nothing here sets it.
 */
export async function editItem(formData: FormData): Promise<void> {
  if (!(await allowed())) redirect("/admin");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/admin?problem=item-missing");

  const [item] = await db
    .select({ kind: items.kind })
    .from(items)
    .where(eq(items.id, id))
    .limit(1);
  if (!item) redirect("/admin?problem=item-missing");

  // `title` is not null and it is what every listing, card and link renders. An
  // empty one would put a nameless row on a shelf.
  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  if (!title) redirect("/admin?problem=item-title");

  /*
   * The category is checked against its own shelf's vocabulary here, because
   * there is no database constraint on it: the facets are editorial and change
   * with the community's conventions, and a check constraint would turn adding
   * one into a migration. A server action is a public endpoint whatever the form
   * offered, so the check has to be on this side.
   *
   * Mods and tools have no facets at all, so any value at all is refused for
   * them, which is what an empty `categories` list means.
   */
  const category = String(formData.get("category") ?? "").trim();
  const section = SECTION_BY_KIND[item.kind] ?? null;
  if (category && (!section || !categoryOf(section, category))) {
    redirect("/admin?problem=item-category");
  }

  /*
   * A release date that will not parse is refused rather than quietly stored as
   * null. `normaliseReleasedOn` returns null both for "nothing was typed" and
   * for "that is not a date", and treating the second as the first would clear a
   * field somebody was in the middle of correcting and then say "Saved".
   */
  const releasedOnRaw = String(formData.get("releasedOn") ?? "").trim();
  const releasedOn = normaliseReleasedOn(releasedOnRaw);
  if (releasedOnRaw && !releasedOn) redirect("/admin?problem=item-date");

  await db
    .update(items)
    .set({
      title,
      authorName: String(formData.get("authorName") ?? "").trim().slice(0, 120) || null,
      summary: String(formData.get("summary") ?? "").trim().slice(0, 300) || null,
      category: category || null,
      releaseVersion:
        String(formData.get("releaseVersion") ?? "").trim().slice(0, 24) || null,
      releasedOn,
      tags: parseTags(String(formData.get("tags") ?? "")),
      // Content changed, so the column that means "content changed" moves.
      updatedAt: new Date(),
    })
    .where(eq(items.id, id));

  revalidatePath("/", "layout");
  redirect("/admin?saved=1");
}

/**
 * Adds a changelog entry, and bumps the item in the same write.
 *
 * The bump is not bookkeeping. "Recently updated" orders on `items.updated_at`
 * in SQL and cannot derive that from the newest changelog entry at read time, so
 * an entry written without it ranks a genuine new release below a corrected
 * typo, on the one shelf a returning player reads to find new work. The rule is
 * written on the column in `schema.ts`.
 *
 * `db.batch`, not `db.transaction`: `neon-http` cannot hold an interactive
 * transaction across awaits, the same reason nothing else here uses one.
 */
export async function addItemUpdate(formData: FormData): Promise<void> {
  if (!(await allowed())) redirect("/admin");

  const itemId = String(formData.get("itemId") ?? "").trim();
  if (!itemId) redirect("/admin?problem=item-missing");

  const [item] = await db
    .select({ id: items.id })
    .from(items)
    .where(eq(items.id, itemId))
    .limit(1);
  if (!item) redirect("/admin?problem=item-missing");

  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  if (!title) redirect("/admin?problem=item-update-title");

  /*
   * When the author changed it, which is not when we typed it in.
   *
   * Blank falls back to now, and the form says so, because "no date" is not a
   * state the column can hold. A calendar day is read at noon UTC, the way every
   * other day on this site is read, so no timezone can tip it into its
   * neighbour.
   */
  const releasedAtRaw = String(formData.get("releasedAt") ?? "").trim();
  let releasedAt = new Date();
  if (releasedAtRaw) {
    const parsed = new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(releasedAtRaw)
        ? `${releasedAtRaw}T12:00:00Z`
        : releasedAtRaw,
    );
    if (Number.isNaN(parsed.getTime())) redirect("/admin?problem=item-update-date");
    releasedAt = parsed;
  }

  await db.batch([
    db.insert(itemUpdates).values({
      itemId,
      title,
      body: String(formData.get("body") ?? "").trim().slice(0, 4000) || null,
      releaseVersion:
        String(formData.get("releaseVersion") ?? "").trim().slice(0, 24) || null,
      releasedAt,
    }),
    db.update(items).set({ updatedAt: new Date() }).where(eq(items.id, itemId)),
  ]);

  revalidatePath("/", "layout");
  redirect("/admin?saved=1");
}

/**
 * Removes one changelog entry, for when the wrong thing was typed into it.
 *
 * **Deliberately does not touch `updated_at`.** Adding an entry has to bump it;
 * removing one must not, because the bump would rank the item as freshly updated
 * on the strength of somebody deleting a mistake, which is precisely the reading
 * that column exists to avoid. The consequence to accept: an item whose only
 * entry is removed keeps the timestamp that entry gave it, so it sits a little
 * higher in "Recently updated" than it has earned. Overstating by one edit beats
 * promoting every correction.
 */
export async function deleteItemUpdate(formData: FormData): Promise<void> {
  if (!(await allowed())) redirect("/admin");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/admin?problem=item-missing");

  await db.delete(itemUpdates).where(eq(itemUpdates.id, id));

  revalidatePath("/", "layout");
  redirect("/admin?saved=1");
}

/**
 * Deletes the whole item.
 *
 * **The rows go and the bytes stay.** `files`, `screenshots`, `map_meta` and
 * `item_updates` all cascade off this row, so the record is genuinely gone from
 * the database. The objects in R2 are not touched by anything here, and the
 * bucket is public with a custom domain, so every file this item ever offered
 * stays fetchable forever by anybody who has the URL, with nothing left in the
 * database that even records which keys they were.
 *
 * That last part is why the admin page says this next to the button rather than
 * only here. Deleting is the action that makes the object unfindable and
 * undeletable at the same time: after this, removing the file from the bucket
 * means going and finding it by hand. For anything that must genuinely stop
 * being distributed, take the object out of R2 first and delete the row second.
 *
 * Hiding is almost always the better answer, and it is the reason `hidden`
 * exists: the second commitment in the build plan is that things do not
 * disappear.
 */
export async function deleteItem(formData: FormData): Promise<void> {
  if (!(await allowed())) redirect("/admin");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) redirect("/admin?problem=item-missing");

  await db.delete(items).where(eq(items.id, id));

  revalidatePath("/", "layout");
  redirect("/admin?saved=1");
}
