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
  redScore,
  blueScore,
  showAxis = true,
}: {
  captures: TrackCapture[];
  startedAt: Date | null;
  endedAt: Date | null;
  /** The final score, so the track can end on the result. */
  redScore?: number;
  blueScore?: number;
  /**
   * False when this sits inside the layered timeline, which draws one clock for
   * every layer. Two axes on one picture is two answers to "when", and they
   * were not even in the same place: this one spans the panel and the lanes are
   * inset by their labels, so the same moment sat at two different points.
   */
  showAxis?: boolean;
}) {
  if (captures.length === 0) return null;

  const at = positions(captures, startedAt, endedAt);

  /*
   * Who was ahead, across the whole match.
   *
   * The markers said when the flags went in. This says what that meant, which is
   * the question a timeline is actually for: a match can have the same six
   * captures and be either a procession or six lead changes, and the dots alone
   * cannot tell you which. The ribbon runs from each capture to the next, tinted
   * by whoever was in front over that stretch and left bare while it was level.
   */
  const lead = captures.map((capture, index) => {
    const from = at[index];
    const to = index + 1 < at.length ? at[index + 1] : 1;
    const ahead =
      capture.redScore > capture.blueScore
        ? "red"
        : capture.blueScore > capture.redScore
          ? "blue"
          : "level";
    return { from, width: Math.max(0, to - from), ahead };
  });

  /*
   * The capture that settled it, marked apart from the rest.
   *
   * The winning goal is the one moment everybody remembers and it looked exactly
   * like the other five. Only claimed where the last capture actually belongs to
   * the winning side, since a match can end with a consolation.
   */
  const decidedBy =
    redScore !== undefined &&
    blueScore !== undefined &&
    redScore !== blueScore &&
    captures[captures.length - 1]?.team ===
      (redScore > blueScore ? "red" : "blue")
      ? captures.length - 1
      : -1;

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
        {/* Who was ahead, as a band on the clock. Level stretches stay bare. */}
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-sm bg-basalt-800">
          {lead.map((segment, index) =>
            segment.ahead === "level" ? null : (
              <span
                key={index}
                className={
                  "absolute inset-y-0 " +
                  (segment.ahead === "red" ? "bg-rust-500/70" : "bg-cobalt-500/70")
                }
                style={{
                  left: `${segment.from * 100}%`,
                  width: `${segment.width * 100}%`,
                }}
              />
            ),
          )}
        </div>

        {captures.map((capture, index) => {
          const red = capture.team === "red";
          const left = `${at[index] * 100}%`;

          /*
           * A marker is a 56 pixel column centred on its moment, so one at the
           * whistle hangs half of itself past the end of the track and gave the
           * panel a horizontal scrollbar. The last capture of a match is always
           * at 100%, so this was every match with a decisive final flag.
           *
           * Pulled inside at the edges rather than clamped in place: the marker
           * still points at the right moment, and only its label moves.
           */
          const shift =
            at[index] > 0.97
              ? "translateX(-100%)"
              : at[index] < 0.03
                ? "translateX(0)"
                : "translateX(-50%)";

          return (
            <div
              key={`${capture.elapsedSeconds}-${index}`}
              className="absolute top-0 h-full"
              style={{ left, transform: shift }}
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
                    (red ? "text-rust-300" : "text-cobalt-300") +
                    (red ? " order-1" : " order-3")
                  }
                >
                  {capture.redScore}-{capture.blueScore}
                </span>
                <span
                  className={
                    "order-2 my-1 block w-px flex-1 " +
                    (red ? "bg-rust-500/50" : "bg-cobalt-400/50")
                  }
                />
                {/* The decisive capture is bigger and ringed. It was the one
                    moment everybody remembers and it looked like all the rest. */}
                <span
                  className={
                    "shrink-0 rotate-45 border " +
                    (index === decidedBy ? "h-3.5 w-3.5 ring-2 " : "h-2.5 w-2.5 ") +
                    (red
                      ? "order-3 border-rust-300 bg-rust-500 ring-rust-500/30"
                      : "order-1 border-cobalt-300 bg-cobalt-500 ring-cobalt-400/30")
                  }
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* The ends of the clock, so the spacing means something, and the result
          it arrived at. */}
      <div
        aria-hidden="true"
        className={
          "flex items-baseline justify-between font-mono text-[0.625rem] tabular-nums text-steel-600 " +
          (showAxis ? "" : "hidden")
        }
      >
        <span>0:00</span>
        {overtimeFrom !== -1 ? <span className="text-oxide-400">overtime</span> : null}
        <span className="flex items-baseline gap-2">
          <span>{clock(fullTime)}</span>
          {redScore !== undefined && blueScore !== undefined ? (
            <span className="font-mono text-xs">
              <span className={redScore > blueScore ? "text-rust-300" : "text-steel-600"}>
                {redScore}
              </span>
              <span className="text-steel-700">-</span>
              <span
                className={blueScore > redScore ? "text-cobalt-300" : "text-steel-600"}
              >
                {blueScore}
              </span>
            </span>
          ) : null}
        </span>
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
                (capture.team === "red" ? "text-rust-400" : "text-cobalt-400")
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
            {index === decidedBy ? (
              <span className="font-display text-[0.5625rem] font-bold uppercase tracking-widest text-steel-500">
                decisive
              </span>
            ) : null}
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
