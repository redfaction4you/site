/**
 * Vets the pages a visitor actually reads.
 *
 *   npm run vet:pages                                    # a local dev server
 *   npm run vet:pages -- https://redfaction4you.com      # production
 *
 * **Pass the URL bare, not as `--base`.** npm swallows `--base` as one of its
 * own flags before this script ever sees it, so `-- --base <url>` silently vets
 * localhost instead. `node scripts/vet-pages.mjs --base <url>` still works.
 *
 * This used to cross-check the match archive: a night's header total against
 * the rows under it, attendance against the match count. RF4U stopped
 * recording stats on 25 September 2026 and those pages went, so it now checks
 * what the site is for, which is the three servers:
 *
 * - each server page answers, lists a rotation with maps in it, and shows the
 *   live panel in one of its three states (playing now, not answering, or the
 *   server browser could not be reached)
 * - `/servers` lands on one of them
 * - every retired address still answers with a redirect rather than a 404,
 *   because those URLs are in Discord posts and in old in-game messages
 * - the front page names all three servers and nothing of the old news page
 *
 * **An offline server is not a failure.** The live panel has three honest
 * states and this only fails when none of them appears, which would mean the
 * panel itself broke. A server that is down for a restart must not turn the
 * scheduled check red.
 *
 * **It reads what the reader reads.** Two rounds of review have been wasted on
 * work verified against localhost while the user was looking at production, so
 * the base URL is printed at the top of every run and belongs in any claim made
 * from it.
 *
 * Read only, over HTTP. It touches no database and can be pointed at anything.
 */

const args = process.argv.slice(2);
const URL_LIKE = /^https?:\/\//i;

/*
 * A URL is a base URL however it arrives, and anything else is an error. An
 * argument that is dropped silently is how this once printed a clean bill of
 * health for localhost while appearing to check production.
 */
let base = null;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--base") {
    base = args[++i] ?? null;
  } else if (URL_LIKE.test(arg)) {
    base = arg;
  } else {
    console.error(`Not a URL: ${arg}. Pass the site to check, e.g. https://redfaction4you.com`);
    process.exit(2);
  }
}
base = (base ?? "http://localhost:3000").replace(/\/+$/, "");

const SERVER_SLUGS = ["themed", "novelty", "halloween"];

/** Addresses that were live pages until 25 September 2026 and must still land. */
const RETIRED = [
  "/matches",
  "/matches/maps",
  "/matches/2026-08-07",
  "/players",
  "/players/pairings",
  "/stats",
  "/stats/dm",
  "/news",
  "/news/2026-09-01",
  "/analyst",
  "/search?q=romek",
  "/link",
  "/servers/map-packs",
  "/servers/match",
];

const problems = [];
const fail = (message) => problems.push(message);

async function get(path, options = {}) {
  const response = await fetch(base + path, {
    redirect: "manual",
    headers: { "user-agent": "rf4u-vet-pages" },
    signal: AbortSignal.timeout(30_000),
    ...options,
  });
  const body = response.status === 200 ? await response.text() : "";
  return { status: response.status, location: response.headers.get("location"), body };
}

/** Visible text, near enough: tags out, entities for the few that matter. */
function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&rsquo;|&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ");
}

const LIVE_STATES = [/Playing now/i, /not answering/i, /could not be reached/i];

console.log(`vet-pages: ${base}\n`);

/* --- each server page ---------------------------------------------------- */

for (const slug of SERVER_SLUGS) {
  const path = `/servers/${slug}`;
  const page = await get(path);
  if (page.status !== 200) {
    fail(`${path} answered ${page.status}`);
    continue;
  }
  const text = textOf(page.body);

  if (!/Rotation/.test(text)) fail(`${path} has no Rotation section`);

  const count = text.match(/(\d+) maps/);
  if (!count) fail(`${path} does not say how many maps it runs`);
  else if (Number(count[1]) === 0) fail(`${path} lists a rotation of 0 maps`);

  if (!LIVE_STATES.some((state) => state.test(text))) {
    fail(`${path} shows none of the three live states; the panel itself is broken`);
  }

  console.log(`  ${path.padEnd(22)} ok, ${count ? count[1] : "?"} maps`);
}

/* --- /servers lands on one of them ---------------------------------------- */

{
  const landing = await get("/servers");
  const to = landing.location ?? "";
  if (![301, 302, 303, 307, 308].includes(landing.status)) {
    fail(`/servers answered ${landing.status}, expected a redirect to a server page`);
  } else if (!SERVER_SLUGS.some((slug) => to.endsWith(`/servers/${slug}`))) {
    fail(`/servers redirects to ${to}, which is not one of the three server pages`);
  } else {
    console.log(`  ${"/servers".padEnd(22)} ok, lands on ${to}`);
  }
}

/* --- retired addresses still land somewhere ------------------------------- */

for (const path of RETIRED) {
  const page = await get(path);
  if (![301, 302, 303, 307, 308].includes(page.status)) {
    fail(`${path} answered ${page.status}; a retired address must redirect, not break`);
    continue;
  }
  // Follow it once, so a redirect pointing at a page that 404s is caught too.
  const target = page.location?.startsWith("http") ? page.location : base + (page.location ?? "/");
  const landed = await fetch(target, { signal: AbortSignal.timeout(30_000) });
  if (landed.status !== 200) fail(`${path} redirects to ${page.location}, which answered ${landed.status}`);
}
console.log(`  ${RETIRED.length} retired addresses checked`);

/* --- the front page -------------------------------------------------------- */

{
  const home = await get("/");
  if (home.status !== 200) {
    fail(`/ answered ${home.status}`);
  } else {
    const text = textOf(home.body);
    for (const name of ["Themed", "Novelty", "Halloween"]) {
      if (!text.includes(name)) fail(`the front page does not name ${name}`);
    }
    for (const gone of ["Match report", "Most frags", "The analyst", "More to read"]) {
      if (text.includes(gone)) fail(`the front page still shows "${gone}"`);
    }
    if (!LIVE_STATES.some((state) => state.test(text))) {
      fail("the front page shows no live state for any server");
    }
    console.log(`  ${"/".padEnd(22)} ok`);
  }
}

console.log("");
if (problems.length > 0) {
  for (const problem of problems) console.log(`  FAIL ${problem}`);
  console.log(`\n${problems.length} problem(s) on ${base}`);
  process.exit(1);
}
console.log(`0 problems on ${base}`);
