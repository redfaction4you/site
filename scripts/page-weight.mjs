/**
 * Times and weighs every page, warm.
 *
 * Kept rather than thrown away after the audit on 6 August, because the thing
 * that made a match page 749 kB was invisible in the source: a closed
 * `<details>` rendering its whole contents. Reading the real response is the
 * only way that shows up.
 *
 *   node scripts/page-weight.mjs                          # a local dev server
 *   node scripts/page-weight.mjs https://redfaction4you.com
 */
const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
const paths = [
  ...new Set([
    "/",
    "/players",
    "/players/pairings",
    "/stats",
    "/analyst",
    ...[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname),
  ]),
];

const timed = [];
for (const path of paths) {
  await fetch(`${BASE}${path}`); // warm the lambda, so this measures the page
  const started = performance.now();
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  const body = await res.text();
  timed.push({
    path,
    ms: Math.round(performance.now() - started),
    kb: Math.round(body.length / 1024),
    status: res.status,
  });
}

timed.sort((a, b) => b.kb - a.kb);
console.log(`\n${BASE}\n`);
console.log("   kB     ms  status  path");
for (const t of timed.slice(0, 12)) {
  console.log(
    `${String(t.kb).padStart(5)}  ${String(t.ms).padStart(5)}  ${String(t.status).padStart(6)}  ${t.path}`,
  );
}

const kb = timed.reduce((s, t) => s + t.kb, 0);
const slow = timed.filter((t) => t.ms > 1000);
const heavy = timed.filter((t) => t.kb > 300);
const broken = timed.filter((t) => t.status !== 200);

console.log(
  `\n${timed.length} pages, ${kb} kB total, ${Math.round(
    timed.reduce((s, t) => s + t.ms, 0) / timed.length,
  )} ms mean`,
);
console.log(`  over 300 kB: ${heavy.length}${heavy.length ? ` (${heavy.map((t) => t.path).join(", ")})` : ""}`);
console.log(`  over 1000 ms: ${slow.length}${slow.length ? ` (${slow.map((t) => t.path).join(", ")})` : ""}`);
console.log(`  not 200: ${broken.length}${broken.length ? ` (${broken.map((t) => `${t.status} ${t.path}`).join(", ")})` : ""}`);
