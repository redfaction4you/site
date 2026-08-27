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
 * Everything the pub servers run, which is every game here except capture the
 * flag.
 *
 * This set began as "deathmatch, including the team variant", and the comment
 * above it said strictness cost nothing because nothing had ever flowed into
 * the deathmatch endpoint. Both of those stopped being true on 27 August 2026.
 * The Themed server's rotation gained Damage Control maps, one DC round
 * finished at 03:44 Pacific, and because `DC` was not in this set the endpoint
 * refused the entire day. That server's archive went quiet for ninety minutes
 * and `/api/health` went red, over a round nobody played.
 *
 * A mixed rotation was always going to do this. The Themed server runs DM and
 * DC maps in one rotation by design, so "every round is the same game" was
 * never a property a pub day could have.
 *
 * The spellings are the ones Alpine's observer can emit, from its GAME_TYPES
 * map, plus the longhand somebody might type into a config by hand.
 */
const PUB_MODES = new Set([
  "DM",
  "DEATHMATCH",
  "TDM",
  "TEAMDM",
  "TEAMDEATHMATCH",
  "KOTH",
  "KINGOFTHEHILL",
  "DC",
  "DAMAGECONTROL",
  "BAGMAN",
  "BAG",
  "TBAG",
  "TEAMBAGMAN",
]);

/**
 * A game that belongs in the pub record rather than the match archive.
 *
 * Used by the match endpoint to refuse one, which is the direction that has to
 * stay strict: `matches` would accept a night of deathmatch without complaint,
 * the flag counters would simply be zero, and every board on the site would
 * rank frags from a free-for-all against frags from a five-a-side.
 */
export function isPubMode(value: unknown): boolean {
  return PUB_MODES.has(normaliseMode(value));
}

/**
 * Capture the flag, which is the one thing the pub archive must never take.
 *
 * The pub endpoint asks this question instead of asking whether a mode is one
 * it recognises, and the difference is what the outage above was made of.
 * Refusing what is positively wrong costs a misrouted sync. Refusing whatever
 * is not on a list costs a real day of a real server every time somebody adds
 * a map in a game type this file has not been told about, which is a thing
 * that happens without anybody thinking of it as a code change.
 *
 * The asymmetry with the match endpoint is still deliberate and is still the
 * safe direction. CTF is enumerated here because the match server has sent
 * exactly one spelling of it for months, so the list cannot go stale the way
 * the pub list did.
 */
const CTF_MODES = new Set(["CTF", "CAPTURETHEFLAG"]);

export function isCaptureTheFlagMode(value: unknown): boolean {
  return CTF_MODES.has(normaliseMode(value));
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
