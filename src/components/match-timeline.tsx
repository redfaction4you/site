"use client";

import { useEffect, useRef, useState } from "react";

import { CaptureList, type TrackCapture } from "@/components/capture-track";
import type { Carry, Timeline } from "@/lib/matches/timeline";

/**
 * The match as one picture: a clock down the middle, red above it, blue below.
 *
 * The version this replaces was three layers stacked — captures, flag carries,
 * fighting — each of which could be switched on and off. A reader said it was
 * hard to understand, and going back to it with that in mind, it was, for two
 * reasons that had nothing to do with how much was drawn.
 *
 * **It showed two clocks and never said so.** Everything was placed on real
 * time, so the axis ran 0:00 to 17:57, while the list underneath ran on the
 * game's own clock, which restarts at zero for extra time. The golden goal of
 * match 42 was drawn at 17:57 and listed at 7:57. Both are true and nothing on
 * the page connected them, so the reader is left holding one moment with two
 * times on it. The clock is now split into its periods, each labelled and each
 * counting from its own zero, exactly as the game does and as anybody who
 * played it remembers. The widths stay proportional to real time, so the shape
 * of the match is unchanged; only the numbers now agree with each other.
 *
 * **Each layer meant something different by up and by colour.** Captures put
 * the scoring side above or below the line. Fighting did the same. But carries
 * were a lane per *flag*, and the bars in them were drawn in the colour of the
 * side doing the carrying, so the row labelled RED FLAG was full of blue bars.
 * That is correct — the blue team carries the red flag — and it reads as a
 * mistake, which is worse than being one.
 *
 * So there is one rule now and it holds everywhere: **your side, your colour,
 * your half of the picture.** A red mark is something red did. What the bar
 * says is which flag they were carrying, and it says it in words on hover.
 *
 * The layers are gone as switches because merging them was the point rather
 * than a side effect: a carry now ends at the capture it produced, on the same
 * line, and lining the two up used to mean counting pixels. Fighting is the one
 * thing that is still optional, because it is a background wash rather than an
 * event and it competes with everything drawn on top of it.
 *
 * Kept from the version before: the clock at the top, a minute mark behind
 * everything, one mark per event with a floor on its width, every row saying
 * what it is, and client state rather than a URL for the one remaining switch.
 */

/**
 * A period of the match, on its own clock.
 *
 * Extra time is not a shaded region at the end of a longer match, it is a
 * second period that starts at zero, and drawing it the first way is what put
 * the boundary in the wrong place: it used to be pinned to the first event
 * after the restart, which on match 42 was 2:18 after the whistle.
 */
type Period = {
  label: string | null;
  /** Fractions of the whole picture, so widths stay proportional to real time. */
  from: number;
  to: number;
  /** How long this period ran, in seconds. */
  seconds: number;
};

