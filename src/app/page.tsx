import Link from "next/link";

import { ColumnImage } from "@/components/column-image";
import { ReadingList } from "@/components/reading-list";
import { listReading } from "@/lib/reading";
import { MatchOfTheNight } from "@/components/match-of-the-night";
import { dayLabel } from "@/components/match-archive";
import {
  archiveTotals,
  latestDay,
  listColumns,
  listOpinions,
  listPlayers,
  matchOfTheNight,
  recentMatches,
} from "@/lib/matches/queries";
import { NightFootageCard } from "@/components/match-footage";
import { footageForNight } from "@/lib/match-footage";
import { RecordsBanner } from "@/components/records-banner";
import { ResultsStrip } from "@/components/results-strip";
import { getTicker } from "@/lib/matches/ticker";
import { DISCORD_INVITE } from "@/lib/nav";
import { getServerStatus } from "@/lib/server-status";

export const dynamic = "force-dynamic";

/**
 * A news front page: the lead story with a rail beside it.
 *
 * Laid out so the article, the night's results and the leaderboard all sit on
 * one screen. A headline at display size and a single paragraph took a third of
 * the viewport and pushed the results below the fold, which is the opposite of
 * what a front page is for. The story now runs at reading size in a column
 * beside the numbers rather than above them.
 */
