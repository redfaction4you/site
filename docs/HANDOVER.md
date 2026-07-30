# Handover

Written 29 July 2026, at the end of the session that built the match archive.
This exists so the next session can continue without the previous conversation.
`CLAUDE.md` covers conventions and gotchas; this covers state and intent.

---

## Where things stand

Live at `redfaction4you.com`, deployed from `redfaction4you/site` on push to
`main`. Everything below is working in production.

| | |
|---|---|
| Match archive | ingest, scoreboards, event logs, capture timelines |
| Players | records, per player pages, written profiles |
| News | one written report per match night, plus per match reports |
| Server | live status, map preview, rules, connection details |
| Backups | nightly to R2, encrypted, verified restorable |
| Health | `/api/health`, 503 when stale, UptimeRobot polling it |

Navigation shows News, Matches, Players, Server, Events. The catalogue
sections (maps, mods, models, weapons, tools, videos, guides) are built but
empty and hidden via the `hidden` flag in `src/lib/nav.ts`. Their pages still
answer, so shared links keep working.

---

## An image per article: built and working

**Built 30 July 2026, rewritten the same day** once it became clear the picture
should be composed from real assets rather than described from scratch. It runs:
the columns for 28 and 29 July both carry a generated illustration.

It needs **paid image access**. Gemini image models have no free allowance on any
of the six keys, so one Google Cloud project has billing enabled and its key is
named in `GEMINI_IMAGE_API_KEY`, used for images and nothing else. The free keys
stay on text. About four cents an image, one image a night.

### What was asked for

One image per article, generated once, stored with it. A sports desk photo
pastiche: a moment from the night. Small resolution is fine.

The ordering was the critical part and is what got built: **the match reports are
written, then the night column, then the image, then the whole thing is stored as
one row.** The illustration belongs to the night that was actually played rather
than being generated in parallel from the numbers.

Then the brief got better: compose from the real player models and a screenshot of
the real map, with the real number of players a side, rather than asking a model to
imagine an evening. That is what is built now.

The slot it fills used to show whatever map the server happened to be on. Because
that changed every few minutes, the picture beside a fixed piece of writing never
stayed still long enough for a reader to remember it.

### The design, which is the part that matters

The picture is **composed from reference images**, not imagined: a screenshot of the
map that was actually played, the actual player models in red and blue, the real
number of figures a side, and a flag in shot only when one was genuinely moving.
That is the difference between a generic sci-fi picture and one that shows your map
and your teams.

Almost nothing is a model's decision:

| decided by | what |
|---|---|
| `match-pick.ts`, from the record | which match (overtime, then closest, then most goals), which moment, squad sizes, whose flag |
| `image-prompt.ts`, in code | which screenshot suits the moment, and the whole prompt |
| a text model | one short mood phrase, capped at 90 characters |
| `vision.ts` | whether the result may be published at all |

Three things were learned the hard way and are load bearing.

**The style block describes treatment only, never a setting.** It opened with "an
industrial Mars mining colony", which was defensible when a model was inventing a
location from nothing and is wrong now twice over: the screenshot *is* the location,
and most CTF maps are not Martian. Ankh is an Egyptian tomb. Only the Warlords maps
are mining bases.

**Prohibitions belong in the gate, not the prompt.** The block used to end with
"absolutely no text, lettering, numbers, logos, signage or watermarks" and "no
recognisable faces". The first image it produced had an illuminated sign reading 22
in the top of the frame and four visible faces. Diffusion models condition on the
tokens they are given and handle negation poorly, so listing what to avoid is a
reliable way to summon it. The prohibitions moved to `vision.ts`, where a text model
can be trusted to apply them, and the prompt states the positive form instead.

**A map with no screenshots is skipped, not invented.** These maps share nothing
visually, so a model with no reference has no way to be right and every reason to be
confidently wrong.

**References are Gemini only, and that is measured.** Cloudflare's FLUX.2 endpoints
accept a multipart upload and return 200, then ignore it: a reference image that was
20 percent vivid marker pixels produced outputs containing 0.00 percent of them,
across `flux-2-klein-4b` and `flux-2-dev` and three field names. Cloudflare is still
used when there are no references, because it is the one with a free allowance.

