/**
 * Vets every night already in the archive.
 *
 *   npm run vet            every night
 *   npm run vet 2026-07-29 one night
 *
 * The same checks the ingest runs, over history rather than over what just
 * arrived. Two reasons to have it as a command as well as a step: a check added
 * today should be answerable about last week, and when something looks wrong on
 * a page this says whether the data or the writing is at fault, which are very
 * different problems.
 *
 * Reads only. It never edits a row, so it is safe to run against production,
 * which is the only database there is.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const { summarise, vetNight } = await import("../src/lib/matches/vet.ts");

const sql = neon(process.env.DATABASE_URL);
const only = process.argv.slice(2).find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));

const days = await sql`
  select distinct archive_day::text as day
  from matches where status = 'final'
  ${only ? sql`and archive_day = ${only}` : sql``}
  order by day desc`;

if (days.length === 0) {
  console.log("\nNothing to vet.\n");
  process.exit(0);
}

let errors = 0;
let notes = 0;

for (const { day } of days) {
  const matches = await sql`
    select id, source_match_id, map_name, red_score, blue_score, winner
    from matches where archive_day = ${day} and status = 'final'
    order by started_at`;

  const ids = matches.map((m) => m.id);
  const players = await sql`
    select match_id, name, team, spectator, kills, deaths, caps,
           shots_hit, shots_fired, fastest_capture_ms, solo_caps, relay_caps
    from match_players where match_id = any(${ids})`;
  const captures = await sql`
    select match_id, team, player_name from match_captures where match_id = any(${ids})`;

  const vettable = matches.map((m) => ({
    sourceMatchId: m.source_match_id,
    mapName: m.map_name,
    redScore: m.red_score,
    blueScore: m.blue_score,
    winner: m.winner,
    players: players
      .filter((p) => p.match_id === m.id)
      .map((p) => ({
        name: p.name,
        team: p.team,
        spectator: p.spectator,
        kills: p.kills,
        deaths: p.deaths,
        caps: p.caps,
        shotsHit: p.shots_hit,
        shotsFired: p.shots_fired,
        fastestCaptureMs: p.fastest_capture_ms,
        soloCaps: p.solo_caps,
        relayCaps: p.relay_caps,
      })),
    captures: captures
      .filter((c) => c.match_id === m.id)
      .map((c) => ({ team: c.team, playerName: c.player_name })),
  }));

  const found = vetNight(day, vettable);
  errors += found.filter((a) => a.severity === "error").length;
  notes += found.length - found.filter((a) => a.severity === "error").length;

  console.log(`\n${day}  ${matches.length} matches  ${summarise(found)}`);
  for (const anomaly of found) {
    console.log(`  ${anomaly.severity === "error" ? "!" : "-"} ${anomaly.check}`);
    console.log(`    ${anomaly.detail}`);
  }
}

console.log(
  `\n${days.length} ${days.length === 1 ? "night" : "nights"} vetted: ` +
    `${errors} error${errors === 1 ? "" : "s"}, ${notes} note${notes === 1 ? "" : "s"}.\n`,
);

// A non-zero exit on real errors, so this can gate something later if wanted.
process.exit(errors > 0 ? 1 : 0);
