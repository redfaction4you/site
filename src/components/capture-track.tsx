import Link from "next/link";

/**
 * The captures of a match, drawn along the clock.
 *
 * The list this replaces was correct and unreadable as a shape: seven lines of
 * "time, side, name, score" that you had to read in full to learn whether the
 * match was tight or a procession. A capture-the-flag match has one story and it
 * is the order the flags went in, which is a picture rather than a table.
 *
 * Red sits above the line and blue below, so a run by one side reads as a
 * cluster on one edge. The running score travels with the marker, because "who
 * was ahead at that moment" is the question a timeline exists to answer.
 *
 * **Positioned on the wall clock, not the match clock.** `elapsed_seconds`
 * restarts at zero in overtime, so placing markers by it would stack the golden
 * goal on top of the kick-off. `observed_at` is a real instant. Where a match
 * has no timestamps the markers fall back to even spacing, which says the order
 * without claiming a timing the record cannot support.
 */

export type TrackCapture = {
  elapsedSeconds: number;
  team: string;
  redScore: number;
  blueScore: number;
  playerName: string | null;
  observedAt: Date | null;
};

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, "0")}`;
}

/**
 * Where each capture sits along the track, 0 to 1.
 *
 * All or nothing on timestamps, for the same reason the drive reconstruction is:
 * mixing a real instant with a restarted match clock sorts worse than either
 * alone.
 */
function positions(captures: TrackCapture[], startedAt: Date | null, endedAt: Date | null): number[] {
  const stamps = captures.map((capture) => capture.observedAt?.getTime());
  const usable = stamps.every((value): value is number => Number.isFinite(value));

  if (usable && startedAt) {
    const start = startedAt.getTime();
    const end = endedAt?.getTime() ?? Math.max(...stamps as number[]);
    const span = end - start;
    if (span > 0) {
      return (stamps as number[]).map((at) =>
        Math.min(1, Math.max(0, (at - start) / span)),
      );
    }
  }

  // No usable clock: even spacing, which states the order and nothing more.
  return captures.map((_, index) =>
    captures.length === 1 ? 0.5 : index / (captures.length - 1),
  );
}

export function CaptureTrack({
  captures,
  startedAt,
  endedAt,
}: {
  captures: TrackCapture[];
  startedAt: Date | null;
  endedAt: Date | null;
}) {
  if (captures.length === 0) return null;

  const at = positions(captures, startedAt, endedAt);

  /*
   * Which captures happened in extra time.
   *
   * The match clock restarts at zero for overtime, so a golden goal reads as
   * 2:57 and lands after an 8:11 in the same list, which looks like a sorting
   * fault rather than the rule of the game. Detected as the clock going
   * backwards between two captures that are already in chronological order,
   * which is the only thing that can cause it.
   */
  const overtimeFrom = captures.findIndex(
    (capture, index) =>
      index > 0 && capture.elapsedSeconds < captures[index - 1].elapsedSeconds,
  );
  const inOvertime = (index: number) => overtimeFrom !== -1 && index >= overtimeFrom;

  /*
   * The right hand end of the clock.
   *
   * Not the last capture's reading, which on an overtime match is a small
   * number from the second period and made the axis run 0:00 to 2:57 over a
   * thirteen minute game.
   */
  const fullTime =
    startedAt && endedAt
      ? Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
      : Math.max(...captures.map((capture) => capture.elapsedSeconds));

  return (
    <div>
      {/*
        The drawing is decoration over the list below, which carries the same
        information in a form a screen reader can follow. Hiding it here rather
        than duplicating every name into an aria-label keeps one source of truth.
      */}
      <div aria-hidden="true" className="relative mt-4 h-24 select-none">
        {/* The clock itself. */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-basalt-600" />

        {captures.map((capture, index) => {
          const red = capture.team === "red";
          const left = `${at[index] * 100}%`;

          return (
            <div
              key={`${capture.elapsedSeconds}-${index}`}
              className="absolute top-0 h-full"
              style={{ left, transform: "translateX(-50%)" }}
              title={`${inOvertime(index) ? "Overtime " : ""}${clock(
                capture.elapsedSeconds,
              )} · ${capture.team} · ${capture.playerName ?? "unknown"} · ${
                capture.redScore
              }-${capture.blueScore}`}
            >
              <div
                className={
                  "flex h-full w-14 flex-col items-center " +
                  (red ? "justify-start pt-1" : "justify-end pb-1")
                }
              >
                {/* Score first for red, last for blue, so both read outward from
                    the line rather than one of them upside down. */}
                <span
                  className={
                    "font-mono text-[0.625rem] leading-none tabular-nums " +
                    (red ? "text-rust-300" : "text-oxide-300") +
                    (red ? " order-1" : " order-3")
                  }
                >
                  {capture.redScore}-{capture.blueScore}
                </span>
                <span
                  className={
                    "order-2 my-1 block w-px flex-1 " +
                    (red ? "bg-rust-500/50" : "bg-oxide-400/50")
                  }
                />
                <span
                  className={
                    "h-2.5 w-2.5 shrink-0 rotate-45 border " +
                    (red
                      ? "order-3 border-rust-400 bg-rust-500"
                      : "order-1 border-oxide-400 bg-oxide-500")
                  }
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* The ends of the clock, so the spacing means something. */}
      <div aria-hidden="true" className="flex justify-between font-mono text-[0.625rem] tabular-nums text-steel-600">
        <span>0:00</span>
        {overtimeFrom !== -1 ? (
          <span className="text-oxide-400">overtime</span>
        ) : null}
        <span>{clock(fullTime)}</span>
      </div>

      <ol className="mt-4 space-y-1.5 border-t border-basalt-800 pt-3 text-sm">
        {captures.map((capture, index) => (
          <li
            key={`${capture.elapsedSeconds}-${index}-row`}
            className="flex flex-wrap items-baseline gap-x-2.5"
          >
            <span
              className={
                "w-10 shrink-0 font-mono tabular-nums " +
                (inOvertime(index) ? "text-oxide-400" : "text-steel-500")
              }
              title={inOvertime(index) ? "In overtime, on a restarted clock" : undefined}
            >
              {clock(capture.elapsedSeconds)}
            </span>
            <span
              className={
                "w-9 shrink-0 font-display text-[0.625rem] font-semibold uppercase tracking-wider " +
                (capture.team === "red" ? "text-rust-400" : "text-oxide-400")
              }
            >
              {capture.team}
            </span>
            {capture.playerName ? (
              <Link
                href={`/players/${encodeURIComponent(capture.playerName)}`}
                className="text-steel-200 hover:text-rust-300 hover:underline"
              >
                {capture.playerName}
              </Link>
            ) : (
              <span className="text-steel-500">unknown</span>
            )}
            <span className="ml-auto font-mono tabular-nums text-steel-400">
              {capture.redScore}
              <span className="text-steel-600">-</span>
              {capture.blueScore}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