| | |
|---|---|
| `src/lib/ai/match-pick.ts` | which match, which moment. Pure, no imports, tested |
| `src/lib/ai/image-prompt.ts` | prompt assembly, shot choice, validation. Pure, tested |
| `src/lib/ai/image-brief.ts` | the one mood phrase |
| `src/lib/ai/image-refs.ts` | generated manifest of what is in the bucket |
| `src/lib/ai/image.ts` | Gemini with references, Cloudflare without. Never throws |
| `src/lib/ai/vision.ts` | the gate. Fails closed |
| `src/lib/ai/night-image.ts` | the steps in order |
| `scripts/refs-push.mjs` | `npm run refs:push`, syncs assets and rewrites the manifest |
| `scripts/refs-label.mjs` | `npm run refs:label`, labels poses by looking at them |

### The reference assets

Staged in `assets/refs` (gitignored), pushed to R2 under `refs/`, catalogued in the
generated `image-refs.ts`. 67 objects as of 30 July 2026: 42 character renders
across both skins, 8 flags, and three to four screenshots each for ankh-b12,
huna-b8, warlords-pro, dark-warlords and relic-seeker.

**Nothing has to be named to a scheme.** `refs-push.mjs` parses whatever arrives,
because making a person match a convention every time they add a map is a worse use
of effort than parsing a few spellings once. Team comes from the folder.

Pose cannot come from a filename, though, because these arrive from a model viewer
thirty at a time as `Screenshot 2026-07-30 011611.png`. `npm run refs:label` looks
at them with a vision model and writes `assets/refs/poses.json`, which **is**
committed: the labels cost a request each and are the record of which render is a
run and which is a crouch. Only unlabelled files are sent, so re-running when more
arrive is cheap.

The pose is then matched to the moment: a capture run takes `run`, a defensive
stand takes `crouch`, a celebration takes `stance`. `death` is used only in the
defensive picture and never in a celebration. T poses are a last resort, being rig
references whose splayed arms carry into the output.

Areas are `blue-flagroom`, `red-flagroom`, `mid`, `mid-alt` and a few generic
fallbacks. The side matters: a capture is scored at the capturing team's own stand,
so a red capture is illustrated in the red flag room.

Two things known to be imperfect. The renders were captured with the weapon
attachment stripped, so hands are empty with the fingers still curled round a grip;
the prompt says so and asks for a weapon to be added, which is the one element in
the picture that is invented. And the output currently reads as a clean in-engine
screenshot rather than the grainy press photograph the treatment block also asks
for: the fidelity instruction that stopped it rendering a glossy modern remake
pushed past the photographic one.

### Regeneration

A night that already has an image keeps it. A column that gets rewritten because
two more matches arrived is the same evening with a longer account of it, and the
picture is a mood rather than a claim about the score, so it is not worth a scarce
image request. `illustrated` in `backfillColumns` is that check, and the
`onConflictDoUpdate` names the image columns only when there is a new image, so a
rewrite cannot blank a picture that exists.

### Labelling, which is not optional

Every other piece of generated content here says it was machine written. A
picture has to say it more loudly, because a synthetic photograph presented as a
record of the evening is the single most misleading thing this project could
publish.

The caption lives inside `ColumnImage` and there is no way to render the image
without it. The Discord embed carries the same label in its footer. There is
deliberately **no** OpenGraph image: a link preview elsewhere would carry the
picture with no caption attached, which is the one place the label cannot follow
it.

### The fallback that needs no model at all

`ColumnImage` takes a storage key and does not care what put it there, so a
hand-uploaded object at `news/<archive-day>.jpg` plus the key on the row is a
picture on the front page with no generation involved. Worth remembering if paid
image access never happens: the reference library is already in the bucket, and
picking one of those screenshots per night is accurate, free, and dull rather than
wrong.

---

## Local development shares the production database

There is one Neon instance. A row edited from a local script is edited on the live
site, and the VPS syncs every fifteen minutes, so production acts on local changes
without being asked.

This is not theoretical. Marking the column for 29 July stale in order to test the
new fact check had the **deployed** code rewrite it ninety seconds later, using none
of the fixes being tested, and it introduced a fresh contradiction of its own while
doing so. The local run then had to be raced against the next sync to win.

