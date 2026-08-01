import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ArchiveNav } from "@/components/archive-nav";
import { ColumnImage } from "@/components/column-image";
import { DayBlock } from "@/components/day-block";
import { NightFootageCard } from "@/components/match-footage";
import { NightScoreboard } from "@/components/night-scoreboard";
import { NightStrip } from "@/components/night-strip";
import { dayLabel } from "@/components/match-archive";
import { footageForNight } from "@/lib/match-footage";
import {
  getColumn,
  listDays,
  listMatchesForDay,
  nightScoreboard,
  nightTotals,
} from "@/lib/matches/queries";
import { isValidDay } from "@/lib/matches/sanitize";

type Props = { params: Promise<{ day: string }> };

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

      <ArchiveNav active="/matches" className="mt-2" />

      {/* Every night on record, across the top rather than down the side. */}
      <NightStrip days={days} current={day} className="mt-3" />

      {/*
        Three blocks rather than two columns, so the source order is right on a
        phone as well as on a desktop.

        Stacked, the rail belongs after the night it describes and before the
        archive behind it: who played tonight is content, and putting it after
        every night on the page would bury it under results it is not about. On a
        wide screen the rail takes the second column across both rows and the
        nights take the first, which is the same arrangement as before.
      */}
      <div className="mt-5 grid gap-x-8 gap-y-6 lg:grid-cols-[1fr_16rem]">
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

          {/*
            Everything the archive holds about the evening, on the page named
            after the evening.

            It was five columns in a rail: rank, name, score, frags, caps.
            Accuracy, damage, deaths, returns and streaks were a click away on a
            player page or spread across six match pages, so the night page said
            less about the night than any page it linked to.
          */}
          {scoreboard.length ? (
            <section className="mt-6">
              <h2 className="rule-heading">
                Who played
                <span className="font-mono normal-case tracking-normal text-steel-600">
                  {scoreboard.length} players
                </span>
              </h2>
              <div className="mt-2">
                <NightScoreboard
                  players={scoreboard}
                  matchCount={matches.length}
                />
              </div>
              <p className="mt-2 text-[0.6875rem] leading-snug text-steel-600">
                Ordered by score, which is what the game ranks on: a capture is
                worth many frags, so the frag leader is often not top. The last
                column is how many of the night&rsquo;s matches each player was
                actually in.
              </p>
            </section>
          ) : null}
        </div>

        {/*
          The rail is what is about the night without being one of its
          results: who played, and what anybody filmed. Reaching another night
          moved to the strip across the top, which does that job in a band
          rather than in a column.

          The scoreboard used to sit inside the block, level with the lead story,
          which is the one spot on the page that belongs to neither the story nor
          the table. Here it reads as what it is.

          Sticky, so it stays reachable while the scroll walks back through
          earlier nights, which is why the scoreboard heading carries its date:
          pinned beside a night it is not about, an unlabelled "that night" would
          be quietly wrong.
        */}
        <aside className="space-y-7 lg:sticky lg:top-20 lg:col-start-2 lg:row-span-2 lg:self-start">
          {/* Anything anybody filmed of this night, beside the results rather
              than under the write-up at the bottom of the page. */}
          <NightFootageCard
            footage={await footageForNight(day)}
            labelFor={(coverage) =>
              matches.find((m) => m.sourceMatchId === coverage.sourceMatchId)?.mapName
            }
          />
        </aside>

        {/*
          One night, and a door to the rest.

          Four earlier nights used to be stacked underneath, which was right
          while `/matches` was a redirect and there was nowhere else to go. It
          made this page four times longer than the night it is named after, and
          the archive index now does that job properly.
        */}
        <p className="lg:col-start-1">
          <Link
            href="/matches"
            className="font-display text-[0.625rem] uppercase tracking-widest text-rust-400 hover:text-rust-300"
          >
            Every night in the archive
          </Link>
        </p>

      </div>
    </div>
  );
}
