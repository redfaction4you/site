# RedFaction4You — site

The home of the RF4U Red Faction (2001) servers, Themed, Novelty and Halloween,
with every map in each rotation, and a catalogue of maps, mods, assets and tools
to play them with. Free, no account needed to download, self-hosted so it does
not vanish when someone else's server does.

Repo: `github.com/redfaction4you/site` (public).

## The scope rule

**The servers and the files to play on them.** The site leads with the three
RF4U servers, each with a page listing its rotation and the map playing now, and
keeps the downloads catalogue beside them.

The first rule was "if it is not something you can download, read or watch, it
does not ship", and it once cut the game servers section along with a C++ client
fork, a UDP tracker and a live server browser. The servers came back and are now
the point of the site. **Stats did not.** A match archive with player records,
stat boards and an AI analyst's write-ups was built and then retired on
25 September 2026 at the owner's request: its pages redirect, its data is kept,
and it is not to be rebuilt without the owner asking. `../BUILD-PLAN.md` has the
older reasoning.

## Current state

**Live at `redfaction4you.com`**, deployed from `redfaction4you/site` on push to
`main`. `docs/HANDOVER.md` is the authority on what is built and what is next;
this file is conventions and gotchas.

Navigation: Servers, Downloads, Events. `/servers` lands on the first server
in `src/lib/servers.ts`, and the tabs there reach the other two. `/themed`,
`/novelty` and `/halloween` are short redirects to them, because that is what
the in-game welcome messages print.

Downloads is the hub at `/downloads`. The four shelves behind it (`/maps`,
`/assets`, `/mods`, `/tools`) are real pages that keep the `hidden` flag,
because they are reached through the hub rather than each spending a slot in the
row; the sitemap builds itself from the catalogue rather than from `nav.ts`, so
hiding them costs nothing in findability. `/models` and `/weapons` are no longer
sections at all: they are facets of Assets and their old routes redirect
permanently, which is in `next.config.ts`. `/videos` and `/guides` are the other
kind of hidden, built and empty with nothing pointing at them yet. Every one of
those routes still answers, so shared links keep working.

Sign-in is removed from the header. Discord auth is still in the code and
returns on its own if `AUTH_DISCORD_ID` is set, but every page reads without an
account.

## Commands

```bash
npm run dev          # localhost:3000
npm run typecheck    # tsc --noEmit — run before every push
npm run lint
npm test             # node --test over scripts/*.test.mjs
npm run rfl -- <file>  # print what the site would record about a download
npm run ingest -- <folder>       # what an ingest would do. Dry run is the default
npm run ingest -- <folder> --go  # store the bytes and write the rows, as drafts
npm run db:generate  # drizzle-kit generate → ./drizzle/*.sql
npm run db:migrate   # apply to Neon
npm run db:check     # verify tables actually exist (custom, scripts/check-db.mjs)
npm run db:studio
npm run vet:pages    # the server pages, redirects and front page; -- <url> for production
npm run weigh        # every page in the sitemap, timed and weighed
npm run apply:welcome  # carry servers.ts welcome texts to map_packs; -- --go to write
```

## Stack

Next.js 15.5 App Router · TypeScript · Tailwind v4 · Auth.js v5 (beta) with
Discord · Drizzle 0.44 · Neon Postgres (`us-east-2`) · Vercel · Cloudflare R2
(provisioned, serving from `files.redfaction4you.com`).

## Gotchas, all of which have already bitten once

- **`drizzle.config.ts` must load `.env.local` explicitly.** `dotenv/config`
  reads `.env` only; `.env.local` is a Next convention dotenv knows nothing
  about. Already fixed — do not "simplify" it back.
- **Tailwind v4 has no config file.** The theme lives in `@theme { }` inside
  `src/app/globals.css`. There is deliberately no `tailwind.config.ts`.
- **Colour token names are historical.** `basalt`, `rust`, `oxide`, `steel` no
  longer describe the colours; only their values changed when the site was
  rethemed. Renaming them would touch every component for no benefit.
- **`oxide` is gold, and `cobalt` is the old blue team colour.** Nothing uses
  `cobalt` since the scoreboards went on 25 September 2026; `oxide` is still the
  gold accent for staleness warnings and compatibility badges.
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
- **Local development shares the production database.** There is one Neon
  instance. A row edited locally is edited on the live site: a rotation changed
  from a local admin page is the rotation the VPS applier reads that night. And
  never run `db:push` or `db:generate` expecting nothing to happen: the retired
  stats tables are still defined in `schema.ts` precisely so that neither
  command proposes dropping them.