Two consequences worth holding on to. Anything touching `night_columns` or
`matches` from a local run is a production change. And a local test of a pipeline
change is only meaningful if the local run is the one that writes.

---

## Why writing goes missing

Diagnosed 30 July 2026, after the Ankh match on the night of 29 July had no
report and the night had no column. **Two separate causes**, and the second was a
bug rather than a limit.

### Three bugs with one symptom

An article that never appears looks the same however it failed, and all three of
these were mistaken for quota before being found. Two were only visible because the
pipeline was run against real data repeatedly.

| | was | now |
|---|---|---|
| text timeout, `generate.ts` | 30s | 60s |
| vision timeout, `vision.ts` | 45s | 120s |
| 5xx handling | ended the chain | falls through |

The timeouts matter more than they look. Gemini's output budget covers internal
reasoning, so a column spends a long time thinking before the first word arrives,
and 30 seconds cut one off mid-thought. The vision payload is the whole generated
image, a couple of megabytes and a third larger again as base64, and four of five
keys timed out on the first real check. That gate **fails closed**, so a timeout
there silently rejects a good picture rather than publishing an unchecked one.

### The bug: a 503 abandoned the whole chain

`shouldTryNextKey` in `generate.ts` used to fall through to the next key on 429
and 403 only. Gemini answers **503 "This model is currently experiencing high
demand"** readily, and a 503 was treated as a malformed request, so one transient
upstream blip returned null and stopped, leaving the second key untouched and the
article unwritten until the next sync fifteen minutes later. That is what cost the
column for 29 July: the first key had quota the whole time.

5xx is now treated as a reason to try the next key. Fixed, and the column for that
night was written immediately afterwards.

The lesson generalises: **a failure here is not necessarily quota.** Read the
status before assuming.

### The limit: twenty requests per day per model per project

