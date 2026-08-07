/**
 * Writes a sanitised match day into Postgres.
 *
 * The dedicated server re-sends the last few days on every sync, so this has to
 * be idempotent: running it twice with the same payload must leave the same
 * rows, not duplicates. Matches upsert on (server, source_match_id); their
 * players and captures are replaced wholesale, because a later snapshot of a
 * match supersedes an earlier one rather than adding to it.
 */
import { createHash } from "node:crypto";
import { and, eq, notInArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { db } from "@/lib/db";
import { archiveDays, matchCaptures, matchPlayers, matches } from "@/lib/db/schema";
import { MIN_COMPLETED_SECONDS } from "./completion";
import { creditDrives, reconstructDrives } from "./drives";
import type { SanitizedDay } from "./sanitize";

export type IngestResult = {
  archiveDay: string;
  server: string;
  matchesWritten: number;
  playersWritten: number;
  capturesWritten: number;
  /** True when the payload matched what is already stored and nothing was written. */
  unchanged: boolean;
};

/**
 * How long a day is trusted on its fingerprint alone before being rewritten.
 *
 * A matching hash says the payload has not changed. It does not say the rows
 * are still there: somebody can delete one by hand, and the thing that used to
 * put it back was the very rewrite this skips. Six hours keeps that repair and
 * still turns ninety-six rewrites a day into four.
 */
const REVERIFY_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * What this day's payload looks like, as one value.
 *
 * `SanitizedDay` is built field by field in a fixed order by `sanitize.ts`, so
 * `JSON.stringify` over it is stable between runs. Dates serialise to ISO
 * strings, which are stable too. It does not need to be a canonical hash; it
 * needs to change whenever the day changes and not otherwise.
 */
function fingerprint(day: SanitizedDay): string {
  return createHash("sha256").update(JSON.stringify(day)).digest("hex");
}

export async function storeDay(day: SanitizedDay): Promise<IngestResult> {
  const hash = fingerprint(day);

  const [seen] = await db
    .select({ contentHash: archiveDays.contentHash, writtenAt: archiveDays.writtenAt })
    .from(archiveDays)
    .where(
      and(eq(archiveDays.server, day.server), eq(archiveDays.archiveDay, day.archiveDay)),
    )
    .limit(1);

  const fresh =
    seen !== undefined &&
    Date.now() - new Date(seen.writtenAt).getTime() < REVERIFY_AFTER_MS;

  if (seen?.contentHash === hash && fresh) {
    return {
      archiveDay: day.archiveDay,
      server: day.server,
      matchesWritten: 0,
      playersWritten: 0,
      capturesWritten: 0,
      unchanged: true,
    };
  }

  return writeDay(day, hash);
}

async function writeDay(day: SanitizedDay, hash: string): Promise<IngestResult> {
  let playersWritten = 0;
  let capturesWritten = 0;
  const matchIds: string[] = [];
  let cancelled = 0;

  for (const match of day.matches) {
    /*
     * A start that was abandoned is not stored at all.
     *
     * It used to be kept and excluded from every total, on the argument that a
     * cancelled match did happen and the archive should not forget it. In
     * practice it is a nil-nil sitting in the middle of a night that nobody
     * played, it has to be marked everywhere it is listed, and the person who
     * runs the league would rather it were gone. It is his archive.
     *
     * Dropping it here rather than deleting the row is what makes it stick: the
     * VPS re-sends the last few days on every sync, so a row deleted by hand is
     * back within fifteen minutes. Skipping it also leaves it out of `matchIds`,
     * which is what the sweep below deletes against, so anything already stored
     * goes on the next sync without a separate step.
     *
     * `final` and a clock are both required. A match still being played is
     * pushed as `live` and is legitimately short; a match with no end time is
     * missing a clock rather than short, and that distinction is the same one
     * `matchCompleted` makes. Getting this wrong would silently discard real
     * matches, so it errs toward keeping.
     */
    if (
      match.status === "final" &&
      match.startedAt &&
      match.endedAt &&
      (match.endedAt.getTime() - match.startedAt.getTime()) / 1000 <
        MIN_COMPLETED_SECONDS
    ) {
      cancelled++;
      continue;
    }

    const [row] = await db
      .insert(matches)
      .values({
        sourceMatchId: match.sourceMatchId,
        server: day.server,
        archiveDay: day.archiveDay,
        status: match.status,
        mapName: match.mapName,
        mode: match.mode,
        startedAt: match.startedAt,
        endedAt: match.endedAt,
        redScore: match.redScore,
        blueScore: match.blueScore,
        overtime: match.overtime,
        winner: match.winner,
        kills: match.kills,
        flagEvents: match.flagEvents,
        rosterEvents: match.rosterEvents,
        ingestedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [matches.server, matches.sourceMatchId],
        set: {
          archiveDay: day.archiveDay,
          status: match.status,
          mapName: match.mapName,
          mode: match.mode,
          startedAt: match.startedAt,
          endedAt: match.endedAt,
          redScore: match.redScore,
          blueScore: match.blueScore,
          overtime: match.overtime,
          winner: match.winner,
          kills: match.kills,
          flagEvents: match.flagEvents,
          rosterEvents: match.rosterEvents,
          ingestedAt: new Date(),
        },
      })
      .returning({ id: matches.id });

    matchIds.push(row.id);

    // Who actually moved the flag on each capture. The scoreboard only records
    // who touched it down, so this is reconstructed from the event log.
    const credit = creditDrives(reconstructDrives(match.flagEvents, match.captures));

    /*
     * The replace goes out as one batch, which Neon runs as one transaction.
     *
     * It used to be a delete awaited, then an insert awaited, and between those
     * two round trips the match had no players. Any page rendering in that gap
     * showed an empty scoreboard, and any total counted the night one match
     * short. It ran for every match in three days every fifteen minutes, so the
     * gap was open something like fifteen hundred times a day, and it is what
     * made `vet:pages` fail once and pass twice on identical data.
     *
     * `db.batch` is the only transaction this driver has: `neon-http` cannot
     * hold an interactive one open across awaits, which is why nothing here has
     * ever used `db.transaction`. A batch is enough, because the whole replace
     * is known before any of it is sent.
     */
    const replace: BatchItem<"pg">[] = [
      db.delete(matchPlayers).where(eq(matchPlayers.matchId, row.id)),
      db.delete(matchCaptures).where(eq(matchCaptures.matchId, row.id)),
    ];

    if (match.players.length) {
      replace.push(
        db.insert(matchPlayers).values(
        match.players.map((player) => ({
          matchId: row.id,
          name: player.name,
          team: player.team,
          spectator: player.spectator,
          score: player.score,
          kills: player.kills,
          deaths: player.deaths,
          caps: player.caps,
          maxStreak: player.maxStreak,
          accuracy: player.accuracy,
          shotsHit: player.shotsHit,
          shotsFired: player.shotsFired,
          damageGiven: player.damageGiven,
          damageTaken: player.damageTaken,
          flagHoldMs: player.flagHoldMs,
          flagPickups: player.flagPickups,
          flagDrops: player.flagDrops,
          flagReturns: player.flagReturns,
          flagCarrierKills: player.flagCarrierKills,
          flagCarrierDeaths: player.flagCarrierDeaths,
          captureAssists: player.captureAssists,
          flagRecoveries: player.flagRecoveries,
          successfulFlagDrives: player.successfulFlagDrives,
          successfulCarryMs: player.successfulCarryMs,
          fastestCaptureMs: player.fastestCaptureMs,
          weaponStats: player.weaponStats,
          identityKey: player.identityKey,
          ...(credit.get(player.name.toLocaleLowerCase("en-US")) ?? {
            soloCaps: 0,
            relayCaps: 0,
            leadCarries: 0,
            winningCarryMs: 0,
            fastestSoloCaptureMs: null,
          }),
        })),
        ),
      );
      playersWritten += match.players.length;
    }

    if (match.captures.length) {
      replace.push(
        db.insert(matchCaptures).values(
          match.captures.map((capture) => ({
            matchId: row.id,
            elapsedSeconds: capture.elapsedSeconds,
            team: capture.team,
            redScore: capture.redScore,
            blueScore: capture.blueScore,
            quantity: capture.quantity,
            playerName: capture.playerName,
            assists: capture.assists,
            driveParticipants: capture.driveParticipants,
            message: capture.message,
            observedAt: capture.observedAt,
          })),
        ),
      );
      capturesWritten += match.captures.length;
    }

    // `batch` is typed as a non-empty tuple; the two deletes are always there.
    await db.batch(replace as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  }

  // A match deleted upstream, voided, or a mistake corrected, should vanish
  // here too, otherwise the archive slowly fills with matches that no longer
  // exist and nobody can tell which are real.
  if (matchIds.length) {
    await db
      .delete(matches)
      .where(
        and(
          eq(matches.server, day.server),
          eq(matches.archiveDay, day.archiveDay),
          notInArray(matches.id, matchIds),
        ),
      );
  }

  if (cancelled > 0) {
    console.info(
      `[ingest] ${day.archiveDay}: skipped ${cancelled} cancelled ${cancelled === 1 ? "start" : "starts"}`,
    );
  }

  /*
   * Recorded last, on purpose.
   *
   * Everything above has to have succeeded for this fingerprint to be true. A
   * run that throws part way leaves the previous value in place, so the next
   * sync sees a mismatch and writes the day again rather than trusting a write
   * that did not finish. Storing it first would turn one failed ingest into a
   * day that is never repaired.
   */
  await db
    .insert(archiveDays)
    .values({ server: day.server, archiveDay: day.archiveDay, contentHash: hash })
    .onConflictDoUpdate({
      target: [archiveDays.server, archiveDays.archiveDay],
      set: { contentHash: hash, writtenAt: new Date() },
    });

  return {
    archiveDay: day.archiveDay,
    server: day.server,
    matchesWritten: matchIds.length,
    playersWritten,
    capturesWritten,
    unchanged: false,
  };
}
