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

### Never edit an env file with Windows PowerShell's `Set-Content`

`Set-Content` and `Out-File` under Windows PowerShell 5.1 write UTF-8 **with a
byte order mark**. Node's `--env-file` reads the BOM as part of the first key, so
`PORT=8788` on line one becomes a variable called `\uFEFFPORT` and `PORT` is
simply absent. Every other line in the file parses correctly, which is what makes
this so hard to see: the file looks right, `Get-Content` prints it right, and
only the first setting is gone.

It has happened once, on 17 August 2026, when the Discord webhook was updated.
`PORT` fell back to the app default of 8787, so the broadcaster answered on the
wrong port and `sync-rf4u-website-archive.ps1` -- which talks to
`http://127.0.0.1:8788` -- failed with "Unable to connect to the remote server"
on every run.

The two-day delay before anyone noticed is the part worth remembering. A running
process keeps the environment it started with, so nothing broke when the file was
edited. The fault appeared at the next restart, by which time the edit was no
longer the obvious suspect.

Use an editor that writes UTF-8 without a BOM, or write the bytes yourself:

```powershell
$p = "C:\RFMatchBroadcast\.env.rf4u"
$b = [System.IO.File]::ReadAllBytes($p)
if ($b[0] -eq 0xEF -and $b[1] -eq 0xBB -and $b[2] -eq 0xBF) {
    [System.IO.File]::WriteAllBytes($p, $b[3..($b.Length - 1)])
}
```

Check it took, rather than assuming:

```powershell
cd C:\RFMatchBroadcast
node "--env-file-if-exists=.env.rf4u" -e "console.log(process.env.PORT)"
```

`8788` means the file parses. `undefined` means the BOM is still there.

A comment on line one absorbs the damage harmlessly, which is why `.env.dm`
carried the same BOM without symptoms. Do not rely on that.

### Changing the webhook takes a restart

The broadcaster reads its environment once, at startup. Editing `.env.rf4u` does
nothing to the process already running, so a webhook change is not in force until
the task is restarted:

```powershell
Stop-ScheduledTask -TaskName 'RF4U Match Broadcast'
Start-ScheduledTask -TaskName 'RF4U Match Broadcast'
```

Until then it keeps posting to the old URL and logging `HTTP 404
{"message": "Unknown Webhook"}` to `data
f4u-service.log`, where nothing reads
it. `/api/health` reports the website's own webhook under `announce.reachable`;
it says nothing about this one.

Confirm the restart took by checking the port is back:

```powershell
Get-NetTCPConnection -State Listen | Where-Object LocalPort -eq 8788
```

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

## The deathmatch server has its own endpoint

`https://redfaction4you.com/api/rf4u/archive/dm`, same secret, same document
shape, different tables. It has been live since 7 August 2026: the DM server runs with `-telemetry`
and `-telemetry-continuous`, and its own broadcaster is on port 8789.env` with `RF4U_ARCHIVE_SYNC_URL` pointing at `/dm`, its own scheduled task,
and **the same identity salt as the match server**, so one person is one person
on both and a merge made on `/admin` applies to both.

**Each endpoint refuses the other's game.** The one thing that can go wrong here
is a URL copied into the wrong `.env`, and a night of deathmatch written into
the match archive would look completely normal — every column exists, the flag
counters would just be zero — while spreading through every board and total on
the site. So the match endpoint rejects a payload whose matches are deathmatch,
and the deathmatch endpoint rejects anything that is not. Both answer 400 and
name the endpoint the payload should have gone to. Nothing is lost by a
rejection: the broadcaster keeps its own SQLite and re-sends its recent days
every fifteen minutes, so a day refused overnight lands once the URL is fixed.

The response reports `playersTimed`, which is how many player rows carried a
`seconds_played`. **If that is 0 on the first real sync, the broadcaster does not
record time on the server** and the cumulative record has to be built without
it. That is worth knowing before a column of dashes says it on a page.

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
- **400 saying the payload is the wrong game** — a sync is pointed at the other
  server's endpoint. The message names the one it should be using. Fix the URL
  in that server's `.env.rf4u`; the next sync catches up on its own.
