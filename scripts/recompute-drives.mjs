/**
 * Recomputes drive credit over the archive that is already stored.
 *
 *   npm run drives:recompute           what would change, writing nothing
 *   npm run drives:recompute -- --go   apply it
 *
 * Drive credit is derived, not recorded: who carried a flag, who finished
 * somebody else's run, and how long the flag's own journey took are all
 * reconstructed from the event log at ingest. That works for a day arriving, and
 * leaves every day already stored on whatever the rules were when it landed. The
 * VPS re-sends recent days on every sync so those correct themselves, and the
 * rest of the archive does not.
 *
 * Written for the change that made a fastest capture require an unbroken run,
 * stand to capture with the flag never on the floor. Every stored
 * `fastest_solo_capture_ms` predates that rule and some of them are journeys
 * that include the flag lying still.
 *
 * Reads the same event log the ingest read and runs the same two functions over
 * it, so this cannot drift from what a re-sent day would produce. It touches
 * only the five derived columns and never the numbers the server sent.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { flag } from "./cli-flags.mjs";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const { reconstructDrives, creditDrives } = await import("../src/lib/matches/drives.ts");

const sql = neon(process.env.DATABASE_URL);
const live = flag("go");

const matches = await sql`
  select id, source_match_id, archive_day::text as day, map_name, flag_events
  from matches order by started_at`;

let changed = 0;
let unchanged = 0;
const lines = [];

for (const match of matches) {
  const players = await sql`
    select id, name, solo_caps, relay_caps, lead_carries, winning_carry_ms,
           fastest_solo_capture_ms
    from match_players where match_id = ${match.id}`;
  const captures = await sql`
    select team, player_name, elapsed_seconds, observed_at
    from match_captures where match_id = ${match.id} order by observed_at`;

  const credit = creditDrives(
    reconstructDrives(
      (match.flag_events ?? []).map((event) => ({
        ...event,
        // Stored as text by the driver; the reconstruction times on it.
        observedAt: event.observedAt ?? null,
      })),
      captures.map((capture) => ({
        elapsedSeconds: capture.elapsed_seconds,
        team: capture.team,
        playerName: capture.player_name,
        observedAt: capture.observed_at,
      })),
    ),
  );

  for (const player of players) {
    const fresh = credit.get(player.name.toLocaleLowerCase("en-US")) ?? {
      soloCaps: 0,
      relayCaps: 0,
      leadCarries: 0,
      winningCarryMs: 0,
      fastestSoloCaptureMs: null,
    };

    const same =
      player.solo_caps === fresh.soloCaps &&
      player.relay_caps === fresh.relayCaps &&
      player.lead_carries === fresh.leadCarries &&
      player.winning_carry_ms === fresh.winningCarryMs &&
      player.fastest_solo_capture_ms === fresh.fastestSoloCaptureMs;

    if (same) {
      unchanged++;
      continue;
    }

    changed++;
    const was = player.fastest_solo_capture_ms;
    const now = fresh.fastestSoloCaptureMs;
    if (was !== now) {
      lines.push(
        `  match ${match.source_match_id} ${match.map_name}: ${player.name} ` +
          `best run ${was === null ? "none" : `${(was / 1000).toFixed(1)}s`} -> ` +
          `${now === null ? "none" : `${(now / 1000).toFixed(1)}s`}`,
      );
    }

    if (live) {
      await sql`
        update match_players set
          solo_caps = ${fresh.soloCaps},
          relay_caps = ${fresh.relayCaps},
          lead_carries = ${fresh.leadCarries},
          winning_carry_ms = ${fresh.winningCarryMs},
          fastest_solo_capture_ms = ${fresh.fastestSoloCaptureMs}
        where id = ${player.id}`;
    }
  }
}

for (const line of lines) console.log(line);

console.log(
  `\n${matches.length} matches: ${changed} player rows ${live ? "updated" : "would change"}, ` +
    `${unchanged} already right.`,
);
if (!live && changed > 0) console.log("Re-run with -- --go to apply.\n");
