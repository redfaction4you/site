# Handover

Rewritten 30 July 2026, at the end of a long session. This exists so the next
session can continue without the previous conversation. `CLAUDE.md` covers
conventions and gotchas; this covers state, intent and what is unfinished.

---

## Where things stand

Live at `redfaction4you.com`, deployed from `redfaction4you/site` on push to
`main`. Everything below is working in production.

| | |
|---|---|
| Match archive | ingest, scoreboards, event logs, capture timelines |
| News | a written column per night, a report per match, both fact checked |
| Illustrations | one per column, composed from real map and player references |
| Players | records, per player pages, written profiles, board placings |
| Stats | `/stats`, twelve boards ranking each statistic separately |
| Server | live status, map preview, rules, connection details |
| Backups | nightly to R2, encrypted, verified restorable |
| Health | `/api/health`, 503 when stale, UptimeRobot polling it |

Navigation: News, Matches, Players, Stats, Server, Events. The catalogue
sections (maps, mods, models, weapons, tools, videos, guides) are built but
empty and hidden via the `hidden` flag in `src/lib/nav.ts`. Their pages still
answer, so shared links keep working.

Sign-in is removed from the header. Discord auth still exists in the code and
returns on its own if `AUTH_DISCORD_ID` is ever set, but every page is readable
without an account and a permanent "sign-in pending" notice was a corner of every
page spent apologising for a feature nobody was waiting for.

---

## The thing to understand first: two stages of checking

This is the spine of the project and most of the session went into it. **Every
piece of writing on this site is machine generated, so the whole value
proposition rests on it being checkable.** Three separate wrong things reached
published pages before this existed, each found by a person reading a page.

**Stage one, the data, on the way in.** `src/lib/matches/vet.ts` runs on every
ingest before a word is written. The archive records most facts twice, so where
two records disagree something is wrong and it can be said so without knowing
which is right. Nine checks: scoreboard captures against the event log, score
against the event log, winner against the score, hits exceeding shots, capture
kinds exceeding captures, implausible unrelayed capture times, captures credited
to unknown players, negative counters, and sides being reshuffled between
matches. Nothing is rejected: a flawed record beats no record. `npm run vet` runs
the same checks over history.

**Stage two, the writing, on the way out.** `src/lib/ai/fact-check.ts` sends every
draft column and match report back with the facts and asks what the data does not
support. A failure is rewritten once with the offending sentences quoted back,
then discarded if still wrong. It **fails open**: if the checker cannot run the
piece publishes anyway, because withholding every article whenever a checker is
rate limited is a worse trade than a rare small error.

Superlatives are additionally computed in code and handed over, because reading
down a table for the largest number is the thing models get wrong and the
arithmetic is trivial for us.

### The three bugs that motivated it

Worth knowing, because each is a shape of error rather than a one-off.

1. A column claimed a "session-high 19.2 percent accuracy" when another player
   shot 19.4, and omitted a player's capture while listing everyone else's. The
   previous night's column got all of it right from the same prompt, so this is
   variance and no prompt wording fixes variance.
2. The stat board printed a **2.2 second capture**, which is impossible.
   `fastest_capture_ms` is how long *that player* held the flag, not how long the
   flag took to get home, so on a relay the last carrier takes a hand-off beside
   their own stand. Every impossible value on record is a relay. The rule is now
   `relay_caps = 0`, not a time floor: any floor high enough to exclude 2.2 would
   have been a number chosen to fit the data.
3. Columns wrote about "Red" and "Blue" as teams. **They are shirt colours that
   get reshuffled.** On 28 July two players swapped sides after the opener. On 29
   July red was the same pair all night while blue rotated through three pairings,
   so "Red set the pace" was fair and "Blue found their footing" described a group
   that never existed. `buildNightFacts` now reports continuity per side by name.

The generalisable lesson: **suspect any number that makes somebody look unusually
good.** All three were flattering and plausible, which is why they published.

---

## The illustrations

One per column, composed from reference images rather than imagined: a screenshot
of the map that was played and the actual player models. Almost nothing is a
model's decision.

