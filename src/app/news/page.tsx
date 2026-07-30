import type { Metadata } from "next";
import Link from "next/link";

import { ColumnImage } from "@/components/column-image";
import { MapShot } from "@/components/map-shot";
import { dayLabel, matchTime } from "@/components/match-archive";
import {
  archiveTotals,
  listColumns,
  listMatchesForDay,
  nightScoreboard,
} from "@/lib/matches/queries";

export const metadata: Metadata = {
  title: "News",
  description:
    "Match night write-ups from the RedFaction4You server: what happened, who stood out, and how the evening went.",
};

export const dynamic = "force-dynamic";

/**
 * The news index, laid out as a front page rather than a list.
 *
 * A page heading, a sentence of explanation and one bordered card is mostly
 * empty space that tells a reader nothing. The newest write-up now runs as the
 * lead with its opening paragraphs and the night's scores beside it, and older
 * ones are a dense list underneath. It reads as something to read even with a
 * single entry.
 */
export default async function NewsPage() {
  const [columns, totals] = await Promise.all([listColumns(), archiveTotals()]);

  const [lead, ...earlier] = columns;
  const leadMatches = lead ? await listMatchesForDay(lead.archiveDay) : [];
  const leadPlayers = lead ? await nightScoreboard(lead.archiveDay) : [];

  if (!lead) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="eyebrow">Read</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-steel-100">News</h1>
        <p className="mt-3 text-base leading-relaxed text-steel-300">
          A write-up of each match night: how the evening went, what turned each game,
          and who stood out.
        </p>
        <p className="mt-6 text-sm text-steel-500">
          Nothing written yet. A report appears here after each night of matches
          finishes.
        </p>
      </div>
    );
  }

  const paragraphs = lead.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-basalt-800 py-2.5">
        <p className="eyebrow">Match reports</p>
        <p className="font-mono text-xs text-steel-600">
          <span className="text-steel-300">{columns.length}</span>{" "}
          {columns.length === 1 ? "report" : "reports"} ·{" "}
          <span className="text-steel-300">{totals.matchCount}</span> matches ·{" "}
          <span className="text-steel-300">{totals.dayCount}</span> nights
        </p>
      </div>

      <div className="grid gap-x-10 gap-y-8 py-6 lg:grid-cols-[1.55fr_1fr]">
        {/* The lead report, with enough of it to be worth reading here. */}
        <article className="min-w-0">
          <p className="text-xs text-steel-500">
            {dayLabel(lead.archiveDay)} · {lead.matchCount}{" "}
            {lead.matchCount === 1 ? "match" : "matches"}
          </p>
          <h1 className="mt-1.5 font-brand text-2xl leading-[1.2] text-steel-100 sm:text-3xl">
            <Link href={`/news/${lead.archiveDay}`} className="hover:text-rust-400">
              {lead.headline}
            </Link>
          </h1>

          <ColumnImage
            imageKey={lead.imageKey}
            model={lead.imageModel}
            headline={lead.headline}
            priority
            className="mt-4 max-w-sm"
          />

          <div className="mt-4 space-y-3 text-sm leading-relaxed text-steel-300">
            {paragraphs.slice(0, 3).map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>

          {paragraphs.length > 3 ? (
            <Link
              href={`/news/${lead.archiveDay}`}
              className="mt-3 inline-block font-display text-[0.6875rem] font-semibold uppercase tracking-widest text-rust-400 hover:text-rust-300"
            >
              Read the rest
            </Link>
          ) : null}
        </article>

        {/* The scores it is describing, so the claims sit next to the record. */}
        <aside className="min-w-0">
          <h2 className="border-b border-basalt-800 pb-1.5 font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
            That night
          </h2>
          <ul>
            {leadMatches.map((match) => (
              <li key={match.id} className="border-b border-basalt-900">
                <Link
                  href={`/matches/${lead.archiveDay}/${match.sourceMatchId}`}
                  className="group flex items-center gap-3 py-1.5"
                >
                  <span className="w-4 shrink-0 font-display text-[0.6875rem] tabular-nums text-steel-700">
                    {match.number}
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-sm tabular-nums">
                    <span
                      className={
                        match.winner === "red" ? "text-rust-400" : "text-steel-600"
                      }
                    >
                      {match.redScore}
                    </span>
                    <span className="mx-0.5 text-steel-700">-</span>
                    <span
                      className={
                        match.winner === "blue" ? "text-oxide-400" : "text-steel-600"
                      }
                    >
                      {match.blueScore}
                    </span>
                  </span>
                  <MapShot
                    mapName={match.mapName}
                    className="hidden w-12 shrink-0 sm:block"
                    sizes="48px"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-steel-300 group-hover:text-rust-300">
                    {match.mapName}
                  </span>
                  <span className="shrink-0 font-mono text-[0.625rem] text-steel-600">
                    {matchTime(match.startedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <Link
            href={`/matches/${lead.archiveDay}`}
            className="mt-2 inline-block font-display text-[0.625rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
          >
            The full night
          </Link>

          {/* Who was actually there. The page described a night without ever
              naming anybody in it, which reads oddly next to a column that is
              mostly about people. */}
          {leadPlayers.length ? (
            <section className="mt-6">
              <h2 className="border-b border-basalt-800 pb-1.5 font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
                Who played
              </h2>
              <ol>
                {leadPlayers.map((player, index) => (
                  <li key={player.name} className="border-b border-basalt-900">
                    <Link
                      href={`/players/${encodeURIComponent(player.name)}`}
                      className="group flex items-baseline gap-2 py-1.5"
                    >
                      <span className="w-3 shrink-0 font-display text-[0.6875rem] tabular-nums text-steel-700">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-steel-300 group-hover:text-rust-300">
                        {player.name}
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-steel-100">
                        {player.kills}
                      </span>
                      <span className="w-11 shrink-0 text-right font-mono text-[0.625rem] tabular-nums text-steel-600">
                        {player.caps} caps
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </aside>
      </div>

      {earlier.length ? (
        <section className="border-t border-basalt-800 pt-5">
          <h2 className="font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
            Earlier reports
          </h2>
          <ul className="mt-2">
            {earlier.map((entry) => (
              <li key={entry.archiveDay} className="border-b border-basalt-900">
                <Link
                  href={`/news/${entry.archiveDay}`}
                  className="group flex flex-wrap items-center gap-x-4 gap-y-0.5 py-2"
                >
                  <ColumnImage
                    imageKey={entry.imageKey}
                    model={entry.imageModel}
                    headline={entry.headline}
                    className="hidden w-20 shrink-0 sm:block"
                    compact
                  />
                  <span className="w-36 shrink-0 font-mono text-[0.6875rem] text-steel-600">
                    {dayLabel(entry.archiveDay)}
                  </span>
                  <span className="min-w-0 flex-1 text-sm text-steel-200 group-hover:text-rust-300">
                    {entry.headline}
                  </span>
                  <span className="shrink-0 font-mono text-[0.625rem] text-steel-600">
                    {entry.matchCount} {entry.matchCount === 1 ? "match" : "matches"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="border-t border-basalt-800 pt-5 text-xs text-steel-600">
          This is the first report. One is written after each night of matches, so
          they accumulate as the server gets used.
        </p>
      )}
    </div>
  );
}
