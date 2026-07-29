/**
 * Turns the dedicated server's private match export into what the site stores.
 *
 * Ported from the VPS handoff package's `lib/rf4u-archive.js`, with the storage
 * target changed from day-sized documents to database rows, and one addition:
 * the server's stable identity handle is carried through to a private column
 * rather than discarded. See `matchPlayers.identityKey` for why.
 *
 * This is a security boundary, so it is an allowlist. Every field on the way
 * out is named here. A new field appearing in the VPS export cannot leak
 * through by accident, it simply is not copied. That property is the whole
 * design, so do not replace this with a spread of the source object.
 *
 * Never carried through:
 *   IP addresses · Discord message and thread ids · Tailscale details
 *   VPS paths and secrets · player coordinates · server controls
 *   anything not named below
 */

/** RF4U match nights are grouped by this calendar day, not by UTC. */
export const ARCHIVE_TIME_ZONE = "America/Los_Angeles";

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function finite(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function whole(value: unknown): number {
  return Math.max(0, Math.round(finite(value)));
}

/** Strips control characters and caps length. Applied to every string. */
function text(value: unknown, maximum = 160): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, maximum);
}

function nullableText(value: unknown, maximum = 160): string | null {
  return text(value, maximum) || null;
}

function timestamp(value: unknown): Date | null {
  const raw = text(value, 40);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export type PublicPlayer = {
  name: string;
  team: string;
  spectator: boolean;
  score: number;
  kills: number;
  deaths: number;
  caps: number;
  maxStreak: number;
  accuracy: number;
  shotsHit: number;
  shotsFired: number;
  damageGiven: number;
  damageTaken: number;
  flagHoldMs: number;
  flagPickups: number;
  flagDrops: number;
  flagReturns: number;
  flagCarrierKills: number;
  flagCarrierDeaths: number;
  captureAssists: number;
  flagRecoveries: number;
  successfulFlagDrives: number;
  successfulCarryMs: number;
  fastestCaptureMs: number | null;
  /** Private. Stored, never served. */
  identityKey: string | null;
};

export type PublicCapture = {
  elapsedSeconds: number;
  team: string;
  redScore: number;
  blueScore: number;
  quantity: number;
  playerName: string | null;
  assists: string[];
  driveParticipants: { name: string; carry_ms: number }[];
  message: string;
  observedAt: Date | null;
};

export type PublicKill = {
  elapsedSeconds: number;
  killerName: string | null;
  killerTeam: string | null;
  victimName: string;
  victimTeam: string | null;
  weapon: string | null;
  suicide: boolean;
  teamKill: boolean;
  flagContext: string | null;
  observedAt: string | null;
};

export type PublicFlagEvent = {
  eventType: string;
  elapsedSeconds: number;
  flagOwner: string | null;
  playerName: string | null;
  killerName: string | null;
  victimName: string | null;
  carryMs: number;
  attribution: string | null;
  recovery: boolean;
  previousCarrierName: string | null;
  message: string;
  observedAt: string | null;
};

export type PublicRosterEvent = {
  eventType: string;
  playerName: string | null;
  fromTeam: string | null;
  toTeam: string | null;
  elapsedSeconds: number;
  observedAt: string | null;
};

export type PublicMatch = {
  sourceMatchId: number;
  status: string;
  mapName: string;
  mode: string;
  startedAt: Date | null;
  endedAt: Date | null;
  redScore: number;
  blueScore: number;
  overtime: boolean;
  winner: string | null;
  players: PublicPlayer[];
  captures: PublicCapture[];
  kills: PublicKill[];
  flagEvents: PublicFlagEvent[];
  rosterEvents: PublicRosterEvent[];
};

export type SanitizedDay = {
  archiveDay: string;
  server: string;
  matches: PublicMatch[];
};

/** Counters that are periodic snapshots, so the largest value is the latest. */
const MAX_FIELDS = [
  "score",
  "kills",
  "deaths",
  "caps",
  "maxStreak",
  "shotsHit",
  "shotsFired",
  "damageGiven",
  "damageTaken",
  "flagHoldMs",
  "flagPickups",
  "flagDrops",
  "flagReturns",
  "flagCarrierKills",
  "flagCarrierDeaths",
  "captureAssists",
  "flagRecoveries",
  "successfulFlagDrives",
  "successfulCarryMs",
] as const;

function sanitizePlayer(source: Record<string, unknown> = {}): PublicPlayer {
  const player: PublicPlayer = {
    name: text(source.name, 80) || "Unknown player",
    team: text(source.team, 24).toLowerCase(),
    spectator: Boolean(source.spectator),
    score: whole(source.score),
    kills: whole(source.kills),
    deaths: whole(source.deaths),
    caps: whole(source.caps),
    maxStreak: whole(source.max_streak),
    accuracy: Math.max(0, finite(source.accuracy)),
    shotsHit: Math.max(0, finite(source.shots_hit)),
    shotsFired: Math.max(0, finite(source.shots_fired)),
    damageGiven: Math.max(0, finite(source.damage_given)),
    damageTaken: Math.max(0, finite(source.damage_taken)),
    flagHoldMs: whole(source.flag_hold_ms),
    flagPickups: whole(source.flag_pickups),
    flagDrops: whole(source.flag_drops),
    flagReturns: whole(source.flag_returns),
    flagCarrierKills: whole(source.flag_carrier_kills),
    flagCarrierDeaths: whole(source.flag_carrier_deaths),
    captureAssists: whole(source.capture_assists),
    flagRecoveries: whole(source.flag_recoveries),
    successfulFlagDrives: whole(source.successful_flag_drives),
    successfulCarryMs: whole(source.successful_carry_ms),
    fastestCaptureMs: finite(source.fastest_capture_ms) > 0
      ? whole(source.fastest_capture_ms)
      : null,
    identityKey: nullableText(source.identity_id, 128),
  };

  // Recompute rather than trust: a reported accuracy and a shot count that
  // disagree should resolve to the one derived from the counts.
  if (player.shotsFired > 0) player.accuracy = player.shotsHit / player.shotsFired;

  return player;
}

/**
 * Merges two rows for the same player in the same match.
 *
 * The server emits periodic snapshots, so duplicate rows are the same player
 * counted twice, not two contributions. Summing them would roughly double
 * everyone's stats. Taking the maximum keeps the final value.
 */
export function mergePlayers(left: PublicPlayer, right: PublicPlayer): PublicPlayer {
  const merged: PublicPlayer = { ...left };

  merged.name = right.name.length >= left.name.length ? right.name : left.name;
  merged.team = right.team || left.team;
  merged.spectator = left.spectator && right.spectator;

  for (const field of MAX_FIELDS) {
    merged[field] = Math.max(left[field], right[field]);
  }

  const fastest = [left.fastestCaptureMs, right.fastestCaptureMs].filter(
    (value): value is number => typeof value === "number" && value > 0,
  );
  merged.fastestCaptureMs = fastest.length ? Math.min(...fastest) : null;

  merged.accuracy =
    merged.shotsFired > 0
      ? merged.shotsHit / merged.shotsFired
      : Math.max(left.accuracy, right.accuracy);

  // Keep whichever row actually carried an identity.
  merged.identityKey = left.identityKey ?? right.identityKey;

  return merged;
}

function consolidatePlayers(players: unknown): PublicPlayer[] {
  const byKey = new Map<string, PublicPlayer>();

  for (const source of Array.isArray(players) ? players : []) {
    const player = sanitizePlayer(source as Record<string, unknown>);
    // Team is part of the key: someone who switched sides mid-match genuinely
    // has two sets of numbers.
    const key = `${player.team}\u0000${player.name.toLocaleLowerCase("en-US")}`;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergePlayers(existing, player) : player);
  }

  return [...byKey.values()].sort((a, b) => {
    if (a.spectator !== b.spectator) return Number(a.spectator) - Number(b.spectator);
    if (a.team !== b.team) return a.team.localeCompare(b.team);
    return b.score - a.score || b.kills - a.kills || a.name.localeCompare(b.name);
  });
}

