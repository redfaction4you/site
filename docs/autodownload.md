# Serving the game's autodownload from here

Alpine resolves a level the player is missing in three steps, and there is no
fourth:

1. It asks a base URL for a filename: `GET {base}/v3/find.php?rfl=<name>`.
2. It reads `download_url` out of the JSON that comes back.
3. It does a plain HTTP GET on whatever that URL says.

The base is `level_download_base_url`, a compiled-in constant in Alpine's
`game_patch/multi/faction_files.cpp`. **The client will download from any host.
It only asks that base where to go.**

So there are two halves to hosting our own files: an endpoint here that speaks
the lookup, and a client pointed at it. This document is the first half.

## Why

A file hosted by somebody else is controlled by somebody else. A map on
FactionFiles cannot be corrected or withdrawn by the person who made it, and for
a community whose maps are most of its history that is the wrong way round. This
is the mechanism that lets an author keep their own work.

It is not about coverage. All 372 maps across our four servers already resolve
through FactionFiles, so nobody joining is stuck today.

## The endpoints

Both mirror FactionFiles' paths exactly, so pointing a client here is one
constant and nothing else. The `.php` is not pretending to be PHP; it is the
endpoint being stood in for.

| | |
|---|---|
| `GET /autodl/v3/find.php?rfl=<name>` | one level, or a passthrough |
| `POST /autodl/checkmaps.php` | `;` separated names, one `found`/`notfound` per line |

**Everything we do not hold is passed through to FactionFiles.** A redirected
client asks us for every level it is missing, including the several hundred we
have never heard of, so answering only for our own would break autodownload for
everything else and make our build worse than the stock one. Falling through
means the redirect can never cost a player a download, which is the property
that makes it safe to ship at all.

Both are unauthenticated, because a game client has no credentials and cannot be
given any. Everything they serve is already public: it is the catalogue, and the
bytes it points at sit in a public bucket.

## The things that will bite

**A malformed answer is worse than no answer.** `parse_level_info` reads
`title`, `author`, `description`, `download_size` and `download_url` with
`.at()`, which throws on a missing key, and throws again on a zero size or an
empty url. A throw there is not read as "not found": it aborts the download with
an error the player sees. `canAnswer` in `src/lib/autodl-rules.ts` is the guard,
and `levelAnswer` is why author and description always come back as strings even
when we know neither.

**The `checkmaps` order is the contract.** The client pairs its request list
against the reply by index, so a dropped or reordered line reports a different
map missing than the one that is. `parseCheckBody` drops blanks for exactly this
reason: a trailing separator would otherwise add a phantom name and shift every
answer after it.

**`download_url` points straight at the bucket, not at `/api/download/[fileId]`.**
That route counts a download and then redirects, which would be nice to have.
It is not worth the risk: the client does a plain GET through its own HTTP
wrapper and nothing here has tested whether that wrapper follows a 302. A failed
download is a player who cannot join, against a counter already documented as
counting only what goes through the site.

**The level index is cached for five minutes.** These endpoints are hit by game
clients rather than by people, so an uncached lookup would wake the database on
somebody else's schedule, which is what the compute bill went on in August. The
cost is that a map uploaded a moment ago is autodownloadable within five
minutes rather than instantly.

**Matching is deliberately not clever.** `levelKey` strips the directory and the
`.rfl` and lowercases, and does nothing else. Normalising punctuation would make
`dm-01` and `dm01` the same map, and serving somebody the wrong level under the
right name is worse than not having it. The rule lives in one place and is
tested; there is deliberately no SQL twin of it, because a rule and its SQL twin
drifting apart is a failure this archive has already had.

## The client half

A patch to our own Alpine build, in the 1.4 tree beside the telemetry patch. It
adds `autodl_base_url` as a client setting rather than changing the constant,
following the same shape as `multiplayer_tracker`, which is already a
configurable endpoint in the same codebase.

- `alpine_settings.h` holds the setting, its validation and the default.
- `alpine_settings.cpp` loads it from `AutodlBaseUrl` and writes it back.
- `faction_files.cpp` uses it, **and falls back to the official base when the
  configured one cannot be reached**. Only a failed request falls through: a
  base that answers "not found" has answered, and asking somebody else the same
  question would be second-guessing it.

Two things to know before shipping a client:

- **Players have to install it.** That is the whole cost of this approach, and
  there is no way around it: no packet from a server can redirect a client, and
  there is no in-protocol file transfer.
- **A locally built DLL reports `VERSION_TYPE_DEV`**, and a server with
  `alpine_require_release_build` set will refuse it. Check what the build stamps
  before distributing one.
