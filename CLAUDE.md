# RedFaction4You — site

A community archive for Red Faction (2001): maps, mods, player models, custom
weapons, tools, guides, videos and events. Free, no account needed to download,
self-hosted so it does not vanish when someone else's server does.

Repo: `github.com/redfaction4you/site` (public).

## The scope rule

**If it is not something you can download, read or watch, it does not ship.**

This rule is load-bearing. It is the result of three rounds of cutting and it
killed, in order: a C++ client fork (Red Faction Classic), a UDP game-server
tracker, a live server browser, the game servers section, the weekly match
schedule, and a standalone client-comparison page. Apply it before adding
anything. The full reasoning is in `../BUILD-PLAN.md`.

## Current state

**Live at `redfaction4you.com`**, deployed from `redfaction4you/site` on push to
`main`. `docs/HANDOVER.md` is the authority on what is built and what is next;
this file is conventions and gotchas.

Navigation: News, Matches, Players, Stats, Server, Events. The catalogue
sections (maps, mods, models, weapons, tools, videos, guides) are built, empty,
and hidden with the `hidden` flag in `src/lib/nav.ts`. Their routes still answer
so shared links keep working.

Sign-in is removed from the header. Discord auth is still in the code and
returns on its own if `AUTH_DISCORD_ID` is set, but every page reads without an
account.

## Commands

```bash
npm run dev          # localhost:3000
npm run typecheck    # tsc --noEmit — run before every push
npm run lint
npm test             # node --test, currently the RFL/VPP/ZIP readers
npm run rfl -- <file>  # print what the site would record about a download
npm run db:generate  # drizzle-kit generate → ./drizzle/*.sql
npm run db:migrate   # apply to Neon
npm run db:check     # verify tables actually exist (custom, scripts/check-db.mjs)
npm run db:studio
npm run ai:quota     # what each Gemini key can do today; -- --images too
npm run vet          # the archive against itself
npm run vet:queries  # every match query filters, or says why not
npm run vet:pages    # a rendered page against itself; -- --base <url>
```

## Stack

Next.js 15.5 App Router · TypeScript · Tailwind v4 · Auth.js v5 (beta) with
Discord · Drizzle 0.44 · Neon Postgres (`us-east-2`) · Vercel · Cloudflare R2
(Phase 2).

## Gotchas, all of which have already bitten once

- **`drizzle.config.ts` must load `.env.local` explicitly.** `dotenv/config`
  reads `.env` only; `.env.local` is a Next convention dotenv knows nothing
  about. Already fixed — do not "simplify" it back.
- **Tailwind v4 has no config file.** The theme lives in `@theme { }` inside
  `src/app/globals.css`. There is deliberately no `tailwind.config.ts`.
- **Colour token names are historical.** `basalt`, `rust`, `oxide`, `steel` no
  longer describe the colours; only their values changed when the site was
  rethemed. Renaming them would touch every component for no benefit.
- **`font-brand` (Black Ops One) ships one weight.** Never combine it with
  `font-bold` or similar — synthetic bolding looks awful. A bare
  `.font-brand { font-weight: 400 }` rule sits outside `@layer` to win against
  Tailwind utilities. Use it only for the wordmark and hero headline; everything
  else is Chakra Petch, which has real 600/700 cuts.
- **`auth()` runs in `SiteHeader`, so it renders on every page.** Anything that
  throws there takes the whole site down. It is guarded by `discordConfigured`
  from `src/lib/auth.ts`; keep that guard.
- **Neon connection strings**: pooled (`-pooler` in host) for the app, direct for
  migrations. Neon's pooler rejects the statements drizzle-kit issues.
- **The free Gemini tier is twenty requests per day, per model, per project.**
  Not per key: a second key in the same Google Cloud project shares the first
  one's twenty. This is the binding constraint on everything in `src/lib/ai/`, and
  when it runs out generation returns null and the missing text is retried on the
  next sync. Capacity appears to free up on a rolling basis rather than at a fixed
  daily boundary: two exhausted keys were serving again fifty minutes later, well
  before midnight in any timezone. Do not rely on a reset time.
  `npm run ai:quota` reports where each key stands right now, which is the only
  reliable answer.
