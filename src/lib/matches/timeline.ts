/**
 * A match as a shape, rather than as a list of things that happened.
 *
 * The capture track answered one question well: the order the flags went in.
 * Everything else the archive holds about a match, and it holds a great deal,
 * was either a table further down the page or nothing at all. A flag that was
 * carried nine tenths of the way and dropped at the door is the best moment in
 * many matches and appeared nowhere, because nobody scored.
 *
 * So this turns the three event streams into layers on one clock. Each layer is
 * a different reading of the same match and can be looked at on its own:
 *
 *   captures  who scored, when, and what the score became
 *   carries   every journey a flag made, including the ones that failed
 *   returns   where a flag was brought home, which is why they failed
 *   frags     the fighting, as density rather than as a list of four hundred
 *
 * **Everything is placed on the wall clock, never on the match clock.**
 * `elapsedSeconds` restarts at zero in overtime, so a golden goal placed by it
 * lands on top of the kick-off. `observedAt` is a real instant. A match whose
 * events carry no timestamps gets captures alone, evenly spaced, which states
 * the order without claiming a timing the record cannot support.
 *
 * Pure, so `node --test` can load it and so the positions can be checked
 * against a match that actually happened rather than against a screenshot.
 */

export type TimelineEvent = {
  elapsedSeconds: number;
  observedAt?: Date | string | null;
};

export type FlagEventLike = TimelineEvent & {
  eventType: string;
  flagOwner: string | null;
  playerName: string | null;
  carryMs: number;
  attribution: string | null;
};

export type KillLike = TimelineEvent & {
  killerName: string | null;
  killerTeam: string | null;
  victimName: string;
  suicide: boolean;
};

export type CaptureLike = TimelineEvent & {
  team: string;
  playerName: string | null;
  redScore: number;
  blueScore: number;
};

/** One journey of a flag: picked up, then dropped, captured or still held. */
export type Carry = {
  /** The flag being moved, so which side was attacking. */
  flagOwner: string;
  /** Whoever was carrying, which is one person per carry by definition. */
  carrier: string | null;
  /** The team doing the carrying, being the side the flag does not belong to. */
  team: string;
  from: number;
  to: number;
  /** How it ended, which is the whole interest of the layer. */
  ending: "captured" | "dropped" | "unfinished";
  seconds: number;
};

export type TimelineMark = {
  at: number;
  label: string;
  team: string | null;
  /** Set where the record infers rather than observes. See `attribution`. */
  inferred?: boolean;
};

export type Timeline = {
  /** True when positions are real times rather than an even spread. */
  timed: boolean;
  /** Seconds the match ran, where it can be known. */
  seconds: number | null;
  captures: (TimelineMark & { redScore: number; blueScore: number })[];
  carries: Carry[];
  returns: TimelineMark[];
  /** Frags bucketed along the clock, so four hundred of them read as pressure. */
  frags: { at: number; red: number; blue: number }[];
  /** Where regulation ended, 0 to 1, when a match went past it. */
  overtimeFrom: number | null;
};

/** Frag buckets across the match. Enough to show a surge, few enough to read. */
const FRAG_BUCKETS = 40;

const stamp = (value: Date | string | null | undefined): number | null => {
  if (!value) return null;
  const at = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(at) ? at : null;
};

const otherTeam = (team: string) =>
  team === "red" ? "blue" : team === "blue" ? "red" : team;

/**
 * The clock every layer is placed on.
 *
 * Built from the events themselves rather than only from the match's own start
 * and end, because a match can carry timestamps on its events and none on the
 * row, and because the first flag event is never the whistle.
 */
function clock(
  events: TimelineEvent[],
  startedAt: Date | string | null,
  endedAt: Date | string | null,
) {
  const stamps = events.map((event) => stamp(event.observedAt));
  const timed = stamps.length > 0 && stamps.every((value) => value !== null);

  if (!timed) return { timed: false, at: () => 0, seconds: null as number | null };

  const known = stamps as number[];
  const start = stamp(startedAt) ?? Math.min(...known);
  const end = stamp(endedAt) ?? Math.max(...known);
  const span = end - start;

  if (span <= 0) return { timed: false, at: () => 0, seconds: null as number | null };

  return {
    timed: true,
    at: (event: TimelineEvent) => {
      const value = stamp(event.observedAt);
      if (value === null) return 0;
      return Math.min(1, Math.max(0, (value - start) / span));
    },
    seconds: Math.round(span / 1000),
  };
}

