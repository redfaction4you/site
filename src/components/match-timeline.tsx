"use client";

import { useState } from "react";

import { CaptureTrack, type TrackCapture } from "@/components/capture-track";
import type { Carry, Timeline } from "@/lib/matches/timeline";

/**
 * The match as layers on one clock.
 *
 * The capture track answers what the scoreboard already knows: who scored and
 * when. Everything that made those captures possible was in the archive and on
 * no page. A flag carried the length of the map and dropped at the door is the
 * moment people remember, and it left no mark anywhere.
 *
 * So the flags and the fighting are layers over the same clock, and each one can
 * be turned off. That is not a preference toggle: they answer different
 * questions, and drawn together they are a mess. Captures say who won, carries
 * say who was pressing and who stopped them, frags say where the match was
 * actually being fought.
 *
 * Four things a reader said about the first two versions, all of them right:
 *
 * **The clock belongs at the top.** It was underneath three layers, which is
 * where the eye arrives last and the wrong place for the thing every row is
 * measured against.
 *
 * **A minute mark behind everything, including the captures.** Lining a carry up
 * with the capture it produced meant counting pixels: the lanes had gridlines
 * and the capture track had none.
 *
 * **One mark per event.** A grab was a dot, an ending a vertical, a returned
 * flag a hairline, and a return also had a layer of its own. That is four things
 * to learn before a row says anything. A carry is one bar now, with a floor on
 * its width so that a flag lost in half a second is still visible, and the only
 * extra mark is where a run ended in a capture.
 *
 * **Every row says what it is.** The layers had switches and no headings, so a
 * reader who turned one on got a row of shapes and no idea what they meant.
 *
 * **Client state rather than a URL, and deliberately.** Every filter on this site
 * is a link because a filtered list is a thing you send somebody. A layer switch
 * is not: it is how one reader looks at one picture, it changes nothing about
 * what the page is, and routing it through the server would cost a round trip
 * per click on a panel whose whole appeal is that it responds.
 */

type Layer = "captures" | "carries" | "frags";

const LAYERS: { key: Layer; label: string; hint: string }[] = [
  {
    key: "captures",
    label: "Captures",
    hint: "Every flag that went home, and the score it made.",
  },
  {
    key: "carries",
    label: "Flag carries",
    hint: "Every grab, how long it was held, and whether it scored.",
  },
  {
    key: "frags",
    label: "Fighting",
    hint: "Frags along the clock, by side, so a surge reads as a surge.",
  },
];

/**
 * A mark every minute, which is the unit anybody watching a match counts in.
 *
 * All of them are drawn faintly behind every layer. The axis labels every second
 * one on a full length match, where twelve labels in a row would be a smear, and
 * every one on a short match where there is room.
 */
function minuteMarks(seconds: number | null): { minute: number; at: number }[] {
  if (!seconds || seconds < 90) return [];
  const marks: { minute: number; at: number }[] = [];
  // Stops short of the end so the last mark cannot collide with the final time.
  for (let t = 60; t < seconds - 20; t += 60) {
    marks.push({ minute: Math.round(t / 60), at: t / seconds });
  }
  return marks;
}

/** The match clock at a fraction of the way through, for a tooltip. */
function clockAt(fraction: number, seconds: number | null): string {
  if (!seconds) return "";
  const at = Math.round(fraction * seconds);
  return `${Math.floor(at / 60)}:${String(at % 60).padStart(2, "0")}`;
}