- **Vercel environment variables need a fresh build, not a redeploy.** Adding a
  variable and hitting redeploy reuses the previous build and the function keeps
  the old environment. `vercel --prod` builds again and picks it up. Half an hour
  went into diagnosing an image pipeline that was correct and simply had no key.
  `vercel env ls production` is the fast way to see what production actually has,
  and `.env.local` is not it: the two stores are unrelated.
- **`npm run <script> -- --go` does not pass `--go` to the script on Windows.**
  npm reads it as one of its own options, warns `Unknown cli config "--go"`, and
  drops it before the script sees `process.argv`. Every destructive script here
  is dry-run by default, so the run that was meant to write prints its dry-run
  report, says nothing was written and exits 0. **It is indistinguishable from a
  successful no-op**, which is why it went unnoticed: `apply:welcome`,
  `map:remove` and two scripts since retired had all been silently refusing to
  act under PowerShell. `link-maps` and `shuffle-packs` were
  converted in the same pass but were never affected, because they are run
  directly with `node` and npm is never in the path to strip anything. **Only a
  script with an entry in `package.json` can be bitten by this.**
  Read flags through `flag()` in `scripts/cli-flags.mjs`, which also reads the
  `npm_config_*` variables npm re-exposes, and print the resolved options so a
  swallowed flag is visible. `scripts/cli-flags.test.mjs` fails if any script
  goes back to reading a flag off `argv`; it found four of the seven cases on
  the first run. A value flag must be written `--kind=asset`: with a space, npm
  records the flag as `true` and passes the value on as a positional, so there
  is nothing left to recover and callers should refuse that form by name. This
  is the same cause as the `vet:pages -- --base <url>` bug below, which printed
  a clean bill of health for a dev server while appearing to check production.
  **When a check is run wrongly it reports success.**
- **`unstable_cache` returns JSON, so a `Date` comes back a string.** The types
  keep saying `Date` and nothing checks the boundary, so the first component to
  call `Intl.DateTimeFormat.format` on it throws `RangeError: Invalid time
  value`. **The request that fills the cache renders correctly and every request
  after it is a 500**, which is why it survived a screenshot, a typecheck and a
  build: the page is fine the first time you look at it. `/maps` did this the
  hour the catalogue cache was added. `LISTING_DATE_FIELDS` in `catalogue.ts` is
  the revival list and `scripts/catalogue-cache.test.mjs` fails if a timestamp
  reaches a listing without being named in it. **Curl a cached page twice**, not
  once. The same applies to anything else stored this way.
- **The cache is per deployment, so a local edit does not clear production's.**
  There is one database, so a row edited through the admin form on `localhost`
  changes for everybody immediately, but the `revalidateTag` that edit fired
  ran against the local cache. Production keeps serving its own copy of the old
  listing for up to an hour while the database holds the new text, which reads
  exactly like a save that did not work. **"Refresh the cache" on `/admin`**
  clears whichever deployment you press it on: press it on
  `redfaction4you.com/admin` to clear production. Same button for a row edited
  by hand in SQL, and for a `scripts/ingest.mjs` run.
- **The catalogue listings are cached for an hour under one tag**, because a
  shelf reads its filters from the URL and is therefore dynamic: without it a
  crawler walking type by sort by tag holds Neon awake, which is the shape of
  thing that produced a $52 month once already. Every admin action and the
  upload commit call `revalidateTag(CATALOGUE_CACHE_TAG)`. **A write that does
  not go through those is invisible for up to an hour** — a row edited by hand
  in SQL, or a `scripts/ingest.mjs` run. Nothing is wrong with the data; it is
  late. Same trap `map_packs` sprang before it.
- **Vercel bills image optimisation per transformation**, so `next.config.ts`
  sets `minimumCacheTTL` to thirty-one days and cuts `deviceSizes` and
  `imageSizes` from eight entries each to four. Every width left in those lists
  is a variant that may be produced and paid for. A screenshot key carries the
  item, its position and its filename, so a different picture is a different
  URL; the one way to serve a stale one is to detach every picture on an item
  and re-attach the same filenames in the same order. Rename them if you do.
