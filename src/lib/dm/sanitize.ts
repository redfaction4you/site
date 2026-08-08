/**
 * Turns the deathmatch server's day export into what the site stores.
 *
 * The same broadcaster program feeds both servers, so the document arriving
 * here has the same shape as a CTF night: a calendar day, a server name, and an
 * array the broadcaster calls `matches`, one entry per map rotation. Almost all
 * of it is thrown away.
 *
 * **Deathmatch is not match based.** A round is kept for provenance — so a
 * total can be traced back to something that happened — and nothing browses
 * them. What survives is who was on the server, what they did with a gun, and
 * when. Captures, flag events, kill logs, roster events, teams and scorelines
 * are dropped here rather than stored and ignored, because a column nobody
 * reads is a column somebody eventually reads by mistake.
 *
 * This is the same kind of security boundary as `../matches/sanitize.ts` and it
 * is an allowlist for the same reason: every field on the way out is named
 * below, so a new field appearing in the export cannot leak through by
 * accident. Do not replace any of it with a spread of the source object.
 *
 * The shooting rules are imported rather than restated. Hits and shots are one
 * measurement, a tuple is believed or rejected whole, and a newer broken
 * reading never displaces an older sound one. That rule cost the archive a
 * published accuracy of 1067% to learn, and a second copy of it here would be
 * the copy that drifts.
 */
import { tookPart } from "../matches/participation.ts";
import { describeModes, isDeathmatchMode } from "../matches/modes.ts";
import {
  ARCHIVE_TIME_ZONE,
  DISCARDED_STATUSES,
  calendarDay,
  chooseShotTuple,
  finite,
  isValidDay,
  mergeWeaponStats,
  nullableText,
  readShotTuple,
  sanitizeWeaponStats,
  text,
  timestamp,
  whole,
  type PublicWeaponStat,
  type ShotTuple,
} from "../matches/sanitize.ts";

/**
 * One player's guns for one round.
 *
 * Much narrower than its CTF counterpart, and everything absent is absent
 * because the game does not have it. No team, no caps, no flag anything. No
 * `accuracy` either: it is derived from the pair at read time by `accuracyOf`,
 * which is the only thing allowed to divide these two numbers.
 */
export type PublicDmPlayer = {
  name: string;
  /** The side, on a team round. Null on a free-for-all, which is most of them. */
  team: string | null;
  kills: number;
  deaths: number;
  score: number;
  maxStreak: number;
  shotsHit: number;
  shotsFired: number;
  damageGiven: number;
  damageTaken: number;
  /**
   * When they arrived and when they were last seen, in this round.
   *
   * The export has no `seconds_played` and never did — the guess that it might
   * was wrong, and reading the real payload settled it. It has these, and they
   * are real session spans rather than snapshot windows: on match 42 every
   * player had one row spanning 1,077 seconds, which is that match exactly.
   */
  firstSeen: Date | null;
  lastSeen: Date | null;
  /** The span above, in seconds. The denominator of every rate on the DM pages. */
  secondsPlayed: number;
  /**
   * Powerup pickups, sent since the 7 August continuous-telemetry DLL: the
   * damage amp, invulnerability, super armor and super health. Zero on rounds
   * recorded before that DLL, and zero on maps that simply have none.
   */
  powerupAmps: number;
  powerupInvulns: number;
  powerupSuperArmors: number;
  powerupSuperHealths: number;
  weaponStats: PublicWeaponStat[];
  /** Private. Stored, never served. Same HMAC, same salt, so same person. */
  identityKey: string | null;
  /** Kept only long enough to merge snapshots. Not stored. */
  shots: ShotTuple;
};

export type SanitizedDmRound = {
  sourceRoundId: number;
  mapName: string;
  startedAt: Date | null;
  endedAt: Date | null;
  players: PublicDmPlayer[];
};

export type SanitizedDmDay = {
  archiveDay: string;
  server: string;
  rounds: SanitizedDmRound[];
};

/** Snapshot counters, so the largest reading is the latest one. */
const MAX_FIELDS = [
  "kills",
  "deaths",
  "score",
  "maxStreak",
  "damageGiven",
  "damageTaken",
  // Powerup counts are running totals like kills, so the largest reading wins.
  "powerupAmps",
  "powerupInvulns",
  "powerupSuperArmors",
  "powerupSuperHealths",
  // secondsPlayed is deliberately absent: it is derived from the two instants
  // below, and taking the largest of two spans would throw away the earlier
  // arrival. See `mergeDmPlayers`.
  // shotsHit and shotsFired are deliberately absent, exactly as they are on the
  // CTF side. They are one measurement. See `chooseShotTuple`.
] as const;

