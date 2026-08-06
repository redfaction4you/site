import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
const sql = neon(process.env.DATABASE_URL);
const BASE = "https://redfaction4you.com";

const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const text = (html) => html.replace(/<[^>]*>/g, " ").replace(/&ndash;/g, "-").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const num = (v) => (v === undefined || v === null ? null : Number(String(v).replace(/,/g, "")));

const maps = await sql`
  select m.map_name,
    count(*)::int as matches, count(distinct m.archive_day)::int as nights,
    sum(m.red_score + m.blue_score)::int as captures,
    count(*) filter (where m.winner = 'red')::int as red_wins,
    count(*) filter (where m.winner = 'blue')::int as blue_wins,
    count(*) filter (where m.overtime)::int as overtime
  from matches m
  where (m.ended_at is null or m.started_at is null
    or extract(epoch from (m.ended_at - m.started_at)) >= 300)
  group by m.map_name order by count(*) desc`;

const problems = [];
for (const map of maps) {
  const html = await fetch(`${BASE}/matches/map/${slug(map.map_name)}`).then((r) => r.text());
  const body = text(html);

  const header = /Matches (\d+) Nights (\d+) Captures ([\d,]+) · ([\d.]+) a match(?: Usual length (\d+:\d+))?(?: Usual size ([\d.]+) players)?(?: Overtime (\d+) of (\d+))?/.exec(body);
  if (!header) { problems.push(`${map.map_name}: could not read the header`); continue; }

  const seen = {
    matches: num(header[1]), nights: num(header[2]), captures: num(header[3]),
    perMatch: num(header[4]), overtime: num(header[7]), overtimeOf: num(header[8]),
  };

  const check = (what, got, want) => {
    if (got !== want) problems.push(`${map.map_name}: ${what} shows ${got}, rows say ${want}`);
  };
  check("matches", seen.matches, map.matches);
  check("nights", seen.nights, map.nights);
  check("captures", seen.captures, map.captures);
  check("captures a match", seen.perMatch, Number((map.captures / map.matches).toFixed(1)));
  if (map.overtime > 0) {
    check("overtime count", seen.overtime, map.overtime);
    check("overtime denominator", seen.overtimeOf, map.matches);
  }

  // Red/blue split
  const split = /How it goes (\d+) \/ (\d+)/.exec(body);
  if (split) {
    check("red wins", num(split[1]), map.red_wins);
    check("blue wins", num(split[2]), map.blue_wins);
  } else if (map.red_wins + map.blue_wins > 0) {
    problems.push(`${map.map_name}: no red/blue split shown`);
  }

  // Player table: captures must sum to the map's captures
  const table = /On this map(.*?)(?:Other maps|$)/s.exec(body)?.[1] ?? "";
  const rowRe = /(\d+) ([A-Za-z0-9!}\[\]_.\- ]+?) (\d+) (\d+) (\d+) (\d+) (\d+|-) (\d+|-) ([\d.]+%|-)/g;
  let sumCaps = 0, sumPlayed = 0, seenRows = 0, match;
  while ((match = rowRe.exec(table))) {
    seenRows++;
    sumPlayed += Number(match[3]);
    sumCaps += match[7] === "-" ? 0 : Number(match[7]);
  }
  const [dbSums] = await sql`
    select coalesce(sum(p.caps),0)::int as caps, count(*)::int as rows
    from match_players p join matches m on m.id = p.match_id
    where m.map_name = ${map.map_name}
      and (m.ended_at is null or m.started_at is null
        or extract(epoch from (m.ended_at - m.started_at)) >= 300)
      and (p.spectator = false and (p.score > 0 or p.kills > 0 or p.deaths > 0 or p.caps > 0
        or p.shots_fired > 0 or p.shots_hit > 0 or p.damage_taken > 0 or p.damage_given > 0
        or p.flag_pickups > 0 or p.flag_returns > 0 or p.max_streak > 0))`;
  if (seenRows > 0 && sumCaps !== dbSums.caps) {
    problems.push(`${map.map_name}: player table caps sum to ${sumCaps}, rows say ${dbSums.caps}`);
  }
  if (seenRows > 0 && sumPlayed !== dbSums.rows) {
    problems.push(`${map.map_name}: player table "played" sums to ${sumPlayed}, rows say ${dbSums.rows}`);
  }
  console.log(`${map.map_name.padEnd(28)} header OK · rows parsed ${seenRows} · caps ${sumCaps}/${dbSums.caps} · played ${sumPlayed}/${dbSums.rows}`);
}

console.log(problems.length ? `\n${problems.length} problems:\n  ` + problems.join("\n  ") : "\nEvery map page agrees with the rows.");
