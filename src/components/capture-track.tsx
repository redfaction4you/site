import Link from "next/link";

/**
 * The captures of a match, as a list, under the picture that draws them.
 *
 * This file used to hold the drawing as well. It does not any more: the picture
 * is one thing now, in `match-timeline.tsx`, with the flags and the fighting on
 * the same clock as the captures. What is left here is the reading a screen
 * reader can follow and anybody can check a number against, which is why the
 * drawing above it is `aria-hidden` rather than duplicated into labels.
 *
 * **The clock restarts in extra time and the list now says where.** Match 42
 * read 1:50, 3:38, 6:53, 9:22, 7:57, which is not a sorting fault and looks
 * exactly like one. A row saying so costs one line and answers it before it is
 * asked.
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

export function CaptureList({
  captures,
  redScore,
  blueScore,
}: {
  captures: TrackCapture[];
  startedAt?: Date | null;
  endedAt?: Date | null;
  /** The final score, so the capture that settled it can be marked. */
  redScore?: number;
  blueScore?: number;
}) {
  if (captures.length === 0) return null;

  /*
   * Where extra time begins, found the same way the picture finds it: the match
   * clock going backwards between two captures that are already in order, which
   * is the only thing that can cause it.
   */
  const overtimeFrom = captures.findIndex(
    (capture, index) =>
      index > 0 && capture.elapsedSeconds < captures[index - 1].elapsedSeconds,
  );

  const decidedBy =
    redScore !== undefined &&
    blueScore !== undefined &&
    redScore !== blueScore &&
    captures[captures.length - 1]?.team === (redScore > blueScore ? "red" : "blue")
      ? captures.length - 1
      : -1;

  return (
    <ol className="mt-4 space-y-1.5 border-t border-basalt-800 pt-3 text-sm">
      {captures.map((capture, index) => (
        <li key={`${capture.elapsedSeconds}-${index}-row`}>
          {index === overtimeFrom ? (
            <p className="mb-1.5 mt-2.5 flex items-center gap-2 font-display text-[0.5625rem] uppercase tracking-widest text-oxide-400">
              Extra time
              <span className="h-px flex-1 bg-oxide-400/20" />
              <span className="font-sans text-[0.625rem] normal-case tracking-normal text-steel-600">
                the clock starts again
              </span>
            </p>
          ) : null}

          <span className="flex flex-wrap items-baseline gap-x-2.5">
            <span
              className={
                "w-10 shrink-0 font-mono tabular-nums " +
                (overtimeFrom !== -1 && index >= overtimeFrom
                  ? "text-oxide-400"
                  : "text-steel-500")
              }
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
          </span>
        </li>
      ))}
    </ol>
  );
}
