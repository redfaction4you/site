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
/**
 * A night's footage, as a card beside the results.
 *
 * A recording of a match was only discoverable by opening the match, or by
 * scrolling past the whole night to the bottom of the write-up. If somebody
 * filmed even one game, that is the most valuable thing on the page and it was
 * the hardest thing to find on it.
 *
 * It sits in the rail, which was a column with three date chips in it and four
 * hundred pixels of nothing underneath. Every sports site puts video exactly
 * here for the same reason: it is the space beside the scores, and video is the
 * one thing a scoreboard cannot be.
 *
 * `labelFor` names which match each recording is, the same as the list below.
 */
export function NightFootageCard({
  footage,
  labelFor,
  className = "",
}: {
  footage: MatchFootage[];
  labelFor?: (coverage: Coverage) => string | undefined;
  className?: string;
}) {
  if (footage.length === 0) return null;

  const [lead, ...rest] = footage;
  const leadLabel = labelFor?.(lead.coverage);

  return (
    <section className={className}>
      <h2 className="rule-heading">
        {footage.length === 1 ? "Footage" : `Footage · ${footage.length}`}
      </h2>

      <a
        href={watchUrl(lead.video.youtubeId, lead.coverage.startsAt)}
        target="_blank"
        rel="noreferrer noopener"
        className="group mt-2 block"
      >
        <div className="relative aspect-video overflow-hidden rounded-sm border border-basalt-700 bg-basalt-850">
          <Image
            src={thumbnailUrl(lead.video.youtubeId)}
            alt=""
            fill
            sizes="272px"
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <span
            className="absolute inset-0 flex items-center justify-center bg-basalt-950/30"
            aria-hidden="true"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rust-500/90 transition-colors group-hover:bg-rust-500">
              <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 fill-steel-100">
                <path d="M2.2 1.5a.6.6 0 0 1 .92-.5l6.6 4.5a.6.6 0 0 1 0 1l-6.6 4.5a.6.6 0 0 1-.92-.5Z" />
              </svg>
            </span>
          </span>
        </div>

        <p className="mt-1.5 text-xs text-steel-300 group-hover:text-rust-300">
          Watch{leadLabel ? `: ${leadLabel}` : " this night"}
        </p>
      </a>

      {rest.length > 0 ? (
        <ul className="mt-1.5 space-y-1">
          {rest.map(({ video, coverage }) => (
            <li key={`${video.youtubeId}-${coverage.sourceMatchId}`}>
              <a
                href={watchUrl(video.youtubeId, coverage.startsAt)}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs text-steel-400 hover:text-rust-300"
              >
                {labelFor?.(coverage) ?? "Another recording"}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-1.5 text-[0.625rem] leading-snug text-steel-600">
        Hosted on YouTube, not here.
      </p>
    </section>
  );
}

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
