/**
 * The database half of the weapon totals. The arithmetic is in `weapons.ts`.
 *
 * Split so the summing can be loaded by `node --test` without a connection, and
 * so this file is only ever the one thing that has gone wrong before: which rows
 * are allowed to count.
 */
import { and, eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/lib/db";
import { matchPlayers, matches } from "@/lib/db/schema";
import { IDENTITY_KEY } from "@/lib/matches/identities";
import {
  MATCH_COMPLETED,
  TOOK_PART,
  canonicalNames,
} from "@/lib/matches/queries";
import { type WeaponRow, type WeaponTotals, summariseWeapons } from "@/lib/matches/weapons";

export type { WeaponTotals };

export const weaponTotals = cache(async function weaponTotals(): Promise<WeaponTotals[]> {
  const rows = await db
    .select({
      key: IDENTITY_KEY,
      name: matchPlayers.name,
      weaponStats: matchPlayers.weaponStats,
    })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    // One row per player per match, not an aggregate: `summariseWeapons` needs
    // the individual documents to tell a broken tuple from a sound one.
    // `IDENTITY_KEY` is a plain expression, so it selects per row like any
    // other column.
    .where(and(TOOK_PART, eq(matches.status, "final"), MATCH_COMPLETED));

  // Named per person before the summing sees them, the same handover
  // `fetchAppearances` makes to the pairing code and for the same reason: one
  // person under four names was four entries on "best with this weapon".
  const named = await canonicalNames();

  const flat: WeaponRow[] = [];
  for (const row of rows) {
    const name = named.get(row.key) ?? row.name;
    for (const stat of row.weaponStats) {
      flat.push({
        name,
        weapon: stat.weapon,
        kills: stat.kills,
        shotsFired: stat.shotsFired,
        shotsHit: stat.shotsHit,
      });
    }
  }

  return summariseWeapons(flat);
});