- **Never run `npm run build` while `next dev` is running.** The build overwrites
  `.next` underneath the dev server and it starts answering 500 with
  `Cannot find module './chunks/vendor-chunks/next.js'`. Stop the dev server, or
  delete `.next` afterwards and restart it.

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
- **Three real files have now been read, on 3 September 2026, and three is not
  a corpus.** `DM-Combat Arena.vpp`, `dm_space.vpp` and `kma Dm s7.vpp`, pulled
  off the live game server, all parsed correctly through `npm run rfl`: version
  200, every client, level names and save dates intact. That confirms the
  per-file 2048-byte alignment in `vpp.ts` **as far as one entry per pack goes**
  and no further, because every one of the three holds exactly one file, so the
  running alignment from one entry to the next is still unexercised. A
  multi-level pack such as the game's own `maps.vpp` is the test that would
  catch a wrong padding rule. Nothing above version 200 has been read, no zip
  from the wild has been opened, and the Alpine branch, the 201 to 299 gap and
  the PS2 versions remain sourced rather than seen. The header of `clients.ts`
  keeps the measurements; do not let "tested against real files" travel further
  than it says.
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

## The catalogue (`src/lib/downloads.ts`, `src/lib/catalogue.ts`)

One `items` table and one set of components serve all four shelves: maps
(`/maps`), assets (`/assets`), mods (`/mods`) and tools (`/tools`). The
per-shelf differences are editorial and live in `SECTIONS`, so a fifth shelf is
an entry there plus two small route files.

- **`kind` is the shelf and `category` is the facet inside it.** A CTF map and a
  Damage Control map are both `kind = 'map'`; they sit on the same shelf and a
  reader narrows down within it, so a new game type is a row in
  `MAP_CATEGORIES` rather than a fifth section. Uncategorised is a real state
  and stays visible: `countByCategory` counts those under the key `"none"`,
  because a map whose filename says nothing about its type must still appear
  somewhere.
- **The section metadata and every rule that can be decided without a database
  live in `src/lib/downloads.ts`, which imports nothing.** Titles, empty-state
  wording, the category lists, the sort values, `categoryFromLevels` and
  `displayVersion` are all there, so `scripts/downloads.test.mjs` runs the real
  code under plain `node`. Each of those rules fails silently if it goes wrong:
  a map filed under the wrong game type sits on the wrong shelf forever with
  nothing about the page looking broken, and a `?sort=` value off a stranger's
  URL that is not handled throws on a page that should simply show the default
  listing. `parseSort` therefore tolerates anything.
- **Filters and sorting are links carrying query parameters, not client state.**
  Every filtered or sorted view is a real URL somebody can paste into Discord.
  That matters more here than a slicker interaction.
- **`item_updates` is the changelog, and it records when the author changed
  something, not when we typed it in.** `released_at` is set explicitly for the
  same reason `items.released_on` exists: an archive that cannot tell "fixed in
  2004" from "archived last night" is not much of an archive. `release_version`
  is nullable because plenty of real updates are "minor thing, no version bump",
  and requiring one would mean inventing version numbers on the author's
  behalf. Read newest first, which is the only order a changelog is read in.
- **The download counter needs `/api/download/[fileId]`, and it counts only what
  went through the site.** Before that route, `recordDownload` had no callers at
  all: the detail page linked straight at the R2 URL, so `download_count` was
  zero on every row and "most downloaded" was an order over a column of zeroes.
  Three things about it are load-bearing. The count runs in `after()`, so a slow
  database never delays the file and can never fail it. The redirect is **302
  and must stay 302**, because a browser caches a permanent one and follows it
  without asking again, which would count each person once and then never see
  them again. And the bucket is public, so anyone holding a key can fetch the
  object directly: the figure undercounts by an unknowable amount and has to be
  presented as downloads through the site rather than a total.
- **`author_name` is not `uploader_id`.** Most of the archive was made by people
  who will never have an account here. Never conflate the two in UI or queries.
- **Storage degrades honestly.** `publicUrl()` returns null when
  `NEXT_PUBLIC_R2_PUBLIC_BASE` is unset, so the download panel says so rather
  than rendering a dead link and the download route answers 503 rather than
  redirecting to an address assembled from a missing base. Same pattern as
  `discordConfigured`.
- **R2 is provisioned and serves from `files.redfaction4you.com`.**
  `NEXT_PUBLIC_R2_PUBLIC_BASE` is set in `.env.local` and in production, and it
  is all that is needed for images too: `next.config.ts` derives the
  `remotePatterns` entry from it, so a hostname added by hand is a hostname that
  will be wrong the day the bucket moves. The unconfigured path above is for a
  local run or a preview that never had the variable.
- Listing pages only ever show `status = 'published'`; drafts 404 on their
  detail route, and `getDownloadable` checks it too, so a file id that leaked
  before publication or was kept after a takedown answers exactly like a typo.
  Verified against a seeded row, not assumed.

### Uploading

Two things write to `items`, and everything either of them creates lands as a
draft for a person to publish. **`docs/uploading.md` is the operator's guide**:
both paths, the folder layout, the sidecar, the commands and the limits.

