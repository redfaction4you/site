import Image from "next/image";
import Link from "next/link";

import type { ItemSummary } from "@/lib/catalogue";
import {
  ARCHIVE_TIME_ZONE,
  categoryOf,
  displayVersion,
  type Section,
} from "@/lib/downloads";
import {
  compatPhrase,
  type RfClient,
} from "@/lib/rfl/clients";
import { publicUrl } from "@/lib/storage";

/**
 * One entry in a catalogue listing, as a row.
 *
 * This replaced a grid of cards, and the reason is what the shelf is for. A card
 * grid is a browsing surface: three across, a big picture each, and the text
 * squeezed under it. What somebody arriving at a downloads page actually does is
 * scan a list for a name, check who made it and when, and take the file. That is
 * a row, and it is what every downloads site that has survived twenty years
 * settled on. It also fits far more of the archive on one screen, which matters
 * when the shelf holds hundreds of maps rather than nine.
 *
 * The row is not a table. Six columns of anything on a 375px screen is either a
 * horizontal scrollbar or five columns nobody sees, and unlike the match
 * statistics there is nothing here to compare down a column: a download count
 * and a date are labels on one item, not a series. So the layout is a flex row
 * that wraps, the meta drops under the title on a phone, and nothing is ever
 * off the edge.
 */

/**
 * `3 Sep 2026`, day first, which is how every other date on this site reads.
 *
 * Fixed to UTC rather than left to the runtime. The formatter runs on the server
 * and the timezone there is not a thing anybody has chosen, so pinning it is the
 * difference between a date that is stable and one that quietly depends on where
 * the render happened. Written here rather than imported from the match
 * archive's formatters: the catalogue and the match statistics deliberately
 * share no code, and a date format is not the thing to start with.
 */
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  timeZone: ARCHIVE_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Whether this will load for you, in one mark.
 *
 * The shelf offers a PLAYS ON filter and no row said what it plays on, so
 * turning the filter on changed the list with nothing on any row explaining
 * why. `CompatBadge` is the honest answer to that question and it is four pills
 * wide, which is fine on a detail page and far too much repeated down a
 * listing. This says the same thing in one phrase, and hands the reader off to
 * the badge for the detail.
 *
 * Three weights, because there are three kinds of answer. Quiet grey is "this
 * is fine", which is most of the archive and should not shout. A brighter grey
 * pill is a real restriction: it names what does load, so a reader running
 * anything else knows the row is not for them. Gold is the same warning colour
 * `CompatBadge` uses, and it means the download needs a decision rather than a
 * click.
 *
 * Where nothing was ever read out of the file there is no mark at all. Silence
 * is not a claim, and a row of "unchecked" down a shelf of mods that were never
 * going to contain a level would be noise standing in for information. The
 * detail page still explains the absence in full.
 */
function RowCompat({
  playsOn,
  confidence,
  rflVersion,
}: {
  playsOn: RfClient[];
  confidence: "known" | "unknown" | null;
  rflVersion: number | null;
}) {
  /*
   * The words come from `compatPhrase` in `@/lib/rfl/clients`, which the front
   * page's arrivals block also calls. This function is now only the dressing:
   * which pill, which colours. That split was made on 9 September 2026, when a
   * second surface needed to say the same thing and the choice was between
   * copying four sentences or hoisting them. The same file already carries
   * `CLIENT_SHORT_LABELS` for exactly this reason, hoisted the same day after
   * two components had each written their own.
   */
  const phrase = compatPhrase(playsOn, confidence, rflVersion);
  if (!phrase) return null;

  const pill =
    "rounded-sm border px-1.5 py-0.5 font-display text-[0.625rem] font-semibold uppercase tracking-wider";

  /*
   * Three styles, not two, and the third is the point. A warning is gold. "Any
   * client" is the quiet good news and is drawn back, because it is true of
   * most of the archive and a lit pill on every row lights up nothing. A
   * shorter list is the one worth noticing, so it gets the brighter text.
   */
  const style = phrase.warn
    ? " border-oxide-400/40 bg-oxide-400/10 text-oxide-400"
    : phrase.text === "Any client"
      ? " border-basalt-700 bg-basalt-850 text-steel-400"
      : " border-basalt-600 bg-basalt-800 text-steel-200";

  return (
    <span title={phrase.title} className={pill + style}>
      {phrase.text}
    </span>
  );
}

