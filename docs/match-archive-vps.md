# Match archive: connecting the dedicated server

The site stores match results that the VPS pushes to it. The VPS remains the
source of truth and the only machine holding the private archive; the site holds
a sanitised copy and serves it at `/matches`.

## What crosses the boundary

The VPS posts a day's export to `POST /api/rf4u/archive/ingest`. The route
sanitises it with an allowlist — every stored field is named in
`src/lib/matches/sanitize.ts` — and writes it to Postgres.

Never sent to a browser, and mostly never stored at all:

| | |
|---|---|
| IP addresses | not stored |
| Discord message and thread ids | not stored |
| Tailscale details, VPS paths, secrets | not stored |
| Player coordinates | not stored |
| Server controls and configuration | not stored |
| Any field not named in the sanitizer | not stored |
| The server's player identity hash | **stored, never served** |

That last row is the deliberate exception. An RF player name is neither unique
nor stable, so the identity hash is the only thing that could ever link a
Discord account to an in-game player — which is the hard part of the planned
player statistics. It lives in `match_players.identity_key`, and no query in
`src/lib/matches/queries.ts` selects it. If you add a query there, do not.

The VPS `ADMIN_SECRET` is never copied to the website and the site has no
ability to control the server. This is a one-way push.

## What is different from the handoff package

The package stored each day as a JSON document in Vercel Blob. This site stores
the same sanitised data in the Postgres database it already has.

**So there is no Blob store to connect and no `BLOB_READ_WRITE_TOKEN`.** If
you are following the original instructions, skip that step; it does not apply.

The reason is player statistics. A per-day document answers "what happened on
Tuesday" and nothing else. Questions across matches — a player's accuracy over
a month, captures across a season — would mean fetching and parsing every day
in the range on every request. Tables answer both.

The ingest contract is unchanged, so the package's sync script works as-is.

## Public API

Open on purpose: publishing what we hold is the mitigation for becoming a
single point of failure for this history.

```
GET /api/rf4u/archive                     index of nights
GET /api/rf4u/archive?date=YYYY-MM-DD     one night's results
```

The day document keeps the original contract's shape and `snake_case` field
names, so anything already written against it keeps working. The bulk event
streams (`kills`, `flagEvents`, `rosterEvents`) are returned as stored.

## Website setup

Already done, but for the record:

1. `RF4U_ARCHIVE_SYNC_SECRET` is set in Vercel (Production) and in `.env.local`.
   It is server-side only and must never be prefixed `NEXT_PUBLIC_`.
2. The endpoint is `https://redfaction4you.com/api/rf4u/archive/ingest`.

## VPS setup

On the dedicated server, add two lines to `C:\RFMatchBroadcast\.env.rf4u`:

```
RF4U_ARCHIVE_SYNC_URL=https://redfaction4you.com/api/rf4u/archive/ingest
RF4U_ARCHIVE_SYNC_SECRET=<the same value as in Vercel>
```

Read the secret out of `C:\RF4U\site\.env.local` on the development machine.
Do not retype it, and do not send it over Discord.

Then copy `sync-rf4u-website-archive.ps1` from the handoff package to
`C:\RFMatchBroadcast\` and register it as a Scheduled Task. The script is
unchanged from the package: the ingest contract here is deliberately identical,
so only the URL differs.

Test it by hand first:

```powershell
powershell -File C:\RFMatchBroadcast\sync-rf4u-website-archive.ps1
```

Then check the log at `C:\RFMatchBroadcast\data\rf4u-website-sync.log` and load
https://redfaction4you.com/matches.

To load the full history rather than the last three days:

```powershell
powershell -File C:\RFMatchBroadcast\sync-rf4u-website-archive.ps1 -Backfill
```

## Re-running is safe

Ingest is idempotent. Matches upsert on `(server, source_match_id)`, and a
match's players and captures are replaced rather than added to, so syncing the
same day repeatedly leaves one copy. A match removed upstream — voided, or a
mistake corrected — is removed here on the next sync of that day.

Verified: posting the sample day twice produced one match, one player row and
one capture, with the duplicate player rows merged rather than summed.

## Timezone

Match nights are grouped by calendar day in `America/Los_Angeles`, matching the
VPS. A match starting 20:00 Pacific belongs to that evening even though it is
already the next day in UTC. Stored timestamps stay UTC; only the grouping is
local.

## If it stops working

- **401 from the endpoint** — the secret differs between the VPS and Vercel, or
  is shorter than 32 characters, which the route rejects outright.
- **413** — a day's export exceeded 4 MB. Kill logs are capped at 5000 events
  per match on ingest, so this should not happen; if it does, the cap in
  `route.ts` is the thing to raise.
- **400 with "no usable date"** — the export had neither a `calendarDate` nor a
  parseable `range.from` nor any match with a start time.
- **Nothing appears but the sync logs success** — check the day actually has
  matches. `/matches` shows the most recent night that has any.
