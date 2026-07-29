/**
 * Writes a sanitised match day into Postgres.
 *
 * The dedicated server re-sends the last few days on every sync, so this has to
 * be idempotent: running it twice with the same payload must leave the same
 * rows, not duplicates. Matches upsert on (server, source_match_id); their
 * players and captures are replaced wholesale, because a later snapshot of a
 * match supersedes an earlier one rather than adding to it.
 */
import { and, eq, notInArray } from "drizzle-orm";

import { db } from "@/lib/db";
import { matchCaptures, matchPlayers, matches } from "@/lib/db/schema";
import { creditDrives, reconstructDrives } from "./drives";
import type { SanitizedDay } from "./sanitize";

export type IngestResult = {
  archiveDay: string;
  server: string;
  matchesWritten: number;
  playersWritten: number;
  capturesWritten: number;
};

export async function storeDay(day: SanitizedDay): Promise<IngestResult> {
  let playersWritten = 0;
  let capturesWritten = 0;
  const matchIds: string[] = [];

  for (const match of day.matches) {
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

    // Replace rather than merge. The payload is the authority on who played.
    await db.delete(matchPlayers).where(eq(matchPlayers.matchId, row.id));
    await db.delete(matchCaptures).where(eq(matchCaptures.matchId, row.id));

    // Who actually moved the flag on each capture. The scoreboard only records
    // who touched it down, so this is reconstructed from the event log.
    const credit = creditDrives(reconstructDrives(match.flagEvents, match.captures));

    if (match.players.length) {
      await db.insert(matchPlayers).values(
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
          }),
        })),
      );
      playersWritten += match.players.length;
    }

    if (match.captures.length) {
      await db.insert(matchCaptures).values(
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
      );
      capturesWritten += match.captures.length;
    }
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

  return {
    archiveDay: day.archiveDay,
    server: day.server,
    matchesWritten: day.matches.length,
    playersWritten,
    capturesWritten,
  };
}
