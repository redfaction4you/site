/**
 * Writes a sanitised deathmatch day into Postgres.
 *
 * Same contract as the match archive's ingest and for the same reason: the VPS
 * re-sends its recent days every fifteen minutes, so running this twice with
 * the same payload has to leave the same rows rather than twice as many. Rounds
 * upsert on (server, source_round_id); their players are replaced wholesale,
 * because a later snapshot of a round supersedes an earlier one rather than
 * adding to it.
 *
 * What is deliberately not here: no drive reconstruction, no vetting, no
 * generated writing, no announcements. Those all exist because a CTF match is a
 * contest somebody will read a report about. A deathmatch round is a map
 * rotation, and the only thing that reads any of this is a cumulative record.
 */
import { createHash } from "node:crypto";
import { and, eq, notInArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { db } from "@/lib/db";
import { archiveDays, dmPlayers, dmRounds } from "@/lib/db/schema";
import type { SanitizedDmDay } from "./sanitize";

export type DmIngestResult = {
  archiveDay: string;
  server: string;
  roundsWritten: number;
  playersWritten: number;
  /**
   * How many player rows arrived with a time on them.
   *
   * Reported rather than assumed. `seconds_played` is not in the documented
   * export contract and the DM record wants time on the server, so this is the
   * cheapest possible answer to whether that column can be built: the first
   * real sync says so in its own response, in the VPS log, without anybody
   * having to query anything. The archive has already shipped two stat boards
   * whose source was a counter the server never fills in.
   */
  playersTimed: number;
  /** True when the payload matched what is stored and nothing was written. */
  unchanged: boolean;
};

/** Same six hours the match archive uses, for the same reason. See `matches/ingest.ts`. */
const REVERIFY_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * How this day is keyed in `archive_days`, which both games share.
 *
 * The prefix, rather than a second table. `archive_days` is keyed on server and
 * day, and the two servers have different names, so in practice the rows could
 * not collide. In practice is not the standard here: the name is whatever the
 * payload says it is, a second broadcaster instance is configured by hand, and
 * a copied `.env` that kept the old name would have the two games invalidating
 * each other's fingerprint every fifteen minutes and rewriting both days
 * forever. A prefix no CTF row can carry costs one line and removes the case.
 */
function fingerprintKey(server: string): string {
  return `dm:${server}`;
}

function fingerprint(day: SanitizedDmDay): string {
  return createHash("sha256").update(JSON.stringify(day)).digest("hex");
}

export async function storeDmDay(day: SanitizedDmDay): Promise<DmIngestResult> {
  const hash = fingerprint(day);
  const key = fingerprintKey(day.server);

  const [seen] = await db
    .select({ contentHash: archiveDays.contentHash, writtenAt: archiveDays.writtenAt })
    .from(archiveDays)
    .where(and(eq(archiveDays.server, key), eq(archiveDays.archiveDay, day.archiveDay)))
    .limit(1);

  const fresh =
    seen !== undefined &&
    Date.now() - new Date(seen.writtenAt).getTime() < REVERIFY_AFTER_MS;

  if (seen?.contentHash === hash && fresh) {
    return {
      archiveDay: day.archiveDay,
      server: day.server,
      roundsWritten: 0,
      playersWritten: 0,
      playersTimed: 0,
      unchanged: true,
    };
  }

  return writeDay(day, hash, key);
}

async function writeDay(
  day: SanitizedDmDay,
  hash: string,
  key: string,
): Promise<DmIngestResult> {
  let playersWritten = 0;
  let playersTimed = 0;
  const roundIds: string[] = [];

  for (const round of day.rounds) {
    const [row] = await db
      .insert(dmRounds)
      .values({
        server: day.server,
        sourceRoundId: round.sourceRoundId,
        archiveDay: day.archiveDay,
        mapName: round.mapName,
        startedAt: round.startedAt,
        endedAt: round.endedAt,
        ingestedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [dmRounds.server, dmRounds.sourceRoundId],
        set: {
          archiveDay: day.archiveDay,
          mapName: round.mapName,
          startedAt: round.startedAt,
          endedAt: round.endedAt,
          ingestedAt: new Date(),
        },
      })
      .returning({ id: dmRounds.id });

    roundIds.push(row.id);

    /*
     * One batch, which Neon runs as one transaction.
     *
     * The match ingest learned this the expensive way: a delete awaited and
     * then an insert awaited leaves the round with no players in between, and
     * anything reading in that window sees a round that nobody was on. Here
     * that would be worse than an empty scoreboard, because the DM pages are
     * sums over every round rather than a page per round, so the gap moves
     * somebody's career total rather than one page.
     *
     * `db.batch`, not `db.transaction`: `neon-http` cannot hold an interactive
     * transaction open across awaits.
     */
    const replace: BatchItem<"pg">[] = [
      db.delete(dmPlayers).where(eq(dmPlayers.roundId, row.id)),
    ];

    if (round.players.length) {
      replace.push(
        db.insert(dmPlayers).values(
          round.players.map((player) => ({
            roundId: row.id,
            name: player.name,
            kills: player.kills,
            deaths: player.deaths,
            score: player.score,
            maxStreak: player.maxStreak,
            shotsHit: player.shotsHit,
            shotsFired: player.shotsFired,
            damageGiven: player.damageGiven,
            damageTaken: player.damageTaken,
            secondsPlayed: player.secondsPlayed,
            weaponStats: player.weaponStats,
            identityKey: player.identityKey,
          })),
        ),
      );
      playersWritten += round.players.length;
      playersTimed += round.players.filter((player) => player.secondsPlayed > 0).length;
    }

    await db.batch(replace as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  }

  // A round deleted upstream should vanish here too. This is the whole reason
  // `dm_rounds` carries a day: without it there is no set to sweep.
  if (roundIds.length) {
    await db
      .delete(dmRounds)
      .where(
        and(
          eq(dmRounds.server, day.server),
          eq(dmRounds.archiveDay, day.archiveDay),
          notInArray(dmRounds.id, roundIds),
        ),
      );
  }

  /*
   * Written last, on purpose, exactly as on the CTF side. A run that throws
   * part way leaves the previous fingerprint in place, so the next sync sees a
   * mismatch and writes the day again rather than trusting an unfinished write.
   */
  await db
    .insert(archiveDays)
    .values({ server: key, archiveDay: day.archiveDay, contentHash: hash })
    .onConflictDoUpdate({
      target: [archiveDays.server, archiveDays.archiveDay],
      set: { contentHash: hash, writtenAt: new Date() },
    });

  return {
    archiveDay: day.archiveDay,
    server: day.server,
    roundsWritten: roundIds.length,
    playersWritten,
    playersTimed,
    unchanged: false,
  };
}