export function buildTimeline({
  flagEvents,
  kills,
  captures,
  startedAt,
  endedAt,
}: {
  flagEvents: FlagEventLike[];
  kills: KillLike[];
  captures: CaptureLike[];
  startedAt: Date | string | null;
  endedAt: Date | string | null;
}): Timeline {
  const everything: TimelineEvent[] = [...flagEvents, ...kills, ...captures];
  const time = clock(everything, startedAt, endedAt);

  /*
   * Without timestamps only the captures can be drawn, and only as an order.
   * The other layers would be a guess about when things happened, which is a
   * worse answer than not drawing them: this is the same trade the accuracy
   * guard makes.
   */
  if (!time.timed) {
    return {
      timed: false,
      seconds: null,
      captures: captures.map((capture, index) => ({
        at: captures.length === 1 ? 0.5 : index / (captures.length - 1),
        label: capture.playerName ?? "unknown",
        team: capture.team,
        redScore: capture.redScore,
        blueScore: capture.blueScore,
      })),
      carries: [],
      returns: [],
      frags: [],
      overtimeFrom: null,
    };
  }

  /*
   * Carries, reconstructed per flag.
   *
   * A pickup opens one and the next drop, capture or return closes it. Two
   * pickups in a row mean the log lost a drop, so the open one is closed at the
   * second: losing the end of a carry is better than drawing one that runs to
   * the end of the match.
   */
  const carries: Carry[] = [];
  const open = new Map<string, { carrier: string | null; from: number }>();

  const flagOf = (event: { flagOwner: string | null }) =>
    (event.flagOwner ?? "").toLowerCase();

  const timed = [
    ...flagEvents.map((event) => ({ kind: "flag" as const, event })),
    ...captures.map((event) => ({ kind: "capture" as const, event })),
  ].sort((a, b) => time.at(a.event) - time.at(b.event));

  const close = (
    flag: string,
    to: number,
    ending: Carry["ending"],
  ) => {
    const carry = open.get(flag);
    if (!carry) return;
    open.delete(flag);
    carries.push({
      flagOwner: flag,
      carrier: carry.carrier,
      team: otherTeam(flag),
      from: carry.from,
      to,
      ending,
      seconds: Math.max(0, Math.round(((to - carry.from) * (time.seconds ?? 0)))),
    });
  };

  for (const entry of timed) {
    const at = time.at(entry.event);

    if (entry.kind === "capture") {
      // A capture by red is a capture of the blue flag.
      close(otherTeam(entry.event.team.toLowerCase()), at, "captured");
      continue;
    }

    const flag = flagOf(entry.event);
    if (!flag) continue;

    if (entry.event.eventType === "flag_pickup") {
      close(flag, at, "dropped");
      open.set(flag, { carrier: entry.event.playerName, from: at });
    } else if (entry.event.eventType === "flag_drop") {
      close(flag, at, "dropped");
    } else if (entry.event.eventType === "flag_return") {
      close(flag, at, "dropped");
    }
  }

  // Anything still open at the whistle happened and did not finish.
  for (const [flag, carry] of open) {
    carries.push({
      flagOwner: flag,
      carrier: carry.carrier,
      team: otherTeam(flag),
      from: carry.from,
      to: 1,
      ending: "unfinished",
      seconds: Math.max(0, Math.round((1 - carry.from) * (time.seconds ?? 0))),
    });
  }

  const returns: TimelineMark[] = flagEvents
    .filter((event) => event.eventType === "flag_return")
    .map((event) => ({
      at: time.at(event),
      label: event.playerName ?? "returned",
      team: otherTeam(flagOf(event)) === "red" ? "blue" : "red",
      // The game does not name the returner, so the archive infers one and says
      // so. A layer that quietly presented a guess as an observation would be
      // the worst thing on this page.
      inferred: event.attribution !== "observed",
    }));

  const frags = Array.from({ length: FRAG_BUCKETS }, (_, index) => ({
    at: index / (FRAG_BUCKETS - 1),
    red: 0,
    blue: 0,
  }));
  for (const kill of kills) {
    if (kill.suicide || !kill.killerTeam) continue;
    const bucket = Math.min(
      FRAG_BUCKETS - 1,
      Math.max(0, Math.round(time.at(kill) * (FRAG_BUCKETS - 1))),
    );
    if (kill.killerTeam === "red") frags[bucket].red += 1;
    else if (kill.killerTeam === "blue") frags[bucket].blue += 1;
  }

  /*
   * Where regulation ended.
   *
   * Found by the match clock going backwards, which is exactly what overtime
   * does to it and the reason nothing else here reads that field.
   */
  let overtimeFrom: number | null = null;
  let highest = -1;
  for (const entry of timed) {
    const elapsed = entry.event.elapsedSeconds;
    if (elapsed < highest - 5) {
      overtimeFrom = time.at(entry.event);
      break;
    }
    highest = Math.max(highest, elapsed);
  }

  return {
    timed: true,
    seconds: time.seconds,
    captures: captures.map((capture) => ({
      at: time.at(capture),
      label: capture.playerName ?? "unknown",
      team: capture.team,
      redScore: capture.redScore,
      blueScore: capture.blueScore,
    })),
    carries,
    returns,
    frags,
    overtimeFrom,
  };
}
