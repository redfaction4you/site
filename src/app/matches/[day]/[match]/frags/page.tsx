import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { dayLabel } from "@/components/match-archive";
import { PlayerLink } from "@/components/player-link";
import { getMatch } from "@/lib/matches/queries";
import { isValidDay } from "@/lib/matches/sanitize";

/**
 * Every frag in one match, on a page of its own.
 *
 * It used to sit on the match page inside a closed `<details>`, and it was the
 * single most expensive thing the site served. Match 21 on 31 July weighed
 * 749 kB, of which 465 kB was the React payload, and 750 of its 774 player
 * links were this list. Every visitor downloaded all of it, twice over — once
 * as markup and once as serialised component data — to look at a scoreboard,
 * and almost nobody opened the triangle.
 *
 * Moving it here rather than truncating it: an archive that quietly stops
 * listing after a hundred rows is worse than one that asks for a click, the log
 * is complete, and it gets a permanent URL somebody can link to. That is the
 * same trade every filter on this site makes.
 */
type Props = { params: Promise<{ day: string; match: string }> };

async function load(params: Props["params"]) {
  const { day, match } = await params;
  if (!isValidDay(day)) return null;

  const id = Number(match);
  if (!Number.isInteger(id) || id < 0) return null;

  return getMatch(day, id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const match = await load(params);
  if (!match) return { title: "Not found" };

  return {
    title: `Frags, ${match.mapName} ${match.redScore}–${match.blueScore}`,
    description: `Every frag recorded in the ${match.mode} on ${match.mapName}, played ${dayLabel(match.archiveDay)}.`,
    // The scoreboard is the page worth finding; this is detail hanging off it.
    robots: { index: false, follow: true },
  };
}

function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default async function FragsPage({ params }: Props) {
  const match = await load(params);
  if (!match) notFound();

  const back = `/matches/${match.archiveDay}/${match.sourceMatchId}`;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-basalt-800 py-2.5">
        <h1 className="eyebrow">Frags</h1>
        <Link
          href={back}
          className="font-mono text-xs text-steel-600 hover:text-rust-300"
        >
          back to the match
        </Link>
      </div>

      <p className="mt-3 text-sm text-steel-400">
        {match.mapName}, {match.redScore}&ndash;{match.blueScore} on{" "}
        {dayLabel(match.archiveDay)}.{" "}
        <span className="text-steel-500">
          {match.kills.length} {match.kills.length === 1 ? "frag" : "frags"} recorded.
        </span>
      </p>

      {match.kills.length === 0 ? (
        <p className="mt-6 text-sm text-steel-500">
          No kill events were recorded for this match. The earliest matches on
          record carry none, and that is expected history rather than a fault.
        </p>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-basalt-700 text-left font-display text-[0.625rem] uppercase tracking-widest text-steel-500">
              <th scope="col" className="w-14 py-1.5 pr-3 font-bold">
                Time
              </th>
              <th scope="col" className="py-1.5 pr-3 font-bold">
                What happened
              </th>
              <th scope="col" className="py-1.5 text-right font-bold">
                Weapon
              </th>
            </tr>
          </thead>
          <tbody>
            {match.kills.map((kill, i) => (
              <tr key={i} className="border-b border-basalt-800 last:border-0">
                <td className="py-1 pr-3 font-mono tabular-nums text-steel-500">
                  {clock(kill.elapsedSeconds)}
                </td>
                <td className="py-1 pr-3 text-steel-400">
                  {kill.suicide ? (
                    <>
                      <PlayerLink name={kill.victimName} /> died
                    </>
                  ) : (
                    <>
                      <PlayerLink name={kill.killerName} />
                      <span className="mx-1.5 text-steel-600">fragged</span>
                      <PlayerLink name={kill.victimName} />
                    </>
                  )}
                  {kill.teamKill ? (
                    <span className="ml-2 text-xs text-rust-400">team frag</span>
                  ) : null}
                </td>
                <td className="py-1 text-right text-xs text-steel-500">
                  {kill.weapon ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