function periodsOf(timeline: Timeline): Period[] {
  const total = timeline.seconds ?? 0;
  if (timeline.overtimeFrom === null) {
    return [{ label: null, from: 0, to: 1, seconds: total }];
  }

  const boundary = timeline.overtimeFrom;
  return [
    { label: "Regulation", from: 0, to: boundary, seconds: Math.round(boundary * total) },
    {
      label: "Extra time",
      from: boundary,
      to: 1,
      seconds: Math.round((1 - boundary) * total),
    },
  ];
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * Where a fraction of the whole picture falls, read on the clock the players saw.
 *
 * This is the function that makes the axis agree with the list: 1.0 on a match
 * that went to extra time is 7:57 of extra time, not 17:57 of anything.
 */
function readingAt(fraction: number, periods: Period[]): string {
  const period =
    periods.find((candidate) => fraction <= candidate.to + 1e-9) ??
    periods[periods.length - 1];
  const span = period.to - period.from;
  const into = span > 0 ? ((fraction - period.from) / span) * period.seconds : 0;
  return `${period.label ? `${period.label.toLowerCase()} ` : ""}${clock(into)}`;
}

/**
 * A faint mark every minute, behind everything, counted from the period's zero.
 *
 * These are not labelled and cannot collide with anything, so they are chosen
 * by the clock alone and drawn on the first paint.
 */
function gridOf(period: Period): number[] {
  if (period.seconds < 90) return [];
  const every = period.seconds > 900 ? 120 : 60;
  const span = period.to - period.from;
  const marks: number[] = [];
  for (let t = every; t < period.seconds - 20; t += every) {
    marks.push(period.from + (t / period.seconds) * span);
  }
  return marks;
}

/** Room for one reading plus air, in pixels. Below this two of them touch. */
const LABEL_ROOM = 56;

/** Clearance a label needs from a period's own zero, and from the next one's. */
const EDGE_ROOM = 40;

/**
 * The labels on the clock, chosen by how much room there is rather than by how
 * long the period ran.
 *
 * Those are different questions and treating them as one is what put nine
 * overlapping readings on a phone: extra time here is eight minutes, which
 * wants a mark a minute on a desktop and has 115 pixels for seven of them at
 * 375 wide. A breakpoint would have been the quick answer and would only have
 * been right at the widths somebody happened to test — this panel is inside a
 * column whose width does not follow the viewport in any simple way.
 *
 * Returns nothing until the track has been measured, which is the first paint.
 * The marks above are already drawn by then, so the clock is never bare.
 */
function labelsOf(period: Period, trackWidth: number): { at: number; label: string }[] {
  const span = period.to - period.from;
  const width = span * trackWidth;
  if (!width || period.seconds < 90) return [];

  const every = [30, 60, 120, 300, 600, 900].find(
    (option) => (option / period.seconds) * width >= LABEL_ROOM,
  );
  if (!every) return [];

  const marks: { at: number; label: string }[] = [];
  for (let t = every; t < period.seconds; t += every) {
    const into = (t / period.seconds) * width;
    // Clear of this period's zero on the left, and of whatever sits at its
    // right hand end: the final time, or the next period's zero.
    if (into < EDGE_ROOM || width - into < EDGE_ROOM) continue;
    marks.push({ at: period.from + (t / period.seconds) * span, label: clock(t) });
  }
  return marks;
}

const ENDINGS: Record<Carry["ending"], string> = {
  captured: "and capped it",
  returned: "then lost it, and the flag went home",
  dropped: "then lost it in the field, where somebody picked it up",
  unfinished: "and was still holding it at the whistle",
};

/**
 * The one rule the picture holds to: your side, your colour, your half.
 *
 * Which flag a side was carrying is said in words on the bar rather than by
 * inverting its colour, which is what the lane-per-flag version did and what
 * made a row labelled RED FLAG come out full of blue bars.
 */
const SIDES = [
  {
    team: "red" as const,
    bar: "bg-rust-500",
    text: "text-rust-300",
    edge: "border-rust-300",
    dot: "bg-rust-500",
    ring: "ring-rust-500/30",
  },
  {
    team: "blue" as const,
    bar: "bg-cobalt-500",
    text: "text-cobalt-300",
    edge: "border-cobalt-300",
    dot: "bg-cobalt-500",
    ring: "ring-cobalt-400/30",
  },
];

export function MatchTimeline({
  timeline,
  captures,
  startedAt,
  endedAt,
  redScore,
  blueScore,
}: {
  timeline: Timeline;
  captures: TrackCapture[];
  startedAt: Date | null;
  endedAt: Date | null;
  redScore: number;
  blueScore: number;
}) {
  const [fighting, setFighting] = useState(false);

  /*
   * How wide the clock actually is, so the labels can be chosen for it.
   *
   * Measured rather than assumed: this panel sits in a column, so its width is
   * not the viewport's and a media query would be answering a different
   * question from the one being asked.
   */
  const track = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    setTrackWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => {
      setTrackWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Without timestamps there is nothing to place: only the order of the
  // captures is known, and the list below says that honestly on its own.
  const drawable = timeline.timed && timeline.captures.length + timeline.carries.length > 0;
  const periods = periodsOf(timeline);
  const busiest = Math.max(
    1,
    ...timeline.frags.map((bucket) => Math.max(bucket.red, bucket.blue)),
  );

  /*
   * Which capture settled it, so the one moment everybody remembers is not
   * drawn exactly like the other five. Only claimed where the last capture
   * belongs to the winning side, since a match can end on a consolation.
   */
  const decidedBy =
    redScore !== blueScore &&
    timeline.captures[timeline.captures.length - 1]?.team ===
      (redScore > blueScore ? "red" : "blue")
      ? timeline.captures.length - 1
      : -1;

  /*
   * Who was ahead, along the middle.
   *
   * The markers say when the flags went in; this says what that meant. The same
   * six captures can be a procession or six lead changes and the dots alone
   * cannot tell you which. Bare while the scores are level.
   */
  const lead = timeline.captures.map((capture, index) => {
    const from = capture.at;
    const to =
      index + 1 < timeline.captures.length ? timeline.captures[index + 1].at : 1;
    return {
      from,
      width: Math.max(0, to - from),
      ahead:
        capture.redScore > capture.blueScore
          ? "red"
          : capture.blueScore > capture.redScore
            ? "blue"
            : "level",
    };
  });

  /** The clock and the period boundary, drawn behind everything. */
  const Grid = () => (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {periods.map((period) =>
        period.label === "Extra time" ? (
          <span
            key="extra"
            className="absolute inset-y-0 bg-oxide-400/[0.05]"
            style={{ left: `${period.from * 100}%`, right: 0 }}
          />
        ) : null,
      )}
      {periods.slice(1).map((period) => (
        <span
          key={`boundary-${period.from}`}
          className="absolute inset-y-0 w-px bg-oxide-400/40"
          style={{ left: `${period.from * 100}%` }}
        />
      ))}
      {periods.flatMap((period) =>
        gridOf(period).map((at) => (
          <span
            key={`${period.from}-${at}`}
            className="absolute inset-y-0 w-px bg-steel-700/20"
            style={{ left: `${at * 100}%` }}
          />
        )),
      )}
    </span>
  );

  /**
   * One side's half of the picture: what they carried and what they scored.
   *
   * `mirror` flips it for the lower half, so both halves read outward from the
   * line rather than one of them upside down.
   */
  const Band = ({ side, mirror }: { side: (typeof SIDES)[number]; mirror: boolean }) => {
    const carries = timeline.carries.filter((carry) => carry.team === side.team);
    const scored = timeline.captures
      .map((capture, index) => ({ capture, index }))
      .filter((entry) => entry.capture.team === side.team);

    return (
      <div className={"relative h-14 " + (mirror ? "" : "flex flex-col justify-end")}>
        {/* The score, at the outer edge, with a hairline down to its mark on
            the line. Both halves read away from the middle. */}
        <div className={"relative h-6 " + (mirror ? "order-2" : "")}>
          {scored.map(({ capture, index }) => (
            <span
              key={`score-${index}`}
              className={
                "absolute flex w-14 flex-col items-center font-mono text-[0.625rem] leading-none tabular-nums " +
                side.text +
                (mirror ? " bottom-0 flex-col-reverse" : " top-0")
              }
              style={{
                left: `${capture.at * 100}%`,
                transform:
                  capture.at > 0.97
                    ? "translateX(-100%)"
                    : capture.at < 0.03
                      ? "translateX(0)"
                      : "translateX(-50%)",
              }}
            >
              <span>
                {capture.redScore}-{capture.blueScore}
              </span>
              <span
                className={
                  "my-1 block w-px flex-1 " +
                  (side.team === "red" ? "bg-rust-500/40" : "bg-cobalt-400/40")
                }
              />
            </span>
          ))}
        </div>

        {/* The carries: one bar per grab, in the colour of whoever ran it. */}
        <div className={"relative h-6 " + (mirror ? "order-1" : "")}>
          {carries.map((carry, index) => (
            <span
              key={index}
              className="absolute inset-y-0"
              style={{
                /*
                 * Held inside the clock at the right hand end.
                 *
                 * A grab in the last second is a real event and it is drawn at
                 * a five pixel floor so it can be seen at all, which puts its
                 * far edge past the whistle. Nothing about the match extends
                 * beyond the whistle, so the bar is pulled back to end on it.
                 */
                left: `min(${carry.from * 100}%, calc(100% - 5px))`,
                width: `${(carry.to - carry.from) * 100}%`,
                minWidth: "5px",
              }}
              title={
                `${carry.carrier ?? "somebody"} carried the ${carry.flagOwner} flag ` +
                `from ${readingAt(carry.from, periods)} for ` +
                `${carry.seconds < 10 ? carry.seconds.toFixed(1) : Math.round(carry.seconds)}s, ` +
                `${ENDINGS[carry.ending]}.`
              }
            >
              <span
                className={
                  "absolute inset-x-0 h-2.5 rounded-sm " +
                  side.bar +
                  (carry.ending === "captured" ? "" : "/30") +
                  (mirror ? " top-1.5" : " bottom-1.5")
                }
              />
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      {drawable ? (
        <>
          {/* The clock, at the top, and its periods. Each counts from its own
              zero because that is the clock the players were reading. */}
          {/*
            The drawing is decoration over the list at the bottom, which carries
            the same match in a form a screen reader can follow. Hidden here
            rather than duplicated into labels, so there is one source of truth
            and no chance of the two drifting apart.
          */}
          <div aria-hidden="true" className="flex items-end gap-2">
            <span className="w-12 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="relative flex h-4">
                {periods.map((period) => (
                  <span
                    key={`name-${period.from}`}
                    className={
                      "overflow-hidden whitespace-nowrap border-l pl-1.5 font-display text-[0.5625rem] uppercase tracking-wider " +
                      (period.label === "Extra time"
                        ? "border-oxide-400/40 text-oxide-400"
                        : "border-basalt-700 text-steel-500")
                    }
                    style={{ width: `${(period.to - period.from) * 100}%` }}
                  >
                    {period.label ?? "Match clock"}
                  </span>
                ))}
              </div>

              <div className="relative h-3.5 font-mono text-[0.625rem] leading-none tabular-nums text-steel-500">
                {periods.map((period) => (
                  <span
                    key={`zero-${period.from}`}
                    className="absolute"
                    style={{ left: `${period.from * 100}%`, paddingLeft: "0.375rem" }}
                  >
                    0:00
                  </span>
                ))}
                {/*
                  As many readings as there is room for, and no more.

                  A period is laid out by how long it ran and labelled by how
                  wide it is drawn, which are different questions: extra time
                  here is eight minutes, wanting a mark a minute on a desktop
                  and having 115 pixels for seven of them on a phone. At 375
                  wide, nine of this match's fourteen readings overlapped their
                  neighbour. `labelsOf` is handed the measured width and thins
                  them until they fit; each period's zero and the final time are
                  always drawn, because they are what the picture is scaled by.
                */}
                {periods.flatMap((period) =>
                  labelsOf(period, trackWidth).map((tick) => (
                    <span
                      key={`label-${period.from}-${tick.label}`}
                      className="absolute -translate-x-1/2"
                      style={{ left: `${tick.at * 100}%` }}
                    >
                      {tick.label}
                    </span>
                  )),
                )}
                <span className="absolute right-0">
                  {clock(periods[periods.length - 1].seconds)}
                </span>
              </div>
            </div>
          </div>

          {/* The picture. One rule holds everywhere in it: your side, your
              colour, your half. */}
          <div
            aria-hidden="true"
            className="mt-1 flex items-stretch gap-2 border-t border-basalt-800 pt-2"
          >
            <div className="flex w-12 shrink-0 flex-col justify-between py-1 text-right font-display text-[0.5625rem] uppercase tracking-wider">
              <span className="text-rust-400">Red</span>
              <span className="text-cobalt-400">Blue</span>
            </div>

            {/* The measured element. The axis above is the same width, being
                the same flex child beside the same gutter. */}
            <div ref={track} className="relative min-w-0 flex-1">
              <Grid />

              {/* Fighting, as a wash behind the events rather than a layer
                  beside them: it is pressure, not a list of moments. */}
              {fighting ? (
                <svg
                  viewBox="0 0 1000 100"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  aria-hidden="true"
                >
                  {(["red", "blue"] as const).map((side) => {
                    const points = timeline.frags.map((bucket, index) => {
                      const x = (index / (timeline.frags.length - 1)) * 1000;
                      const size =
                        ((side === "red" ? bucket.red : bucket.blue) / busiest) * 48;
                      return `${x.toFixed(1)},${(side === "red" ? 50 - size : 50 + size).toFixed(1)}`;
                    });
                    return (
                      <polygon
                        key={side}
                        points={`0,50 ${points.join(" ")} 1000,50`}
                        className={
                          side === "red" ? "fill-rust-500/20" : "fill-cobalt-500/20"
                        }
                      />
                    );
                  })}
                </svg>
              ) : null}

              <div className="relative">
                <Band side={SIDES[0]} mirror={false} />

                {/* The middle: who was ahead, and every flag that went home. */}
                <div className="relative h-3">
                  <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-sm bg-basalt-800">
                    {lead.map((segment, index) =>
                      segment.ahead === "level" ? null : (
                        <span
                          key={index}
                          className={
                            "absolute inset-y-0 " +
                            (segment.ahead === "red"
                              ? "bg-rust-500/70"
                              : "bg-cobalt-500/70")
                          }
                          style={{
                            left: `${segment.from * 100}%`,
                            width: `${segment.width * 100}%`,
                          }}
                        />
                      ),
                    )}
                  </div>

                  {timeline.captures.map((capture, index) => {
                    const side = capture.team === "red" ? SIDES[0] : SIDES[1];
                    return (
                      <span
                        key={`cap-${index}`}
                        className={
                          "absolute top-1/2 shrink-0 -translate-x-1/2 -translate-y-1/2 rotate-45 border " +
                          (index === decidedBy
                            ? "h-3.5 w-3.5 ring-2 "
                            : "h-2.5 w-2.5 ") +
                          side.edge +
                          " " +
                          side.dot +
                          " " +
                          side.ring
                        }
                        style={{
                          // Same reason as the carry bars: a mark centred on
                          // the whistle hangs half of itself past the end of
                          // the clock, and the last capture of a decided match
                          // is always there.
                          left: `clamp(8px, ${capture.at * 100}%, calc(100% - 8px))`,
                        }}
                        title={
                          `${capture.label} capped for ${capture.team} at ` +
                          `${readingAt(capture.at, periods)} · ` +
                          `${capture.redScore}-${capture.blueScore}` +
                          (index === decidedBy ? " · the one that settled it" : "")
                        }
                      />
                    );
                  })}
                </div>

                <Band side={SIDES[1]} mirror />
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-14 text-[0.625rem] text-steel-600">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-6 rounded-sm bg-steel-400" />
              carried and capped
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-6 rounded-sm bg-steel-400/30" />
              carried and lost
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rotate-45 border border-steel-400 bg-steel-500" />
              a flag that went home
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-6 rounded-sm bg-steel-500" />
              who was ahead
            </span>
            <span>Hover anything for who, when and how it ended.</span>
            <button
              type="button"
              onClick={() => setFighting((current) => !current)}
              aria-pressed={fighting}
              title="Frags along the clock, by side, so a surge reads as a surge."
              className={
                "ml-auto rounded-sm border px-2 py-1 font-display text-[0.5625rem] uppercase tracking-wider transition-colors " +
                (fighting
                  ? "border-rust-700 bg-rust-500/10 text-rust-300"
                  : "border-basalt-700 text-steel-500 hover:border-basalt-600 hover:text-steel-300")
              }
            >
              Fighting
            </button>
          </div>
        </>
      ) : null}

      <CaptureList
        captures={captures}
        startedAt={startedAt}
        endedAt={endedAt}
        redScore={redScore}
        blueScore={blueScore}
      />
    </div>
  );
}