const ENDINGS: Record<Carry["ending"], string> = {
  captured: "then capped it",
  returned: "then lost it, and the flag went home",
  dropped: "then lost it in the field, where somebody picked it up",
  unfinished: "and was still holding it at the whistle",
};

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
  const [on, setOn] = useState<Record<Layer, boolean>>({
    captures: true,
    carries: true,
    frags: false,
  });

  const toggle = (layer: Layer) =>
    setOn((current) => ({ ...current, [layer]: !current[layer] }));

  // Without timestamps there is nothing to layer: only the order of the
  // captures is known, and the track already says that honestly.
  const layered = timeline.timed;
  const busiest = Math.max(
    1,
    ...timeline.frags.map((bucket) => Math.max(bucket.red, bucket.blue)),
  );
  const minutes = minuteMarks(timeline.seconds);
  const every = timeline.seconds && timeline.seconds > 480 ? 2 : 1;

  /** The clock, drawn behind every layer including the captures. */
  const Grid = () => (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {timeline.overtimeFrom !== null ? (
        <span
          className="absolute inset-y-0 right-0 bg-oxide-400/[0.07]"
          style={{ left: `${timeline.overtimeFrom * 100}%` }}
        />
      ) : null}
      {minutes.map((mark) => (
        <span
          key={mark.minute}
          className={
            "absolute inset-y-0 w-px " +
            (mark.minute % every === 0 ? "bg-steel-700/25" : "bg-steel-700/[0.12]")
          }
          style={{ left: `${mark.at * 100}%` }}
        />
      ))}
    </span>
  );

  /** A layer, with a heading, so nobody has to guess what a row of shapes is. */
  const Row = ({
    title,
    note,
    children,
  }: {
    title: string;
    note: string;
    children: React.ReactNode;
  }) => (
    <div className="mt-3">
      <p className="figure-label mb-1 text-steel-500">
        {title}
        <span className="ml-2 font-sans text-[0.625rem] normal-case tracking-normal text-steel-600">
          {note}
        </span>
      </p>
      {children}
    </div>
  );

  const Lane = ({ flag }: { flag: "red" | "blue" }) => {
    const carries = timeline.carries.filter((carry) => carry.flagOwner === flag);
    if (carries.length === 0) return null;

    // Whoever carries this flag is the other side, always.
    const bar = flag === "red" ? "bg-cobalt-500" : "bg-rust-500";

    return (
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-right font-display text-[0.5625rem] uppercase tracking-wider text-steel-600">
          <span className={flag === "red" ? "text-rust-400" : "text-cobalt-400"}>
            {flag}
          </span>{" "}
          flag
        </span>

        <div className="relative h-6 flex-1 rounded-sm bg-basalt-850">
          <Grid />

          {carries.map((carry, index) => (
            <span
              key={index}
              title={
                `${carry.carrier ?? "somebody"} grabbed the ${flag} flag at ` +
                `${clockAt(carry.from, timeline.seconds)}, held it ` +
                `${carry.seconds < 10 ? carry.seconds.toFixed(1) : Math.round(carry.seconds)}s, ` +
                `${ENDINGS[carry.ending]}.`
              }
            >
              {/*
                One bar for one grab, and nothing else.

                A bar already begins where the flag was taken, so the dot that
                used to mark that was saying it twice. What it needed instead was
                a floor on its width, so a grab lost in half a second is still
                something a reader can see and point at.
              */}
              <span
                className={
                  "absolute top-1.5 h-3 min-w-[5px] rounded-sm " +
                  bar +
                  (carry.ending === "captured" ? "" : "/35")
                }
                style={{
                  left: `${carry.from * 100}%`,
                  width: `${(carry.to - carry.from) * 100}%`,
                }}
              />
              {/* The one extra mark worth keeping: where a run ended in a
                  capture, which is the only ending the reader is looking for. */}
              {carry.ending === "captured" ? (
                <span
                  className={"absolute top-0 h-full w-[3px] rounded-sm " + bar}
                  style={{ left: `calc(${carry.to * 100}% - 1px)` }}
                />
              ) : null}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {LAYERS.map((layer) => (
          <button
            key={layer.key}
            type="button"
            onClick={() => toggle(layer.key)}
            aria-pressed={on[layer.key]}
            title={layer.hint}
            className={
              "rounded-sm border px-2 py-1 font-display text-[0.5625rem] uppercase tracking-wider transition-colors " +
              (on[layer.key]
                ? "border-rust-700 bg-rust-500/10 text-rust-300"
                : "border-basalt-700 text-steel-500 hover:border-basalt-600 hover:text-steel-300")
            }
          >
            {layer.label}
          </button>
        ))}
      </div>

      {/* The clock, at the top, where the thing every row is measured against
          belongs. */}
      {layered ? (
        <div className="flex items-end gap-2 border-b border-basalt-800 pb-1">
          <span className="w-14 shrink-0" aria-hidden="true" />
          <div className="relative h-3.5 min-w-0 flex-1 font-mono text-[0.625rem] leading-none tabular-nums text-steel-500">
            <span className="absolute left-0">0:00</span>
            {minutes
              .filter((mark) => mark.minute % every === 0)
              .map((mark) => (
                <span
                  key={mark.minute}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${mark.at * 100}%` }}
                >
                  {mark.minute}:00
                </span>
              ))}
            <span className="absolute right-0">{clockAt(1, timeline.seconds)}</span>
            {timeline.overtimeFrom !== null ? (
              <span
                className="absolute -translate-x-1/2 text-oxide-400"
                style={{ left: `${((timeline.overtimeFrom + 1) / 2) * 100}%` }}
              >
                extra time
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {layered && on.frags ? (
        <Row title="Fighting" note="frags by side, red above the line and blue below">
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0" aria-hidden="true" />
            <div className="relative h-10 flex-1">
              <Grid />
              <svg
                viewBox="0 0 1000 100"
                preserveAspectRatio="none"
                className="h-full w-full"
                aria-hidden="true"
              >
                {(["red", "blue"] as const).map((side) => {
                  const points = timeline.frags.map((bucket, index) => {
                    const x = (index / (timeline.frags.length - 1)) * 1000;
                    const size =
                      ((side === "red" ? bucket.red : bucket.blue) / busiest) * 46;
                    const y = side === "red" ? 50 - size : 50 + size;
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  });
                  return (
                    <polygon
                      key={side}
                      points={`0,50 ${points.join(" ")} 1000,50`}
                      className={
                        side === "red" ? "fill-rust-500/60" : "fill-cobalt-500/60"
                      }
                    />
                  );
                })}
                <line
                  x1="0"
                  y1="50"
                  x2="1000"
                  y2="50"
                  className="stroke-basalt-700"
                  strokeWidth="1"
                />
              </svg>
            </div>
          </div>
        </Row>
      ) : null}

      {layered && on.carries ? (
        <Row
          title="Flag carries"
          note="every grab: how long it was held, and whether it scored"
        >
          <div className="space-y-1">
            <Lane flag="red" />
            <Lane flag="blue" />
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-16 text-[0.625rem] text-steel-600">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-6 rounded-sm bg-steel-400" />
                carried and capped
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-6 rounded-sm bg-steel-400/35" />
                carried and lost
              </span>
              <span>Hover for who, how long and how it ended.</span>
            </p>
          </div>
        </Row>
      ) : null}

      {on.captures ? (
        <Row title="Captures" note="the flags that went home, and the score they made">
          <div className="flex items-start gap-2">
            {/* The same gutter every lane has, so a capture sits directly under
                the carry that produced it. */}
            <span className="w-14 shrink-0" aria-hidden="true" />
            <div className="relative min-w-0 flex-1">
              {layered ? <Grid /> : null}
              <CaptureTrack
                captures={captures}
                startedAt={startedAt}
                endedAt={endedAt}
                redScore={redScore}
                blueScore={blueScore}
                showAxis={!layered}
              />
            </div>
          </div>
        </Row>
      ) : null}

      {!on.captures && !on.carries && !on.frags ? (
        <p className="py-6 text-center text-xs text-steel-600">
          Every layer is off.
        </p>
      ) : null}
    </div>
  );
}
