"use client";

import { useState } from "react";

import { CaptureTrack, type TrackCapture } from "@/components/capture-track";
import type { Timeline } from "@/lib/matches/timeline";

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
      "Every journey a flag made, including the ones that failed. A bar runs " +
      "from the pickup to the capture, the drop or the whistle.",
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

  const carriesFor = (flag: string) =>
    timeline.carries.filter((carry) => carry.flagOwner === flag);

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
        <div className="mb-3">
          <p className="figure-label mb-1 text-steel-600">Frags</p>
          {/*
            Two rows meeting at a line, red above and blue below, which is the
            arrangement the capture track already taught the reader. Height is
            share of the busiest moment rather than an absolute, because the
            question is where the fighting was, not how much of it there was.
          */}
          <div className="flex h-10 items-center gap-px" aria-hidden="true">
            {timeline.frags.map((bucket, index) => (
              <span key={index} className="flex h-full flex-1 flex-col justify-center">
                <span
                  className="w-full bg-rust-500/70"
                  style={{ height: `${(bucket.red / busiest) * 50}%` }}
                />
                <span className="h-px w-full bg-basalt-700" />
                <span
                  className="w-full bg-cobalt-500/70"
                  style={{ height: `${(bucket.blue / busiest) * 50}%` }}
                />
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {layered && (on.carries || on.returns) ? (
        <div className="mb-3 space-y-1.5">
          {(["red", "blue"] as const).map((flag) => {
            const carries = carriesFor(flag);
            const returns = timeline.returns.filter(
              (mark) => (flag === "red" ? mark.team === "blue" : mark.team === "red"),
            );
            if (carries.length === 0 && returns.length === 0) return null;

            return (
              <div key={flag}>
                <p className="figure-label mb-0.5 text-steel-600">
                  <span className={flag === "red" ? "text-rust-400" : "text-cobalt-400"}>
                    {flag}
                  </span>{" "}
                  flag
                </p>
                <div className="relative h-4 rounded-sm bg-basalt-800">
                  {on.carries
                    ? carries.map((carry, index) => (
                        <span
                          key={index}
                          title={`${carry.carrier ?? "somebody"} carried the ${flag} flag for ${carry.seconds}s, ${
                            carry.ending === "captured"
                              ? "and capped"
                              : carry.ending === "dropped"
                                ? "and lost it"
                                : "and was still holding it at the whistle"
                          }`}
                          className={
                            "absolute inset-y-0 rounded-sm " +
                            (carry.team === "red" ? "bg-rust-500" : "bg-cobalt-500") +
                            // A carry that scored is solid; one that did not is
                            // the same bar at half strength, so the picture says
                            // which pressure came to something without needing a
                            // key to read it.
                            (carry.ending === "captured" ? "" : "/40")
                          }
                          style={{
                            left: `${carry.from * 100}%`,
                            width: `${Math.max(0.6, (carry.to - carry.from) * 100)}%`,
                          }}
                        />
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
                          className="absolute inset-y-0 w-px bg-steel-300"
                          style={{ left: `${mark.at * 100}%` }}
                        />
                      ))
                    : null}
                </div>
              </div>
            );
          })}

          {on.carries ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.625rem] text-steel-600">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-4 rounded-sm bg-steel-400" />
                carried and capped
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-4 rounded-sm bg-steel-400/40" />
                carried and lost
              </span>
              <span>Hover a bar for who, how long, and how it ended.</span>
            </p>
          ) : null}

          {on.returns ? (
            <p className="text-[0.625rem] leading-snug text-steel-600">
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