function sanitizeCapture(source: Record<string, unknown> = {}): PublicCapture {
  return {
    elapsedSeconds: whole(source.elapsed_seconds),
    team: text(source.team, 24).toLowerCase(),
    redScore: whole(source.red_score),
    blueScore: whole(source.blue_score),
    quantity: Math.max(1, whole(source.quantity)),
    playerName: nullableText(source.player_name, 80),
    assists: Array.isArray(source.capture_assists)
      ? source.capture_assists.map((n) => text(n, 80)).filter(Boolean).slice(0, 16)
      : [],
    driveParticipants: Array.isArray(source.drive_participants)
      ? source.drive_participants
          .map((p) => ({
            name: text((p as Record<string, unknown>)?.name, 80),
            carry_ms: whole((p as Record<string, unknown>)?.carry_ms),
          }))
          .filter((p) => p.name)
          .slice(0, 16)
      : [],
    message: text(source.message, 320),
    observedAt: timestamp(source.observed_at),
  };
}

/** Kill, flag and roster events, named field by field like everything else. */
function sanitizeKill(source: Record<string, unknown> = {}) {
  return {
    elapsedSeconds: whole(source.elapsed_seconds),
    killerName: nullableText(source.killer_name, 80),
    killerTeam: nullableText(source.killer_team, 24),
    victimName: text(source.victim_name, 80) || "Unknown player",
    victimTeam: nullableText(source.victim_team, 24),
    weapon: nullableText(source.weapon, 80),
    suicide: Boolean(source.suicide),
    teamKill: Boolean(source.team_kill),
    flagContext: nullableText(source.flag_context, 80),
    observedAt: nullableText(source.observed_at, 40),
  };
}

