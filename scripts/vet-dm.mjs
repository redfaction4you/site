/**
 * Vets the deathmatch archive against itself.
 *
 *   npm run vet:dm
 *
 * The DM tables have no completion rule and no night pages, so the CTF vet
 * does not cover them. What can still go wrong has already gone wrong once
 * each, which is where every check below comes from:
 *
 * - A player with kills or deaths but zero seconds played means the scoreboard
 *   stream is not reaching the archive, and the whole DM record ranks on that
 *   column. Built on the day the column was: the first design would have
 *   quietly rendered a board sorted on noughts.
 * - A round shorter than 30 seconds whose players carry stats is the phantom
 *   shape: the pre-fix DLL opened a round on a dying level at each rotation
 *   and stamped the previous round's totals onto it. One reached production on
 *   7 August 2026 and was swept by hand; this notices the next one.
 * - Hits exceeding shots is the same impossibility the CTF side vets.
 *
 * Reads only, so it is safe against production, which is the only database.
 * Exits non-zero on a finding — never run it inside a pipeline chain whose
 * exit code is read from the last command.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const sql = neon(process.env.DATABASE_URL);
const findings = [];

const untimed = await sql`
  select r.map_name, r.started_at::text as started, p.name, p.kills, p.deaths
  from dm_players p join dm_rounds r on r.id = p.round_id
  where (p.kills > 0 or p.deaths > 0) and p.seconds_played = 0
`;
for (const row of untimed) {
  findings.push(
    `untimed-player: ${row.name} has ${row.kills} kills / ${row.deaths} deaths but 0 seconds on ${row.map_name} (${row.started}) — the scoreboard stream is not landing`,
  );
}

const phantoms = await sql`
  select r.map_name, r.started_at::text as started,
         extract(epoch from (r.ended_at - r.started_at))::int as seconds,
         count(*) filter (where p.kills > 0 or p.deaths > 0) as scored_players
  from dm_rounds r join dm_players p on p.round_id = r.id
  where r.ended_at is not null
    and r.ended_at - r.started_at < interval '30 seconds'
  group by r.id, r.map_name, r.started_at, r.ended_at
  having count(*) filter (where p.kills > 0 or p.deaths > 0) > 0
`;
for (const row of phantoms) {
  findings.push(
    `phantom-shape: a ${row.seconds}s round on ${row.map_name} (${row.started}) carries ${row.scored_players} scored player(s) — the boundary-round bug, or something new wearing its clothes`,
  );
}

const impossible = await sql`
  select r.map_name, p.name, round(p.shots_hit::numeric, 2) as hit, round(p.shots_fired::numeric, 2) as fired
  from dm_players p join dm_rounds r on r.id = p.round_id
  where p.shots_hit > p.shots_fired
`;
for (const row of impossible) {
  findings.push(
    `hits-exceed-shots: ${row.name} on ${row.map_name}: ${row.hit} hits from ${row.fired} shots`,
  );
}

const [counts] = await sql`
  select count(distinct r.id) as rounds, count(p.id) as players
  from dm_rounds r left join dm_players p on p.round_id = r.id
`;

if (findings.length) {
  console.error(`DM archive: ${findings.length} finding(s) across ${counts.rounds} round(s):`);
  for (const finding of findings) console.error(`  - ${finding}`);
  process.exit(1);
}

console.log(
  `DM archive: nothing wrong across ${counts.rounds} round(s), ${counts.players} player row(s).`,
);
