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
};

type CaptureLike = {
  elapsedSeconds: number;
  team: string;
  playerName: string | null;
};

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

  for (const event of flagEvents) {
    const flag = (event.flagOwner ?? "").toLowerCase();
    if (event.eventType === "flag_pickup") {
      push(flag, { at: event.elapsedSeconds, kind: "pickup", player: event.playerName });
    } else if (event.eventType === "flag_drop") {
      push(flag, {
        at: event.elapsedSeconds,
        kind: "drop",
        player: event.playerName,
        carryMs: event.carryMs,
      });
    } else if (event.eventType === "flag_return") {
      push(flag, { at: event.elapsedSeconds, kind: "return" });
    }
  }

  for (const capture of captures) {
    push(otherTeam(capture.team.toLowerCase()), {
      at: capture.elapsedSeconds,
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

    const closeSegment = (at: number, carryMs?: number) => {
      if (!holder) return;
      segments.push({
        name: holder,
        // The event's own figure when it has one, since it is the server's
        // measurement rather than our arithmetic on whole seconds.
        carryMs: carryMs && carryMs > 0 ? carryMs : Math.max(0, (at - heldSince) * 1000),
      });
      holder = null;
    };

    for (const step of steps) {
      if (step.kind === "pickup") {
        // A pickup while somebody already holds it means we missed a drop.
        // Close what we have rather than losing the time.
        if (holder) closeSegment(step.at);
        holder = step.player;
        heldSince = step.at;
      } else if (step.kind === "drop") {
        closeSegment(step.at, step.carryMs);
      } else if (step.kind === "return") {
        // The flag went home. Nobody scored, so there is nothing to credit.
        holder = null;
        segments = [];
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
          flagOwner,
          capturedAt: step.at,
          capper: step.player,
          carriers,
          leadCarrier: carriers[0]?.name ?? null,
          solo: carriers.length <= 1,
        });

        segments = [];
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
};

/** Per player credit for a match, keyed by lowercased name. */
export function creditDrives(drives: Drive[]): Map<string, DriveCredit> {
  const credit = new Map<string, DriveCredit>();

  const entry = (name: string): DriveCredit => {
    const key = name.toLocaleLowerCase("en-US");
    const found = credit.get(key);
    if (found) return found;
    const fresh = { soloCaps: 0, relayCaps: 0, leadCarries: 0, winningCarryMs: 0 };
    credit.set(key, fresh);
    return fresh;
  };

  for (const drive of drives) {
    if (drive.capper) {
      const capper = entry(drive.capper);
      if (drive.solo) capper.soloCaps++;
      else capper.relayCaps++;
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

  return credit;
}
