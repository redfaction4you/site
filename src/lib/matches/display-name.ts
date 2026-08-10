/**
 * Whether a name may be pinned to somebody, and why not.
 *
 * The admin page renames people, and until 9 August it accepted any forty
 * characters. That is a trap, because **a player page is reached by name**:
 * `getPlayer` filters on `playedBy(name)`, which selects the identities with a
 * `match_players` row carrying that name, and the page calls `notFound()` when
 * nothing comes back. So renaming somebody to a name they never played under
 * gives them a name on every board, a link from every scoreboard, and a **404
 * at the end of all of them**. Nothing warned about it and nothing checked.
 *
 * Two rules follow, and both are about the URL rather than about taste:
 *
 * - The name has to be one this person actually played under, or their page
 *   cannot be found by it.
 * - It must not be a name somebody else played under, or their page finds two
 *   identities and shows whichever the database returned first. `cowboy dan` is
 *   the live example: `$t!nX` used it on 6 August and `Skuldug` on 7 August, so
 *   it is a legal name for neither of them.
 *
 * Clearing a name is always allowed: that goes back to the most used one, which
 * is by definition on record.
 *
 * Deliberately free of imports so `node --test` can load it directly, the same
 * arrangement `pairings.ts`, `names.ts` and `accuracy.ts` use.
 */

/** One name, and the identity that played under it. */
export type UsedName = { key: string; name: string };

export type NameVerdict =
  /** Theirs, and only theirs. */
  | "ok"
  /** Nobody has played under it, so their page would 404. */
  | "not-on-record"
  /** Somebody else has played under it too, so the page is ambiguous. */
  | "ambiguous";

function fold(name: string): string {
  return name.trim().toLocaleLowerCase("en-US");
}

/**
 * Whether `offered` can be pinned to `identityKey`.
 *
 * `used` is every (identity, name) pair on record. It is passed in rather than
 * queried so this stays testable and so the caller can fetch it once.
 */
export function checkDisplayName(
  offered: string,
  identityKey: string,
  used: readonly UsedName[],
): NameVerdict {
  const wanted = fold(offered);
  if (!wanted) return "ok";

  const owners = new Set<string>();
  for (const row of used) {
    if (fold(row.name) === wanted) owners.add(row.key);
  }

  if (owners.size === 0) return "not-on-record";
  // Their own key among others is still ambiguous: the page would have to pick.
  if (owners.size > 1 || !owners.has(identityKey)) return "ambiguous";
  return "ok";
}

/**
 * Display names that more than one person answers to.
 *
 * The admin page shows this as a warning rather than refusing anything, because
 * it can arise without anybody typing a name at all: `DISPLAY_NAME` falls back
 * to the most used name, and two people who have both only ever played as
 * `Default` collide with nothing pinned. It is worth seeing, because everything
 * that finds a person by name — a player page, a rank, a link on a scoreboard —
 * has to pick one of them.
 */
export function collidingNames(
  people: readonly { identityKey: string; displayName: string }[],
): string[] {
  const seen = new Map<string, number>();
  for (const person of people) {
    const key = fold(person.displayName);
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }

  return people
    .filter((person) => (seen.get(fold(person.displayName)) ?? 0) > 1)
    .map((person) => person.displayName)
    .filter((name, index, all) => all.indexOf(name) === index)
    .sort();
}