- **A missing article is not necessarily quota.** Three separate bugs produced the
  identical symptom, an article that simply never appears, and each was mistaken
  for quota first:
  - Gemini answers 503 "currently experiencing high demand" readily, and
    `shouldTryNextKey` treating that as a malformed request cost a whole night's
    column while the first key still had quota. 5xx now falls through.
  - The text timeout was 30 seconds. The output budget covers the model's
    thinking, so a column that reasons for twenty seconds before writing a word
    times out. Now 60, against a route budget of 300.
  - The vision timeout was 45 seconds against a payload that is the whole image,
    a couple of megabytes and a third larger again as base64. Four of five keys
    timed out on the first real check. Now 120. That gate fails closed, so a
    timeout there silently rejects a perfectly good picture.

  Read the status before assuming. `docs/HANDOVER.md` has the diagnosis.
- **Local development shares the production database.** There is one Neon
  instance. A row edited locally is edited on the live site, and the VPS syncs
  every fifteen minutes, so production will happily act on it: marking a column
  stale locally had the deployed code rewrite it first, with none of the fixes
  that were being tested. Anything that touches `night_columns` or `matches` from
  a local run is a production change.
- **The models endpoint lists models the key cannot call.** Every image model is
  listed and every one answers 429 with no free tier allocation. A 429 whose
  detail carries no quota number means "not included", not "ran out".
- **Vercel environment variables need a fresh build, not a redeploy.** Adding a
  variable and hitting redeploy reuses the previous build and the function keeps
  the old environment. `vercel --prod` builds again and picks it up. Half an hour
  went into diagnosing an image pipeline that was correct and simply had no key.
  `vercel env ls production` is the fast way to see what production actually has,
  and `.env.local` is not it: the two stores are unrelated.
- **Never run `npm run build` while `next dev` is running.** The build overwrites
  `.next` underneath the dev server and it starts answering 500 with
  `Cannot find module './chunks/vendor-chunks/next.js'`. Stop the dev server, or
  delete `.next` afterwards and restart it.
- **`DISCORD_NEWS_WEBHOOK` is unset everywhere**, local and production, so columns
  are written and published on the site but announced nowhere. Once it is set,
  calling `/api/rf4u/archive/rebuild` against a *local* server will post to the
  real channel, because there is only one webhook. Blank it for that run.

## Compatibility detection (`src/lib/rfl/`)

Phase 2 groundwork, built ahead of the upload path. `inspectUpload(bytes)` takes
a bare `.rfl`, a `.vpp` packfile, a `.zip`, or a `.zip` containing a `.vpp`, and
returns the format version of every level inside plus the clients that can load
them. Detection is by content, never by extension.

- **The version table lives in `clients.ts` with a `RFL_TABLE_VERIFIED_ON`
  date and its sources named.** Re-check it when Alpine ships a format bump.
  Versions 201–299 are a documented gap: they report `confidence: "unknown"`
  rather than a guess, because a confidently wrong badge is worse than an
  honest one.
- **Everything has been tested against synthetic fixtures only.** We do not
  have a single real Red Faction file on disk. The spec could differ from what
  RED actually wrote in 2001. `npm run rfl -- <file>` on a genuine map is the
  outstanding test, and the per-file 2048-byte alignment assumption in `vpp.ts`
  is the thing most likely to be wrong.
- **`required_features` is deliberately not implemented.** Unlike `rfl_version`
  and `plays_on` it cannot be read from the header — it needs the section list
  parsed and Alpine event types recognised. The version alone answers "will
  this load", which is the question that costs people a broken download.
- **`zip.ts` imports `node:zlib`**, so anything importing this module must run
  on the Node runtime, not the edge runtime.
- `tsconfig.json` sets `allowImportingTsExtensions` so this module's relative
  imports carry `.ts`. That is what lets plain `node` run the real parser in
  tests and in the CLI with no build step. It is the only module written that
  way; the rest of `src/` uses `@/`.

## The catalogue (`src/lib/catalogue.ts`, `src/components/catalogue-page.tsx`)

One `items` table and one set of components serve all five sections. The
per-section differences are editorial, and they live in `KIND_META` — adding a
sixth section is an entry there plus two three-line route files.

- **Filters are links carrying query parameters, not client state.** Every
  filtered view is a real URL somebody can paste into Discord. That matters
  more here than a slicker interaction.
- **`author_name` is not `uploader_id`.** Most of the archive was made by people
  who will never have an account here. Never conflate the two in UI or queries.
- **Storage degrades honestly.** `publicUrl()` returns null when
  `NEXT_PUBLIC_R2_PUBLIC_BASE` is unset, and the download panel says so rather
  than rendering a dead link. Same pattern as `discordConfigured`.
- **Setting `NEXT_PUBLIC_R2_PUBLIC_BASE` is all that is needed for images** —
  `next.config.ts` derives the `remotePatterns` entry from it.
