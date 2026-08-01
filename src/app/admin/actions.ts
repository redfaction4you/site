"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { adminState, forgetAdmin, rememberAdmin } from "@/lib/admin-key";
import { db } from "@/lib/db";
import { playerIdentities } from "@/lib/db/schema";

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
