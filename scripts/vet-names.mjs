/**
 * Vets the names, not the numbers.
 *
 *   npm run vet:names                                # a local dev server
 *   npm run vet:names -- https://redfaction4you.com  # production
 *
 * `vet:pages` asks whether a page contradicts itself about a figure. This asks
 * whether it contradicts itself about a person, which is the other half of the
 * same problem and had no check at all.
 *
 * Names on this server are neither unique nor stable. `identities.ts` groups a
 * person's rows however many names they played under, which fixed every total
 * and none of the prose: a kill in the event log, a capture's assist list, a
 * sentence the server composed, a match report, a column and an opinion piece
 * all carry a bare name with no identity beside it. Ten aliases were live on
 * production when this was written, the plainest being a front page reading
 * "Special ED" over a results strip that said Romek. One person, two labels,
 * and the label linking to a page headed with the other one.
 *
 * Reads the aliases from the archive and the pages over HTTP, so it needs
 * DATABASE_URL. That is the one thing `vet-pages.mjs` deliberately does not
 * need, which is why this is a separate script rather than another check inside
 * it.
 */
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

/*
 * Never announce anything from here.
 *
 * DISCORD_NEWS_WEBHOOK is set in .env.local and absent in production, so a
 * script that loads that file is one careless import away from posting to the
 * community channel. This one only reads, and should stay unable to.
 */
delete process.env.DISCORD_NEWS_WEBHOOK;

const args = process.argv.slice(2);
const BASE = (args.find((arg) => /^https?:\/\//i.test(arg)) ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Checked .env.local, then .env.");
  process.exit(2);
}

const sql = neon(process.env.DATABASE_URL);

/*
 * Every name anybody has played under, against the one the site shows for that
 * person. `mode()` and the chosen name from /admin, exactly as DISPLAY_NAME
 * resolves them, so this cannot come to disagree with the pages it is checking.
 */
const rows = await sql`
  select lower(mp.name) as alias, c.name as canonical
  from match_players mp
  join (
    select coalesce(mp2.identity_key, lower(mp2.name)) as key,
           coalesce(min(pi.display_name),
                    mode() within group (order by mp2.name)) as name
    from match_players mp2
    left join player_identities pi on pi.identity_key = mp2.identity_key
    group by 1
  ) c on c.key = coalesce(mp.identity_key, lower(mp.name))
  group by 1, 2
`;

const aliases = rows.filter((row) => row.alias !== row.canonical.toLowerCase());

if (aliases.length === 0) {
  console.log(`\nNobody on record has played under more than one name. Nothing to check.\n`);
  process.exit(0);
}

console.log(`\nReading ${BASE}`);
console.log(`${aliases.length} aliases on record: ${aliases.map((a) => a.alias).join(", ")}\n`);

/** Every page a name can reach, taken from the sitemap plus the ones not in it. */
const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
const fromSitemap = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  // The sitemap carries absolute URLs against the production host, which is not
  // necessarily the host being read. Only the path is wanted.
  .map((match) => new URL(match[1]).pathname)
  .filter((path) => path !== "/");

const paths = [
  "/",
  "/players",
  "/players/pairings",
  "/stats",
  ...new Set(fromSitemap),
];

/*
 * A name is only a leak where a reader can see it. `/players/s9` as an href is
 * how an old link keeps working, which is deliberate, so tags are stripped and
 * only the text between them is searched.
 */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ");
}

const NAME_CONTINUES = /[\w$}]|![\w$}]/;

function shows(text, alias) {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^\\w!$}])(${escaped})(?!${NAME_CONTINUES.source})`, "i");
  return pattern.test(text);
}

const problems = [];
let read = 0;

for (const path of paths) {
  const response = await fetch(`${BASE}${path}`);
  if (!response.ok) {
    problems.push({ path, detail: `answered ${response.status}` });
    continue;
  }

  read++;
  const text = visibleText(await response.text());

  for (const { alias, canonical } of aliases) {
    if (shows(text, alias)) {
      problems.push({ path, detail: `shows "${alias}", who the site calls "${canonical}"` });
    }
  }
}

for (const problem of problems) {
  console.log(`  ! ${problem.path}`);
  console.log(`    ${problem.detail}`);
}

console.log(
  `\n${read} ${read === 1 ? "page" : "pages"} read on ${BASE}: ` +
    `${problems.length} ${problems.length === 1 ? "name" : "names"} shown that ` +
    `${problems.length === 1 ? "belongs" : "belong"} to somebody the site calls something else.\n`,
);

process.exit(problems.length > 0 ? 1 : 0);
