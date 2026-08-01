import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * The key on the admin page, and why it is a key rather than a sign-in.
 *
 * Everything else on this site is readable without an account, and adding one
 * sign-in flow would mean an OAuth app, a session store and a login page for a
 * feature used by one person a few times a month. What this needs is a way to
 * say "this browser is the owner's", once.
 *
 * So: visit `/admin?key=...` once on a device. The key is checked, a signed
 * cookie is set, and the URL is replaced so the key does not sit in the address
 * bar or in history. From then on the page opens. A new device means visiting
 * with the key once more.
 *
 * The cookie holds a signature rather than the key, so a copy of it cannot be
 * turned back into the secret. It is httpOnly and sameSite lax, so script on the
 * page cannot read it and another site cannot make the browser use it.
 *
 * Unset means locked. If `RF4U_ADMIN_KEY` is missing the page refuses everyone,
 * including whoever deployed it, which is the right way round: a missing secret
 * should never be an open door.
 */

const COOKIE = "rf4u_admin";

/** A year. Long enough that nobody meets the key twice on the same machine. */
const MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Eight characters, not sixteen.
 *
 * A minimum at all because this is a public endpoint and a four character
 * password is guessable by anybody who finds the page. Low enough that a
 * password somebody actually chose is accepted, since one that has to be stored
 * in a manager to be usable ends up pasted somewhere worse.
 */
const MIN_LENGTH = 8;

function secret(): string | null {
  const value = process.env.RF4U_ADMIN_KEY?.trim();
  return value && value.length >= MIN_LENGTH ? value : null;
}

/** What the cookie should contain for a given secret. */
function signature(key: string): string {
  return createHmac("sha256", key).update("rf4u-admin-v1").digest("hex");
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // Length is compared first because timingSafeEqual throws on a mismatch, and
  // the length of a secret is not the part worth protecting.
  return left.length === right.length && timingSafeEqual(left, right);
}

export type AdminState =
  /** No key is configured, so nobody can get in. */
  | { state: "unconfigured" }
  /** This browser has been unlocked before. */
  | { state: "allowed" }
  /** Not unlocked, and no key offered. */
  | { state: "locked" };

/** Whether this request may see the admin page. */
export async function adminState(offered?: string): Promise<AdminState> {
  const key = secret();
  if (!key) return { state: "unconfigured" };

  if (offered && sameString(offered.trim(), key)) return { state: "allowed" };

  const jar = await cookies();
  const held = jar.get(COOKIE)?.value;
  if (held && sameString(held, signature(key))) return { state: "allowed" };

  return { state: "locked" };
}

/**
 * Remembers this browser, after a correct key.
 *
 * Only callable from a server action or route handler, which is why unlocking
 * is a form post rather than a link: a page render cannot set a cookie.
 */
export async function rememberAdmin(): Promise<boolean> {
  const key = secret();
  if (!key) return false;

  const jar = await cookies();
  jar.set(COOKIE, signature(key), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
  return true;
}

/** Forgets this browser. */
export async function forgetAdmin(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}
