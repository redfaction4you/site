import type { Board, RankedEntry } from "@/lib/matches/leaderboards";

/**
 * Where the field actually sits on one board.
 *
 * A ranked list says who is first and hides the only thing that makes first
 * interesting: whether it was a gap or a photo finish. Accuracy on this archive
 * runs 15.9% to 20.1%, everybody within four points of each other. Frags run 319
 * to 721, more than double. Both render as five descending rows and look like
 * the same story.
 *
 * One dot per player on one axis says it immediately. Clustered means the board
 * is close and the ranking is nearly arbitrary; spread means it is real.
 *
 * Choices worth knowing:
 *
 * **Better is always to the right**, including on fastest capture, where better
 * is a smaller number and the axis therefore runs high to low. Both ends carry
 * their real value, so nothing is hidden by the flip, and a reader who learns
 * the direction once does not have to relearn it per board.
 *
 * **The axis spans the field, not zero.** This is a strip plot, not a bar: no
 * length is being read from a baseline, so there is no truncated-bar deception
 * to guard against, and a zero-based axis would pile every accuracy dot into one
 * illegible clump at the right hand end.
 *
 * **Only the ends are labelled.** A value beside every dot is chaos and goes
 * unread; the exact figure for every player is in the table directly below,
 * which is this chart's table view.
 */
export function StatStrip({
  entries,
  board,
}: {
  entries: RankedEntry[];
  board: Board;
}) {
  // One dot is not a distribution, it is a fact already stated by the table.
  if (entries.length < 2) return null;

  const values = entries.map((entry) => entry.value);
  const best = entries[0];
  const worst = entries[entries.length - 1];
  const high = Math.max(...values);
  const low = Math.min(...values);
  const span = high - low;

  /** 0 at the weak end of the field, 100 at the leader's, whichever way it runs. */
  function position(value: number): number {
    // Everybody level: one clump in the middle is the truth, not a bug.
    if (span === 0) return 50;
    const fraction = (value - low) / span;
    return board.direction === "low" ? (1 - fraction) * 100 : fraction * 100;
  }

  /*
   * Nudged apart vertically where they land on top of each other.
   *
   * Rendering it is what caught this. Fastest capture has one player on 60.8
   * seconds and everybody else between 8.7 and 12.6, so a linear axis puts eight
   * of the nine dots inside the right hand eight percent of the strip and they
   * become one blob with the last one drawn hiding the rest.
   *
   * The axis is not touched, because the x position is the data and squeezing it
   * to make the picture tidier would be the lie. Only the vertical offset moves,
   * which encodes nothing, and a reader can see that two dots nudged apart are at
   * the same place. Deterministic rather than random: the same board draws the
   * same way every request.
   */
  const laidOut = entries.map((entry) => ({ entry, at: position(entry.value) }));
  const rows: number[][] = [[], [], []];
  const offsets = laidOut.map(({ at }) => {
    // A dot is about ten pixels on a strip a few hundred wide, so anything
    // inside a couple of percent is touching.
    const row = rows.findIndex(
      (taken) => !taken.some((other) => Math.abs(other - at) < 2.2),
    );
    const chosen = row === -1 ? 0 : row;
    rows[chosen].push(at);
    return [0, -7, 7][chosen];
  });

  return (
    <figure className="mt-4">
      <div className="relative h-7">
        {/* Solid hairline, one shade off the surface. */}
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-basalt-700"
        />

        {laidOut.map(({ entry, at }, index) => {
          const leads = entry.rank === 1;
          return (
            <span
              key={entry.player.name}
              /* The hit area is the whole square, not the small dot inside it,
                 so a dot in a tight cluster is still reachable. */
              /* The centring translate lives in the inline transform beside the
                 offset, because two transforms cannot both apply. */
              className="absolute top-0 flex h-7 w-6 items-center justify-center"
              style={{
                left: `${at}%`,
                transform: `translateX(-50%) translateY(${offsets[index]}px)`,
              }}
              title={`${entry.player.name}: ${entry.display}`}
            >
              <span
                aria-hidden="true"
                className={
                  "block rounded-full shadow-[0_0_0_2px_var(--color-basalt-950)] " +
                  (leads ? "h-2.5 w-2.5 bg-rust-500" : "h-2 w-2 bg-steel-500")
                }
              />
            </span>
          );
        })}
      </div>

      {/*
        The ends, which are the only labels worth drawing. Named on the right
        because that is the leader and naming them is the one label a reader
        wants without hovering.
      */}
      <figcaption className="mt-0.5 flex items-baseline justify-between gap-4 font-mono text-[0.625rem] tabular-nums text-steel-600">
        <span>
          {worst.display}
          <span className="ml-1.5 font-sans not-italic tracking-normal">
            {entries.length} ranked
          </span>
        </span>
        <span className="text-right">
          <span className="font-sans tracking-normal text-steel-500">
            {best.player.name}
          </span>
          <span className="ml-1.5 text-steel-300">{best.display}</span>
        </span>
      </figcaption>
    </figure>
  );
}
