"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { adminState, forgetAdmin, rememberAdmin } from "@/lib/admin-key";
import { db } from "@/lib/db";
import { mapPacks, matchPlayers, playerIdentities, type MapPackEntry } from "@/lib/db/schema";
import { isLevelFilename } from "@/lib/map-packs";
import {
  buildFeatureFacts,
  saveFeature,
  writeFeature,
  type FeatureSubject,
} from "@/lib/ai/feature";
import { activeModel } from "@/lib/ai/generate";

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
  if (!source || !target || source === target) redirect("/admin?problem=1");

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
  if (end === source) redirect("/admin?problem=1");

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

  if (!name || !slug) redirect("/admin?problem=1");

  // Every filename is checked before it is stored. A typo here becomes a map
  // the server cannot load, and the server's answer to that is worse than a
  // rejected form: it drops the entry and the rotation quietly shortens.
  const bad = maps.filter((entry) => !isLevelFilename(entry.filename));
  if (maps.length === 0 || bad.length > 0) redirect("/admin?problem=1");

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

  await db.update(mapPacks).set({ active: false }).where(eq(mapPacks.active, true));
  await db
    .update(mapPacks)
    .set({ active: true, activatedAt: new Date(), updatedAt: new Date() })
    .where(eq(mapPacks.slug, slug));

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
  revalidatePath("/", "layout");
  redirect("/admin?saved=1");
}

export async function deleteMapPack(formData: FormData): Promise<void> {
  if (!(await allowed())) redirect("/admin");
  const slug = String(formData.get("slug") ?? "").trim();
  if (!slug) redirect("/admin?problem=1");
  await db.delete(mapPacks).where(eq(mapPacks.slug, slug));
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

  if (!subject) redirect("/admin?problem=1");

  const facts = await buildFeatureFacts(subject);
  if (!facts) redirect("/admin?problem=1");

  const piece = await writeFeature(facts);
  if (!piece) redirect("/admin?problem=1");

  await saveFeature(piece, facts, activeModel());

  revalidatePath("/", "layout");
  redirect(`/analyst/features/${piece.slug}`);
}
