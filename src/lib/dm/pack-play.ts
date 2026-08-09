/**
 * A map pack against what the deathmatch server actually recorded.
 *
 * A pack is a list the site holds; the rotation is what the server ended up
 * running. Those are not the same thing, and the gap is silent by design:
 * `dedi_cfg.cpp` downloads any rotation map it is missing and **skips the ones
 * it cannot get**, logging a line and starting anyway. A ten map pack quietly
 * becomes a three map rotation while this site goes on listing ten.
 *
 * There is no way to ask the server what it kept — the site pushes a pack and
 * the VPS applies it, and nothing comes back. But `dm_rounds` answers the
 * question from the other end: a map in rotation gets played, so a pack entry
 * with no rounds against it, on a pack whose other maps have plenty, is the
 * shape of a map that never arrived.
 *
 * **It is evidence, not proof**, and the wording on the page says so. A pack
 * switched on an hour ago has nothing against anything, so nothing is called
 * missing until the rotation has had the chance to reach every map: at least as
 * many rounds recorded as the pack has maps. Measured against the real one on 9
 * August, the looser rule — anything at all has been played — put a warning on
 * two of three maps off the back of a single round, which is how a check
 * trained somebody to ignore it.
 *
 * Matching is on the **title**, not the filename. `dm_rounds.map_name` holds
 * the map's display name as the server reports it — "Badlands", "Glass House" —
 * and a pack entry carries `dm04.rfl` with the title beside it. Measured on 9
 * August against the one pack on record: two of its three entries matched a
 * recorded name and the filenames matched nothing, because they never appear in
 * the archive at all.
 *
 * Deliberately free of imports so `node --test` can load it directly, the same
 * arrangement `pairings.ts`, `names.ts` and `accuracy.ts` use.
 */

/** What the archive holds about one map. Mirrors `listDmMaps`. */
export type PackPlay = {
  rounds: number;
  secondsPlayed: number;
  kills: number;
  players: number;
  lastPlayed: string | null;
};

/** Just enough of a `MapPackEntry` to look one up. */
export type TitledEntry = {
  filename: string;
  title?: string;
};

export type PackEntryPlay = {
  /** What the server recorded on this map, or null if it has recorded none. */
  play: PackPlay | null;
  /**
   * Nothing recorded here while the rest of the pack has been played.
   *
   * The honest reading is "worth checking", not "broken": somebody could
   * genuinely have rotated past it, and on a busy pack that is unlikely rather
   * than impossible.
   */
  missing: boolean;
};

/**
 * The key both sides are compared on.
 *
 * Case and inner spacing are normalised because one side is typed into a form
 * and the other comes off a game server, and "Glass  House" matching nothing
 * would be a bug nobody could see.
 */
export function playKey(name: string): string {
  return name.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

/**
 * Lines up a pack's entries with the play recorded on each.
 *
 * Returns one result per entry, in the pack's own order, so a caller can render
 * them beside the maps without matching anything itself.
 */
export function packPlay(
  entries: readonly TitledEntry[],
  recorded: ReadonlyMap<string, PackPlay>,
): PackEntryPlay[] {
  const found = entries.map((entry) => {
    /*
     * An entry with no title cannot be looked up and must not be accused.
     *
     * The filename never appears in `dm_rounds`, so treating a missing title as
     * "not played" would flag every such entry the moment one sibling was
     * played. Untitled entries are simply unknown here.
     */
    const title = entry.title?.trim();
    if (!title) return null;
    return recorded.get(playKey(title)) ?? null;
  });

  /*
   * Enough rounds that the rotation could have reached every map.
   *
   * A rotation moves through its list, so with N maps it takes N rounds before
   * a map's absence says anything at all. Below that, silence is just a pack
   * that has only been on for an evening — and a warning shown then is a
   * warning nobody reads by the time it is real.
   */
  const rounds = found.reduce((sum, play) => sum + (play?.rounds ?? 0), 0);
  const enoughPlay = entries.length > 0 && rounds >= entries.length;

  return entries.map((entry, index) => {
    const play = found[index];
    const titled = Boolean(entry.title?.trim());
    return {
      play,
      missing: enoughPlay && titled && (play === null || play.rounds === 0),
    };
  });
}
