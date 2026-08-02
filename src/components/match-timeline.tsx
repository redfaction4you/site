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
 * **Every layer is drawn in the same column, including the capture track.** They
 * are laid out as a two column grid, labels then plot, so a moment is at the same
 * place in all of them. It was not: the lanes were inset by their labels and the
 * track spanned the whole panel, so the carry that produced a capture ended
 * visibly to the left of the capture it produced.
 *
 * **A grab is an event, not a short bar.** The first version drew each carry as
 * a bar and nothing else, so the commonest thing in a match, somebody taking the
 * flag off the stand and dying on the spot, was a sliver a pixel or two wide that
 * nobody would notice. Every carry now opens with a mark at the moment of the
 * grab, the same size whether the carry lasted four tenths of a second or four
 * minutes, and closes with a mark saying how it ended. The bar between them is
 * the duration. Read that way a lane says grab, run, outcome rather than only
 * duration.
 *
 * **The ending is a shape, not another colour.** Colour already says which side
 * was carrying, so a capture, a drop in the field and a flag back on its stand
 * have to differ some other way or the lane says one thing twice and the other
 * not at all.
 *
 * **Client state rather than a URL, and deliberately.** Every filter on this site
 * is a link because a filtered list is a thing you send somebody. A layer switch
 * is not: it is how one reader looks at one picture, it changes nothing about
 * what the page is, and routing it through the server would cost a round trip
 * per click on a panel whose whole appeal is that it responds.
 */