export function DownloadRow({
  item,
  section,
}: {
  item: ItemSummary;
  section: Section;
}) {
  const category = categoryOf(section, item.category);
  const version = displayVersion(item.releaseVersion);
  const updated = item.updatedAt ? DAY_MONTH_YEAR.format(item.updatedAt) : null;

  /*
   * The year only, never the day.
   *
   * `released_on` is a date column and most of the archive is going to arrive
   * knowing "2003" and nothing finer, which stores as the first of January.
   * Printing "1 Jan 2003" would invent a day from a default. The year is the
   * part that was actually known.
   */
  const year = item.releasedOn ? item.releasedOn.slice(0, 4) : null;

  /*
   * A null here has two quite different causes and the placeholder says which.
   * Either the item has no screenshot, which is an ordinary state for a file
   * recovered from a dead forum, or it has one and `publicUrl` has told us the
   * bucket is not configured. The second is our fault and should read as our
   * fault rather than as a map nobody photographed.
   */
  const shot = item.screenshotKey ? publicUrl(item.screenshotKey) : null;
  const unserved = item.screenshotKey !== null && shot === null;

  return (
    <li className="border-b border-basalt-800 transition-colors last:border-b-0 odd:bg-steel-500/[0.04] hover:bg-rust-500/[0.07]">
      {/*
        Wraps on a phone so the counts sit on their own line under the title,
        and holds one line from `sm` up. The thumbnail and the text keep the
        first line to themselves either way.
      */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-3 sm:flex-nowrap sm:gap-x-4">
        <Link
          href={`${section.route}/${item.slug}`}
          className="group flex min-w-0 flex-1 basis-full gap-3 sm:basis-auto sm:gap-4"
        >
          <div className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-sm border border-basalt-700 bg-basalt-900 sm:w-28">
            {shot ? (
              <Image
                src={shot}
                /* Decorative: the title sits beside it inside the same link, so
                   announcing the file as well would say the same thing twice. */
                alt=""
                fill
                sizes="(min-width: 640px) 112px, 80px"
                className="object-cover"
              />
            ) : (
              <span
                title={
                  unserved
                    ? `There is a screenshot of this ${section.noun}, but image storage is not configured, so it cannot be shown.`
                    : `No screenshot of this ${section.noun} yet.`
                }
                className="flex h-full items-center justify-center px-1 text-center font-display text-[0.5625rem] uppercase leading-tight tracking-wider text-steel-400"
              >
                {unserved ? "Not served yet" : "No screenshot"}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h3 className="font-display text-base font-semibold leading-snug text-steel-100 transition-colors group-hover:text-rust-300">
                {item.title}
              </h3>

              {/* Quieter than the title and never bolder. A version is part of
                  the name of the file, not a second heading. */}
              {version ? (
                <span className="text-xs font-normal text-steel-400">{version}</span>
              ) : null}

              {category ? (
                <span
                  title={category.blurb}
                  className="rounded-sm border border-basalt-600 bg-basalt-800 px-1.5 py-0.5 font-display text-[0.625rem] font-semibold uppercase tracking-wider text-steel-300"
                >
                  {category.label}
                </span>
              ) : null}

              {/*
                Only on a shelf that can carry level data. An asset or a tool
                has no client compatibility to state, and a blank where a mark
                would be is not the same as a mark saying nothing.

                On the title line rather than beside the download count,
                because it is part of what the row is offering rather than a
                reading of how it has done. It costs the link two words, which
                is the same trade the category chip beside it already makes.
              */}
              {section.hasLevels ? (
                <RowCompat
                  playsOn={item.playsOn}
                  confidence={item.detectionConfidence}
                  rflVersion={item.rflVersion}
                />
              ) : null}
            </div>

            <p className="mt-1 text-xs text-steel-400">
              {/* `author_name`, never the uploader. Most of this was made by
                  people who will never hold an account here, and saying so
                  plainly is better than crediting whoever posted the zip. */}
              {item.authorName ?? (
                <span title="Nobody recorded who made this.">Unknown</span>
              )}
              {year ? (
                <>
                  {" · "}
                  <span title={`Released in ${year}`}>{year}</span>
                </>
              ) : null}
            </p>

            {item.summary ? (
              <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-steel-400">
                {item.summary}
              </p>
            ) : null}
          </div>
        </Link>

        {/*
          Outside the link on purpose. It is the one part of the row that is a
          reading rather than a destination, and a link whose accessible name
          runs to a summary, a date and a download count is a link nobody can
          hear the end of.
        */}
        <p className="w-full shrink-0 text-xs text-steel-400 sm:w-auto sm:whitespace-nowrap sm:text-right">
          <span className="font-mono tabular-nums text-steel-200">
            {item.downloadCount.toLocaleString("en-GB")}
          </span>{" "}
          {item.downloadCount === 1 ? "download" : "downloads"}
          {updated ? (
            <>
              <span className="sm:hidden"> · </span>
              <span className="sm:mt-0.5 sm:block">Updated {updated}</span>
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}