/** The earlier of two instants, ignoring a missing one. */
function earliest(left: Date | null, right: Date | null): Date | null {
  if (!left || !right) return left ?? right;
  return left.getTime() <= right.getTime() ? left : right;
}

/** The later of two instants, ignoring a missing one. */
function latest(left: Date | null, right: Date | null): Date | null {
  if (!left || !right) return left ?? right;
  return left.getTime() >= right.getTime() ? left : right;
}

/** The span between two instants in whole seconds, or 0 where there is not one. */
function spanSeconds(from: Date | null, to: Date | null): number {
  if (!from || !to) return 0;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
}

function sanitizePlayer(source: Record<string, unknown> = {}): PublicDmPlayer {
  const firstSeen = timestamp(source.first_seen);
  const lastSeen = timestamp(source.last_seen);

  return {
    name: text(source.name, 80) || "Unknown player",
    // Empty on a free-for-all, which is most rounds. Stored as null rather than
    // an empty string so "no sides" and "side unknown" cannot be told apart by
    // accident later.
    team: text(source.team, 24).toLowerCase() || null,
    firstSeen,
    lastSeen,
    secondsPlayed: spanSeconds(firstSeen, lastSeen),
    kills: whole(source.kills),
    deaths: whole(source.deaths),
    score: whole(source.score),
    maxStreak: whole(source.max_streak),
    powerupAmps: whole(source.powerup_amps),
    powerupInvulns: whole(source.powerup_invulns),
    powerupSuperArmors: whole(source.powerup_super_armors),
    powerupSuperHealths: whole(source.powerup_super_healths),
    shotsHit: Math.max(0, finite(source.shots_hit)),
    shotsFired: Math.max(0, finite(source.shots_fired)),
    damageGiven: Math.max(0, finite(source.damage_given)),
    damageTaken: Math.max(0, finite(source.damage_taken)),
    weaponStats: sanitizeWeaponStats(source.weapon_stats),
    identityKey: nullableText(source.identity_id, 128),
    shots: readShotTuple(source),
  };
}

/**
 * Merges two snapshots of the same player in the same round.
 *
 * Identical reasoning to the CTF side: the server emits periodic snapshots, so
 * two rows are one player counted twice and summing them would double
 * everybody's evening.
 */
export function mergeDmPlayers(
  left: PublicDmPlayer,
  right: PublicDmPlayer,
): PublicDmPlayer {
  const merged: PublicDmPlayer = { ...left };

  merged.name = right.name.length >= left.name.length ? right.name : left.name;

  for (const field of MAX_FIELDS) {
    merged[field] = Math.max(left[field], right[field]);
  }

  const shots = chooseShotTuple(left.shots, right.shots);
  merged.shots = shots;
  merged.shotsHit = shots.shotsHit;
  merged.shotsFired = shots.shotsFired;

  merged.identityKey = left.identityKey ?? right.identityKey;
  merged.team = left.team ?? right.team;
  merged.weaponStats = mergeWeaponStats(left.weaponStats, right.weaponStats);

  /*
   * The session is the outside of both snapshots, and the time is derived from
   * it afterwards.
   *
   * Not `Math.max` on the two spans, which is the obvious move and is wrong in
   * the case that matters: two snapshots of somebody who was there the whole
   * round each cover part of it, and the longer part is not the round. Taking
   * the earliest arrival and the latest sighting gives the span they were
   * actually present for. It is the same reasoning as `chooseShotTuple` from
   * the other end — those two numbers are one measurement and must not be
   * combined independently; these two are the ends of one span.
   */
  merged.firstSeen = earliest(left.firstSeen, right.firstSeen);
  merged.lastSeen = latest(left.lastSeen, right.lastSeen);
  merged.secondsPlayed = spanSeconds(merged.firstSeen, merged.lastSeen);

  return merged;
}

/**
 * One row per person, and nobody who was not there.
 *
 * Rows with nothing at all recorded are dropped here rather than stored and
 * filtered at read time, which is the opposite of what the CTF side does. The
 * reason is the reason deathmatch got its own tables: a row that cannot be
 * selected beats a row every future query has to remember to exclude. On the
 * CTF side those rows are evidence about a specific match somebody may dispute.
 * Here they are somebody who connected while a map was loading, and there is no
 * match page for them to be missing from.
 *
 * The test for having been there is `tookPart`, shared with the match archive
 * so the two cannot come to disagree about what playing means. It reads the
 * fields deathmatch has and ignores the flag counters that are not here.
 */
