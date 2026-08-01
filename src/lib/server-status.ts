/**
 * Is our server up, and who is on it.
 *
 * One HTTP request to FactionFiles' public server-browser API, for our server
 * and nothing else. That distinction matters: this is not the UDP tracker the
 * build plan cut twice. There is no socket to keep open, no Windows service, no
 * list of other people's servers to maintain, and nothing stored. If the API
 * goes away the page says it does not know, and everything else still works.
 *
 * Cached for a short window so a busy page does not hammer somebody else's
 * service, 30 seconds is fresh enough for "is anyone playing" and polite.
 */

const RFSB_API = "https://rfsb.factionfiles.com/api/v2/server";
const RFSB_PLAYERS_API = "https://rfsb.factionfiles.com/api/v2/players";
const RFSB_LOOKUP_API = "https://rfsb.factionfiles.com/api/v2/ff-rfl-lookup";

/** How long a cached answer stays good, in seconds. */
const REVALIDATE = 30;

/** Give up rather than hang a page render on a third party being slow. */
const TIMEOUT_MS = 4000;

/** Live state of the game in progress, when there is one. */
export type LiveGame = {
  /** Seconds remaining, or null if the server does not report it. */
  timeLeft: number | null;
  redScore: number;
  blueScore: number;
  teamBased: boolean;
  /**
   * Who is on, and how they are doing.
   *
   * The shape is now verified against a live server, which it never had been:
   * every earlier check found the server empty, so the array was always empty
   * and the parser was written blind. It was wrong in two ways. There is no
   * `team` field, so the side was always null, and `kills`, `deaths` and `caps`
   * were being thrown away without anybody noticing there was nothing to
   * display.
   *
   * Still parsed defensively. Anything unrecognised is simply not shown.
   */
  players: LivePlayer[];
};

export type LivePlayer = {
  name: string;
  /** Red, blue, or null when the game is not team based. */
  team: "red" | "blue" | null;
  score: number | null;
  kills: number | null;
  deaths: number | null;
  caps: number | null;
};

/** The current map, matched to its FactionFiles page and preview image. */
export type MapInfo = {
  name: string;
  fileId: number;
  imageUrl: string;
  pageUrl: string;
};

export type ServerStatus =
  | {
      state: "online";
      players: number;
      humans: number;
      bots: number;
      maxPlayers: number;
      map: string | null;
      gameType: string | null;
      client: string | null;
      matchMode: boolean;
      /** Server rule flags, already filtered and labelled for display. */
      rules: string[];
      /** Null when the extra lookups failed; the page just shows less. */
      game: LiveGame | null;
      mapInfo: MapInfo | null;
    }
  | { state: "offline" }
  /** The browser API could not be reached. We do not know, and say so. */
  | { state: "unknown"; reason: string };

type RfsbResponse = {
  success?: boolean;
  error?: string;
  info?: {
    name?: string;
    level_name?: string;
    game_type?: string;
    patch_name?: string;
    patch_ver?: string;
    flags?: string[];
    rfl_name?: string;
    player_count_info?: {
      num_players?: number;
      max_players?: number;
      num_bots?: number;
      num_humans?: number;
    };
  };
};

const GAME_TYPES: Record<string, string> = {
  capture_the_flag: "CTF",
  team_deathmatch: "Team deathmatch",
  deathmatch: "Deathmatch",
};

/** Turns "capture_the_flag" into something a person would say. */
function gameType(raw: string | undefined): string | null {
  if (!raw) return null;
  return GAME_TYPES[raw] ?? raw.replace(/_/g, " ");
}

/**
 * Flags that tell a player nothing. Every server in the browser is dedicated
 * and internet-listed, so showing them is noise on a panel meant to answer
 * "what am I joining".
 */
const IGNORED_FLAGS = new Set(["dedicated", "internet", "lan", "passworded_off"]);

/**
 * Readable names for the rule flags the browser reports.
 *
 * Only the ones whose meaning is unambiguous get a rewritten label. Anything
 * else falls through to its own name with the underscores taken out, which is
 * honest: a flag we do not recognise is shown as the server named it rather
 * than guessed at.
 */
const FLAG_LABELS: Record<string, string> = {
  af_only: "Alpine only",
  match_mode: "Match mode",
  gaussian_spread: "Gaussian spread",
  damage_notifications: "Damage numbers",
  force_respawn: "Force respawn",
  balance_teams: "Balanced teams",
  team_damage: "Team damage",
  fall_damage: "Fall damage",
  weapons_stay: "Weapons stay",
  flag_dropping: "Flag dropping",
  drop_amps: "Drop amps",
};

function ruleTags(flags: string[] | undefined): string[] {
  if (!Array.isArray(flags)) return [];
  return flags
    .filter((flag) => !IGNORED_FLAGS.has(flag))
    .map((flag) => FLAG_LABELS[flag] ?? flag.replace(/_/g, " "));
}