| decided by | what |
|---|---|
| `match-pick.ts`, from the record | which match (overtime, then closest, then most goals), which moment, whose flag |
| `image-prompt.ts`, in code | which screenshot, the crop, the whole prompt |
| a text model | one mood phrase, capped at 90 characters |
| `vision.ts` | whether it may be published at all |

**Model: `gemini-3-pro-image`**, and the choice matters. The flash models treat
several references as things to blend, so the map came back as the right
materials arranged into a courtyard that was not the level. The pro model treats
the plate as a plate. Roughly 13c an image against 4c, on one image a night.

### Things learned the hard way, all load bearing

- **Name the glass.** "Shallow depth of field" is a hint that gets read loosely.
  `400mm f/2.8` is a specification and the training behind it is full of real
  sideline photography. The blur then does a second job: the location only has to
  carry the right palette and light, not the right geometry, which is the one
  thing the model reliably gets wrong.
- **Avoid wide action shots.** Several figures at several depths meant scale and
  physics had to be right everywhere and they were not. Telephoto portraits of one
  or two figures play to what the model does well. Framing varies per night
  (shoulders, chest, waist, full) so a run of them does not look identical.
- **Prohibitions belong in the gate, not the prompt.** Listing "no text, no
  signage, no numbers" put an illuminated sign reading 22 in the first image
  generated. Diffusion models condition on the tokens they are given.
- **The style block describes treatment only, never a setting.** It once said
  "industrial Mars mining colony", which is wrong twice: the screenshot is the
  location, and most of these maps are not Martian.
- **Flag logic.** A capture returns the flag to its stand the instant it
  completes, so only `flag-run` has a flag in hand, it is always the enemy's, and
  no stand appears behind the runner.
- **The vision gate knows two exceptions**, both learned by it rejecting good
  pictures: the game's own low polygon faces are not real people, and carved
  ornament is not text. Ankh is an Egyptian tomb covered in glyphs and a strict
  reading meant it could never be illustrated.

### The reference assets

Staged in `assets/refs` (gitignored), pushed to R2 under `refs/`, catalogued in
the generated `src/lib/ai/image-refs.ts`. Characters in both skins with labelled
poses, flags, and screenshots for ankh-b12, huna-b8, warlords-pro, dark-warlords
and relic-seeker.

- `npm run refs:label` labels character poses by looking at them, writing
  `assets/refs/poses.json` (committed). Only unlabelled files are sent.
- `npm run refs:push -- --go` syncs to R2 and regenerates the manifest.
- Nothing needs renaming: the push script parses whatever names arrive. An
  unlabelled map screenshot classifies as `overview`, which is what gets shown
  wherever a map is merely named.

---

## Keys, quota and cost

The binding constraint on everything in `src/lib/ai/`.

- **Free Gemini tier is twenty requests per day per model per project**, not per
  key. Six keys from six Google accounts, so six allowances.
- **Image models have no free allowance at all.** One project has billing enabled
  and its key is in `GEMINI_IMAGE_API_KEY`, used for images only. The free keys
  stay on text, with the billed key last in the text chain as a safety net.
- `npm run ai:quota` reports where each key stands. `-- --images` includes images.
- Anthropic is last in the chain and is the only provider that fails
  independently of Google. `OPENAI_API_KEY` is present but out of credit.
- **Cloudflare Workers AI cannot do reference images.** It accepts a multipart
  upload, returns 200, and ignores it: measured at 0.00% marker transfer. It is
  used only when there are no references.

Production env vars are set (all six Gemini keys, the image key, Anthropic,
Cloudflare). See `CLAUDE.md` for the redeploy gotcha.

---

## Outstanding

