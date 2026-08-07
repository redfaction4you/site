/**
 * Which game a payload is describing, decided in one place.
 *
 * There are two ingest endpoints now and one broadcaster program feeding both,
 * configured by an environment file on the VPS. The thing that can go wrong is
 * therefore not a bug in either endpoint, it is a URL in the wrong `.env`: the
 * deathmatch server's sync pointed at the CTF endpoint, or the reverse.
 *
 * That is the exact failure the separate tables were chosen to prevent, and
 * separate tables alone do not prevent it. `matches` would happily accept a
 * night of deathmatch — the columns all exist, the flag counters would simply
 * be zero — and every board on the site would then rank frags from a
 * free-for-all against frags from a five-a-side. Nothing would look broken.
 *
 * So each endpoint states which game it is for and refuses the other. A refusal
 * costs nothing: the broadcaster keeps its own SQLite and re-sends the last few
 * days on every sync, so a day rejected at four in the morning lands intact
 * once the URL is corrected.
 *
 * Deliberately free of imports so `node --test` can load it directly.
 */

/**
 * Uppercase letters only, so spelling and punctuation cannot decide a game.
 *
 * The match server sends `"ctf"` today and the sanitizer uppercases it. What
 * the deathmatch server will send is not known here — `DM`, `Deathmatch` and
 * `Team DM` are all plausible from the same engine — and a mode that arrives
 * with a space in it must not be read as a different game from the same word
 * without one.
 */
export function normaliseMode(value: unknown): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

/**
 * Deathmatch, including the team variant.
 *
 * Only one of the two games is enumerated, which is deliberate. Both endpoints
 * ask about deathmatch and neither asks what capture the flag looks like,
 * because the two questions are not equally safe to get wrong:
 *
 * - The deathmatch endpoint requires a mode in this set. Nothing has ever
 *   flowed into it, so strictness costs nothing and a payload that will not say
 *   which game it is should not be believed.
 * - The match endpoint refuses a mode in this set and accepts everything else,
 *   including modes nobody here has heard of. It has months of working history
 *   behind it and `mode` is not in the documented contract, so refusing
 *   anything unrecognised would break a real sync to defend against a
 *   hypothetical payload.
 *
 * Team deathmatch is in this set on purpose. It has sides, so it is not quite
 * the free-for-all the DM record is written for, but it is scored on frags and
 * it belongs nowhere near a board built on flags. If the rotation includes one,
 * the cumulative record is still the right description of it.
 */
const DM_MODES = new Set(["DM", "DEATHMATCH", "TDM", "TEAMDM", "TEAMDEATHMATCH"]);

export function isDeathmatchMode(value: unknown): boolean {
  return DM_MODES.has(normaliseMode(value));
}

/**
 * What the modes in a payload were, for a rejection somebody can act on.
 *
 * An endpoint that answers "wrong game" and does not say which game it was
 * handed leaves the person on the VPS guessing between a misrouted sync and a
 * mode this file has never heard of. Both are one-line fixes and they are
 * different lines.
 */
export function describeModes(modes: Iterable<unknown>): string {
  const seen = [...new Set([...modes].map((mode) => normaliseMode(mode) || "(blank)"))];
  return seen.length ? seen.join(", ") : "(none)";
}
