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
 * So the flags, the returns and the fighting are layers over the same clock, and
 * each one can be turned off. That is not a preference toggle: they answer
 * different questions, and drawn together they are a mess. Captures say who won,
 * carries say who was pressing, returns say who was holding, frags say where the
 * match was actually being fought.
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

type Layer = "captures" | "carries" | "returns" | "frags";

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
    key: "returns",
    label: "Returns",
    hint:
      "Where a flag was brought home. The game does not name the returner, so " +
      "the archive infers one and marks it.",
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
    returns: false,
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
    const returns = timeline.returns.filter((mark) =>
      flag === "red" ? mark.team === "blue" : mark.team === "red",
    );
    if (carries.length === 0 && returns.length === 0) return null;

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

        <div className="relative h-5 flex-1 rounded-sm bg-basalt-850">
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
                      "absolute top-[7px] h-1.5 rounded-full " +
                      bar +
                      (carry.ending === "captured" ? "" : "/35")
                    }
                    style={{
                      left: `${carry.from * 100}%`,
                      width: `${Math.max(0.3, (carry.to - carry.from) * 100)}%`,
                    }}
                  />
                  {/* The grab, the same size however long the carry lasted. */}
                  <span
                    className={"absolute top-1 h-3 w-[3px] rounded-sm " + grab}
                    style={{ left: `${carry.from * 100}%` }}
                  />
                  {/*
                    The flag on the floor, from the drop until it went home.
                    Not part of the carry, and the thing that says whether an
                    attack died at the door or was cleaned up at leisure.
                  */}
                  {carry.returnedAt !== null ? (
                    <span
                      className="absolute top-[9px] h-px bg-steel-500/60"
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
                        "absolute top-0 h-full w-[3px] rounded-sm " +
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

          {on.returns
            ? returns.map((mark, index) => (
                <span
                  key={`r${index}`}
                  title={
                    mark.inferred
                      ? "Flag returned. The game does not name the returner, so this is inferred."
                      : "Flag returned."
                  }
                  className="absolute -top-1 h-7 w-px bg-steel-400/70"
                  style={{ left: `${mark.at * 100}%` }}
                />
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

      {layered && (on.carries || on.returns) ? (
        <div className="mb-2 space-y-1">
          <Lane flag="red" />
          <Lane flag="blue" />

          {on.carries ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-16 text-[0.625rem] text-steel-600">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-[3px] rounded-sm bg-steel-300" />
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
                <span className="inline-block h-3 w-[3px] rounded-sm bg-steel-400" />
                on the floor, then home
              </span>
              <span>Hover for who, how long and how it ended.</span>
            </p>
          ) : null}

          {on.returns ? (
            <p className="pl-16 text-[0.625rem] leading-snug text-steel-600">
              Returns are inferred: the game does not say who brought a flag
              back, so the archive credits the player who was uniquely closest to
              it and marks the figure as inferred everywhere it appears.
            </p>
          ) : null}
        </div>
      ) : null}

      {on.captures ? (
        <CaptureTrack
          captures={captures}
          startedAt={startedAt}
          endedAt={endedAt}
          redScore={redScore}
          blueScore={blueScore}
        />
      ) : null}

      {!on.captures && !on.carries && !on.returns && !on.frags ? (
        <p className="py-6 text-center text-xs text-steel-600">
          Every layer is off.
        </p>
      ) : null}
    </div>
  );
}
