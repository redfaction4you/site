/**
 * Works out who actually moved the flag on each capture.
 *
 * The scoreboard credits one person with a cap: whoever touched it down. But a
 * flag often changes hands. Someone carries it most of the length, dies at the
 * door, and a teammate picks it up and walks the last few metres. Both show up
 * as "1 cap" for the finisher and nothing at all for the carrier, which is not
 * what anyone who was in the game remembers happening.
 *
 * A drive is one journey of a flag: from the moment it leaves its base until it
 * is either captured or returned. Reconstructed from the flag event log, which
 * records every pickup, drop and return with a time.
 *
 * Vocabulary follows what people already say. A capper caps, a flag carrier
 * carries, and the only new term is lead carrier, meaning whoever carried it
 * longest on a drive somebody else finished.
 */
import type { PublicFlagEvent } from "./sanitize";

export type DriveCarrier = { name: string; carryMs: number };

export type Drive = {
  /** Which team's flag was being moved, so which team was scoring. */
  flagOwner: string;
  /** Seconds into the match when it was captured. */
  capturedAt: number;
  /** Who touched it down. */
  capper: string | null;
  /** Everyone who carried it, longest first. */
  carriers: DriveCarrier[];
  /** Longest carrier. Equal to the capper on a solo cap. */
  leadCarrier: string | null;
  /** True when one person carried it the whole way. */
  solo: boolean;
  /**
   * How long the flag took to get home, from leaving its stand to the capture.
   *
   * The flag's journey rather than anybody's possession, and the difference
   * matters: a drive can include time on the floor between a drop and the next
   * pickup, which belongs to the journey and to nobody's carry.
   *
   * A drive always begins from the stand, because a return resets it. That is
   * what makes this measurable at all.
   */
  journeyMs: number;
};

type CaptureLike = {
  elapsedSeconds: number;
  team: string;
  playerName: string | null;
  /** Optional. See `timeline` for why it is preferred when present. */
  observedAt?: Date | string | null;
};

type TimedLike = { elapsedSeconds: number; observedAt?: Date | string | null };

/**
 * Puts every event on one clock that only ever moves forward.
 *
 * `elapsedSeconds` is the match clock and **it restarts at zero in overtime**.
 * Reconstruction sorts by time, so on an overtime match the extra period sorted
 * in front of the first minute and the flag's journey came out shuffled. That is
 * not cosmetic: it changed who was credited. On three overtime matches on record
 * it turned two of Romek's solo captures into relays and gave one drive to a
 * player who had no part in it.
 *
 * `observed_at` is a real instant and is present on every event on record, so
 * where the whole match has it, everything is re-timed as seconds from the first
 * event. It is all or nothing per match: mixing an epoch in milliseconds with a
 * match clock in seconds would sort far worse than either alone. Without full
 * coverage this falls back to the match clock and behaves exactly as before,
 * which is right for any older export that never carried timestamps.
 *
 * The zero point becomes the first flag event rather than the whistle. Nothing
 * reads the absolute value; only the order and the gaps matter, and both survive.
 */
function timeline<T extends TimedLike>(events: T[]): (event: T) => number {
  const instants: number[] = [];

  for (const event of events) {
    const raw = event.observedAt;
    if (raw === undefined || raw === null) return (e) => e.elapsedSeconds;
    const ms = raw instanceof Date ? raw.getTime() : Date.parse(raw);
    if (!Number.isFinite(ms)) return (e) => e.elapsedSeconds;
    instants.push(ms);
  }

  if (instants.length === 0) return (e) => e.elapsedSeconds;

  const base = Math.min(...instants);
  return (event) => {
    const raw = event.observedAt;
    const ms = raw instanceof Date ? raw.getTime() : Date.parse(raw as string);
    return (ms - base) / 1000;
  };
}

function otherTeam(team: string): string {
  return team === "red" ? "blue" : team === "blue" ? "red" : "";
}

/**
 * Rebuilds every successful drive in a match.
 *
 * Failed drives, where the flag was returned before anyone scored, are dropped:
 * they are interesting but there is nothing to credit anybody for, and the
 * point of this is giving credit.
 */