- **`scripts/ingest.mjs`** is the bulk path, from a local disk, with a dry run
  first. Capped by nothing, so it is still the answer for the large end of the
  archive.
- **The form on `/admin`** (`src/components/upload-admin.tsx`, the only client
  component in the path) is one item at a time, put there by whoever made it,
  without a terminal. It writes through `src/lib/ingest.ts` and the three routes
  under `src/app/api/admin/upload/`.
  - **It has two upload paths and degrades honestly between them.** The browser
    PUTs straight to R2 with a presigned URL, which has no size limit; when that
    fails it posts through `/api/admin/upload`, which Vercel caps at 4.5 MB, so
    `SERVER_PATH_LIMIT_BYTES` is 4 MB. **195 of the 391 custom maps on the live
    server are over that**, mean 14.6 MB and largest 379 MB, so the fallback
    carries about half the archive and no more.
  - **The direct path stays dead until a CORS policy is set on the bucket**, by
    hand, in the Cloudflare dashboard: our R2 token is Object Read and Write and
    `GetBucketCors` answers AccessDenied. Until then the browser's PUT fails with
    no status at all, and the form prints the policy to paste and the CLI command
    rather than a 413 nobody can act on. `AllowedHeaders` needs **both**
    `content-type` and `cache-control`, because the signature covers both and a
    policy naming only the first fails identically to having no policy.
- **`src/lib/ingest.ts` is the CLI's twin and the two must agree.** Every derived
  rule is shared through `ingest-rules.ts` and `downloads.ts`; the statement
  lists are written twice and nothing checks that they still match, so a field
  added to one upsert belongs in the other the same day.

Four things a person editing this code needs to know:

- **Ids come from Drizzle, not from Postgres.** Every id in the catalogue tables
  is `$defaultFn(crypto.randomUUID)`, which is a client-side default and leaves
  no `DEFAULT` on the column. **A raw SQL insert must supply the id** or it
  fails on a not-null violation. This has already bitten once.
- **`inspectUpload` throws on a container it does not recognise**, which is the
  right behaviour for a parser and the wrong shape for a bulk run over a folder
  of textures and tools. Sniff first with `looksLikeRfl`, `looksLikeVpp` or
  `looksLikeZip`, all exported from `src/lib/rfl`, and treat "not a level" as an
  ordinary download rather than an error. It also takes the real filename now:
  a bare `.rfl` is nothing but level bytes, so without it the only game-type
  signal Red Faction has is gone before anything can read it.
- **The CLI cannot import `@/lib` anything that touches the database.** It runs
  under plain `node`, outside Next, so the path alias and the server-only
  environment are not there. It builds its own Neon and S3 clients, at the top of
  `scripts/ingest.mjs`. What it shares instead is
  `src/lib/ingest-rules.ts`, which imports nothing and is loaded directly by
  `node` in `scripts/ingest-rules.test.mjs`: **keep it importing nothing.** The
  sharing is the point, because a storage key is a promise and two callers
  disagreeing about how to build one is how an archive ends up with a file it
  cannot find and a row it cannot replace.
- **A draft governs the page and never the bytes.** The object is stored and
  world readable the moment the ingest writes it, so the decision to distribute
  something happens before `--go`, not at publish time.

## Retired: stats, the match archive and the analyst

Built between July and September 2026 and retired on 25 September 2026 at the
owner's request: the CTF match archive, the deathmatch rounds, players,
pairings, stat boards, search, and Stanley Mesh, the AI analyst who wrote a
column each night. `docs/HANDOVER.md` has the full story and what replaced it.

- **The pages are gone and their addresses redirect**, temporarily, in
  `next.config.ts`. Old Discord posts and in-game messages still land.
- **The data is kept.** Every table is still defined in `schema.ts`, so nothing
  proposes dropping it. **Only four of the thirteen are in the nightly backup**
  (`matches`, `match_players`, `match_captures`, `night_columns`), so take a
  full export before dropping anything.
- **The analyst's generation is gone; one small AI use came back.** The only
  trigger for the analyst was the archive ingest route, which is deleted. The
  OpenAI key in Vercel is unused and can be revoked. **Keep
  `ANTHROPIC_API_KEY*`, `CLOUDFLARE_AI_TOKEN` and the `GEMINI_API_KEY*` keys**:
  the server ghost uses them (next section).

## The server ghost (`src/lib/ghost/`, `/api/ghost`)

