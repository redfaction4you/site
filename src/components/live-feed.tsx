import Link from "next/link";

import type { LiveMatch } from "@/lib/matches/queries";

/**
 * The match as it is being played, from the archive's own event stream.
 *
 * The dedicated server has been pushing in-progress matches the whole time,
 * marked `live`, with every pickup, drop, return and capture, each one carrying
 * a message already written. Nothing on the site read it. The server page had a
 * score from the public browser API, which knows the numbers and none of the
 * story, while the database held the story.
 *
 * **It lags and the page says so.** These events arrive when the server next
 * syncs rather than as they happen, so this is the match up to a few minutes
 * ago while the scoreboard beside it is up to thirty seconds ago. Two clocks on
 * one screen is worth it, because they answer different questions, but a feed
 * that implied it was live to the second would be lying about the one thing it
 * cannot do.
 */

/** `m:ss` on the match clock, which is what every message is stamped with. */
function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * A capture is the only event that changes anything, so it is the only one
 * given weight. Everything else is what led up to one.
 */
function isCapture(eventType: string): boolean {
  return eventType === "flag_capture";
}

export function LiveFeed({ match }: { match: LiveMatch }) {
  if (match.events.length === 0 && match.captures.length === 0) return null;

  // The scoreline as it stood after each capture, built by walking forwards.
  let red = 0;
  let blue = 0;
  const timeline = match.captures.map((event) => {
    if (event.flagOwner === "blue") red += 1;
    else if (event.flagOwner === "red") blue += 1;
    return { event, red, blue };
  });

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-basalt-800 pb-1.5">
        <h2 className="font-display text-sm font-bold text-steel-100">
          How it is going
        </h2>
        <Link
          href={`/matches/${match.archiveDay}/${match.sourceMatchId}`}
          className="font-display text-[0.625rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
        >
          The match page
        </Link>
      </div>

      {timeline.length > 0 ? (
        <div className="mt-3">
          <h3 className="figure-label">Captures</h3>
          <ol className="mt-1.5 space-y-1">
            {[...timeline].reverse().map(({ event, red: r, blue: b }, index) => (
              <li
                key={`${event.elapsedSeconds}-${index}`}
                className="flex items-baseline gap-2 text-xs"
              >
                <span className="w-9 shrink-0 font-mono tabular-nums text-steel-600">
                  {clock(event.elapsedSeconds)}
                </span>
                {/*
                  The flag taken is the other side's, so whoever captured it is
                  the side that did not own it. Stated from the flag rather than
                  from a team field, because the flag is what the event records.
                */}
                <span
                  className={
                    "w-8 shrink-0 font-display text-[0.5625rem] font-bold uppercase tracking-wider " +
                    (event.flagOwner === "blue" ? "text-rust-400" : "text-oxide-400")
                  }
                >
                  {event.flagOwner === "blue" ? "Red" : "Blue"}
                </span>
                <span className="min-w-0 flex-1 truncate text-steel-200">
                  {event.playerName ?? "somebody"}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-steel-400">
                  {r}
                  <span className="text-steel-700">-</span>
                  {b}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="mt-3 text-xs text-steel-500">
          No captures yet this match.
        </p>
      )}

      {match.events.length > 0 ? (
        <div className="mt-5">
          <h3 className="figure-label">Flag action</h3>
          {/*
            The server's own wording, not ours. Every event arrives with a
            message written for the Discord feed, and rewriting them here would
            be a second way of saying the same thing that could drift from the
            first.
          */}
          <ol className="mt-1.5 space-y-0.5">
            {match.events.map((event, index) => (
              <li
                key={`${event.elapsedSeconds}-${index}`}
                className={
                  "text-xs leading-snug " +
                  (isCapture(event.eventType) ? "text-steel-200" : "text-steel-500")
                }
              >
                {event.message}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