**Map overviews.** Five maps have them. The user has more coming and said they
would add them the day after this session. Drop into
`C:\RF4U\site\assets\refs\maps\`, unsorted is fine: the filenames carry the map
name (`20260711_201308_CTF-Ankhb12.jpg`), so folders and `MAP_ALIASES` entries can
be derived rather than guessed. Never guess a map from pixels.

**Pairings** are built, 30 July 2026. `src/lib/matches/pairings.ts` is pure and
tested, `queries.ts` fetches the appearances it reads, and every player page has
an "Alongside and against" section. The facts also go into the player profile
prompt, which is the part Orion needs.

Two rules in it are the point rather than detail. A win rate is withheld below
five decided matches together, because a percentage from three games describes
the last one; the record is always shown, since that is a fact and the rate is an
inference. And **how much better somebody plays with a given partner is
deliberately not computed.** It is the obvious next question and this data cannot
answer it: splitting an already small number of matches into with-them and
without-them leaves a figure that is mostly which side the shuffle picked. It
becomes answerable at hundreds of matches, not eight. The reasoning is in the
module header so nobody adds it by accident.

`/players/pairings` is the server-wide view, linked from `/players` and from each
player's own section. It shadows `/players/[name]` for anybody actually called
"pairings", since Next resolves a static segment first. Left alone deliberately.

**Who moves flags together is the obvious next dimension and is not built.** It is
the pairing that only a CTF archive can show, and the measurement is already
there: `drives.ts` reconstructs every drive at ingest to credit lead carries. What
is missing is persistence. `match_captures.drive_participants` and `assists` are
empty on every row currently stored, because the VPS sends them empty and ingest
copies what it is given, so a pairing built on hand-offs would have to re-read
`matches.flag_events` for every match on every page load. The fix is to have
`storeDay` write the reconstructed carriers into `drive_participants` when the
payload does not supply them, which is what the column comment in `schema.ts`
already anticipates, plus a backfill for rows already stored.

Measured on the current archive before deciding not to build it: 32 drives, 22
solo and 10 relays, with the most-relayed pair on three. Thin enough that a table
would be mostly ones, which is the reason it waits rather than a reason it will
not work.

**Then Orion**, below.

**Stanley Mesh** is built, 31 July 2026, and is what the Orion note below
became. A sports analyst with a byline photo of a low poly character from the
game, writing one opinion piece per night about pairings, in `opinion.ts` and the
`opinion_pieces` table. All three decisions listed below were kept: the byline
says machine written, the guard is different from the fact checker, and it runs
on leftover quota.

The guard worth understanding is that it is mostly upstream rather than in the
prompt. He sees a win rate only where a pairing has cleared five decided
matches, and sees no percentage at all below that, because a model told to
ignore a number in front of it will use it. He is also shown only the archive as
it stood on the night he is writing under, after the first version cited seven
matches together on a page where the pair had played once.

**Orion**, the earlier note, kept for the reasoning: A named automated
columnist writing short opinion and prediction pieces to fill the front page
between match nights. Three things already decided: the byline must state it is
machine written, because a human-sounding name is the one thing that quietly
undoes the labelling everything else carries; predictions cannot be fact checked
the way reports are, so they need a different guard (reference only recorded
stats, never state a prediction as fact); and it should run only on leftover free
quota. Thin until there is more data.

**Player opt-out.** The user is asking players first. Player pages are already
`noindex, follow`. When wanted: a table of opted-out name keys respected by every
read path. Names are not unique, so it is a request honoured in good faith and
should say so.

**A matches home page.** `/matches` redirects to the newest night, which is the
right default now. Worth building when there are enough nights that scanning
across them beats landing on one, and the useful version is probably grouped by
map or by notable matches rather than being a list of dates.

**The totals boards will skew with time.** As the archive grows a regular's
totals become unreachable and the totals boards become a seniority list. The per
match boards exist for this reason; eventually you want recent-form windows.

**Discord webhook.** `DISCORD_NEWS_WEBHOOK` is deliberately unset everywhere, so
columns publish on the site but are announced nowhere. Setting it turns
announcements on with no code change.

## The 2.2 broadcaster package, and why the storage was not changed

`RF4U-MATCH-ARCHIVE-INTEGRATION-2.2.zip` arrived on 31 July with instructions to
build the archive on Vercel Blob, one JSON document per day. **The shot integrity
rules were taken and the storage model was not.** That decision is the same one
recorded further up this file, and it is worth restating because the package will
probably arrive again:

Day-sized documents cannot answer a question that crosses matches. `/players`,
the twelve stat boards, pairings, player profiles and the night columns all
aggregate across the whole archive, and every one of them would become "read
every document and reduce in memory". Postgres was chosen for exactly this and
the reasoning has not changed.

What the package was genuinely right about is the shooting bug, and its own test
fixture uses `shots_hit: 1804, shots_fired: 169`, our numbers. Those rules are now
in `sanitize.ts` and its tests. See `chooseShotTuple`.

Also worth knowing: the `windows-vps/` scripts in the package are byte identical
to `../Transfers/vps-archive-sync/`, which is a superset with extra diagnostics
and is newer. Nothing to take there.

**Two stored things are still wrong and code cannot fix them on its own.**

*Drive credit on the three overtime matches.* `soloCaps`, `relayCaps` and
`leadCarries` are computed at ingest, so the ordering fix in `drives.ts` only
reaches a match when its day is re-sent. The VPS re-sends recent days on every
sync, so nights inside that window heal themselves once this deploys; anything
older needs a deliberate re-send. Verify with a re-run of the comparison: correct
ordering gives Romek two solo captures on Relic Seeker where the stored row says
one solo and one relay.

*Prose naming people who were not in the match.* Every stored report and column
written before 31 July counted absent rows as players. Confirmed: the match 10
report says "Both Fatoon for red and T1k}super for blue finished with 0 frags",
and the 30 July column puts Fatoon in a match they did not play. The prompts now
forbid naming anybody not in the list and forbid remarking that somebody scored
nothing, but stored prose does not change until it is regenerated.

*Prose written from the poisoned totals.* Stored, so it outlives the bug that
produced it, and the page now contradicts itself where the scoreboard withholds a
figure the article still quotes. Confirmed:

- The **Rail Fight match report** says SiD shot "1067.5% accuracy".
- **SiD's profile** says "a league-best 29.5 percent accuracy". The sound total is
  16.0%. 29.5% is exactly what you get by including the broken match.
- Every **profile written after the rail night** ranked accuracy against SiD's
  inflated figure, so the ranks are suspect even where the player's own number is
  fine. That covers medeo, t1k}super, ed assmaster, oddbaal, fatoon and romek.
  "SiD hits shots at a rate no one else matches" is simply false.
- The night columns are clean, checked for any three digit percentage.

Fixing means regenerating, which costs quota and rewrites other prose, so it was
left as a decision rather than done. Note the fact checker could not have caught
any of this: it verifies prose against the facts it was given, and the facts were
wrong.

**Orphaned images.** Changing image provider changed the stored extension from
`.png` to `.jpg`, leaving the old objects in the bucket. Harmless, worth a cleanup
pass if it recurs.

---

## Next session: what to do, and why

Written at the end of 31 July 2026. Everything below is deployed and verified
unless it says otherwise.

### The one pattern worth understanding before touching anything

Four separate data bugs were fixed today and **every one of them had already
been detected.** `vet.ts` had been reporting `hits-exceed-shots` on every run for
days while the site published 1067% accuracy. The failure was never detection. It
was that nothing consumed what detection produced.

The same shape appeared four more times: a reported scalar trusted over a derived
one (accuracy, fastest capture), a stale figure that a staleness check could not
see, prose outliving the bug that produced it, and a job whose result nothing
reported so nobody could tell it had stopped.

**When adding anything here, ask what consumes it when it fires.** A check nobody
acts on is a log line.

### The to-do list

Ordered by how much each reduces the chance of the next silent wrong number.

**1. Make vetting consume its own output.** The biggest structural gap left.
`vetNight` runs on every ingest, logs, returns a summary in the response, and
gates nothing: the reports and column are then written from data already known to
be faulty. Two anomalies are open right now that nothing acts on
(`implausible-solo-capture` on matches 10 and 12). The proportionate fix is not
to block publication, which would trade a rare error for frequent silence, but to
pass the anomalies into the generation prompts as "these specific figures are
known bad, do not cite them", the way superlatives are already precomputed and
handed over. Cheap, suppresses nothing.

**2. Give stored prose a fact fingerprint.** Reports, columns and profiles are
written once and keep whatever was true then. `player_profiles.match_count` is
the only staleness check and it cannot see counters changing inside an
already-counted match, which is how a profile came to claim 254 frags beside a
page showing 263. Store a cheap hash of the facts a piece was written from and
rewrite when it changes. Weigh against quota: the free tier is the binding
constraint, so a check that rewrites eagerly is its own problem. There is a task
chip open for this.

**3. Extend `verify.ts` to the reports and the column.** The free checks, no
invented numbers and no superlative on a contested value, currently guard only
Stanley Mesh. Match reports and night columns run the model check without them,
which is both more expensive and less certain. They should run the free pass
first for the same reason he does.

**4. Give the generation pipeline somewhere to be observed.** Twice today a job
was working and looked broken because nothing reported it. `/api/health` covers
sync and backup; it says nothing about what was written, what failed
verification, or what is stale. Even a small admin JSON would have saved an hour.

**5. Record a fixture set so prompts can be iterated without quota.** Every
prompt change today cost real requests from an allowance that is the binding
constraint. A handful of saved facts blocks plus expected-shape assertions would
let the wording be changed and tested for free.

**6. Replace throwaway repair scripts with a real command.** Nulling reports,
clearing pieces and re-checking data were all done with ad hoc scripts written
and deleted in the same minute. A small `npm run repair -- <operation>` with
named, reviewed operations would make that repeatable and safe against a
production database that is also the development one.

### Known state, so nothing is rediscovered

- **Two rows permanently hold `hits > shots`** (SiD and Romek, Rail Fight). The
  VPS patch fixes counting forward and never recomputed that night. Quarantined
  on read; nothing derived from them reaches a page.
- **Five absent rows are still stored** and always will be. Filtered on read by
  `TOOK_PART`.
- **39 rows carry a measured `fastest_solo_capture_ms`.** Nothing under five
  seconds anywhere. The board is correct.
- **Overtime drive credit is correct after re-ingest**, verified: Romek shows two
  solo captures on match 13, which is what the corrected ordering predicts.
- **Stanley Mesh has one piece**, for 30 July. Nights 28 and 29 correctly have
  none: scoped to what was known then, they fall under the twelve match minimum.
- The avatar is still `public/mr-mesh.png` from before he was renamed. Harmless,
  and a two line change if it bothers anybody.

---

## Operating it

```bash
npm run dev            # localhost:3000
npm test               # 124 tests
npm run typecheck      # before every push
npm run vet            # check the archive against itself
npm run ai:quota       # what each key can do today
npm run refs:label     # label new character poses
npm run refs:push -- --go
```

Two authenticated endpoints, both taking `RF4U_ARCHIVE_SYNC_SECRET` as a bearer
token:

```
POST /api/rf4u/archive/rebuild   run report, column, image and profile generation now
GET  /api/admin/backup           run a backup now; ?list=1 to list without writing
```

`GET /api/health` is public and returns 503 when the sync or the backup is
overdue.

---

## Things not to break

**The sanitizer is an allowlist.** `src/lib/matches/sanitize.ts` names every field
it copies. A field invented upstream cannot leak because it is simply not copied.
Never replace it with a spread.

**`match_players.identity_key` is stored and never served.** Every read path in
`queries.ts` names its columns. Do not use `db.query.matchPlayers.findMany()`.

**The R2 bucket is public.** Anything written there is downloadable by anyone who
guesses the key. Backups are encrypted and an unencrypted write is refused.
`src/lib/r2.ts` refuses the `backups/` prefix outright.

**Generated content is always labelled**, with one exception the user asked for.
Prose says who wrote it everywhere it appears. The illustration's visible "AI
interpretation" caption was removed on 30 July 2026 at the user's request; the alt
text and the figure title still identify it as generated, and both live inside
`ColumnImage` so the picture cannot be rendered without them. Do not put the
caption back unasked. There is deliberately no OpenGraph image: a link preview is
the one place a label could not follow it.

**No em dashes**, anywhere, in site copy or generated text.

**They and them for every player**, in all generated text.

---

## The thing that still matters most

The catalogue is empty. Everything above is a very good archive of a server with
nothing to download attached to it, and the build plan is explicit that launching
empty and waiting for uploads that never come is the most likely way this project
dies. Seeding from the Levels4You archive is worth more than any further feature,
and it is also the only way to test the RFL compatibility parser against a real
file rather than the synthetic fixtures it currently passes.
