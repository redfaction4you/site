import Link from "next/link";

import type { WeaponTotals } from "@/lib/matches/weapons";

/**
 * What each weapon does, and who does it with them.
 *
 * The archive has stored per-weapon shooting since the 2.1 broadcaster and
 * nothing has ever read it. It is the only thing here that describes the game
 * rather than the people: the Heavy Machine Gun and the Assault Rifle account
 * for most of the killing and neither lands one shot in five, the Sniper Rifle
 * lands one in three and kills a fraction as often, and the explosives kill
 * without recording a shot at all.
 *
 * **A weapon that records no shots gets a dash, not a zero.** The Rocket
 * Launcher has kills on record and no shots, because the telemetry counts a shot
 * when a bullet leaves a barrel. Printing 0% beside seventy kills would be the
 * most confidently wrong number on the site.
 */
export function WeaponStatsTable({ weapons }: { weapons: WeaponTotals[] }) {
  if (weapons.length === 0) {
    return (
      <p className="py-4 text-sm text-steel-500">
        No weapon data yet. It arrives with the 2.1 broadcaster and the earliest
        matches on record carry none, because it was never recorded.
      </p>
    );
  }

  const unsound = weapons.reduce((sum, weapon) => sum + weapon.unsoundRows, 0);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-[0.8125rem]">
          <thead>
            <tr className="border-b border-basalt-700 text-left font-display text-[0.6875rem] uppercase tracking-widest text-steel-400">
              <th scope="col" className="py-1.5 pr-3 font-bold">
                Weapon
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-bold">
                Frags
              </th>
              <th scope="col" className="py-1.5 pr-3 font-bold">
                Share
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-bold">
                Shots
              </th>
              <th scope="col" className="py-1.5 pr-3 text-right font-bold">
                Accuracy
              </th>
              <th scope="col" className="py-1.5 font-bold">
                Most frags with it
              </th>
            </tr>
          </thead>

          <tbody>
            {weapons.map((weapon) => (
              <tr
                key={weapon.weapon}
                className="border-b border-basalt-800 last:border-b-0 hover:bg-rust-500/[0.05]"
              >
                <th scope="row" className="py-1.5 pr-3 text-left font-normal text-steel-200">
                  {weapon.weapon}
                </th>

                <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-steel-100">
                  {weapon.kills.toLocaleString("en-GB")}
                </td>

                {/*
                  The share as a bar as well as a number. Twelve weapons down a
                  column of percentages is a table you read; the same twelve with
                  a bar is a table you take in, and the shape of this particular
                  distribution, two weapons doing most of the work, is the whole
                  point of the section.
                */}
                <td className="w-28 py-1.5 pr-3">
                  <span className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-1 min-w-px flex-1 bg-basalt-700"
                    >
                      <span
                        className="block h-full bg-rust-500"
                        style={{ width: `${Math.max(weapon.killShare * 100, 1)}%` }}
                      />
                    </span>
                    <span className="w-9 shrink-0 text-right font-mono text-[0.625rem] tabular-nums text-steel-500">
                      {(weapon.killShare * 100).toFixed(1)}%
                    </span>
                  </span>
                </td>

                <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-steel-400">
                  {weapon.tracksShots ? (
                    Math.round(weapon.shotsFired).toLocaleString("en-GB")
                  ) : (
                    <span className="text-steel-700">&mdash;</span>
                  )}
                </td>

                <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-steel-200">
                  {weapon.accuracy === null ? (
                    <span
                      className="text-steel-700"
                      title={
                        weapon.tracksShots
                          ? "The recorded hits exceed the recorded shots, so no accuracy can be worked out."
                          : "This weapon does not record shots, only frags."
                      }
                    >
                      &mdash;
                    </span>
                  ) : (
                    `${(weapon.accuracy * 100).toFixed(1)}%`
                  )}
                </td>

                <td className="py-1.5 text-steel-400">
                  {weapon.topKiller ? (
                    <Link
                      href={`/players/${encodeURIComponent(weapon.topKiller.name)}`}
                      className="hover:text-rust-300"
                    >
                      {weapon.topKiller.name}{" "}
                      <span className="font-mono text-[0.625rem] text-steel-600">
                        {weapon.topKiller.kills}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-steel-700">&mdash;</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[0.6875rem] leading-snug text-steel-600">
        A dash under shots means the weapon records frags but not shots, which is
        true of every explosive. Under accuracy it means that, or that the hits
        and shots recorded contradict each other.
        {unsound > 0
          ? ` ${unsound} player ${unsound === 1 ? "row is" : "rows are"} left out of the shooting figures for that reason.`
          : ""}{" "}
        Weapon data begins with the 2.1 broadcaster; the earliest matches on
        record carry none and never will.
      </p>
    </>
  );
}
