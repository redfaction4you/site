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

Phase 1 is built and running locally. Outstanding to finish it:

1. **Discord OAuth app** — not created. `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET`
   are empty in `.env.local`, so sign-in is untested end to end.
2. ~~Verify migrations landed~~ — **done, 28 July 2026.** `npm run db:check`
   passes: accounts, sessions, users, verificationToken all present, one
   migration recorded.
3. ~~GitHub org + repo~~ — **done, 28 July 2026.** Public at
   `redfaction4you/site`, `main` tracking `origin/main`.
4. **Vercel** — import, env vars, **generate a separate `AUTH_SECRET` for
   production**, add the production callback URL to Discord.
5. **Domain repoint** — last. `redfaction4you.com` is currently a Google Site and
   keeps serving until DNS changes, so there is no downtime window.

Live pages: `/`, `/videos`, `/discord`, `/members/[handle]`, `/signin`, and the
five catalogue sections `/maps`, `/mods`, `/models`, `/weapons`, `/tools` with
their `/[slug]` detail pages. The catalogue is built but empty — it renders an
empty state, not a stub.
Stubs remaining: `/guides` (Phase 2), `/events` (Phase 4).

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

- **`sanitize.ts` is a security boundary and an allowlist.** Every stored field
  is named in it. A new field appearing in the VPS export cannot leak through,
  because it simply is not copied. **Never** replace this with a spread of the
  source object.
- **`match_players.identity_key` is stored and never served.** It is the only
  stable key that could link a Discord account to an in-game player, which the
  build plan calls the hard part of player statistics. Every query in
  `queries.ts` names its columns and none name that one. Do not use
  `db.query.matchPlayers.findMany()` here — it would select everything.
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
  - **References are Gemini only, measured not assumed.** Cloudflare's FLUX.2
    accepts a multipart upload, returns 200, and ignores it: a reference that was
    20% vivid marker pixels produced outputs containing 0.00%. Cloudflare is used
    only when there are no references.
  - A map with no screenshots is skipped rather than invented. `MAP_ALIASES` in
    `image-refs.ts` maps server map names onto folders; `npm run refs:push`
    regenerates that file and syncs `assets/refs` to R2.
  - `src/components/column-image.tsx` is the only thing that renders it and the
    caption lives inside that component, so the picture cannot be shown unlabelled.
    There is deliberately no OpenGraph image: a link preview is the one place the
    label could not follow it.
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
