import Image from "next/image";
import type { Metadata } from "next";
import Link from "next/link";

import { ColumnImage } from "@/components/column-image";
import { ReadingList } from "@/components/reading-list";
import { READING_KINDS, listReading, type ReadingKind } from "@/lib/reading";
import { dayLabel } from "@/components/match-archive";
import { NightMatches } from "@/components/night-matches";
import {
  archiveTotals,
  listColumns,
  listOpinions,
  listMatchesForDay,
  nightScoreboard,
} from "@/lib/matches/queries";
import { COLUMNIST_HREF, COLUMNIST_NAME } from "@/lib/ai/opinion";

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
  const [columns, totals, opinions, reading] = await Promise.all([
    listColumns(),
    archiveTotals(),
    listOpinions(3),
    listReading(),
  ]);

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
        <aside className="min-w-0 space-y-6">
          <NightMatches matches={leadMatches} archiveDay={lead.archiveDay} />

          {/*
            The columnist, where somebody reading the news would find him.

            One piece in a bordered card, captioned "written by a machine". The
            card said opinion twice and carried one headline where there are
            several, and the caption told a reader something the byline and his
            own page already say: he is a visibly low polygon character called
            Stanley Mesh, the note at the foot of every piece says he is a column
            rather than a person, and his page opens by saying so. Said a third
            time under a headline it reads as a warning label on a joke.

            A section with his face, his name as the heading, and every piece he
            has filed under it, which is also the answer to not being able to
            find him: the heading is the link.
          */}
          {opinions.length ? (
            <section>
              <Link
                href={COLUMNIST_HREF}
                className="group flex items-center gap-2.5 border-b border-basalt-800 pb-1.5"
              >
                <Image
                  src="/mr-mesh.png"
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 rounded-sm border border-basalt-600 object-cover object-top"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[0.5625rem] font-bold uppercase tracking-[0.24em] text-oxide-400">
                    Opinion
                  </span>
                  <span className="block font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-300 group-hover:text-rust-300">
                    {COLUMNIST_NAME}
                  </span>
                </span>
                <span className="shrink-0 font-display text-[0.625rem] uppercase tracking-widest text-rust-400 group-hover:text-rust-300">
                  All
                </span>
              </Link>
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
                      <span className="block text-xs leading-snug text-steel-200 group-hover:text-rust-300">
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

          {/* Who was actually there. The page described a night without ever
              naming anybody in it, which reads oddly next to a column that is
              mostly about people. */}
          {leadPlayers.length ? (
            <section>
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
                      {/* The denominator. People drop in and out across a night,
                          so a frag total is partly a measure of who stayed. */}
                      <span className="w-8 shrink-0 text-right font-mono text-[0.5625rem] tabular-nums text-steel-700">
                        {player.matchesPlayed}/{leadMatches.length}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </aside>
      </div>

      {/*
        Everything written, not only the reports.

        This page is where somebody comes to read, and it listed one of the
        three kinds: reports. Opinion pieces were a rail beside the lead, by
        headline alone, and features appeared nowhere on it at all — the longest
        writing on the site, reachable only from the analyst's own page. The
        list says which kind each entry is, because a reader picking what to
        read next needs to know whether it reports, argues or covers a subject.
      */}
      {reading.length ? (
        <section className="border-t border-basalt-800 pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
              Everything to read
            </h2>
            {/* Counted in a fixed order, so the line does not reshuffle itself
                every time a different kind happens to be the newest. */}
            <p className="font-mono text-xs text-steel-500">
              {(["report", "opinion", "feature"] as ReadingKind[])
                .map((kind) => ({
                  kind,
                  n: reading.filter((entry) => entry.kind === kind).length,
                }))
                .filter(({ n }) => n > 0)
                .map(
                  ({ kind, n }) =>
                    `${n} ${READING_KINDS[kind].label.toLowerCase()}${n === 1 ? "" : "s"}`,
                )
                .join(" · ")}
            </p>
          </div>
          <ReadingList entries={reading} initial={6} className="mt-2" />
        </section>
      ) : null}

      {earlier.length ? (
        <section className="mt-8 border-t border-basalt-800 pt-5">
          <h2 className="font-display text-[0.6875rem] font-bold uppercase tracking-widest text-steel-400">
            Earlier reports
          </h2>
          <ul className="mt-2">
            {earlier.map((entry) => (
              <li key={entry.archiveDay} className="border-b border-basalt-900">
                <Link
                  href={`/news/${entry.archiveDay}`}
                  className="group flex flex-wrap items-baseline gap-x-4 gap-y-0.5 py-2"
                >
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