function sanitizeFlagEvent(source: Record<string, unknown> = {}) {
  return {
    eventType: text(source.event_type, 48),
    elapsedSeconds: whole(source.elapsed_seconds),
    flagOwner: nullableText(source.flag_owner, 24),
    playerName: nullableText(source.player_name, 80),
    killerName: nullableText(source.killer_name, 80),
    victimName: nullableText(source.victim_name, 80),
    carryMs: whole(source.carry_ms),
    attribution: nullableText(source.attribution, 80),
    recovery: Boolean(source.recovery),
    previousCarrierName: nullableText(source.previous_carrier_name, 80),
    message: text(source.message, 320),
    observedAt: nullableText(source.observed_at, 40),
  };
}

function sanitizeRosterEvent(source: Record<string, unknown> = {}) {
  return {
    eventType: text(source.event_type, 48),
    playerName: nullableText(source.player_name, 80),
    fromTeam: nullableText(source.from_team, 24),
    toTeam: nullableText(source.to_team, 24),
    elapsedSeconds: whole(source.elapsed_seconds),
    observedAt: nullableText(source.observed_at, 40),
  };
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function sanitizeMatch(source: Record<string, unknown> = {}): PublicMatch {
  return {
    sourceMatchId: whole(source.id),
    status: text(source.status, 24) || "unknown",
    mapName: text(source.map_name, 120) || "Unknown map",
    mode: text(source.mode, 24).toUpperCase() || "CTF",
    startedAt: timestamp(source.started_at),
    endedAt: timestamp(source.ended_at),
    redScore: whole(source.red_score),
    blueScore: whole(source.blue_score),
    overtime: Boolean(source.overtime),
    winner: nullableText(source.winner, 24),
    players: consolidatePlayers(source.players),
    captures: list(source.captures).map(sanitizeCapture).slice(0, 128),
    kills: list(source.kills).map(sanitizeKill).slice(0, 5000),
    flagEvents: list(source.flagEvents).map(sanitizeFlagEvent).slice(0, 2000),
    rosterEvents: list(source.rosterEvents).map(sanitizeRosterEvent).slice(0, 1000),
  };
}

/** YYYY-MM-DD for an instant, in the archive's timezone. */
export function calendarDay(value: string | Date, zone = ARCHIVE_TIME_ZONE): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error("Archive timestamp is invalid");

  // en-CA formats as YYYY-MM-DD, which is what we want.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function isValidDay(value: unknown): boolean {
  const raw = String(value ?? "");
  if (!DAY_PATTERN.test(raw)) return false;
  const [year, month, day] = raw.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

/**
 * Match states we do not keep.
 *
 * A cancelled match is one that was abandoned before it counted, a bad map
 * load, a restart, someone dropping in the first minute. Its scoreboard is
 * noise: it drags player averages down and pads the match count with games
 * nobody played. The archive is a record of matches that happened.
 *
 * Dropped at ingest rather than hidden at display, so it never occupies a row
 * or an id. Because ingest removes matches that disappear from a re-synced day,
 * anything already stored and later cancelled is cleaned up on the next sync.
 */
const DISCARDED_STATUSES = new Set(["cancelled", "canceled", "aborted"]);

/** Sanitises a whole day's export. Throws if it is not usable. */
export function sanitizeDay(source: unknown): SanitizedDay {
  if (!source || typeof source !== "object") {
    throw new Error("Archive payload must be a JSON object");
  }

  const payload = source as Record<string, unknown>;
  const matches = list(payload.matches)
    .map(sanitizeMatch)
    .filter((match) => !DISCARDED_STATUSES.has(match.status.toLowerCase()))
    .slice(0, 128);

  let archiveDay: string;
  if (isValidDay(payload.calendarDate)) {
    archiveDay = String(payload.calendarDate);
  } else {
    const range = payload.range as Record<string, unknown> | undefined;
    const fallback = range?.from ?? matches[0]?.startedAt;
    if (!fallback) throw new Error("Archive payload has no usable date");
    archiveDay = calendarDay(
      fallback as string | Date,
      text(payload.archiveTimeZone, 64) || ARCHIVE_TIME_ZONE,
    );
  }

  return {
    archiveDay,
    server: text(payload.server, 120) || "RF4U Competitive [Match]",
    matches,
  };
}
