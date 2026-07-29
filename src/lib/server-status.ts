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

/** How long a cached answer stays good, in seconds. */
const REVALIDATE = 30;

/** Give up rather than hang a page render on a third party being slow. */
const TIMEOUT_MS = 4000;

export type ServerStatus =
  | { state: "online"; players: number; humans: number; bots: number; maxPlayers: number; map: string | null; gameType: string | null; client: string | null; matchMode: boolean }
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

    return {
      state: "online",
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