Asked for on 25 September 2026: a friendly ghost in the Halloween server's
chat, called **Wisp**. Not "ghost", because a player on the server has that
name. The owner's brief: "if someone joins, it should reach out to that user
'hey playername'. if they reply, continue. 'hows it going'. be chill. relaxed.
be a friend." So every person who joins gets "hey <name>" (the process's own
line, no model), and whoever it is talking with gets answers for three minutes
after it last spoke to them. It also answers its name, questions about the
server, and everything a lone player says. It is a Node process on the VPS
(`C:\RFMatchBroadcast\ghost\ghost.mjs`, task "RF4U Halloween Ghost") that joins
the game as a server-browser client and asks this site what to say.

- **Claude first, capped, with the free services behind it.** On 1 October,
  after a week of Wisp asking odd questions and losing the thread, the owner
  said "if you need the paid api to get better results, just use it". So
  `speak.ts` asks Claude Haiku 4.5 first while the VPS says its daily cap
  allows (400 replies, `data/ghost-halloween-paid.json`, which also keeps the
  tokens used), then Cloudflare Workers AI (Llama 3.3 70B, then 3.1 8B), then
  Gemini flash lite across every numbered key. The OpenAI key is still unused.
  When nothing answers, the ghost says one of its own lines where one fits.
- **The prompt has a cached half.** `persona.stable()` is the persona, the
  knowledge base (`knowledge.ts`: voting, the servers' public settings, Alpine,
  Red Faction, the community) and every map on the server with its file name,
  about 7,400 tokens, the same on every reply while the rotation stands, so it
  is cached for an hour. `persona.live()` is what is playing now. Haiku caches
  nothing under 4,096 tokens and says so only in `usage`, which the VPS logs:
  if `cache read` stays 0 the cache is not working. Anything that changes per
  reply belongs in `live()` or `promptFor()`, never in `stable()`.
- **Wisp cannot see the game**, and the persona says so: no describing maps,
  no "nice map so far". Its map questions are the VPS process's own lines,
  worded as a survey for the admins' map list, and go only to somebody it is
  chatting with, in a lull, once a visit.
- **Keys stay in Vercel.** The VPS authenticates with `RF4U_ARCHIVE_SYNC_SECRET`
  and never holds a model key.
- **Everything it says is plain ASCII with no em dashes**, because it reaches a
  2001 bitmap font. `asciiLine` enforces it and `scripts/ghost.test.mjs` checks
  it.
- **It never talks to the bots**, by the owner's instruction. It answers only a
  speaker the Alpine players snapshot confirms is a person, because a bot talks
  within a second of joining, before it is flagged (the first version answered
  two that way). The rule and its tests are `ghost-rules.mjs` and
  `ghost-rules.test.mjs` next to `ghost.mjs` on the VPS.
- **Its records are never deleted**, by the owner's instruction (26 September:
  "keep records, don't delete them"). The notebook on the VPS
  (`data/ghost-halloween-friends.json`) keeps every line, every fact players
  shared (NOTE) and everything learned about the game (LORE, with who said it);
  only the recent part is sent with a reply. The chat log is archived at 5 MB,
  never trimmed. An unreadable notebook is set aside, never overwritten.
- **Deploy the two halves together.** The in-game name (`NAME` in ghost.mjs) and
  the persona here must match, and ghost.mjs and ghost-rules.mjs are copied as a
  pair. Order: create `C:\RFMatchBroadcast\data\ghost-halloween.off`, push the
  site and wait for Vercel to show Ready, copy both files and restart the task,
  check its log, delete the off file. The same steps head ghost.mjs.
- **The persona is per server** (`persona.ts`). Only Halloween has one; another
  server gets a ghost by adding its persona and running a copy of the process.
- **Do not rebuild any of it without the owner asking.**

## Weight, measured rather than guessed

`npm run weigh` times and weighs every page in the sitemap and names anything
over 300 kB or 1000 ms. Point it at production the way `vet:pages` is pointed:
`npm run weigh -- https://redfaction4you.com`.

Numbers from 6 August, so they can be re-checked. The whole site went from
18.1 MB to 9.1 MB across 62 pages in one change, and none of it was visible in
the source: read the real response rather than reasoning about the components.

- **When a page is heavy it is the rendering, not the data.** The worst case
  on record was a match page (since retired) at 749 kB, of which 465 kB was the
  React payload for one list that was rendered in full inside a closed
  `<details>`. The largest page today is a server rotation, and `map-rotation`
  in `globals.css` numbers its rows by CSS for the same reason.
- **The VPS is not busy**: two cores at 4%, the broadcaster on 44 MB, 49 GB of
  disk free. See `../STACK.md` before optimising anything there.

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
