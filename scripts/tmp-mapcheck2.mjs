import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);
const BASE = "https://redfaction4you.com";
const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const cell = (h) => h.replace(/<[^>]*>/g, "").replace(/&ndash;/g, "-").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").trim();

const maps = await sql`
  select m.map_name, count(*)::int as matches, sum(m.red_score + m.blue_score)::int as captures
  from matches m
  where (m.ended_at is null or m.started_at is null or extract(epoch from (m.ended_at - m.started_at)) >= 300)
  group by m.map_name order by count(*) desc`;

const problems = [];
for (const map of maps) {
  const html = await fetch(`${BASE}/matches/map/${slug(map.map_name)}`).then((r) => r.text());
  // The per-map table is the <ol> whose items link to /players/
  const ol = [...html.matchAll(/<ol[\s\S]*?<\/ol>/g)].find((m) => m[0].includes("/players/"));
  if (!ol) { problems.push(`${map.map_name}: no player table found`); continue; }

  const rows = [...ol[0].matchAll(/<li[\s\S]*?<\/li>/g)].map((li) => {
    const spans = [...li[0].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((s) => cell(s[1]));
    return spans.filter((s) => s !== "");
  });

  // rank, name, played, score, frags, deaths, caps, returns, acc, streak, [best run]
  let caps = 0, played = 0, frags = 0;
  for (const r of rows) {
    const n = r.map((v) => (/^-?\d+$/.test(v) ? Number(v) : null));
    const nums = n.filter((v) => v !== null);
    if (nums.length < 6) continue;
    played += nums[1]; frags += nums[3]; caps += nums[5] ?? 0;
  }

  const [db] = await sql`
    select coalesce(sum(p.caps),0)::int as caps, coalesce(sum(p.kills),0)::int as frags, count(*)::int as appearances
    from match_players p join matches m on m.id = p.match_id
    where m.map_name = ${map.map_name}
      and (m.ended_at is null or m.started_at is null or extract(epoch from (m.ended_at - m.started_at)) >= 300)
      and p.spectator = false and (p.score > 0 or p.kills > 0 or p.deaths > 0 or p.caps > 0
        or p.shots_fired > 0 or p.shots_hit > 0 or p.damage_taken > 0 or p.damage_given > 0
        or p.flag_pickups > 0 or p.flag_returns > 0 or p.max_streak > 0)`;

  const ok = caps === db.caps && frags === db.frags && played === db.appearances && caps === map.captures;
  console.log(
    `${map.map_name.padEnd(28)} rows ${String(rows.length).padStart(2)} · caps ${caps}/${db.caps} (map ${map.captures}) · frags ${frags}/${db.frags} · played ${played}/${db.appearances} ${ok ? "OK" : "<<<"}`,
  );
  if (caps !== db.caps) problems.push(`${map.map_name}: table caps ${caps} vs rows ${db.caps}`);
  if (caps !== map.captures) problems.push(`${map.map_name}: table caps ${caps} vs match scores ${map.captures}`);
  if (frags !== db.frags) problems.push(`${map.map_name}: table frags ${frags} vs rows ${db.frags}`);
  if (played !== db.appearances) problems.push(`${map.map_name}: table played ${played} vs appearances ${db.appearances}`);
}
console.log(problems.length ? `\n${problems.length} problems:\n  ` + problems.join("\n  ") : "\nEvery map table agrees with the rows.");
