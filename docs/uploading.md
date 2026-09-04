# Uploading: getting files into the catalogue

Written 3 September 2026, the day the downloads section shipped with nothing on
the shelves. This is the operator's guide: how a folder of files on a disk
becomes a row people can download. `CLAUDE.md` covers the conventions a person
editing the code needs; this covers running it.

The first job this was built for is bulk. The archive is being recovered from
dead forums, expired hosts and the map folders of servers that are still
running, so most of the work is a hundred folders on a local disk. The second
job is one person with one file, which is what the form on `/admin` is for, and
the two write the same rows.

## Two ways in, and which one to use

This document used to say there was deliberately no upload form, and the
reasoning was about bulk: the unit of work is a hundred folders, and a browser
is the slow way to move them. That is still true of a recovery run and it was
never the whole story. The person this archive is for is a mapper, and the
reason to host his own work here is that hosting it somewhere else means
somebody else decides whether he can edit or delete it. That only holds if
putting a file here is something he can do himself, without a terminal.

So there are two, and they write the same rows through the same rules:

- **The form on `/admin`**, for one thing at a time. Choose a file, say which
  shelf, and it is in the catalogue as a draft.
- **The CLI**, for bulk. A folder of two hundred folders is one command and
  reads every file at the byte level before anything is written.

Both derive the slug, the storage key and the game type from
`src/lib/ingest-rules.ts` and `src/lib/downloads.ts`, which is the point of
those two modules importing nothing: **a storage key is a promise**, it becomes
the permanent public URL, and two writers disagreeing about how to build one is
how an archive ends up with a file it cannot find and a row it cannot replace.
Where the form and the CLI disagree about anything, that is a bug in one of
them rather than a choice.

## The form on /admin

Under **Upload something**, above the catalogue it feeds. It needs the admin key
like everything else on that page, and all three routes behind it check that key
themselves, because a route handler is a public endpoint whatever page called
it.

Fill in what you know. Title and address prefill from the filename and stay
editable, and the address is shown as you type, along with the storage key the
file will live at forever, because both are permanent and this is the last
moment either is cheap to change. If something already lives at that address the
form says whose it is: uploading then replaces that item's file and edits its
row rather than making a second one, which is the same upsert on `(kind, slug)`
the CLI does.