- Listing pages only ever show `status = 'published'`; drafts 404 on their
  detail route. Verified against a seeded row, not assumed.

## Match archive (`src/lib/matches/`, `/matches`)

The dedicated server pushes each night's results to
`POST /api/rf4u/archive/ingest`, authenticated by `RF4U_ARCHIVE_SYNC_SECRET`.
Setup and troubleshooting: `docs/match-archive-vps.md`.

- **A match that did not count must not count anywhere, and the checks are
  automatic now.** An abandoned start arrives labelled `final` like any other
  match, so duration is the only test: `completion.ts` holds the rule,
  `MATCH_COMPLETED` in `queries.ts` is its SQL twin, and the two must be kept in
  step exactly as `tookPart` and `TOOK_PART` are. The rule has been written once
  and missed twice, both times reaching a published page, so three things now
  watch it:
  - **`npm run vet:queries`**, which runs inside `npm test`. Every query reading
    the match tables either filters or carries a comment saying
    `counts-everything: <why>`. There is no third option. Plenty of queries
    genuinely want every row and the reason differs each time, which is why the
    exemption is a sentence rather than a flag.
  - **`npm run vet:pages`**, which reads rendered pages over HTTP and checks
    that a page does not contradict itself: a header total against the rows it
    totals, a player count against the scoreboard, attendance denominators
    against the match count. It found the last two failures on production while
    the database was entirely consistent. Point it at what the reader is
    looking at, not at localhost.
  - **GitHub Actions**, `checks` on every push and `vet-live` after a deploy and
    every six hours, because the archive changes without anybody pushing.
  It covers the night pages, the archive index, `/players`, `/stats` and the
  map index, which are three cuts of the same rows and therefore have to agree:
  the nights by evening, `/players` by person, `/matches/maps` by level. Match
  pages, pairings and the per-map pages are not cross-checked by anything.
- **`sanitize.ts` is a security boundary and an allowlist.** Every stored field
  is named in it. A new field appearing in the VPS export cannot leak through,
  because it simply is not copied. **Never** replace this with a spread of the
  source object.
- **`match_players.identity_key` is stored and never served.** It is the only
  stable key that could link a Discord account to an in-game player, which the
  build plan calls the hard part of player statistics. Every query in
  `queries.ts` names its columns and none name that one. Do not use
  `db.query.matchPlayers.findMany()` here — it would select everything.
- **Hits and shots are one measurement and must never be merged separately.**
  This was the cause of the 1067% accuracy on Rail Fight, and the 2.2
  broadcaster package confirmed it: `mergePlayers` took the maximum of every
  counter independently, which is right for a running total and wrong for a
  pair, so it could report the largest hit count it had seen against the largest
  shot count it had seen, from different snapshots. One bad sample then stuck
  forever. `chooseShotTuple` in `sanitize.ts` now picks a whole tuple, prefers
  the newest valid one, and never lets a newer invalid one displace an older
  valid one. Weapon stats obey the same rule. **Do not put `shotsHit` or
  `shotsFired` back into `MAX_FIELDS`.**
- **A row can still arrive bad with nothing better to choose**, so the read
  guard stays as well. **`src/lib/matches/accuracy.ts` is the single rule.** `accuracyOf` returns
  null where the record contradicts itself, every read path uses it, and the
  aggregates total only sound matches via `SOUND_SHOOTING` in `queries.ts`. The
  rows are left exactly as sent, the same trade `fastest_capture_ms` makes for
  relays. Do not clamp to 100%: that puts a broken counter top of the board.
- **`spectator = false` does not mean somebody played.** The server sends a row
  for everyone it had on a team when it snapshotted, and five rows on record
  carry a real team, the flag unset, and every counter zero: no score, frags,
  deaths, shots, flag touches or damage taken. They never entered the game.
  Real spectators arrive correctly marked with `team = 'spectator'`; this is a
  third category the schema had no name for. **`participation.ts` (`tookPart`)
  and its SQL twin `TOOK_PART` in `queries.ts` are now the test everywhere**, and
  the two must be kept in step. Any sign of life counts, down to one point of
  damage taken, because dropping somebody who played is far worse than keeping
  somebody who did not. Uncorrected it made match 10 a three against three when
  it was two against two, gave Chill Hippo and Ath-PL a player page each despite
  never playing a match, fed the illustration the wrong number of figures a
  side, and put a name in a column for a match they were not in, which is how a
  reader found it.
