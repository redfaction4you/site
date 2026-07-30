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

## The next piece of work: an image per article

This is the thing the last message asked for and it is not built.

### The problem

The front page briefly showed the map the server happened to be on beside the
lead article. Because that changes every few minutes, the picture next to a
fixed piece of writing kept changing, so no reader could form a memory of it.
That slot is now empty, with a comment pointing here.

### What was asked for

One image per article, generated once, stored with it. A sports desk photo
pastiche: the blue team celebrating, a moment from the night. Small resolution
is fine. Gemini is already wired up and its image models are available to the
configured key.

Critically, the ordering: **write the match reports, then the night column, then
generate the image from that text, then publish the whole thing as one package.**
The image should illustrate the story that was actually written, not be
generated in parallel from the raw numbers.

### Design

1. **Model.** The key already lists `gemini-3-pro-image`, `gemini-2.5-flash-image`
   and `nano-banana-pro-preview` via
   `GET https://generativelanguage.googleapis.com/v1beta/models`. Query that
   rather than pinning a name, for the reason described in
   `src/lib/ai/generate.ts`: Google retires model names to new keys, and
   `gemini-2.5-flash` already 404s with "no longer available to new users"
   despite still being listed.

2. **Storage.** R2 is configured and public at `files.redfaction4you.com`.
   Write to `news/<archive-day>.jpg`. Add the domain to `next.config.ts`
   `remotePatterns`, which already derives an entry from
   `NEXT_PUBLIC_R2_PUBLIC_BASE`, so this should need no change.
   Do **not** write to `backups/`. See the warning below.

3. **Schema.** Add to `night_columns`: `image_key text`, `image_prompt text`,
   `image_model text`. Keeping the prompt matters: it is the only record of why
   a given picture exists, and it makes a regeneration reproducible.

4. **Sequencing.** In `src/lib/ai/night-runner.ts`, `backfillColumns()` already
   runs after `backfillReports()`. Generate the image inside the same loop
   immediately after `writeNightColumn()` succeeds and before the insert, so a
   column row never exists without its image having been attempted. Announcing
   to Discord is a separate pass (`announcePendingColumns`) and already only
   fires for columns with no `postedAt`, so the image will exist by then and can
   be attached to the embed.

5. **Prompt.** Feed it the headline and the first paragraph, plus the concrete
   facts: which team won, the map names, the score. Ask for a photojournalistic
   sports image, no text or lettering in the picture, no faces of real people.
   Red Faction is a Mars mining setting, so the vocabulary is industrial,
   red rock, mining equipment, not fantasy.

6. **Failure.** Same rule as everywhere else in this codebase: if generation
   fails, the column still publishes without an image. Never block the writing
   on the picture.

### Label it

Every other piece of generated text on the site says it was machine written.
An illustration must do the same, for the same reason: the site's value is that
its information can be trusted, and a synthetic photograph presented plainly is
the single most misleading thing that could be added to it. A caption reading
"illustration, generated" or similar is not optional.

### The alternative the user also offered

Uploading real images into folders by circumstance, red team wins, blue team
wins, per map, and picking one to match. Cheaper, always accurate, needs no
model, but needs someone to supply and maintain the library. Worth raising
again if generated images look wrong for the site.

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

**Discord webhook.** `DISCORD_NEWS_WEBHOOK` is deliberately unset, so columns
are written and published on the site but announced nowhere. Setting it turns
announcements on with no code change.

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
