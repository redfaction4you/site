import type { Metadata } from "next";
import Link from "next/link";

import { desc } from "drizzle-orm";

import { dayLabel, matchTime } from "@/components/match-archive";
import { db } from "@/lib/db";
import { matchVideos } from "@/lib/db/schema";
import { parseYouTubeId, thumbnailUrl, watchUrl } from "@/lib/match-videos";
import { listDays, listMatchesForDay } from "@/lib/matches/queries";
import { attach, identify, lookupVideo, remove } from "./actions";

export const metadata: Metadata = {
  title: "Add a recording",
  // Not linked from anywhere and not worth indexing either. This is a tool, not
  // a page of the archive.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{
    v?: string;
    day?: string;
    bad?: string;
    added?: string;
    removed?: string;
    problem?: string;
  }>;
};

/** The channel the archive's own uploads come from, for labelling only. */
const OWN_CHANNEL = process.env.NEXT_PUBLIC_YOUTUBE_CHANNEL_URL ?? null;

/**
 * Attaching a recording to a match, without a commit and a deploy.
 *
 * Reachable by typing `/link` and by nothing else: no navigation entry, no
 * index. **It is deliberately open.** There is no key, no password and no
 * sign-in, which was decided rather than overlooked. The worst anybody can do
 * is attach a real video to the wrong match, every entry below has a remove
 * button, and undoing a mistake is one click rather than an edit to a file.
 *
 * Three steps, each one a URL rather than client state, the same way the
 * catalogue filters work. That means the back button behaves, a half finished
 * add can be sent to somebody, and the page needs no JavaScript to work.
 */
