import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ColumnImage } from "@/components/column-image";
import { DayBlock } from "@/components/day-block";
import { DayRail } from "@/components/day-rail";
import { dayLabel, matchTime } from "@/components/match-archive";
import {
  getColumn,
  listDays,
  listMatchesForDay,
  nightScoreboard,
  nightTotals,
} from "@/lib/matches/queries";
import { isValidDay } from "@/lib/matches/sanitize";

type Props = { params: Promise<{ day: string }> };

/**
 * How many earlier nights stack under the one being read.
 *
 * The point of the stack is that scrolling walks backwards through the archive
 * rather than dead-ending after one night. It is bounded because every extra
 * night is another query and another set of thumbnails, and nobody scrolls
 * through a season. The rail is how you reach anything further back.
 */
const STACKED_NIGHTS = 4;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { day } = await params;
  if (!isValidDay(day)) return { title: "Not found" };

  return {
    title: `Match night, ${dayLabel(day)}`,
    description: `Every match played on ${dayLabel(day)} on the RedFaction4You server, with scoreboards and the night's write-up.`,
  };
}

export default async function MatchDayPage({ params }: Props) {
  const { day } = await params;
  if (!isValidDay(day)) notFound();

  const [days, matches, column, totals, scoreboard] = await Promise.all([
    listDays(),
    listMatchesForDay(day),
    getColumn(day),
    nightTotals(day),
    nightScoreboard(day),
  ]);

  if (matches.length === 0) notFound();

  /*
   * The nights below this one, newest of them first.
   *
   * Loaded together rather than on scroll: four nights is four small queries,
   * and an infinite scroller would be a lot of machinery for an archive that
   * adds a night every couple of days.
   */
  const behind = days.filter((entry) => entry.archiveDay < day);
  const stacked = behind.slice(0, STACKED_NIGHTS);
  const older = behind.length - stacked.length;

  const earlierNights = await Promise.all(
    stacked.map(async (entry) => ({
      archiveDay: entry.archiveDay,
      matches: await listMatchesForDay(entry.archiveDay),
    })),
  );

  const first = matches[0]?.startedAt ?? null;
  const last = matches[matches.length - 1]?.endedAt ?? null;
  const sessionMinutes =
    first && last ? Math.round((last.getTime() - first.getTime()) / 60000) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <p className="eyebrow">
        <Link href="/matches" className="hover:text-rust-300">
          Matches
        </Link>
      </p>

      <div className="mt-3 grid gap-8 lg:grid-cols-[1fr_13rem]">
        <div className="min-w-0 space-y-12">
          {/*
            The night being read, whole and above the fold.

            Every match used to get a full width card with a 16:9 screenshot,
            which meant a six match night ran past two screens: you could see a
            piece of the evening but never the evening itself, and comparing the
            third match to the sixth meant scrolling between them.
          */}
          <div>
            <DayBlock archiveDay={day} matches={matches} heading="h1">
              <div className="space-y-5">
                {/* The night at a glance, beside the matches rather than above
                    them, so both fit one screen. */}
                <dl className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["Players", totals.players],
                      ["Frags", totals.frags],
                      ["Captures", totals.captures],
                      ["Minutes", sessionMinutes ?? "-"],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt className="figure-label">{label}</dt>
                      <dd className="figure-value mt-0.5 font-mono text-lg">{value}</dd>
                    </div>
                  ))}
                </dl>
                {first ? (
                  <p className="text-xs text-steel-600">
                    First match {matchTime(first)}.
                  </p>
                ) : null}

                {scoreboard.length ? (
                  <section>
                    <h2 className="rule-heading">That night</h2>
                    <ol className="mt-2">
                      {scoreboard.map((player, index) => (
                        <li key={player.name} className="border-b border-basalt-900">
                          <Link
                            href={`/players/${encodeURIComponent(player.name)}`}
                            className="group flex items-baseline gap-2 py-1"
                          >
                            <span className="w-3 shrink-0 font-display text-[0.625rem] tabular-nums text-steel-700">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs text-steel-300 group-hover:text-rust-300">
                              {player.name}
                            </span>
                            <span className="shrink-0 font-mono text-xs tabular-nums text-steel-100">
                              {player.kills}
                            </span>
                            <span className="w-10 shrink-0 text-right font-mono text-[0.5625rem] tabular-nums text-steel-600">
                              {player.caps} {player.caps === 1 ? "cap" : "caps"}
                            </span>
                            {/* The denominator. People drop in and out across a
                                night, so a frag total is partly a measure of who
                                stayed. */}
                            <span className="w-7 shrink-0 text-right font-mono text-[0.5625rem] tabular-nums text-steel-700">
                              {player.matchesPlayed}/{matches.length}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </section>
                ) : null}
              </div>
            </DayBlock>

            {/*
              The write-up, as a line rather than a card.

              It had a twelve rem illustration and four lines of standfirst,
              which added most of a screen to a block whose whole point is that a
              night fits one. The full piece is one click away on the news page
              and does not need reproducing here; what this has to do is say a
              write-up exists and get out of the way.
            */}
            {column ? (
              <Link
                href={`/news/${day}`}
                className="plate group mt-4 flex items-center gap-3 p-3"
              >
                <ColumnImage
                  imageKey={column.imageKey}
                  model={column.imageModel}
                  headline={column.headline}
                  className="hidden w-20 shrink-0 sm:block"
                />
                <span className="min-w-0 flex-1">
                  <span className="figure-label block text-rust-500">The write-up</span>
                  <span className="mt-0.5 block truncate font-display text-sm font-bold text-steel-100 group-hover:text-rust-300">
                    {column.headline}
                  </span>
                </span>
                <span className="shrink-0 font-display text-[0.625rem] uppercase tracking-widest text-rust-400 group-hover:text-rust-300">
                  Read
                </span>
              </Link>
            ) : null}
          </div>

          {/*
            Backwards through the archive, a night per scroll.

            The page used to end after one night, so the only route to the night
            before was back out to a selector and in again. Reading an archive is
            walking backwards through it, and the scroll should do that.
          */}
          {earlierNights.map((night) => (
            <DayBlock
              key={night.archiveDay}
              archiveDay={night.archiveDay}
              matches={night.matches}
            />
          ))}

          {older > 0 ? (
            <p className="text-sm text-steel-500">
              {older} older {older === 1 ? "night is" : "nights are"} in the index
              beside this.
            </p>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <DayRail days={days} current={day} />
        </aside>
      </div>
    </div>
  );
}