export function reconstructDrives(
  flagEvents: PublicFlagEvent[],
  captures: CaptureLike[],
): Drive[] {
  // A capture by red is a capture of the blue flag, so index captures by the
  // flag that was being carried rather than by the team that scored.
  type Step =
    | { at: number; kind: "pickup"; player: string | null }
    | { at: number; kind: "drop"; player: string | null; carryMs: number }
    | { at: number; kind: "return" }
    | { at: number; kind: "capture"; player: string | null };

  const byFlag = new Map<string, Step[]>();

  const push = (flag: string, step: Step) => {
    if (!flag) return;
    const list = byFlag.get(flag);
    if (list) list.push(step);
    else byFlag.set(flag, [step]);
  };

  // One clock for both streams, so a capture cannot sort before the pickup that
  // led to it. Built from everything at once for the same reason.
  const clock = timeline([...flagEvents, ...captures]);

  for (const event of flagEvents) {
    const flag = (event.flagOwner ?? "").toLowerCase();
    if (event.eventType === "flag_pickup") {
      push(flag, { at: clock(event), kind: "pickup", player: event.playerName });
    } else if (event.eventType === "flag_drop") {
      push(flag, {
        at: clock(event),
        kind: "drop",
        player: event.playerName,
        carryMs: event.carryMs,
      });
    } else if (event.eventType === "flag_return") {
      push(flag, { at: clock(event), kind: "return" });
    }
  }

  for (const capture of captures) {
    push(otherTeam(capture.team.toLowerCase()), {
      at: clock(capture),
      kind: "capture",
      player: capture.playerName,
    });
  }

  const drives: Drive[] = [];

  for (const [flagOwner, steps] of byFlag) {
    steps.sort((a, b) => a.at - b.at);

    let holder: string | null = null;
    let heldSince = 0;
    let segments: DriveCarrier[] = [];
    // When the flag left its stand. A return resets it, which is what makes the
    // journey measurable: a drive always starts from home.
    let leftStandAt: number | null = null;

    const closeSegment = (at: number, carryMs?: number) => {
      if (!holder) return;
      segments.push({
        name: holder,
        /*
         * The event's own figure when it has one, since it is the server's
         * measurement rather than our arithmetic.
         *
         * Rounded, and that is load bearing rather than tidiness. Re-timing onto
         * `observed_at` made the clock fractional, so this arithmetic started
         * producing values like 27113.999999999975, and `winning_carry_ms` is a
         * Postgres integer. Every ingest failed with a type error until this was
         * rounded, which took the archive offline for a sync cycle.
         */
        carryMs:
          carryMs && carryMs > 0
            ? Math.round(carryMs)
            : Math.max(0, Math.round((at - heldSince) * 1000)),
      });
      holder = null;
    };

    for (const step of steps) {
      if (step.kind === "pickup") {
        // A pickup while somebody already holds it means we missed a drop.
        // Close what we have rather than losing the time.
        if (holder) closeSegment(step.at);
        if (leftStandAt === null) leftStandAt = step.at;
        holder = step.player;
        heldSince = step.at;
      } else if (step.kind === "drop") {
        closeSegment(step.at, step.carryMs);
      } else if (step.kind === "return") {
        // The flag went home. Nobody scored, so there is nothing to credit.
        holder = null;
        segments = [];
        leftStandAt = null;
      } else {
        closeSegment(step.at);

        // Merge repeat carries by the same player into one total.
        const totals = new Map<string, number>();
        for (const segment of segments) {
          if (!segment.name) continue;
          totals.set(segment.name, (totals.get(segment.name) ?? 0) + segment.carryMs);
        }

        // The capper always belongs in the drive even if the log missed their
        // pickup, otherwise a solo cap can come back with no carriers at all.
        if (step.player && !totals.has(step.player)) totals.set(step.player, 0);

        const carriers = [...totals.entries()]
          .map(([name, carryMs]) => ({ name, carryMs }))
          .sort((a, b) => b.carryMs - a.carryMs);

        drives.push({
          journeyMs:
            leftStandAt === null
              ? 0
              : Math.max(0, Math.round((step.at - leftStandAt) * 1000)),
          flagOwner,
          capturedAt: step.at,
          capper: step.player,
          carriers,
          leadCarrier: carriers[0]?.name ?? null,
          solo: carriers.length <= 1,
        });

        segments = [];
        leftStandAt = null;
      }
    }
  }

  return drives.sort((a, b) => a.capturedAt - b.capturedAt);
}

export type DriveCredit = {
  soloCaps: number;
  relayCaps: number;
  /** Drives this player carried longest and somebody else finished. */
  leadCarries: number;
  /** Total time carrying on drives that ended in a capture. */
  winningCarryMs: number;
  /**
   * The quickest flag journey this player completed alone, or null.
   *
   * The replacement for the server's `fastest_capture_ms`, which could not be
   * used honestly. That field is one scalar per player per match with no link to
   * any particular capture, so there was no way to check what it had measured,
   * and it produced a board led by a 2.7 second capture. Filtering on
   * `relay_caps = 0` removed most of the impossible values and could not remove
   * that one, because the player genuinely had a single unrelayed capture: the
   * number simply was not the length of a run.
   *
   * This is the flag's own journey, stand to capture, on drives one person
   * carried the whole way. Those are the only captures where the flag's time and
   * a player's time are the same thing, which is the entire reason the stat can
   * be attributed to anybody.
   */
  fastestSoloCaptureMs: number | null;
};

/** Per player credit for a match, keyed by lowercased name. */
export function creditDrives(drives: Drive[]): Map<string, DriveCredit> {
  const credit = new Map<string, DriveCredit>();

  const entry = (name: string): DriveCredit => {
    const key = name.toLocaleLowerCase("en-US");
    const found = credit.get(key);
    if (found) return found;
    const fresh = {
      soloCaps: 0,
      relayCaps: 0,
      leadCarries: 0,
      winningCarryMs: 0,
      fastestSoloCaptureMs: null as number | null,
    };
    credit.set(key, fresh);
    return fresh;
  };

  for (const drive of drives) {
    if (drive.capper) {
      const capper = entry(drive.capper);
      if (drive.solo) {
        capper.soloCaps++;
        // A journey of zero means the log lost the pickup, not an instant run.
        if (drive.journeyMs > 0) {
          capper.fastestSoloCaptureMs =
            capper.fastestSoloCaptureMs === null
              ? drive.journeyMs
              : Math.min(capper.fastestSoloCaptureMs, drive.journeyMs);
        }
      } else capper.relayCaps++;
    }

    // Lead carrier only counts when somebody else finished it. On a solo cap
    // the capper is already credited and counting it twice would flatter them.
    if (
      drive.leadCarrier &&
      drive.capper &&
      drive.leadCarrier.toLocaleLowerCase("en-US") !==
        drive.capper.toLocaleLowerCase("en-US")
    ) {
      entry(drive.leadCarrier).leadCarries++;
    }

    for (const carrier of drive.carriers) {
      entry(carrier.name).winningCarryMs += carrier.carryMs;
    }
  }

  // Belt and braces on the same problem. `winning_carry_ms` is an integer column
  // and a float reaching it fails the whole insert, taking the night's ingest
  // with it, so the value is rounded where it is produced and again here.
  for (const value of credit.values()) {
    value.winningCarryMs = Math.round(value.winningCarryMs);
  }

  return credit;
}