function consolidatePlayers(players: unknown): PublicDmPlayer[] {
  const byName = new Map<string, PublicDmPlayer>();

  for (const source of Array.isArray(players) ? players : []) {
    const row = source as Record<string, unknown>;
    // Real spectators arrive marked. They are watching, not playing.
    if (row.spectator || text(row.team, 24).toLowerCase() === "spectator") continue;

    const player = sanitizePlayer(row);
    // Name only. There are no sides to have switched.
    const key = player.name.toLocaleLowerCase("en-US");
    const existing = byName.get(key);
    byName.set(key, existing ? mergeDmPlayers(existing, player) : player);
  }

  return [...byName.values()]
    .filter((player) => tookPart(player))
    .sort((a, b) => b.kills - a.kills || b.score - a.score || a.name.localeCompare(b.name));
}

function sanitizeRound(source: Record<string, unknown> = {}): SanitizedDmRound {
  return {
    sourceRoundId: whole(source.id),
    mapName: text(source.map_name, 120) || "Unknown map",
    startedAt: timestamp(source.started_at),
    endedAt: timestamp(source.ended_at),
    players: consolidatePlayers(source.players),
  };
}

/**
 * Sanitises a whole day of deathmatch. Throws if it is not usable.
 *
 * **No minimum duration.** The CTF ingest drops a short `final` match because a
 * start that was abandoned is not a match that happened, and putting a nil-nil
 * in the middle of a night misdescribes the evening. Deathmatch has no such
 * thing: a rotation that lasted ninety seconds because the map was voted on is
 * still ninety seconds in which people fragged each other, and the cumulative
 * record is the sum of what happened rather than a list of contests. Rounds are
 * dropped only when the server itself says they were cancelled, and when
 * nobody was on them.
 */
export function sanitizeDmDay(source: unknown): SanitizedDmDay {
  if (!source || typeof source !== "object") {
    throw new Error("Archive payload must be a JSON object");
  }

  const payload = source as Record<string, unknown>;
  const raw = Array.isArray(payload.matches)
    ? (payload.matches as Record<string, unknown>[])
    : [];

  /*
   * Wrong game, refused whole.
   *
   * This is the routing check, and it is the only thing standing between a
   * misconfigured `.env` on the VPS and a night of capture the flag written
   * into the deathmatch record, where it would be summed into everybody's
   * cumulative frags and nothing would look wrong. See `../matches/modes.ts`.
   *
   * Every round has to be deathmatch, not most of them. A document carrying
   * both is not a rotation, it is two servers' data in one file, and there is
   * no reading of that which is safe to store.
   */
  const kept = raw.filter(
    (round) => !DISCARDED_STATUSES.has(text(round.status, 24).toLowerCase()),
  );
  const foreign = kept.filter((round) => !isDeathmatchMode(round.mode));
  if (foreign.length) {
    throw new Error(
      `This endpoint stores deathmatch, and ${foreign.length} of ${kept.length} ` +
        `${kept.length === 1 ? "round is" : "rounds are"} ` +
        `${describeModes(foreign.map((round) => round.mode))}. ` +
        `Capture the flag belongs at /api/rf4u/archive/ingest.`,
    );
  }

  const rounds = kept
    .map(sanitizeRound)
    // A rotation nobody was on is not provenance for anything.
    .filter((round) => round.players.length > 0)
    .slice(0, 256);

  let archiveDay: string;
  if (isValidDay(payload.calendarDate)) {
    archiveDay = String(payload.calendarDate);
  } else {
    const range = payload.range as Record<string, unknown> | undefined;
    const fallback = range?.from ?? rounds[0]?.startedAt;
    if (!fallback) throw new Error("Archive payload has no usable date");
    archiveDay = calendarDay(
      fallback as string | Date,
      text(payload.archiveTimeZone, 64) || ARCHIVE_TIME_ZONE,
    );
  }

  /*
   * The server name is the payload's, with no default.
   *
   * The CTF sanitizer falls back to the match server's name because it was
   * written when there was one server and a blank could only have meant that
   * one. There are two now, `dm_rounds.server` is half of the key an ingest
   * upserts on, and a document that will not say where it came from must not be
   * filed under a guess.
   */
  const server = text(payload.server, 120);
  if (!server) throw new Error("Archive payload does not say which server sent it");

  return { archiveDay, server, rounds };
}
