"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import { adminState, forgetAdmin, rememberAdmin } from "@/lib/admin-key";
import { db } from "@/lib/db";
import {
  featurePieces,
  mapPacks,
  matchPlayers,
  playerIdentities,
  type MapPackEntry,
} from "@/lib/db/schema";
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
 * — Vercel cannot open a connection to a home server. The consequence worth
 * knowing is that switching a pack on is not instant and is not meant to look
 * instant: the admin page says "the server picks this up within five minutes".
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