The free tier allowance is in the 429 detail as
`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, limit 20. Note *per project*,
not per key.

**Do not rely on a reset time.** This file previously said midnight Pacific, on the
reasonable assumption that a "per day" quota has a daily boundary. Observation says
otherwise: two keys exhausted at 22:30 Pacific were both serving again at 23:22 the
same evening, with no midnight crossed in any timezone. That looks like a rolling
window where requests age out individually rather than a counter that zeroes. It
means a night that runs dry partly recovers within the hour, which is better than
the assumption, but it also means nothing can be scheduled around it.
`npm run ai:quota` is the only reliable answer to "how much is left".

A four match night with five players needs roughly eleven text requests: one report
per match, one column, and a profile rewrite for anyone far enough out of date.
Against twenty per project that leaves no room for retries, which is why the night
of 29 July ran out.

`npm run ai:quota` reports where each key stands; `-- --images` includes image
generation. It costs one request per key per model probed, so not on a match night.
A 429 costs nothing, so an exhausted key is free to check.

### The fallbacks are not fallbacks

`OPENAI_API_KEY` is set but out of credit. `ANTHROPIC_API_KEY` is set but
**empty**, so it never enters the chain: `attempts()` treats a blank key as absent,
which is correct but means the chain is shorter than the environment suggests. The
real chain today is Gemini and nothing else. Filling in the Anthropic key would add
a genuinely independent provider, which is worth more than another Gemini project
because it fails independently.

### What was changed

**Profiles no longer rewrite on every change.** `PROFILE_REWRITE_STEP` is 3: a
profile is rewritten once three more matches have happened, not every time somebody
plays. Rewriting on any change meant every participant's profile was rewritten
every evening, repeatedly during the evening as counts kept moving, for text that
read almost identically. Reports were never regenerated and still are not:
`backfillReports` selects on `report is null`.

**Keys are enumerated.** `geminiKeys()` reads `GEMINI_API_KEY` then
`GEMINI_API_KEY_2` upward to ten, so capacity is an environment change with no
deploy. A key filled in out of order logs a warning and is used anyway rather than
silently dropped.

**Do not bother dedicating keys to images.** The daily cap is per *model*, so a key
used all day for text has its entire image allowance untouched. Text and images do
not compete, and segmenting keys by purpose would leave one exhausted while another
sits idle.

Since the cap is per model, a second model is worth as much as a second project:
`gemini-flash-latest` and `gemini-2.5-flash` have separate twenties on one key.
Nothing splits work across models today, and it is the cheapest capacity available
if keys ever run short.

One cost worth knowing: while no key has image quota, every sync makes one doomed
image request per key. A 429 spends no allowance and the attempts are logged, so
this is deliberately not suppressed. A negative cache would hide the moment a new
key starts working, which is the wrong tradeoff while somebody is actively trying
to make it work.

---

## Other outstanding items

**Light mode.** Asked for, not started. The palette in
`src/app/globals.css` `@theme` is dark-committed: `basalt` is the background
ramp, `steel` the text ramp. A light theme needs a second set of token values
under `:root[data-theme="light"]` plus a toggle that writes the attribute and
persists it, and an inline script in `layout.tsx` to set it before first paint
or the page flashes dark. Note the colour names are historical and no longer
describe their values; do not rename them, `CLAUDE.md` explains why.

**Player opt-out.** The user is asking players first. Player pages are already
`noindex, follow`. When it is wanted: a table of opted-out name keys, respected
by every read path. Names are not unique, so this is a request honoured in good
faith and should say so.

**Discord webhook.** `DISCORD_NEWS_WEBHOOK` is deliberately unset, locally and in
production, so columns are written and published on the site but announced
nowhere. Setting it turns announcements on with no code change. Once it is set,
note that there is only one webhook: calling `rebuild` against a local server will
post to the real channel unless the variable is blanked for that run.

**Weapon stats on player pages.** Per weapon shooting is stored per match from
the 2.1 broadcaster (`match_players.weapon_stats`). Not yet rolled up into
career totals on `/players/[name]`.

**One cached backup URL.** `files.redfaction4you.com/backups/2026-07-29.json.gz`
was briefly public before backups were encrypted. Deleted at origin, but
Cloudflare served it from edge cache for four hours. Purge it in the Cloudflare
dashboard if it has not aged out.

---

## Things not to break

These each cost something to learn.

**The sanitizer is an allowlist.** `src/lib/matches/sanitize.ts` names every
field it copies. A field invented upstream cannot leak because it is simply not
copied. Never replace it with a spread. v2 of the broadcaster added
`private_alias_history` and it was dropped automatically; there is a test.

**`match_players.identity_key` is stored and never served.** It is the only
stable handle for linking a Discord account to an in-game player. Every read
path in `src/lib/matches/queries.ts` names its columns. Do not use
`db.query.matchPlayers.findMany()` there.

**The R2 bucket is public.** It has a custom domain attached, so anything
written to it is downloadable by anyone who guesses the key. The first backup
was readable at `files.redfaction4you.com` within seconds and contained
identity keys. Backups are now AES-256-GCM encrypted and an unencrypted write
is refused outright. Anything else written to that bucket must be safe to
publish.

**Generated text is always labelled**, naming the model.

**Gemini's output budget covers its thinking.** A column spends well over a
thousand tokens reasoning before writing a word, and a run that stops on
`MAX_TOKENS` is discarded rather than stored half finished. This silently
produced no columns for hours at a 3000 budget. It is 8000 now.

**No em dashes**, anywhere, in site copy or generated text. Both prompts
forbid them.

**They and them for every player**, in all generated text. A model will
otherwise infer gender from a handle; it did once.

---

## Operating it

```bash
npm run dev            # localhost:3000
npm test               # 58 tests
npm run typecheck      # before every push
npm run db:check       # verify tables exist
npm run backup:read    # list backups; pass a key to decrypt one
npm run ai:quota       # what each Gemini key can do today
npm run ai:quota -- --images   # and whether images are possible at all
```

Two authenticated endpoints, both taking `RF4U_ARCHIVE_SYNC_SECRET` as a bearer
token:

```
POST /api/rf4u/archive/rebuild   run report, column and profile generation now
GET  /api/admin/backup           run a backup now; ?list=1 to list without writing
```

`GET /api/health` is public and returns 503 when the sync or the backup is
overdue.

---

## The thing that still matters most

The catalogue is empty. Everything above is scaffolding for a file archive with
nothing in it, and the build plan is explicit that launching empty and waiting
for uploads that never come is the most likely way this project dies. Seeding
from the Levels4You archive is worth more than any further feature, and it is
also the only way to test the RFL compatibility parser against a real file
rather than the synthetic fixtures it currently passes.
