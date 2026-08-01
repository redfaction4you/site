import Link from "next/link";

import { dayLabel, matchTime } from "@/components/match-archive";
import { UNSOUND_SHOOTING_NOTE, accuracyOf } from "@/lib/matches/accuracy";
import { mapSlug } from "@/lib/matches/maps";
import type { PlayerRecordRow } from "@/lib/matches/queries";
import { formatOf, withRunningRecord } from "@/lib/matches/record";

/**
 * A player's record, written the way a fight record is written.
 *
 * The table this replaces gave a date, a map, a side, a result and a scoreline.
 * Everything that made a row mean something was missing: who it was against, who
 * it was with, whether it was two a side or three, and what the record stood at
 * afterwards. On a server that reshuffles sides every match, "won 5-3 on Ankh"
 * is not a fact about anybody until you know which two people were on the other
 * end of it.
 *
 * The shape is borrowed deliberately. A combat sports record has had centuries
 * to settle on result, record, opponent, event, date, and it settled there
 * because that is the order the questions come in. The two changes are that a
 * CTF match has a side rather than a corner, and it has teammates, which is the
 * one column a fight record never needs and this one cannot do without.
 */

function Names({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="text-steel-700">-</span>;

  return (
    <span className="flex flex-wrap gap-x-1.5 gap-y-0.5">
      {names.map((name) => (
        <Link
          key={name}
          href={`/players/${encodeURIComponent(name)}`}
          className="text-steel-300 hover:text-rust-300"
        >
          {name}
        </Link>
      ))}
    </span>
  );
}

export function PlayerRecord({ history }: { history: PlayerRecordRow[] }) {
  if (history.length === 0) return null;

  const rows = withRunningRecord(history);

  return (
    <div className="panel mt-4 overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-basalt-700">
            {[
              ["Res.", "left"],
              ["Record", "right"],
              ["Score", "right"],
              ["Side", "left"],
              ["Size", "left"],
              ["Map", "left"],
              ["With", "left"],
              ["Against", "left"],
              ["F/D/C", "right"],
              ["Acc", "right"],
              ["Date", "left"],
            ].map(([label, align]) => (
              <th
                key={label}
                className={
                  "whitespace-nowrap px-2 py-1.5 font-display text-[0.5625rem] uppercase tracking-wider text-steel-500 " +
                  (align === "left" ? "text-left" : "text-right")
                }
                title={
                  label === "F/D/C"
                    ? "Frags, deaths and captures in that match"
                    : label === "Size"
                      ? "How many a side, counted from who actually played"
                      : undefined
                }
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map(({ match, wins, losses, result }) => {
            const accuracy = accuracyOf(match.shotsHit, match.shotsFired);
            const ownScore = match.team === "red" ? match.redScore : match.blueScore;
            const otherScore = match.team === "red" ? match.blueScore : match.redScore;
            const matchHref = `/matches/${match.archiveDay}/${match.sourceMatchId}`;

            return (
              <tr
                key={match.matchId}
                /*
                  The tint is the column. A word in a cell has to be read; a
                  green row and a red row are countable at a glance, which is
                  what the record column is for and what makes a run of three
                  losses visible without counting anything.
                */
                className={
                  "border-b border-basalt-800 " +
                  (result === "won"
                    ? "bg-signal-green/10"
                    : result === "lost"
                      ? "bg-rust-500/10"
                      : "")
                }
              >
                <td className="whitespace-nowrap px-2 py-1.5">
                  <span
                    className={
                      "font-display text-[0.625rem] font-bold uppercase tracking-wider " +
                      (result === "won"
                        ? "text-signal-green"
                        : result === "lost"
                          ? "text-rust-400"
                          : "text-steel-500")
                    }
                  >
                    {result === "undecided" ? "n/r" : result}
                  </span>
                </td>

                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums text-steel-200">
                  {wins}&ndash;{losses}
                </td>

                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums">
                  {/* Their score first, because this is their record. The match
                      page reads red then blue; here that would mean a win
                      sometimes printing as 3-5. */}
                  <span className="text-steel-100">{ownScore}</span>
                  <span className="text-steel-700">&ndash;</span>
                  <span className="text-steel-400">{otherScore}</span>
                  {match.overtime ? (
                    <span
                      className="ml-1 font-display text-[0.5625rem] uppercase tracking-wider text-oxide-400"
                      title="Went to overtime"
                    >
                      ot
                    </span>
                  ) : null}
                </td>

                <td
                  className={
                    "whitespace-nowrap px-2 py-1.5 font-display text-[0.625rem] uppercase tracking-wider " +
                    (match.team === "red"
                      ? "text-rust-400"
                      : match.team === "blue"
                        ? "text-oxide-400"
                        : "text-steel-500")
                  }
                >
                  {match.team}
                </td>

                <td className="whitespace-nowrap px-2 py-1.5 font-mono tabular-nums text-steel-400">
                  {formatOf(match.alongside.length + 1, match.against.length)}
                </td>

                <td className="px-2 py-1.5">
                  <Link
                    href={`/matches/map/${mapSlug(match.mapName)}`}
                    className="whitespace-nowrap text-steel-200 hover:text-rust-300"
                    title={`Every match on ${match.mapName}`}
                  >
                    {match.mapName}
                  </Link>
                </td>

                <td className="px-2 py-1.5">
                  <Names names={match.alongside} />
                </td>

                <td className="px-2 py-1.5">
                  <Names names={match.against} />
                </td>

                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums text-steel-300">
                  {match.kills}
                  <span className="text-steel-700">/</span>
                  {match.deaths}
                  <span className="text-steel-700">/</span>
                  {match.caps}
                </td>

                <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono tabular-nums text-steel-400">
                  {accuracy === null ? (
                    <span
                      title={match.shotsFired > 0 ? UNSOUND_SHOOTING_NOTE : undefined}
                    >
                      -
                    </span>
                  ) : (
                    `${(accuracy * 100).toFixed(1)}%`
                  )}
                </td>

                <td className="whitespace-nowrap px-2 py-1.5">
                  <Link href={matchHref} className="text-steel-400 hover:text-rust-300">
                    {dayLabel(match.archiveDay)}
                  </Link>
                  <span className="ml-1.5 text-steel-600">
                    {matchTime(match.startedAt)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
