import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ColumnImage } from "@/components/column-image";
import { DayBlock } from "@/components/day-block";
import { DayRail } from "@/components/day-rail";
import { NightFootageCard } from "@/components/match-footage";
import { dayLabel } from "@/components/match-archive";
import { footageForNight } from "@/lib/match-videos";
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

      {/* The rail widened from 13rem when the scoreboard moved into it: six
          columns of it do not fit in a strip sized for date chips. */}
      {/*
        Three blocks rather than two columns, so the source order is right on a
        phone as well as on a desktop.

        Stacked, the rail belongs after the night it describes and before the
        archive behind it: who played tonight is content, and putting it after
        every night on the page would bury it under results it is not about. On a
        wide screen the rail takes the second column across both rows and the
        nights take the first, which is the same arrangement as before.
      */}
      <div className="mt-3 grid gap-8 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          {/*
            The night being read, whole and above the fold.

            Every match used to get a full width card with a 16:9 screenshot,
            which meant a six match night ran past two screens: you could see a
            piece of the evening but never the evening itself, and comparing the
            third match to the sixth meant scrolling between them.
          */}
          <div>
            <DayBlock
              archiveDay={day}
              matches={matches}
              heading="h1"
              /* Four figures that were a two by two grid of labelled cells and a
                 sentence about the first kick-off, which between them cost more
                 height than the six matches they described. The kick-off is a
                 column on those matches now, so it says itself. */
              stats={[
                `${totals.players} players`,
                `${totals.frags} frags`,
                `${totals.captures} captures`,
                sessionMinutes === null ? null : `${sessionMinutes} min`,
              ]
                .filter(Boolean)
                .join(" · ")}
              /*
                The night's story, above its results and with the picture at a
                size somebody can see.

                It was a strip at the foot of the block: a twenty pixel
                thumbnail, the headline truncated to one line, under everything
                else on the page. Every sports page puts the lead at the top of
                the main column with the image attached to it, because the
                story is what makes a table of scores worth reading. This is the
                one picture the site generates every night and it was furniture.
              */
              lead={
                column ? (
                  <Link
                    href={`/news/${day}`}
                    className="group flex items-start gap-3 border-b border-basalt-800 pb-3"
                  >
                    <ColumnImage
                      imageKey={column.imageKey}
                      model={column.imageModel}
                      headline={column.headline}
                      className="hidden w-40 shrink-0 sm:block"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="figure-label block text-rust-500">
                        The write-up
                      </span>
                      {/* Wraps rather than truncating. A headline cut in half is
                          a worse invitation than no headline. */}
                      <span className="mt-1 block font-display text-lg font-bold leading-snug text-steel-100 group-hover:text-rust-300">
                        {column.headline}
                      </span>
                      <span className="mt-1.5 block font-display text-[0.625rem] uppercase tracking-widest text-rust-400 group-hover:text-rust-300">
                        Read the night
                      </span>
                    </span>
                  </Link>
                ) : null
              }
            />
          </div>
        </div>

        {/*
          The rail is everything about the night that is not one of its results:
          how to reach another night, who played, and what anybody filmed.

          The scoreboard used to sit inside the block, level with the lead story,
          which is the one spot on the page that belongs to neither the story nor
          the table. Here it reads as what it is.

          Sticky, so it stays reachable while the scroll walks back through
          earlier nights, which is why the scoreboard heading carries its date:
          pinned beside a night it is not about, an unlabelled "that night" would
          be quietly wrong.
        */}
        <aside className="space-y-7 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:self-start">
          <DayRail days={days} current={day} />

          {scoreboard.length ? (
            <section>
              <h2 className="rule-heading">
                Who played
                <span className="font-mono normal-case tracking-normal text-steel-600">
                  {dayLabel(day)}
                </span>
              </h2>

              {/*
                Named, for the same reason the match rows are: `6 caps` and
                `6/6` beside a frag count are three numbers and one of them was
                a fraction of something never stated.

                Score is here because the table is ordered by it and was not
                showing it, so fourth place held 137 frags and fifth held 157 and
                the ranking read as broken. In CTF it is not: a capture is worth
                far more than a frag, and this is the column that explains why
                somebody with eleven of them outranks somebody who shot more
                people.
              */}
              <div className="mt-2 flex items-baseline gap-2 border-b border-basalt-700 pb-1 font-display text-[0.5625rem] uppercase tracking-wider text-steel-600">
                <span className="w-3 shrink-0">#</span>
                <span className="min-w-0 flex-1">Player</span>
                <span className="w-9 shrink-0 text-right">Score</span>
                <span className="w-8 shrink-0 text-right">Frags</span>
                <span className="w-6 shrink-0 text-right">Caps</span>
                <span
                  className="w-8 shrink-0 text-right"
                  title="Matches they played, of the matches that night"
                >
                  Played
                </span>
              </div>

              <ol>
                {scoreboard.map((player, index) => (
                  <li key={player.name} className="border-b border-basalt-800">
                    <Link
                      href={`/players/${encodeURIComponent(player.name)}`}
                      className="group flex items-baseline gap-2 py-1"
                    >
                      <span className="w-3 shrink-0 font-display text-[0.625rem] tabular-nums text-steel-600">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-steel-200 group-hover:text-rust-300">
                        {player.name}
                      </span>
                      <span className="w-9 shrink-0 text-right font-mono text-xs tabular-nums text-steel-100">
                        {player.score}
                      </span>
                      <span className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-steel-300">
                        {player.kills}
                      </span>
                      <span className="w-6 shrink-0 text-right font-mono text-xs tabular-nums text-steel-400">
                        {player.caps}
                      </span>
                      {/* The denominator. People drop in and out across a night,
                          so a frag total is partly a measure of who stayed. */}
                      <span className="w-8 shrink-0 text-right font-mono text-[0.625rem] tabular-nums text-steel-600">
                        {player.matchesPlayed}/{matches.length}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {/* Anything anybody filmed of this night, beside the results rather
              than under the write-up at the bottom of the page. */}
          <NightFootageCard
            footage={footageForNight(day)}
            labelFor={(coverage) =>
              matches.find((m) => m.sourceMatchId === coverage.sourceMatchId)?.mapName
            }
          />
        </aside>

        {/*
          Backwards through the archive, a night per scroll.

          The page used to end after one night, so the only route to the night
          before was back out to a selector and in again. Reading an archive is
          walking backwards through it, and the scroll should do that.

          Under a heading, and at h3, because without one the page shows three
          nights of equal weight beside a rail that is about one of them. The
          rail is not wrong, it is scoped to the night in the URL, but nothing
          said so: the fix is to say which night this page is, rather than to
          stop the rail being about it.
        */}
        <div className="min-w-0 lg:col-start-1">
          {earlierNights.length > 0 ? (
            <h2 className="rule-heading mb-3">Earlier nights</h2>
          ) : null}

          <div className="space-y-8">
            {earlierNights.map((night) => (
              <DayBlock
                key={night.archiveDay}
                archiveDay={night.archiveDay}
                matches={night.matches}
                heading="h3"
              />
            ))}
          </div>

          {older > 0 ? (
            <p className="mt-8 text-sm text-steel-500">
              {older} older {older === 1 ? "night is" : "nights are"} in the index
              beside this.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
