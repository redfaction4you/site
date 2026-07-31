import type { Metadata } from "next";
import Link from "next/link";

import { PAIR_RATE_REQUIREMENT } from "@/lib/matches/pairings";
import { allPairings } from "@/lib/matches/queries";

export const metadata: Metadata = {
  title: "Pairings",
  description:
    "Who plays with whom on the RedFaction4You server, and who plays against whom, counted from who was on which side in every archived match.",
  // Same reasoning as /players. Aggregating a handle is one thing; making it
  // searchable is the part nobody signed up for.
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

function share(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** A player's name, linked, as it appears inside a pairing. */
function Name({ name }: { name: string }) {
  return (
    <Link
      href={`/players/${encodeURIComponent(name)}`}
      className="text-steel-100 hover:text-rust-300"
    >
      {name}
    </Link>
  );
}

function Head({ columns }: { columns: { label: string; align?: "left" }[] }) {
  return (
    <thead>
      <tr>
        {columns.map((column) => (
          <th
            key={column.label}
            className={
              "px-3 py-2 font-display text-[0.6875rem] uppercase tracking-widest text-steel-500 " +
              (column.align === "left" ? "text-left" : "text-right")
            }
          >
            {column.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/** Matches with no recorded result, shown as a suffix rather than folded in. */
function Undecided({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-1 text-steel-600" title={`${count} with no recorded result`}>
      +{count}
    </span>
  );
}

/**
 * Every pairing on the server, both kinds.
 *
 * The player pages each show one person's slice of this. That is the right place
 * to read it when you already have somebody in mind, and the wrong place to
 * notice that two people have played eleven matches on opposite sides, because
 * seeing that means opening a page and knowing to look. A server this size is a
 * handful of people who mostly play each other, and this is the shape of that.
 *
 * Deliberately not a matrix. Six players fit in a grid and thirty would not, and
 * a table that stops working at the size this archive is trying to grow to is a
 * table that gets rebuilt later.
 *
 * This route shadows `/players/[name]` for a player actually called "pairings",
 * because Next resolves a static segment before a dynamic one. Left alone: the
 * alternative is a uglier URL for everybody to protect against a name nobody has
 * used, and if somebody ever does, this comment is where to start.
 */
export default async function PairingsPage() {
  const { partnerships, rivalries } = await allPairings();

  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <p className="eyebrow">
        <Link href="/players" className="hover:text-rust-300">
          Players
        </Link>
      </p>
      <h1 className="mt-2 font-display text-4xl font-bold text-steel-100">Pairings</h1>
      <p className="mt-4 max-w-2xl text-lg leading-relaxed text-steel-300">
        Who plays with whom, and who plays against whom.
      </p>

      {/*
        The thing a reader has to know before the numbers mean anything. Sides
        here are shirt colours that get reshuffled between matches, so every
        figure below is counted from who was actually on which side in each
        match, and most people appear in both tables.
      */}
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-steel-400">
        Red and blue are shirt colours on this server, not teams, and they get
        reshuffled between matches. Everything here is counted from who was on
        which side in each match, which is why most people appear in both tables.
      </p>

      {partnerships.length === 0 && rivalries.length === 0 ? (
        <div className="panel mt-10 p-8 text-center">
          <p className="text-sm text-steel-400">
            No matches recorded yet, so there are no pairings to show.
          </p>
        </div>
      ) : (
        <>
          {partnerships.length > 0 ? (
            <section className="mt-10">
              <h2 className="font-display text-lg font-bold text-steel-100">
                On the same side
              </h2>
              <p className="mt-1 text-sm text-steel-500">
                Matches these two played together, and the record they share.
              </p>

              <div className="panel mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <Head
                    columns={[
                      { label: "Players", align: "left" },
                      { label: "Together" },
                      { label: "Record" },
                      { label: "Win rate" },
                    ]}
                  />
                  <tbody>
                    {partnerships.map((pair) => (
                      <tr
                        key={`${pair.a}-${pair.b}`}
                        className="border-t border-basalt-700"
                      >
                        <td className="px-3 py-2">
                          {/* Real spaces rather than padding alone, so the text
                              still reads as two names when it is copied or read
                              aloud rather than looked at. */}
                          <Name name={pair.a} />
                          <span className="text-steel-600"> and </span>
                          <Name name={pair.b} />
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-300">
                          {pair.matches}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-200">
                          {pair.wins}–{pair.losses}
                          <Undecided count={pair.undecided} />
                        </td>
                        {/* Blank, not a dash. A dash reads as "none" and the
                            answer is "not yet". */}
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-300">
                          {pair.winRate === null ? "" : share(pair.winRate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-steel-600">
                {PAIR_RATE_REQUIREMENT}
              </p>
            </section>
          ) : null}

          {rivalries.length > 0 ? (
            <section className="mt-12">
              <h2 className="font-display text-lg font-bold text-steel-100">
                On opposite sides
              </h2>
              <p className="mt-1 text-sm text-steel-500">
                Matches these two played against each other, and how those went.
                The record reads left to right.
              </p>

              <div className="panel mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <Head
                    columns={[
                      { label: "Player", align: "left" },
                      { label: "Record" },
                      { label: "Player", align: "left" },
                      { label: "Faced" },
                    ]}
                  />
                  <tbody>
                    {rivalries.map((pair) => (
                      <tr
                        key={`${pair.a}-${pair.b}`}
                        className="border-t border-basalt-700"
                      >
                        <td className="px-3 py-2">
                          <Name name={pair.a} />
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-200">
                          {pair.aWins}–{pair.bWins}
                          <Undecided count={pair.undecided} />
                        </td>
                        <td className="px-3 py-2">
                          <Name name={pair.b} />
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-steel-300">
                          {pair.matches}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {/*
            The same limit the player pages carry, said again here because this
            page can be linked to directly and a reader arriving cold has not
            read the other one.
          */}
          <p className="mt-8 text-xs leading-relaxed text-steel-500">
            Grouped by player name, which Red Faction does not reserve or make
            unique, so two people who used the same name appear here as one and
            anyone who renamed appears as two. How much better somebody plays with
            a particular partner is deliberately not shown: it would mean splitting
            an already small number of matches in two, and the difference would be
            mostly which side the shuffle put them on.
          </p>
        </>
      )}
    </div>
  );
}