export default async function HomePage() {
  const [status, totals, latest, players, columns, recent, opinions, records, reading] =
    await Promise.all([
      getServerStatus(),
      archiveTotals(),
      latestDay(),
      listPlayers(),
      listColumns(),
      recentMatches(10),
      listOpinions(3),
      getTicker(),
      listReading(),
    ]);


  /*
   * Anything filmed of the most recent night.
   *
   * The front page had no route to footage at all, so a recording added the
   * moment a night finished was invisible on the one page most people land on.
   * It is the only thing here that is not a number or a paragraph, which is
   * exactly why it belongs above a list of results rather than below one.
   */
  const footage = latest ? await footageForNight(latest) : [];

  const online = status.state === "online" ? status : null;
  const busy = online && online.players > 0;
  const column = columns[0] ?? null;

  // The featured match belongs to the night the column is about, so it is only
  // fetched once there is a column to hang it beside.
  const featured = column ? await matchOfTheNight(column.archiveDay) : null;

  // Three paragraphs is most of a column and still fits beside the rail.
  const paragraphs = column
    ? column.body
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .slice(0, 3)
    : [];

  const leaders = [...players].sort((a, b) => b.kills - a.kills).slice(0, 6);

  /*
   * Everything to read except the one already open at the top of the page.
   *
   * Removed by key, not by dropping the first entry. The lead here is the newest
   * *column*, and the reading list is sorted across all three kinds — so a
   * feature written more recently sits at index 0, and slicing it off hid the
   * feature while listing the lead article a second time directly beside itself.
   */
  const lead = columns[0];
  const more = reading.filter(
    (entry) => !(lead && entry.kind === "report" && entry.day === lead.archiveDay),
  );


  return (
    <>
      <h1 className="sr-only">RedFaction4You</h1>

      {/*
        The records, back across the top — asked for on 8 August, as a banner
        that scrolls slowly rather than the block that used to be here.

        The old one was removed for a good reason and it still holds: a static
        wall of superlatives above the results those records came out of put
        the conclusion before the evidence. A slow marquee is a different
        thing. It is one line rather than a grid, it is ambient rather than
        the first thing to read, and /stats remains the page where each record
        gets its match and its context. Every item still links to the match it
        was set in.
      */}
      <RecordsBanner items={records} />

      <div className="mx-auto max-w-6xl px-4 pb-10">
      {/* Status readout. One line, with the map the server is on. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-basalt-800 py-2.5 text-xs">
        <Link href="/servers" className="group flex items-center gap-2">
          <span
            aria-hidden="true"
            className={
              "h-2 w-2 shrink-0 rounded-full " +
              (busy
                ? "animate-pulse bg-signal-green"
                : online
                  ? "bg-oxide-400"
                  : "bg-steel-600")
            }
          />
          <span className="font-display uppercase tracking-widest text-steel-400 group-hover:text-steel-200">
            {online
              ? "Server online"
              : status.state === "offline"
                ? "Server offline"
                : "Server unknown"}
          </span>
          {online ? (
            <span className="font-mono text-steel-500">
              {online.players}/{online.maxPlayers}
              {online.map ? ` · ${online.map}` : ""}
            </span>
          ) : null}
        </Link>

        <span className="ml-auto flex flex-wrap gap-x-4 font-mono text-steel-600">
          <span>
            <span className="text-steel-300">{totals.matchCount}</span> matches
          </span>
          <span>
            <span className="text-steel-300">{totals.dayCount}</span> nights
          </span>
          <span>
            <span className="text-steel-300">{players.length}</span> players
          </span>
        </span>
      </div>

      {/*
        What happened, before anything written about what happened.

        This page opened with a headline, an illustration and three paragraphs,
        which put the first score 789px down a 720px screen. The article was
        1271px of a 1959px page. Almost nobody arriving here is meeting the
        server for the first time; they are looking up last night, and a front
        page that makes them scroll for it is answering a question they did not
        ask.
      */}
      <ResultsStrip matches={recent} className="mt-3" />

      <div className="grid gap-x-10 gap-y-8 pb-6 pt-5 lg:grid-cols-[1.55fr_1fr]">
        {/* --- The story, now under the results rather than above them --- */}
        {/* --- The lead story --- */}
        <article className="min-w-0">
          {column ? (
            <>
              <p className="eyebrow">Match report · {dayLabel(column.archiveDay)}</p>
              <h2 className="mt-2 font-brand text-2xl leading-[1.2] text-steel-100 sm:text-3xl">
                <Link href={`/news/${column.archiveDay}`} className="hover:text-rust-400">
                  {column.headline}
                </Link>
              </h2>

              {/*
                The illustration belongs to this article rather than to the
                moment. This slot used to show whatever map the server happened
                to be on, which changed every few minutes, so the picture beside
                a fixed piece of writing never stayed still long enough for a
                reader to remember it. Now it is generated once from the finished
                column and stored with it. Renders nothing when there is no
                image, which is common.
              */}
              <ColumnImage
                imageKey={column.imageKey}
                model={column.imageModel}
                headline={column.headline}
                priority
                className="mt-4 max-w-sm"
              />

              <div className="mt-4 space-y-3 text-sm leading-relaxed text-steel-300">
                {paragraphs.map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>

              <Link
                href={`/news/${column.archiveDay}`}
                className="mt-3 inline-block font-display text-[0.6875rem] font-semibold uppercase tracking-widest text-rust-400 hover:text-rust-300"
              >
                Read the full report
              </Link>
            </>
          ) : (
            <>
              <h2 className="font-brand text-2xl leading-[1.2] text-steel-100 sm:text-3xl">
                Everything for Red Faction,{" "}
                <span className="text-rust-500">in one place that stays up.</span>
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-steel-300">
                Match results, player records and the community server. Free, no
                account needed. A write-up appears here after each match night.
              </p>
            </>
          )}
        </article>

        {/* --- The rail --- */}
        <div className="min-w-0 space-y-6">
          {/* Above the results list deliberately: it is the one result worth
              reading rather than one of several worth scanning. */}
          {column && featured ? (
            <MatchOfTheNight match={featured} archiveDay={column.archiveDay} />
          ) : null}

          {/* Somebody filmed it, which beats anything else on this page. */}
          {latest ? <NightFootageCard footage={footage} /> : null}

          {/*
            The columnist, who was reachable only from the news pages. A reader
            who never opens one had no way of knowing the site has an opinion in
            it, which is most of the point of having one.
          */}
          {opinions.length ? (
            <section>
              <div className="flex items-baseline justify-between border-b border-basalt-800 pb-1.5">
                <h2 className="font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
                  The analyst
                </h2>
                <Link
                  href="/analyst"
                  className="font-display text-[0.625rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
                >
                  All
                </Link>
              </div>
              {/*
                Every piece he has filed, not just the newest. There are only
                ever a few and one headline made the section look like a single
                article rather than a column somebody keeps writing.

                No "written automatically" under the headline. The section is
                headed The analyst, the byline on the piece is a low polygon
                character called Stanley Mesh, the note at the foot of every
                piece says he is a column rather than a person, and his own page
                opens with it. A fourth telling under the headline reads as a
                warning label.
              */}
              <ul>
                {opinions.map((piece) => (
                  <li
                    key={piece.archiveDay}
                    className="border-b border-basalt-900 last:border-b-0"
                  >
                    <Link
                      href={`/news/${piece.archiveDay}`}
                      className="group block py-1.5"
                    >
                      <span className="block text-sm leading-snug text-steel-200 group-hover:text-rust-300">
                        {piece.headline}
                      </span>
                      <span className="mt-0.5 block font-mono text-[0.625rem] text-steel-600">
                        {dayLabel(piece.archiveDay)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/*
            The other articles, which the front page had no route to at all.

            The lead was the only write-up on it, so a reader who had already
            seen that one had nowhere to go: the archive looked like it held a
            single article. These are the ones underneath it.

            Headed "Earlier nights", which named what they are about rather than
            what they are. A night is a set of results and this is a list of
            things to read, so a reader who had just come from the results had no
            reason to think these were anything new. `/news` calls them reports
            and so does the lead directly above, which makes this the one place
            on the site using a different word for the same thing.
          */}
          {/*
            Everything there is to read, not only the reports.

            This listed night columns and nothing else, while opinion pieces sat
            in their own box below and features — the longest writing on the
            site — appeared on neither this page nor `/news`. Somebody who had
            read the lead had one more thing offered to them and no idea the
            other two kinds existed. Three at a time, with the rest a click
            away, so the rail stays a rail.
          */}
          {more.length > 0 ? (
            <section>
              <div className="flex items-baseline justify-between border-b border-basalt-800 pb-1.5">
                <h2 className="font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
                  More to read
                </h2>
                <Link
                  href="/news"
                  className="font-display text-[0.625rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
                >
                  All
                </Link>
              </div>
              <ReadingList entries={more} initial={3} />
            </section>
          ) : null}

          <section>
            <div className="flex items-baseline justify-between border-b border-basalt-800 pb-1.5">
              <h2 className="font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
                Most frags
              </h2>
              <Link
                href="/players"
                className="font-display text-[0.625rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
              >
                All
              </Link>
            </div>

            {leaders.length === 0 ? (
              <p className="mt-3 text-xs text-steel-500">Nobody on record yet.</p>
            ) : (
              <ol>
                {leaders.map((player, index) => (
                  <li key={`${player.name}-${index}`} className="border-b border-basalt-800">
                    <Link
                      href={`/players/${encodeURIComponent(player.name)}`}
                      className="group flex items-baseline gap-2.5 py-1.5"
                    >
                      <span className="w-3 shrink-0 font-display text-[0.6875rem] tabular-nums text-steel-700">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-steel-300 group-hover:text-rust-300">
                        {player.name}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-steel-200">
                        {player.kills}
                      </span>
                      <span className="w-12 shrink-0 text-right font-mono text-[0.625rem] tabular-nums text-steel-600">
                        {player.caps} caps
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-basalt-800 pt-4 text-xs">
        <p className="max-w-2xl leading-relaxed text-steel-500">
          Games are arranged in Discord. Everything played on the server is recorded
          here permanently, and you never need an account to read any of it.
          {latest ? ` Last night archived: ${dayLabel(latest)}.` : ""}
        </p>
        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noreferrer noopener"
          className="shrink-0 rounded-sm bg-rust-500 px-4 py-2 font-display text-[0.6875rem] font-semibold uppercase tracking-widest text-white transition-colors hover:bg-rust-400"
        >
          Join the Discord
        </a>
      </div>
      </div>
    </>
  );
}