/*
 * Three layers, and there were four.
 *
 * Returns had a switch of its own and drew a tick on the lane wherever a flag
 * went home. Every one of those ticks is already the end of a carry, drawn as
 * its ending, so the layer duplicated what was underneath it: on its own it was
 * two nearly empty lanes, and turned on with the carries it added a third kind
 * of thin vertical mark to a lane that already had two. A switch that adds
 * nothing is worse than no switch, because a reader has to try it to find out.
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
    hint:
      "Every grab, how far it got, and how it ended: captured, dropped in the " +
      "field, or returned to its stand.",
  },
  {
    key: "frags",
    label: "Fighting",
    hint: "Frags along the clock, by side, so a surge reads as a surge.",
  },
];

/** Minute marks, so every layer is read against the same clock. */
function gridMarks(seconds: number | null): number[] {
  if (!seconds || seconds < 120) return [];
  // Every two minutes on a normal match, every minute on a short one.
  const step = seconds > 480 ? 120 : 60;
  const marks: number[] = [];
  for (let t = step; t < seconds; t += step) marks.push(t / seconds);
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
  const grid = gridMarks(timeline.seconds);

  /** The clock and the extra time band, drawn behind every lane. */
  const Grid = () => (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {grid.map((at) => (
        <span
          key={at}
          className="absolute inset-y-0 w-px bg-basalt-700/70"
          style={{ left: `${at * 100}%` }}
        />
      ))}
      {timeline.overtimeFrom !== null ? (
        <span
          className="absolute inset-y-0 right-0 bg-oxide-400/[0.08]"
          style={{ left: `${timeline.overtimeFrom * 100}%` }}
        />
      ) : null}
    </span>
  );

  const Lane = ({ flag }: { flag: "red" | "blue" }) => {
    const carries = timeline.carries.filter((carry) => carry.flagOwner === flag);
    if (carries.length === 0) return null;

    // Whoever carries this flag is the other side, always.
    const bar = flag === "red" ? "bg-cobalt-500" : "bg-rust-500";
    const grab = flag === "red" ? "bg-cobalt-300" : "bg-rust-300";

    return (
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-right font-display text-[0.5625rem] uppercase tracking-wider text-steel-600">
          <span className={flag === "red" ? "text-rust-400" : "text-cobalt-400"}>
            {flag}
          </span>{" "}
          flag
        </span>

        <div className="relative h-7 flex-1 rounded-sm bg-basalt-850">
          <Grid />

          {on.carries
            ? carries.map((carry, index) => (
                <span
                  key={index}
                  title={
                    `${carry.carrier ?? "somebody"} grabbed the ${flag} flag at ` +
                    `${clockAt(carry.from, timeline.seconds)}, held it ` +
                    `${carry.seconds < 10 ? carry.seconds.toFixed(1) : Math.round(carry.seconds)}s, ` +
                    `${ENDINGS[carry.ending]}.`
                  }
                >
                  {/* The run. Half strength unless it scored, so pressure that
                      came to nothing still reads as pressure. */}
                  <span
                    className={
                      "absolute top-[10px] h-2 rounded-full " +
                      bar +
                      (carry.ending === "captured" ? "" : "/35")
                    }
                    style={{
                      left: `${carry.from * 100}%`,
                      width: `${Math.max(0.3, (carry.to - carry.from) * 100)}%`,
                    }}
                  />
                  {/*
                    The grab: a dot on the top edge, which nothing else on the
                    lane is. Three kinds of thin vertical mark meaning three
                    different things was a barcode, so only the ending is a
                    vertical now and the grab has its own shape.
                  */}
                  <span
                    className={"absolute top-0.5 h-2 w-2 rounded-full " + grab}
                    style={{ left: `calc(${carry.from * 100}% - 1px)` }}
                  />
                  {/*
                    The flag on the floor, from the drop until it went home.
                    Not part of the carry, and the thing that says whether an
                    attack died at the door or was cleaned up at leisure.
                  */}
                  {carry.returnedAt !== null ? (
                    <span
                      className="absolute top-[13px] h-px bg-steel-500/60"
                      style={{
                        left: `${carry.to * 100}%`,
                        width: `${Math.max(0.2, (carry.returnedAt - carry.to) * 100)}%`,
                      }}
                    />
                  ) : null}

                  {/* And the ending. A capture closes the lane's full height in
                      the carrying side's colour, a flag that went home closes it
                      in steel at the moment it got there, and a flag left in the
                      field closes with nothing, which is what happened. */}
                  {carry.ending === "captured" || carry.returnedAt !== null ? (
                    <span
                      className={
                        "absolute bottom-0 h-4 w-[3px] rounded-sm " +
                        (carry.ending === "captured" ? bar : "bg-steel-400")
                      }
                      style={{
                        left: `calc(${(carry.returnedAt ?? carry.to) * 100}% - 2px)`,
                      }}
                    />
                  ) : null}
                </span>
              ))
            : null}

        </div>
      </div>
    );
  };

  return (
    <div>
      {layered ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
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
      ) : null}

      {layered && on.frags ? (
        <div className="mb-2 flex items-center gap-2">
          <span className="w-14 shrink-0 text-right font-display text-[0.5625rem] uppercase tracking-wider text-steel-600">
            frags
          </span>
          {/*
            One shape rather than forty blocks.

            Bars with gaps between them read as a chart of nothing in
            particular. The question this layer answers is where the fighting
            was, which is a silhouette, so it is two mirrored areas in an SVG
            that stretches with the column: a filled shape can be stretched
            without looking wrong, which is why this one layer is not built the
            same way as the others.
          */}
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
      ) : null}

      {layered && on.carries ? (
        <div className="mb-2 space-y-1">
          <Lane flag="red" />
          <Lane flag="blue" />

          {on.carries ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-16 text-[0.625rem] text-steel-600">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-steel-300" />
                grabbed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-5 rounded-full bg-steel-400" />
                capped
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-5 rounded-full bg-steel-400/35" />
                lost
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-px w-4 bg-steel-500/60" />
                <span className="inline-block h-4 w-[3px] rounded-sm bg-steel-400" />
                on the floor, then home
              </span>
              <span>Hover for who, how long and how it ended.</span>
            </p>
          ) : null}

        </div>
      ) : null}

      {on.captures ? (
        <div className="flex items-start gap-2">
          {/* The same gutter every lane has, so the captures line up with the
              carries that produced them. */}
          <span className="w-14 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
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
      ) : null}

      {/*
        One clock for the whole picture.
        
        Every layer had its own idea of where time was: the lanes carried
        unlabelled gridlines, the capture track carried 0:00 and the final time
        at its own edges, and the two were inset differently. This is the only
        axis now, it sits under whatever is drawn, and it is the same width as
        every plot above it.
      */}
      {layered && (on.captures || on.carries || on.frags) ? (
        <div className="mt-1 flex items-start gap-2">
          <span className="w-14 shrink-0" aria-hidden="true" />
          <div className="relative h-4 min-w-0 flex-1 font-mono text-[0.625rem] tabular-nums text-steel-600">
            <span className="absolute left-0">0:00</span>
            {grid.map((at) => (
              <span
                key={at}
                className="absolute -translate-x-1/2"
                style={{ left: `${at * 100}%` }}
              >
                {clockAt(at, timeline.seconds)}
              </span>
            ))}
            <span className="absolute right-0">
              {clockAt(1, timeline.seconds)}
            </span>
            {timeline.overtimeFrom !== null ? (
              <span
                className="absolute -translate-x-1/2 text-oxide-400"
                style={{
                  left: `${((timeline.overtimeFrom + 1) / 2) * 100}%`,
                  top: "0.9rem",
                }}
              >
                extra time
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {!on.captures && !on.carries && !on.frags ? (
        <p className="py-6 text-center text-xs text-steel-600">
          Every layer is off.
        </p>
      ) : null}
    </div>
  );
}
