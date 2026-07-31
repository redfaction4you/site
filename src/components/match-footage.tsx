import Image from "next/image";

import {
  type Coverage,
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
 * Deliberately says nothing about whose view the recording is. A match is filmed
 * either from somebody's own screen or from the spectator camera, and which one
 * cannot be told from outside the video. An earlier version asserted it anyway,
 * which is precisely the sort of confident guess the rest of this site refuses
 * to make. Anyone watching finds out in the first few seconds.
 *
 * `labelFor` exists because a night page lists several recordings and "watch"
 * three times over says nothing about which is which. The match page passes
 * nothing, since the reader is already looking at the match.
 */
export function MatchFootageList({
  footage,
  heading,
  labelFor,
  className = "",
}: {
  footage: MatchFootage[];
  heading: string;
  labelFor?: (coverage: Coverage) => string | undefined;
  className?: string;
}) {
  if (footage.length === 0) return null;

  return (
    <section className={className}>
      <h2 className="font-display text-sm font-bold uppercase tracking-widest text-steel-400">
        {heading}
      </h2>

      <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {footage.map(({ video, coverage }) => {
          const label = labelFor?.(coverage);

          return (
            <li key={`${video.youtubeId}-${coverage.sourceMatchId}`}>
              <a
                href={watchUrl(video.youtubeId, coverage.startsAt)}
                target="_blank"
                rel="noreferrer noopener"
                className="group block"
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

                {label ? (
                  <p className="mt-2 font-display text-xs font-semibold uppercase tracking-wider text-steel-200 group-hover:text-rust-300">
                    {label}
                  </p>
                ) : null}
                {video.note ? (
                  <p className="mt-1 text-xs leading-relaxed text-steel-400">
                    {video.note}
                  </p>
                ) : null}
                {coverage.startsAt ? (
                  <p className="mt-0.5 text-xs text-steel-500">Starts partway in</p>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[0.6875rem] leading-relaxed text-steel-600">
        Hosted on YouTube, not here.
      </p>
    </section>
  );
}