Everything lands as a draft unless you say otherwise, for the reasons under
[Everything lands as a draft](#everything-lands-as-a-draft) below, and the same
caveat applies: the draft governs the page, never the bytes.

### The size problem, and the one limit worth knowing

Measured on the 391 custom maps on the live server: mean 14.6 MB, largest
379 MB, and 195 of the 391 over 4 MB. Against that, **Vercel caps a serverless
function request body at 4.5 MB** and a Next server action defaults to 1 MB. So
posting the bytes through our own server works for about half the archive and
fails for the rest, and no amount of raising a limit in `next.config.ts` moves
the platform's own.

The form therefore tries two things in order and tells you which one carried the
file:

1. **Straight from the browser into the bucket**, with a presigned PUT. No size
   limit worth the name, and it is what makes a 379 MB pack possible.
2. **Posted through the site**, when the first is not available and the file
   fits under the cap the server reports. That cap is
   `SERVER_PATH_LIMIT_BYTES` in `src/lib/ingest.ts` and it is 4 MiB rather than
   4.5, because the file is not the whole request: the field names, the
   boundaries and the multipart framing are inside the same body.

Progress is real in both cases, byte by byte, because a form that sits still for
four minutes on a large map looks exactly like a form that is broken.

### Turning the direct route on, once

The direct PUT needs a CORS policy on the R2 bucket, and **our API token cannot
set one**: it is an Object Read and Write token, so `GetBucketCors` answers
`AccessDenied`. It is a one-time job in the Cloudflare dashboard, under R2, the
bucket, Settings, CORS policy:

```json
[
  {
    "AllowedOrigins": ["https://redfaction4you.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type", "cache-control"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 3600
  }
]
```

**Both headers are load-bearing.** The signed URL covers `content-type` and
`cache-control`, so the browser has to send exactly those, and a browser will
not send either cross-origin unless the bucket has named it. Leaving
`cache-control` out produces the same failure as having no policy at all, on a
policy that looks right.

Add `http://localhost:3000` to `AllowedOrigins` to use the form from a dev
server. Until this is set, a browser refuses the PUT before it gets a reply, so
the failure arrives with no status and no body at all: that is what the form
reads as "not enabled yet" and why it falls back rather than reporting an error.
A real status coming back from R2 is the other case, a signature or a key it
would not accept, and the form says which of the two happened rather than
folding them into one message.

**A file over the cap with the direct route not yet enabled is refused in
words.** It says the size, it says the cap, it prints the policy above with this
deployment's own origin in it, and it names the CLI as the way through in the
meantime. Never a bare 413, and never a spinner that stops.

### What the form does not do

- **One file per item**, plus screenshots. A folder with a zip, a readme and a
  second version in it is a job for the CLI, which refuses the ambiguity rather
  than guessing which file is the download.
- **No sidecar, no changelog and no description.** `item.json` carries all
  three. Changelog entries are added afterwards in the catalogue section
  directly below the form, and the long prose for a detail page currently comes
  from a sidecar and the CLI or from nowhere.
- **No bulk.** Two hundred folders is two hundred trips through a form.
- **It cannot un-upload.** Same as everywhere else here: the object is in a
  public bucket from the moment it lands, and deleting the row later leaves it
  there. See [The honest limits](#the-honest-limits).

### The three routes behind it

`src/components/upload-admin.tsx` is the only client component in the path and
owns the upload state and nothing else. It talks to three route handlers, each
of which re-checks the admin key, because a route handler is a public endpoint
whatever page called it:

- `POST /api/admin/upload/prepare`, once per file, with `kind`, `slug`,
  `filename`, `sizeBytes`, `role` (`download` or `screenshot`) and a `position`
  for screenshots. It answers the storage `key`, a presigned PUT `url`, the
  `headers` that url was signed with, `serverPathLimitBytes` for the fallback,
  and `existing` when something already lives at that address.
- `POST /api/admin/upload`, the fallback, multipart, with the same fields and
  the file itself. It answers the key it derived and a `sha256` of the bytes it
  received.
- `POST /api/admin/upload/commit`, once, with the metadata and the keys that
  landed. It calls `ingestUploaded` in `src/lib/ingest.ts`, which writes the
  item, the file, the screenshots and `map_meta` exactly as the CLI does,
  including supplying every id itself, because Drizzle generates ids and
  Postgres has no default on those columns.

**The key is derived on the server and never taken from the browser.** `prepare`
and the fallback each build it from the item's own address; `commit` is handed
the keys that landed, rebuilds every one of them the same way and refuses the
request if any disagrees. So nothing a caller sends decides where an object goes
or what a catalogue row is allowed to point at, which is what stops a stray
request naming something it should not be able to write, the encrypted database
backups in the same bucket included.

Two things are worth knowing about the hash. `files.sha256` is `NOT NULL` and it
is what makes a catalogue row a promise about specific bytes. The server path
hashes what it receives, since the bytes are already in memory. **A direct
upload never passes through our code at all, so the browser hashes the file
itself** and sends the digest at commit: the alternative is fetching a 379 MB
object back out of the bucket inside a serverless function, which is the case
the direct path exists to avoid.

The bytes are stored before any row points at them, which is the safe direction
of the two: an object nothing references is a few spare kilobytes, while a row
referencing an object that is not there is a download button handing somebody a
404, and the site cannot tell.

## The CLI, and the folder is the item

Everything from here down is the bulk path: `npm run ingest`, run from the repo
root, reading files off a local disk. It is what a recovery run uses, it reads
the bytes before it writes anything, and it is also the way through when a file
is too large for the server path and the direct route is not on yet.

One folder, one catalogue entry:

- **exactly one downloadable file**, which becomes the download,
- **any images**, which become the screenshot gallery,
- **an optional `item.json`**, which carries what a filename cannot.

Everything else in the folder is ignored: `Thumbs.db`, `desktop.ini`,
`.DS_Store`, dotfiles and the `._` forks a Mac leaves in a zip. A folder
recovered from a forum post carries all of them and none of them is the file
anybody wants.

**Two candidate downloads is a refusal, not a decision.** A folder holding
`map.rfl` and `map_old.rfl` is a question for a person: picking the larger or
the newer would be a coin toss recorded permanently as a fact. Split them into
two folders, or delete the one you do not want, and run it again.

Images are taken in filename order and that order is baked into the storage key,
so the gallery order is set by naming them `01-`, `02-` and so on. Screenshots
are optional, and a map with none looks exactly as empty on its page as it
sounds.

**A folder whose children are all folders is a batch**, one item per child and
one level of nesting only. That is the same rule the zip reader uses and for the
same reason: a folder of folders is a normal way to keep an archive, a folder of
folders of folders is somebody's whole disk. Packaging does not count against it,
so a `Thumbs.db` the parent picked up does not turn two hundred map folders into
one item. A real loose file beside them does, because then "is that file this
item's download or a stray" is exactly the guess that gets refused elsewhere.
Point the run at the parent and read the row count before `--go`.

## A worked example

```
D:/rf-archive/
  ankh-b12/
    CTF-Ankh_b12.zip
    01-flagroom.jpg
    02-mid.jpg
    03-tomb.jpg
    item.json
  dm-space/
    dm_space.vpp
```

`dm-space` has no sidecar and no screenshots, and that is a complete, valid
item: title and slug come off the filename, the game type comes off the level
name inside the pack, and everything else stays empty until somebody fills it
in. Most of a bulk run looks like that.

`item.json`, with every field it understands:

```json
{
  "kind": "map",
  "slug": "ankh-b12",
  "title": "Ankh",
  "authorName": "Unknown",
  "summary": "A tournament CTF map set in an Egyptian tomb.",
  "description": "Longer prose for the detail page. Plain text, several paragraphs if you have them. This is where the history goes: which server it was made for, what changed between betas, who kept a copy when the original host went down.",
  "category": "ctf",
  "releaseVersion": "b12",
  "releasedOn": "2003",
  "tags": ["ctf", "tournament", "egyptian"],
  "updates": [
    {
      "title": "b12",
      "body": "Fixed the clip brush on the red ramp.",
      "releaseVersion": "b12",
      "releasedAt": "2004-06-01"
    },
    {
      "title": "b11",
      "body": "First public release.",
      "releaseVersion": "b11",
      "releasedAt": "2003-11-20"
    }
  ]
}
```

Every field is optional and every one has a fallback, so the smallest useful
sidecar is a title and an author. What is worth knowing about each:

- **`kind`** is the shelf: `map`, `asset`, `mod` or `tool`. Nothing about a
  file says which shelf it belongs on, so set this for anything that is not a
  map. A tool filed as a map is found by nobody looking for a tool and by
  everybody who is not. A whole run can be pointed at one shelf with
  `--kind=asset` instead, which is the usual way: a folder of player models is a
  folder of assets, and writing a sidecar for each of two hundred would be a
  long evening spent saying one thing.
- **`slug`** is the item's address forever. Set it when you care what the URL
  says; otherwise it is derived, and the dry run prints what it will be.
- **`authorName`** is who made the file, spelled the way they spelled it. It is
  not the person running the ingest and it is not an account: most of this
  archive was made by people who will never hold one. `"Unknown"` is a
  legitimate value and a much better one than a guess.
- **`summary`** is the line under the title in a listing. **`description`** is
  the detail page.
- **`category`** overrides the derivation below. This is how a single player
  level gets `"sp"`, which is never derived from anything.
- **`releasedOn`** takes `YYYY-MM-DD` or a bare year. A bare year is stored as
  the first of January and the listing prints the year alone, so a default day
  is never shown as though somebody recorded it. Most of this archive knows the
  year and nothing finer.
- **`releaseVersion`** is whatever the author wrote. `a5a`, `b12`, `ver1` and
  `2.0 FINAL` are all real. Nothing parses or orders it.
- **`updates`** is the changelog, newest first, and `releasedAt` is when the
  author changed something rather than when we typed it in. An archive that
  cannot tell "fixed in 2004" from "archived last night" is not much of an
  archive. `title` is required on each entry; the rest are not, because plenty
  of real updates are "minor thing, no version bump".

A sidecar that does not validate stops that folder and lists every complaint,
field by field. Nothing in it is written.

## The commands

```bash
npm run ingest -- "D:/rf-archive/ankh-b12"                 # dry run: reads everything, writes nothing
npm run ingest -- "D:/rf-archive/ankh-b12" --go            # store the bytes, write the rows
npm run ingest -- "D:/rf-archive"                          # every item folder inside it, still a dry run
npm run ingest -- "D:/rf-models" --kind=asset              # a whole run onto one shelf
npm run ingest -- "D:/rf-archive" --go --publish           # write, and skip the draft step
npm run rfl -- "D:/rf-archive/ankh-b12/CTF-Ankh_b12.zip"   # just the parser, on one file
```

`--author="Volition"` records an author wherever no `item.json` names one, for a
folder recovered from one person's site.

**Attach every value with an equals sign.** `--kind=asset`, never `--kind asset`.
npm parses a flag it does not recognise as its own configuration and hands only
the positional arguments through, so with a space it keeps the flag and passes
`asset` on as though it were a path, and nothing can tell that from a folder
called `asset`. That spelling is refused by name rather than guessed at. The
same swallowing is why the first line of every run reads back what it understood:

```
options: kind=map  author=(none)  go=no  publish=no
```

Read that line. `--base` was documented on `vet:pages` for weeks, npm ate it
every time, and the script reported a clean bill of health for production having
read localhost. The flag that matters here is `--go`.

Run it from the repo root: it reads `.env.local` explicitly, the same way
`refs:push` and every other script here does, because `dotenv` reads `.env` and
knows nothing about Next's `.env.local`.

**The dry run is the default, and `--go` is what writes.** Every destructive
script in this repo works that way, and this one has more reason than most. The
dry run is not a formality. It prints a row per item carrying the shelf, the
category it derived, how many levels it found inside, the size, the screenshot
count and the address the item will live at, then a `worth a look` block with
every parser warning, then a count of what it would create and update. A refused
folder says why on its own row and the run exits non-zero, so a scripted batch
notices.

**The address on that row is permanent**, and so is the storage key derived from
it: the key is the kind, the slug and the filename, it becomes the file's public
URL, it is what a link pasted into Discord resolves through, and it is unique in
the database. That is the column worth reading before `--go`, on every folder,
every time.

It needs `DATABASE_URL` and the four R2 variables (`R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`). Without storage there
is no ingest at all rather than a degraded one: `files.storage_key`,
`size_bytes` and `sha256` are all `NOT NULL`, so a row cannot exist without the
bytes really being stored and really being hashed. That is deliberate. It is
what makes a catalogue row a promise that the file is here.

## Everything lands as a draft

An ingested item is `status = 'draft'`. A draft does not appear in any listing,
its detail page 404s, and `/api/download/[fileId]` refuses it, so a draft is
invisible to a reader in exactly the way a typo is. Publishing is a separate
decision made on `/admin`.

That is the safe default because the derivation is confident and occasionally
wrong. A map filed under the wrong game type sits on the wrong shelf forever
with nothing about the page looking broken, and the moment to catch it is
before anybody has the link. Ingest two hundred folders, read down what it
derived, fix the handful that are wrong, publish the rest.

`--go --publish` skips that step and puts everything straight onto the shelves.
It is there for a folder somebody has already been through file by file, and it
is the wrong default for a recovery run. Re-running an ingest never undoes it
either: a published item stays published, and its publication date is stamped
once and never moved, so nothing is quietly promoted back to the top of "Newest"
by a second pass.

## The database is production and the bucket is public

There is one Neon instance and one bucket, and a local run writes to both.

- **A row written by `--go` is on the live site immediately.** It is a draft, so
  no page shows it, but it is really there.
- **The bytes are world readable the moment they are stored, draft or not.**
  The bucket is public and has a custom domain on it, so the object is
  downloadable by anyone who knows the key, and the key is derived from the kind,
  the slug and the filename rather than being random. Draft status governs the
  page, never the file.

So the decision to distribute something is made before `--go`, not at publish
time. Do not ingest a file you have not decided you may host.

## What is derived, and what is not

Derived from the file itself, with no input from anybody:

- the storage key, the slug and a placeholder title from the filename,
- `size_bytes` and a SHA-256 of the stored bytes,
- the container (`rfl`, `vpp` or `zip`), every level inside it, the highest RFL
  version found, the clients that can load all of them, the detection confidence
  and any warnings, all from `inspectUpload`,
- the game type, for maps.

**The game type comes from the level's filename, using the game's own rule.**
It is taken from `multi_level_name_matches_any_mp_prefix` in Alpine Faction's
`multi.cpp`, which is what a server uses to decide whether a level can be voted
for a given type, so the two are meant to stay in step: a map filed here as CTF
that no server would accept as CTF is a listing that lies about the file it is
offering. `ctf` and `pctf` give CTF, `dm` and `pdm` give deathmatch, `koth` and
`dc` give theirs, and `run` needs a separator or a digit after it, because
`runway.rfl` is an ordinary deathmatch map. A pack whose levels disagree is
filed as whichever type most of them are, and a genuine tie is `other` rather
than whichever level the zip happened to list first.

Not derived, ever:

- **Single player.** There is no filename convention for it, so it is set by
  hand in `item.json` as `"category": "sp"` or it is not set at all.
- **Which shelf it belongs on.** See `kind` above.
- Author, summary, description, release date, version and tags. Nothing in a
  `.rfl` header knows any of them.

**A bare `.rfl` keeps its filename now**, which it did not until today. A zip or
a packfile carries its entries' names inside it, so a level's path survives; a
bare level is nothing but level bytes and the inspector used to record it as the
literal string `level.rfl`, throwing away the only game-type signal Red Faction
has before anything could read it. So renaming a bare `.rfl` before ingesting it
changes what it gets filed as. Rename it to what the server would have called
it, or to nothing at all.

An uncategorised map is a normal state and stays visible: it is counted and
listed under "none" rather than being hidden until somebody classifies it. The
queue of things for a person to look at is real, and it is not a queue of
broken rows.

## The honest limits

- **Deleting an item does not delete its bytes.** The row goes, the page goes,
  and the object stays at its permanent public URL. Making something genuinely
  stop being distributed means deleting or re-keying the R2 object as well.
  Nothing on `/admin` does that for you.
- **Unpublishing stops the page, not the file.** `status = 'hidden'` is the
  right tool for a mislabelled or disputed upload, and it is enough right up
  until somebody still has the download link.
- **The download counter counts downloads that went through the site.** It
  counts what passes through `/api/download/[fileId]`, and the bucket is public,
  so anyone holding a key fetches the object without us ever hearing about it.
  The figure undercounts by an unknowable amount and is presented as downloads
  through the site rather than as a total. That is the price of a public bucket
  and it was worth paying.
- **Re-ingesting the same folder overwrites the same object**, because the key
  is derived rather than random. That is what makes a corrected file replace the
  broken one rather than orphaning it. It also means a second folder whose name
  slugs onto an existing item's slug is aiming at that item's address, which is
  the one thing to watch in a bulk run.
- **The parser reads headers, not levels.** It answers "will this load", which
  is the question that costs somebody a broken download. It does not answer
  whether the map is any good, whether the zip contains what its readme claims,
  or which Alpine features a level uses: `required_features` is not implemented,
  and RFL versions between 201 and 299 are a documented gap that reports
  `unknown` rather than guessing.

## When something goes wrong

- **A dash in the `levels` column** means the bytes are not an `.rfl`, a `.vpp`
  or a `.zip`, so the parser was never asked. That is normal and correct for a
  tool, a model or a texture pack: those are ingested as ordinary downloads with
  no compatibility reading at all, and the item is not refused for it. A `0`
  there is the different case, a container that read as one of the three and held
  no level, and the reason is printed under the table.
- **A warning naming one level inside a pack** is one bad map in a good
  packfile. The rest are still read, and the warning is stored on the item so it
  can be looked at later rather than discovered by a player.
- **Nothing to publish on `/admin`** usually means the ingest ran as a dry run.
  It says so on the last line.