export default async function LinkPage({ searchParams }: Props) {
  const params = await searchParams;
  const youtubeId = params.v ? parseYouTubeId(params.v) : null;
  const day = params.day ?? null;

  const [days, lookup, stored] = await Promise.all([
    listDays(),
    youtubeId ? lookupVideo(youtubeId) : Promise.resolve(null),
    db
      .select()
      .from(matchVideos)
      .orderBy(desc(matchVideos.addedAt))
      .limit(40),
  ]);

  const matches = day ? await listMatchesForDay(day) : [];
  const fromOwnChannel =
    OWN_CHANNEL && lookup?.authorUrl
      ? lookup.authorUrl.toLowerCase() === OWN_CHANNEL.toLowerCase()
      : null;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-basalt-800 py-2.5">
        <h1 className="eyebrow">Add a recording</h1>
        <p className="font-mono text-xs text-steel-600">
          <span className="text-steel-300">{stored.length}</span> added here
        </p>
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-steel-400">
        Paste a YouTube link and say which match it is of. It appears on that
        match, on its night, and under the write-up, straight away. Anything
        wrong can be removed at the bottom of this page.
      </p>

      {params.added ? (
        <p className="mt-4 border-l-2 border-signal-green px-3 py-1 text-sm text-steel-200">
          Added to {params.added} {params.added === "1" ? "match" : "matches"}.
        </p>
      ) : null}
      {params.removed ? (
        <p className="mt-4 border-l-2 border-basalt-600 px-3 py-1 text-sm text-steel-300">
          Removed.
        </p>
      ) : null}
      {params.bad ? (
        <p className="mt-4 border-l-2 border-rust-500 px-3 py-1 text-sm text-steel-200">
          That did not look like a YouTube video link, so nothing was saved.
          Guessing at it would put a dead link on a real match.
        </p>
      ) : null}
      {params.problem ? (
        <p className="mt-4 border-l-2 border-rust-500 px-3 py-1 text-sm text-steel-200">
          Pick a night and tick at least one match.
        </p>
      ) : null}

      {/* --- step one: what is it --- */}
      <form action={identify} className="mt-6">
        <label
          htmlFor="url"
          className="font-display text-[0.625rem] uppercase tracking-widest text-steel-500"
        >
          The link
        </label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <input
            id="url"
            name="url"
            type="text"
            defaultValue={youtubeId ? `https://youtu.be/${youtubeId}` : ""}
            placeholder="https://youtu.be/..."
            className="min-w-0 flex-1 rounded-sm border border-basalt-600 bg-basalt-850 px-3 py-2 font-mono text-sm text-steel-100 placeholder:text-steel-600 focus:border-rust-500 focus:outline-none"
          />
          <button
            type="submit"
            className="shrink-0 rounded-sm bg-rust-500 px-4 py-2 font-display text-[0.6875rem] font-semibold uppercase tracking-wider text-white transition-colors hover:bg-rust-400"
          >
            Look it up
          </button>
        </div>
      </form>

      {youtubeId ? (
        <>
          {/* What was pasted, shown back before anything is saved. A title is
              the only way somebody can tell they pasted the right video. */}
          <div className="mt-6 flex gap-3 border-t border-basalt-800 pt-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={thumbnailUrl(youtubeId)}
              alt=""
              className="hidden h-[4.5rem] w-32 shrink-0 rounded-sm border border-basalt-700 object-cover sm:block"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-steel-100">
                {lookup?.title ?? "No title (YouTube did not answer)"}
              </p>
              <p className="mt-0.5 text-xs text-steel-500">
                {lookup?.authorName ?? "Unknown channel"}
                {fromOwnChannel === false ? (
                  <span className="ml-1.5 text-oxide-400">
                    · someone else&rsquo;s channel
                  </span>
                ) : null}
              </p>
              <a
                href={watchUrl(youtubeId)}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1 inline-block font-mono text-[0.625rem] text-steel-600 hover:text-rust-300"
              >
                {youtubeId}
              </a>
            </div>
          </div>

          {/* --- step two: which night --- */}
          <div className="mt-6">
            <p className="font-display text-[0.625rem] uppercase tracking-widest text-steel-500">
              Which night
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {days.map((entry) => {
                const active = entry.archiveDay === day;
                return (
                  <li key={entry.archiveDay}>
                    <Link
                      href={`/link?v=${youtubeId}&day=${entry.archiveDay}`}
                      className={
                        "block rounded-sm border px-2.5 py-1 text-xs transition-colors " +
                        (active
                          ? "border-rust-500 bg-rust-500/10 text-rust-300"
                          : "border-basalt-700 bg-basalt-850 text-steel-300 hover:border-basalt-500")
                      }
                    >
                      {dayLabel(entry.archiveDay)}
                      <span className="ml-1.5 font-mono text-[0.625rem] text-steel-600">
                        {entry.matchCount}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* --- step three: which matches --- */}
          {day && matches.length > 0 ? (
            <form action={attach} className="mt-6">
              <input type="hidden" name="youtubeId" value={youtubeId} />
              <input type="hidden" name="archiveDay" value={day} />

              <p className="font-display text-[0.625rem] uppercase tracking-widest text-steel-500">
                Which matches
              </p>
              <p className="mt-1 text-xs leading-relaxed text-steel-500">
                Tick every match the video covers. One upload is often a whole
                evening, so give each one the time it starts at in the recording
                and the link will jump there.
              </p>

              <ul className="mt-3">
                {matches.map((match) => (
                  <li key={match.id} className="border-b border-basalt-800">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <input
                        id={`m-${match.sourceMatchId}`}
                        type="checkbox"
                        name="matchId"
                        value={match.sourceMatchId}
                        className="h-4 w-4 shrink-0 accent-rust-500"
                      />
                      <label
                        htmlFor={`m-${match.sourceMatchId}`}
                        className="flex min-w-0 flex-1 items-baseline gap-2 text-sm"
                      >
                        <span className="w-4 shrink-0 font-mono text-[0.625rem] tabular-nums text-steel-600">
                          {match.number}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-steel-200">
                          {match.mapName}
                        </span>
                        {match.overtime ? (
                          <span className="shrink-0 font-mono text-[0.5625rem] uppercase tracking-wider text-oxide-400">
                            overtime
                          </span>
                        ) : null}
                        <span className="shrink-0 font-mono text-xs tabular-nums text-steel-500">
                          {matchTime(match.startedAt)}
                        </span>
                        <span className="w-12 shrink-0 text-right font-mono text-sm tabular-nums text-steel-300">
                          {match.redScore}
                          <span className="text-steel-700">-</span>
                          {match.blueScore}
                        </span>
                      </label>
                      <input
                        type="text"
                        name={`startsAt-${match.sourceMatchId}`}
                        placeholder="0:00"
                        aria-label={`Start time for ${match.mapName}`}
                        className="w-16 shrink-0 rounded-sm border border-basalt-700 bg-basalt-850 px-2 py-1 text-right font-mono text-xs text-steel-200 placeholder:text-steel-700 focus:border-rust-500 focus:outline-none"
                      />
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  name="note"
                  type="text"
                  placeholder="Anything worth saying (optional)"
                  className="min-w-0 flex-1 rounded-sm border border-basalt-600 bg-basalt-850 px-3 py-2 text-sm text-steel-100 placeholder:text-steel-600 focus:border-rust-500 focus:outline-none"
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-sm bg-rust-500 px-4 py-2 font-display text-[0.6875rem] font-semibold uppercase tracking-wider text-white transition-colors hover:bg-rust-400"
                >
                  Attach
                </button>
              </div>
            </form>
          ) : null}
        </>
      ) : null}

      {/* --- what has been added, and the undo --- */}
      {stored.length > 0 ? (
        <section className="mt-12">
          <h2 className="rule-heading">Added through this page</h2>
          <p className="mt-2 text-xs leading-relaxed text-steel-500">
            The five recordings that came with the site are in the code and are
            not listed here. Everything below can be removed.
          </p>

          <ul className="mt-3">
            {stored.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-basalt-800 py-2"
              >
                <Link
                  href={`/matches/${row.archiveDay}/${row.sourceMatchId}`}
                  className="min-w-0 flex-1 truncate text-sm text-steel-200 hover:text-rust-300"
                >
                  {row.title ?? row.youtubeId}
                </Link>
                <span className="shrink-0 font-mono text-[0.625rem] text-steel-600">
                  {dayLabel(row.archiveDay)} · #{row.sourceMatchId}
                  {row.startsAt ? ` · from ${row.startsAt}s` : ""}
                </span>
                <form action={remove} className="shrink-0">
                  <input type="hidden" name="youtubeId" value={row.youtubeId} />
                  <input type="hidden" name="archiveDay" value={row.archiveDay} />
                  <input
                    type="hidden"
                    name="sourceMatchId"
                    value={row.sourceMatchId}
                  />
                  <button
                    type="submit"
                    className="font-display text-[0.625rem] uppercase tracking-widest text-steel-500 hover:text-rust-400"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
