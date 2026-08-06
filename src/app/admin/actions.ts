"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { adminState, forgetAdmin, rememberAdmin } from "@/lib/admin-key";
import { db } from "@/lib/db";
import { matchPlayers, playerIdentities } from "@/lib/db/schema";

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