/** Shared fetch: short timeout, cached, and never throws past the caller. */
async function getJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: REVALIDATE },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * The in-progress game: score, clock and who is playing.
 *
 * Separate endpoint from the server summary, so it is fetched only when the
 * server is actually up. A failure here degrades the panel rather than the page.
 */
async function getLiveGame(host: string, port: string): Promise<LiveGame | null> {
  const body = await getJson<{
    success?: boolean;
    game?: {
      time_left?: number;
      scores?: { red?: number; blue?: number };
      is_team_based?: boolean;
    };
    players?: unknown[];
  }>(`${RFSB_PLAYERS_API}/${host}/${port}`);

  if (!body?.success || !body.game) return null;

  const teamBased = Boolean(body.game.is_team_based);
  const number = (value: unknown) => (typeof value === "number" ? value : null);

  const players = (Array.isArray(body.players) ? body.players : [])
    .map((entry) => {
      const p = entry as Record<string, unknown>;
      const name = typeof p.name === "string" ? p.name : null;
      if (!name) return null;

      /*
       * The side, which the payload states only for blue.
       *
       * Observed live: every blue player carries `blue_team` in `flags` and
       * every red player carries an empty array. There is no `red_team` marker
       * to look for, so red is the absence of blue, which is only safe to
       * assume while the game is team based. It is read anyway in case the
       * server ever starts sending it.
       */
      const flags = Array.isArray(p.flags)
        ? p.flags.filter((flag): flag is string => typeof flag === "string")
        : [];

      const team: "red" | "blue" | null = flags.includes("blue_team")
        ? "blue"
        : flags.includes("red_team")
          ? "red"
          : teamBased
            ? "red"
            : null;

      return {
        name,
        team,
        score: number(p.score),
        kills: number(p.kills),
        deaths: number(p.deaths),
        caps: number(p.caps),
      };
    })
    .filter((p): p is LivePlayer => p !== null);

  return {
    timeLeft: typeof body.game.time_left === "number" ? body.game.time_left : null,
    redScore: body.game.scores?.red ?? 0,
    blueScore: body.game.scores?.blue ?? 0,
    teamBased,
    players,
  };
}

/**
 * Matches the running map to its FactionFiles entry, which is where the preview
 * image comes from. Two hops: the level filename resolves to a file id, and the
 * id addresses the image.
 */
async function getMapInfo(rflName: string | undefined): Promise<MapInfo | null> {
  if (!rflName) return null;

  const lookup = await getJson<{
    success?: boolean;
    file_name?: string;
    file_id?: number;
    guessed?: boolean;
  }>(`${RFSB_LOOKUP_API}/${encodeURIComponent(rflName)}`);

  if (!lookup?.success || !lookup.file_id) return null;

  return {
    name: lookup.file_name || rflName,
    fileId: lookup.file_id,
    imageUrl: `https://www.factionfiles.com/files_images/preview.php?id=${lookup.file_id}`,
    pageUrl: `https://www.factionfiles.com/ff.php?action=file&id=${lookup.file_id}`,
  };
}

export async function getServerStatus(): Promise<ServerStatus> {
  const address = process.env.NEXT_PUBLIC_SERVER_ADDRESS;
  if (!address) return { state: "unknown", reason: "No server address configured." };

  const [host, port] = address.split(":");
  if (!host || !port) {
    return { state: "unknown", reason: "Server address is not host:port." };
  }

  try {
    const response = await fetch(`${RFSB_API}/${host}/${port}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: REVALIDATE },
    });

    if (!response.ok) {
      return { state: "unknown", reason: `Server browser returned ${response.status}.` };
    }

    const body = (await response.json()) as RfsbResponse;

    // The browser answers `success: false` for a server it cannot reach, which
    // is the honest meaning of offline: nobody could contact it just now.
    if (!body.success || !body.info) return { state: "offline" };

    const counts = body.info.player_count_info ?? {};

    // Only now that we know the server is up. Both are optional extras: if
    // either fails the panel shows less rather than the page failing.
    const [game, mapInfo] = await Promise.all([
      getLiveGame(host, port),
      getMapInfo(body.info.rfl_name),
    ]);

    return {
      state: "online",
      game,
      mapInfo,
      players: counts.num_players ?? 0,
      humans: counts.num_humans ?? counts.num_players ?? 0,
      bots: counts.num_bots ?? 0,
      maxPlayers: counts.max_players ?? 0,
      map: body.info.level_name || null,
      gameType: gameType(body.info.game_type),
      client:
        body.info.patch_name && body.info.patch_ver
          ? `${body.info.patch_name} ${body.info.patch_ver}`
          : null,
      matchMode: Boolean(body.info.flags?.includes("match_mode")),
      rules: ruleTags(body.info.flags),
    };
  } catch (error) {
    // A timeout or a network failure means we do not know, not that the server
    // is down. Saying "offline" here would be a guess presented as a fact.
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? "The server browser did not respond in time."
        : "Could not reach the server browser.";
    return { state: "unknown", reason };
  }
}