- **`shots_hit` is fractional and that is correct.** Values like 159.75 and
  207.875 are always eighths, and an audit of every match traced all 32 of them
  to the Automatic Shotgun: eight pellets a shot, so three pellets landing is
  three eighths of a hit. No row is fractional without shotgun use and no other
  weapon ever produces one. Accuracy is therefore pellet weighted, which is the
  more meaningful figure and matches what the game reports. Rounding to integers
  would inflate every shotgun user. The column is `doublePrecision` for this.
- **Weapon stats are absent, never wrong, before the 2.1 broadcaster.** Matches 2
  to 5 carry none; from match 6 onward all 44 rows sum exactly to their player
  total. An empty `weapon_stats` is expected history, not a fault.
- **Overtime restarts `elapsed_seconds` at zero**, and two things sorted on it.
  The capture timeline opened with the golden goal and counted up to it, fixed by
  `CAPTURE_ORDER` in `queries.ts`, which orders on `observed_at`. Worse,
  `drives.ts` reconstructs the flag's journey by time, so extra time sorted in
  front of the first minute and **credit came out wrong**: across the three
  overtime matches on record it turned two of Romek's solo captures into relays
  and gave a drive to somebody with no part in it. `reconstructDrives` now
  re-times everything onto `observed_at` when the whole match has it, and falls
  back to the match clock when it does not. All or nothing per match: mixing an
  epoch in milliseconds with a clock in seconds sorts worse than either alone.
  **Drive credit is computed at ingest, so stored rows only correct themselves
  when a day is re-sent.**
- **Duplicate player rows are merged by maximum, not summed.** The server emits
  periodic snapshots, so two rows are one player counted twice. Summing would
  double everyone's night. Accuracy is recomputed from shot counts rather than
  trusted.
- **Ingest is idempotent** — the VPS re-sends recent days on every sync.
  Matches upsert on `(server, source_match_id)`; players and captures are
  replaced. A match deleted upstream is deleted here.
- **Days are `America/Los_Angeles`, not UTC.** A match at 20:00 Pacific belongs
  to that evening even though it is the next day in UTC. Timestamps stay UTC;
  only the grouping is local.
- **Stanley Mesh (`src/lib/ai/opinion.ts`) is the one thing here allowed a view.**
  A sports analyst who writes a short piece about pairings after each night. The
  whole guard is the line between a preference and a finding: "the pairing worth
  trying is X with Y" claims nothing about the record, "X and Y are the strongest
  pairing" claims a measurement three matches cannot support. The fact checker
  cannot catch the second kind, since every number in such a sentence may be
  true, so the defence is upstream. **He is handed a win rate only where the
  pairing has cleared the bar, and below it never sees a percentage** rather than
  being told to ignore one. A model given a tempting number and told not to use
  it uses it.
  - **He is shown the archive as it stood that night, not as it stands now.**
    Written from everything, the piece under 28 July said two players had shared
    a side seven times at 86%; on 28 July they had played together once. Every
    number was true of today and false of the page it sat on.
  - Byline and photo are deliberate. A mesh is a 3D model, and the portrait is a
    visibly low poly character from the game. A photorealistic face would be the
    one thing that quietly undoes the machine written label. The name lives in
    `COLUMNIST_NAME`, so renaming him is one line.
  - Runs last in `runNightJobs`, so it only spends quota nothing else wanted, and
    never rewrites: an opinion does not go stale the way a summary of a half
    finished evening does.
- **Pairings (`src/lib/matches/pairings.ts`) are built on names, never on
  colours.** Who is on a side with whom, and who is opposite. The module is pure
  so `node --test` loads it directly, the same arrangement as `leaderboards.ts`.
  Two decisions in it are load bearing: a win rate is withheld below five decided
  matches together, because a percentage from three games describes the last one
  rather than the pairing, and the record is shown regardless because that is a
  fact where the rate is an inference. **How much better somebody plays with a
  given partner is deliberately not computed** and the header says why: it splits
  an already small sample in two and the difference would be mostly which side
  the shuffle picked.
