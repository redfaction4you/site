import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);
const BASE = "https://redfaction4you.com";
const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const strip = (h) => h.replace(/<[^>]*>/g, " ").replace(/&ndash;/g, "-").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const [before] = await sql`select max(ingested_at) as at, count(*)::int as n from matches`;

const maps = await sql`
  select m.map_name,
    count(*)::int as matches,
    count(distinct m.archive_day)::int as nights,
    sum(m.red_score + m.blue_score)::int as captures,
    count(*) filter (where m.winner = 'red')::int as red,
    count(*) filter (where m.winner = 'blue')::int as blue,
    count(*) filter (where m.overtime)::int as ot,
    round(avg(extract(epoch from (m.ended_at - m.started_at))))::int as avg_secs,
    max(abs(m.red_score - m.blue_score)) filter (where m.winner in ('red','blue'))::int as biggest,
    (select coalesce(sum(p.caps),0)::int from match_players p join matches m2 on m2.id = p.match_id
      where m2.map_name = m.map_name
        and (m2.ended_at is null or m2.started_at is null or extract(epoch from (m2.ended_at - m2.started_at)) >= 300)) as player_caps,
    (select coalesce(max(p.caps),0)::int from match_players p join matches m2 on m2.id = p.match_id
      where m2.map_name = m.map_name
        and (m2.ended_at is null or m2.started_at is null or extract(epoch from (m2.ended_at - m2.started_at)) >= 300)) as most_caps,
    (select coalesce(max(p.kills),0)::int from match_players p join matches m2 on m2.id = p.match_id
      where m2.map_name = m.map_name
        and (m2.ended_at is null or m2.started_at is null or extract(epoch from (m2.ended_at - m2.started_at)) >= 300)) as most_frags,
    (select coalesce(max(p.max_streak),0)::int from match_players p join matches m2 on m2.id = p.match_id
      where m2.map_name = m.map_name
        and (m2.ended_at is null or m2.started_at is null or extract(epoch from (m2.ended_at - m2.started_at)) >= 300)) as best_streak,
    (select coalesce(max(p.flag_returns),0)::int from match_players p join matches m2 on m2.id = p.match_id
      where m2.map_name = m.map_name
        and (m2.ended_at is null or m2.started_at is null or extract(epoch from (m2.ended_at - m2.started_at)) >= 300)) as most_returns,
    (select min(p.fastest_solo_capture_ms)::int from match_players p join matches m2 on m2.id = p.match_id
      where m2.map_name = m.map_name and p.fastest_solo_capture_ms is not null
        and (m2.ended_at is null or m2.started_at is null or extract(epoch from (m2.ended_at - m2.started_at)) >= 300)) as fastest_run
  from matches m
  where (m.ended_at is null or m.started_at is null or extract(epoch from (m.ended_at - m.started_at)) >= 300)
  group by m.map_name order by count(*) desc`;

const problems = [];
for (const map of maps) {
  const body = strip(await fetch(`${BASE}/matches/map/${slug(map.map_name)}`).then((r) => r.text()));
  const want = (label, re, expected, format = (v) => v) => {
    const found = re.exec(body);
    if (!found) { problems.push(`${map.map_name}: could not read ${label}`); return; }
    const got = found[1].replace(/,/g, "");
    if (String(got) !== String(format(expected))) {
      problems.push(`${map.map_name}: ${label} shows ${got}, rows say ${format(expected)}`);
    }
  };

  want("matches", /Matches (\d+)/, map.matches);
  want("nights", /Nights (\d+)/, map.nights);
  want("captures", /Captures ([\d,]+) ·/, map.captures);
  want("captures a match", /Captures [\d,]+ · ([\d.]+) a match/, (map.captures / map.matches).toFixed(1));
  want("usual length", /Usual length (\d+:\d+)/, `${Math.floor(map.avg_secs / 60)}:${String(map.avg_secs % 60).padStart(2, "0")}`);
  if (map.ot > 0) want("overtime", /Overtime (\d+) of/, map.ot);
  if (map.red + map.blue > 0) {
    want("red wins", /How it goes (\d+) \//, map.red);
    want("blue wins", /How it goes \d+ \/ (\d+)/, map.blue);
    want("biggest win", /Biggest win by (\d+)/, map.biggest);
  }
  // The card reads label, then who did it, then the figure.
  if (map.fastest_run) want("fastest run", /Fastest run [^0-9]{1,40}?([\d.]+)s/, (map.fastest_run / 1000).toFixed(1));
  if (map.most_caps > 0) want("most captures", /Most captures [^0-9]{1,40}?(\d+)/, map.most_caps);
  if (map.most_frags > 0) want("most frags", /Most frags [^0-9]{1,40}?(\d+)/, map.most_frags);
  if (map.best_streak > 0) want("longest streak", /Longest streak [^0-9]{1,40}?(\d+)/, map.best_streak);
  if (map.most_returns > 0) want("most returns", /Most returns [^0-9]{1,40}?(\d+)/, map.most_returns);

  if (map.captures !== map.player_caps) {
    problems.push(`${map.map_name}: match scores total ${map.captures} captures, the scoreboards total ${map.player_caps}`);
  }
  console.log(`${map.map_name.padEnd(28)} checked`);
}

const [after] = await sql`select max(ingested_at) as at, count(*)::int as n from matches`;
console.log(`\nsync moved during the audit: ${String(before.at) !== String(after.at) || before.n !== after.n ? "YES — rerun" : "no"}`);
console.log(problems.length ? `\n${problems.length} problems:\n  ` + problems.join("\n  ") : "\nEvery figure on every map page matches the rows.");
