import Image from "next/image";

import {
  PERSPECTIVE_LABEL,
  PERSPECTIVE_NOTE,
  type MatchFootage,
  thumbnailUrl,
  watchUrl,
} from "@/lib/match-videos";

/**
 * Recordings of a match, or of a night.
 *
 * Links out with a thumbnail rather than embedding a player, which is the same
 * choice the video archive makes. An embed loads YouTube on every match page
 * whether anybody watches or not, and this site does not otherwise hand a
 * reader's visit to a third party for furniture they did not ask for.
 *
 * Whose view it is sits on the card rather than in a footnote. Player footage is
 * one person's game and spectator footage follows the action, and somebody
 * choosing what to watch wants that before they click, not after.
 */
export function MatchFootageList({
  footage,
  heading,
  className = "",
}: {
  footage: MatchFootage[];
  heading: string;
  className?: string;
}) {
  if (footage.length === 0) return null;

  return (
    <section className={className}>
      <h2 className="font-display text-sm font-bold uppercase tracking-widest text-steel-400">
        {heading}
      </h2>

      <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {footage.map(({ video, coverage }) => (
          <li key={`${video.youtubeId}-${coverage.sourceMatchId}`}>
            <a
              href={watchUrl(video.youtubeId, coverage.startsAt)}
              target="_blank"
              rel="noreferrer noopener"
              className="group block"
              title={PERSPECTIVE_NOTE[video.perspective]}
            >
              <div className="relative aspect-video overflow-hidden rounded-sm border border-basalt-700 bg-basalt-850">
                <Image
                  src={thumbnailUrl(video.youtubeId)}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <span
                  className="absolute inset-0 flex items-center justify-center bg-basalt-950/35 opacity-0 transition-opacity group-hover:opacity-100"
                  aria-hidden="true"
                >
                  <span className="rounded-full bg-rust-500 px-4 py-2 font-display text-xs font-semibold uppercase tracking-widest text-steel-100">
                    Watch
                  </span>
                </span>
              </div>

              <p className="mt-2 font-display text-xs font-semibold uppercase tracking-wider text-steel-200 group-hover:text-rust-300">
                {PERSPECTIVE_LABEL[video.perspective]}
              </p>
              <p className="mt-0.5 text-xs text-steel-500">
                {video.perspective === "player"
                  ? `${video.recordedBy}'s screen`
                  : `Recorded by ${video.recordedBy}`}
                {coverage.startsAt ? " · starts partway in" : ""}
              </p>
              {video.note ? (
                <p className="mt-1 text-xs leading-relaxed text-steel-400">{video.note}</p>
              ) : null}
            </a>
          </li>
        ))}
      </ul>

      {/*
        Said once under the list rather than on every card. The distinction
        matters most for player footage, where a viewer could otherwise take a
        recording of one person's game as a record of the whole match.
      */}
      <p className="mt-3 text-[0.6875rem] leading-relaxed text-steel-600">
        {footage.some((f) => f.video.perspective === "player")
          ? PERSPECTIVE_NOTE.player
          : PERSPECTIVE_NOTE.spectator}{" "}
        Hosted on YouTube, not here.
      </p>
    </section>
  );
}