- **The nightly column carries a generated illustration, composed from reference
  images** rather than imagined: a screenshot of the map that was actually played,
  the actual player models in red and blue, and the real number of figures a side.
  - **Almost nothing is a model's decision.** `match-pick.ts` reads which match was
    the most interesting, which moment to depict, the squad sizes and whose flag was
    moving straight off the record. A text model contributes one short mood phrase
    and nothing else. The prompt is assembled by code in `image-prompt.ts`.
  - **The style block describes treatment only, never a setting.** It once said
    "industrial Mars mining colony", which is wrong: the screenshot is the location,
    and most CTF maps are not Martian anyway. Ankh is an Egyptian tomb; only the
    Warlords maps are mining bases. Anything about architecture or materials belongs
    in the screenshot.
  - **Prohibitions belong in the gate, not the prompt.** Listing "no text, no
    signage, no numbers" put an illuminated sign reading 22 in the first image
    generated. Diffusion models condition on the tokens they are given.
  - **The vision gate fails closed.** No key, a timeout, an unparseable answer are
    all rejections. An unchecked synthetic photograph must never reach a reader.
    It knows two exceptions, both learned by it wrongly rejecting good pictures:
    the game's own low polygon faces are not "a real person", and carved ornament
    is not "text". Ankh is an Egyptian tomb whose walls are covered in glyphs, and
    a strict reading meant it could never be illustrated at all.
  - **References are Gemini only, measured not assumed.** Cloudflare's FLUX.2
    accepts a multipart upload, returns 200, and ignores it: a reference that was
    20% vivid marker pixels produced outputs containing 0.00%. Cloudflare is used
    only when there are no references.
  - A map with no screenshots is skipped rather than invented. `MAP_ALIASES` in
    `image-refs.ts` maps server map names onto folders; `npm run refs:push`
    regenerates that file and syncs `assets/refs` to R2.
  - `src/components/column-image.tsx` is the only thing that renders it. It
    carried a visible "AI interpretation" caption until **30 July 2026, when the
    user asked for it to be removed**. What labels the picture now is the alt
    text, which calls it a generated illustration, and the figure's title, which
    says it is not a photograph of the match. Both are attached inside the
    component so the picture cannot be rendered without them. Do not reinstate the
    caption without being asked. There is deliberately no OpenGraph image.
- **Generated writing is fact checked before it is stored.** `fact-check.ts` sends
  every draft column and match report back with the facts and asks what the data
  does not support; a failure is rewritten once, then discarded. It exists because a
  column claimed a "session-high 19.2 percent accuracy" when another player shot
  19.4, and omitted a player's capture while listing everyone else's. Superlatives
  are now also computed in code and handed over, because reading down a table for
  the largest number is what models get wrong. Unlike the image gate this **fails
  open**: withholding every article whenever the checker is rate limited would be a
  worse trade than a rare small error.
- Stored in Postgres rather than the day-sized documents the handoff package
  used, because player statistics need to query across matches and a per-day
  document cannot answer that without reading all of them.

## Conventions

- Data that is small and rarely changes lives in a typed file under `src/lib/`
  rather than the database: `videos.ts`, `nav.ts`. It renders without a query and
  is one pull request to change. Move to Postgres only when hand-editing hurts.
- Unbuilt routes use `<StubPage>` and state plainly what is coming and in which
  phase. They never 404 and never say "under construction".
- Prose on the site is plain and non-promotional. Where a tradeoff exists, name
  it — see the video archive admitting that deleted uploads leave dead links.

## Theme

Taken from the RF4U CTF Tournament Hub (`../Index/index.html`) so both
properties read as one product: `#e0301e` red, `#e6b64f` gold, `#0c0c10` ground,
Black Ops One wordmark, Chakra Petch body, hazard stripe under the header,
fist-and-pickaxe favicon at `public/icon.png`.

## Sibling files (parent directory, not part of this repo)

- `../BUILD-PLAN.md` — living plan, phases, risks, open questions
- `../Index/index.html` — the existing RF4U CTF Tournament Hub. A single 336KB
  file on Firebase 10.14.1 with email/password accounts. Phase 4 absorbs it,
  which means **rebuilding**, not porting, and picking one identity system.
  Discord should win. Do not invest further in Firebase accounts.
- `../SETUP.md` — Firebase setup guide for that hub
- `../Tourney Images/` — existing branding assets (raster only)

## Open questions blocking later work

1. **Levels4You archive** — do we have it? Seeding the catalogue from it is the
   single biggest factor in whether Phase 2 launches with content or with an
   empty shell. This matters more than any code.
2. **First videos** — `src/lib/videos.ts` is an empty array by design.
3. **Discord role IDs** for Mapper and Admin.
4. **What the dedicated server records** — decides what Phase 3 player statistics
   can show. Constraints: the VPS must not be hogged (batch export, not live
   queries), and reconciling Discord identity against RF player names is the hard
   part, not the charts.
