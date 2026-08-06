/**
 * What each weapon actually does, across the whole archive.
 *
 * `weapon_stats` has been stored on every player row since the 2.1 broadcaster
 * and nothing has ever read it across matches. It is the only part of the record
 * that describes the game rather than the people playing it: which weapon does
 * the killing here, which one people carry and never land, which one is picked
 * up twice a night and settles a match when it is.
 *
 * Summed in TypeScript rather than in Postgres, deliberately. Expanding the
 * documents SQL-side means a lateral join, and a lateral join means writing
 * `TOOK_PART` and `MATCH_COMPLETED` out again against an alias, which is exactly
 * the hand-copied twin that has gone wrong every time it has been written. The
 * caller filters with the real constants and hands the rows over; a night is a
 * couple of hundred rows of a dozen weapons each.
 *
 * Deliberately free of database imports so `node --test` can load it directly,
 * the same arrangement `pairings.ts` and `leaderboards.ts` use.
 */
import { accuracyOf, shootingIsSound } from "./accuracy.ts";

/** One weapon's line on one player's row in one match. */
export type WeaponRow = {
  /** The person, already resolved to one name however many they play under. */
  name: string;
  weapon: string;
  kills: number;
  shotsFired: number;
  shotsHit: number;
};

export type WeaponTotals = {
  weapon: string;
  kills: number;
  /** Share of every recorded weapon kill. */
  killShare: number;
  shotsFired: number;
  shotsHit: number;
  /**
   * Null where the weapon records no shots, or where the counters that do exist
   * contradict each other. Both are real and they are not the same thing, so
   * `tracksShots` tells them apart.
   */
  accuracy: number | null;
  /**
   * Whether this weapon reports shots at all.
   *
   * The explosives do not: the Rocket Launcher has kills on record and zero
   * shots, as do the Grenade and the Remote Charge, because the telemetry counts
   * a shot when a bullet leaves a barrel. An accuracy of 0% for a weapon that
   * has killed seventy people is the most misleading number this page could
   * print, so those are marked rather than divided. Asked of the rows rather
   * than kept as a list of explosives here, which would be one broadcaster
   * change away from being wrong with nothing to say so.
   */
  tracksShots: boolean;
  /** Rows whose hits exceeded their shots, left out of the two figures above. */
  unsoundRows: number;
  /** Who has the most kills with it, where anybody has any. */
  topKiller: { name: string; kills: number } | null;
};

/**
 * Totals per weapon, and the best shot with each.
 *
 * Hits and shots are summed only over rows that agree with themselves, and kills
 * over all of them. That split is the same trade `SOUND_SHOOTING` makes one
 * level up: a broken shot counter says nothing about whether the kills beside it
 * happened. Two Rail Driver rows on record report 2,595 hits from 825 shots,
 * which would otherwise publish the weapon at 314% accuracy.
 */
export function summariseWeapons(rows: WeaponRow[]): WeaponTotals[] {
  type Bucket = {
    kills: number;
    shotsFired: number;
    shotsHit: number;
    unsoundRows: number;
    sawShots: boolean;
    byPlayer: Map<string, { name: string; kills: number }>;
  };

  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    if (!row.weapon) continue;

    const bucket = buckets.get(row.weapon) ?? {
      kills: 0,
      shotsFired: 0,
      shotsHit: 0,
      unsoundRows: 0,
      sawShots: false,
      byPlayer: new Map(),
    };

    bucket.kills += row.kills;
    if (row.shotsFired > 0) bucket.sawShots = true;

    if (shootingIsSound(row.shotsHit, row.shotsFired)) {
      bucket.shotsFired += row.shotsFired;
      bucket.shotsHit += row.shotsHit;
    } else {
      bucket.unsoundRows++;
    }

    if (row.kills > 0) {
      // Per person, on the name the caller resolved. Keyed case-insensitively
      // so a spelling that drifted between matches does not split a total the
      // rest of the site keeps together.
      const key = row.name.toLocaleLowerCase("en-US");
      const player = bucket.byPlayer.get(key) ?? { name: row.name, kills: 0 };
      player.kills += row.kills;
      bucket.byPlayer.set(key, player);
    }

    buckets.set(row.weapon, bucket);
  }

  const totalKills = [...buckets.values()].reduce((sum, b) => sum + b.kills, 0);

  const totals: WeaponTotals[] = [];
  for (const [weapon, bucket] of buckets) {
    let topKiller: { name: string; kills: number } | null = null;
    for (const player of bucket.byPlayer.values()) {
      // A tie keeps the first alphabetically rather than whichever was inserted
      // first, so the page does not change between two identical readings.
      if (
        !topKiller ||
        player.kills > topKiller.kills ||
        (player.kills === topKiller.kills && player.name.localeCompare(topKiller.name, "en") < 0)
      ) {
        topKiller = { ...player };
      }
    }

    totals.push({
      weapon,
      kills: bucket.kills,
      killShare: totalKills > 0 ? bucket.kills / totalKills : 0,
      shotsFired: bucket.shotsFired,
      shotsHit: bucket.shotsHit,
      accuracy: accuracyOf(bucket.shotsHit, bucket.shotsFired),
      tracksShots: bucket.sawShots,
      unsoundRows: bucket.unsoundRows,
      topKiller,
    });
  }

  return totals.sort(
    (a, b) => b.kills - a.kills || a.weapon.localeCompare(b.weapon, "en"),
  );
}
