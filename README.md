# RedFaction4You — site

A community archive for Red Faction (2001): maps, mods, tools, guides, videos
and tournament records.

Phase 1 skeleton: Next.js App Router, Tailwind, Discord auth, Neon Postgres.

**Intended home:** `github.com/redfaction4you/site`

---

## Read this first

This scaffold was written without network access, so **it has never been
installed, compiled or run.** The logic and the wiring are sound and every
internal import and route link has been checked, but dependency versions are
best-guess and the first `npm install` or `npm run build` may need a nudge. Budget
twenty minutes for that. Everything under "If the first install fights you" below
covers the failures I consider likely.

---

## Prerequisites

- Node 20.11 or newer (`node -v`)
- A Discord account with permission to create an application, and admin on the
  RF4You Discord server
- A Neon account (free tier)
- A Vercel account (the existing airecordshop one is fine)

---

## 1. Install

```bash
cd rf4you-site
npm install
cp .env.example .env.local
```

Generate the session key and paste it into `.env.local` as `AUTH_SECRET`:

```bash
npx auth secret
```

## 2. Discord application

1. <https://discord.com/developers/applications> → **New Application** → name it
   `RedFaction4You`.
2. **OAuth2** → copy **Client ID** into `AUTH_DISCORD_ID`, then **Reset Secret**
   and copy it into `AUTH_DISCORD_SECRET`.
3. Still on OAuth2, add these **Redirects**, exactly, one per line:

   ```
   http://localhost:3000/api/auth/callback/discord
   https://<your-vercel-preview-url>/api/auth/callback/discord
   https://redfaction4you.com/api/auth/callback/discord
   ```

   A trailing slash or a missing one is the usual cause of `invalid_redirect_uri`.
4. In Discord itself, turn on **User Settings → Advanced → Developer Mode**.
   Right-click the RF4You server icon → **Copy Server ID** → paste into both
   `DISCORD_GUILD_ID` and `NEXT_PUBLIC_DISCORD_GUILD_ID`.
5. **Server Settings → Widget → Enable Server Widget.** Without this the embed on
   `/discord` shows a configuration notice instead of the member list.
6. **Server Settings → Roles**, right-click a role → **Copy Role ID**, for
   whichever roles should grant admin and mapper. Paste into `DISCORD_ROLE_ADMIN`
   and `DISCORD_ROLE_MAPPER`. Comma-separate if more than one role qualifies.
   *(This is open question 14.5 in the build plan. Leaving them blank is safe:
   everyone in the guild is simply a `member`.)*
7. Set `NEXT_PUBLIC_DISCORD_INVITE` to a **non-expiring** invite link.

## 3. Neon database

1. <https://console.neon.tech> → **New Project**, region closest to your players.
2. **Connection string** → copy the **pooled** one into `DATABASE_URL`.
3. Untick "Pooled connection" and copy the direct one into
   `DATABASE_URL_UNPOOLED`. Migrations need this; Neon's pooler rejects the
   session-level statements drizzle-kit issues.
4. Create the tables:

   ```bash
   npm run db:generate   # writes SQL into ./drizzle
   npm run db:migrate    # applies it
   ```

   Commit the generated `drizzle/` directory. Migrations belong in git.

## 4. Run it

```bash
npm run dev          # http://localhost:3000
npm run typecheck    # do this before every push
```

Sign in with Discord. On success you should get an avatar in the header, a role
badge if you gave yourself the admin role ID, and a working `/members/<handle>`
page.

## 5. Push and deploy

```bash
git init && git add -A && git commit -m "Phase 1: site skeleton"
git remote add origin git@github.com:redfaction4you/site.git
git push -u origin main
```

On Vercel: **Add New → Project → import the repo**. Framework preset is detected
as Next.js; do not override the build command. Then **Settings → Environment
Variables** and add every key from `.env.local` *except* `AUTH_URL`, which Vercel
sets itself. Redeploy after adding them — Vercel does not pick up new variables
on an existing build.

Once the preview URL works, add it to the Discord redirect list from step 2.3.

## 6. Repoint the domain — last, and only when happy

The Google Site keeps serving `redfaction4you.com` until you do this, so there is
no rush and no window where the site is down.

1. Vercel → project → **Settings → Domains** → add `redfaction4you.com` and
   `www.redfaction4you.com`.
2. Vercel shows the exact records. At your registrar, replace the Google Sites
   records with:
   - `A` on the apex `@` → the IP Vercel gives you
   - `CNAME` on `www` → `cname.vercel-dns.com`
3. Wait for propagation, confirm HTTPS, then add the production callback URL to
   Discord if you have not already.

---

## If the first install fights you

**Peer dependency errors on `next-auth`.** Auth.js v5 is still tagged beta and its
peer range sometimes lags React releases.

```bash
npm install --legacy-peer-deps
```

**A version in `package.json` does not exist.** I pinned from memory without a
registry to check against. Fix by letting npm choose:

```bash
npm install next@latest react@latest react-dom@latest
npm install next-auth@beta @auth/drizzle-adapter@latest
npm install -D tailwindcss@latest @tailwindcss/postcss@latest
npm install drizzle-orm@latest @neondatabase/serverless@latest
npm install -D drizzle-kit@latest
```

**Tailwind classes render as plain text.** Means Tailwind v3 got installed instead
of v4. This project uses the v4 CSS-first config: there is deliberately no
`tailwind.config.ts`, and the theme lives in `@theme { }` inside
`src/app/globals.css`. Either install v4, or migrate that block to a v3 config
file.

## Theme

The palette and type are taken from the RF4U CTF Tournament Hub
(`../Index/index.html`) so the two properties read as one product:
`#e0301e` red, `#e6b64f` gold, `#0c0c10` ground, Black Ops One for the wordmark
and hero, Chakra Petch for everything else. The favicon is the fist-and-pickaxe
mark extracted from the hub, at `public/icon.png`.

Token names in `globals.css` (`basalt`, `rust`, `oxide`, `steel`) are historical
and no longer describe the colours literally. Renaming them would touch every
component for no benefit, so they stayed.

`font-brand` is Black Ops One and ships **one weight only**. Never combine it
with `font-bold` or similar; a bare `.font-brand { font-weight: 400 }` rule sits
outside `@layer` specifically to beat those utilities if anyone tries.

**`DATABASE_URL is not set` at build time.** Vercel needs the variable present for
the build, not just at runtime. Check it is enabled for the Production,
Preview *and* Development environments.

**`OAuthAccountNotLinked`.** You signed in previously with a different Discord
account against the same email. Delete the row from `users` and try again.

---

## Edit these before launch

| File | What |
|---|---|
| `src/lib/videos.ts` | **`VIDEOS` is an empty array.** The page renders a tidy empty state, but it wants content. Paste YouTube IDs; instructions are in the file. |
| `.env.local` | `DISCORD_ROLE_ADMIN`, `DISCORD_ROLE_MAPPER` — build plan open question |
| `src/lib/clients.ts` | Check the versions and bump `LAST_CHECKED` before launch |
| `src/app/page.tsx` | Hero copy, if you want it to read differently |
| `src/components/site-footer.tsx` | Trademark notice — worth a read, it is doing real work |

## Layout

```
src/
├── app/
│   ├── page.tsx                     Hero, what is here, commitments, Discord
│   ├── layout.tsx                   Fonts, header, footer, metadata
│   ├── videos/                      Curated YouTube links (ADD SOME)
│   ├── clients/                     Alpine vs Dash vs Pure vs vanilla, on the facts
│   ├── discord/                     Widget embed
│   ├── signin/                      Discord-only sign-in
│   ├── members/[handle]/            Minimal profile
│   ├── api/auth/[...nextauth]/      Auth.js handlers
│   └── {maps,mods,tools,guides,tournaments}/
│                                    Stubs, so nothing in the nav dead-links
├── components/
├── lib/
│   ├── auth.ts                      Auth.js config + role sync on sign-in
│   ├── discord.ts                   Guild membership lookup, role mapping
│   ├── videos.ts                    The video archive (EDIT THIS, it is empty)
│   ├── clients.ts                   RF client facts + last-checked date
│   ├── nav.ts                       Single source of truth for the nav
│   └── db/                          Drizzle schema + Neon client
└── types/next-auth.d.ts             Session type augmentation
```

Four live pages, five stubs. Phases: 1 skeleton (this), 2 catalogue,
3 members, 4 tournaments. See build plan v6.

## Design decisions worth knowing

**Role sync runs on sign-in, not on a schedule.** One Discord request per login.
A promotion in Discord takes effect next time that person signs in, with no admin
action here. If Discord is down, sign-in still succeeds and the stored role is
kept.

**Handles are assigned once and never change.** Changing them later would rot
every `/members/<handle>` URL.

**The video archive lives in code, not Postgres.** A curated list of a few dozen
YouTube links is one pull request to change and needs no upload form, no
moderation queue and no storage. Phase 3 moves it into the database if it
outgrows hand-editing.

**We link to YouTube and host no video.** Thumbnails come from
`i.ytimg.com` with no API key. The known weakness is that a deleted upload
leaves a dead entry; self-hosting would fix it and cost real money, so we accept
it and check links periodically instead.

**No servers, no tracker, no match schedule.** This is an archive. The rule that
settled the scope: if it is not something you can download, read or watch, it
does not ship. See build plan v6 section 0.

**The `/clients` page takes no side.** It reports what the Red Faction Wiki
says, with a visible last-checked date in `src/lib/clients.ts`. As of July 2026
that means recommending Alpine Faction, which is the actively developed one.
Re-check it when you notice a new release.

**Every route in the site map exists already.** Unbuilt pages say plainly what is
coming and when, rather than 404ing or pretending to be under construction. The
URL set is stable from day one, which matters for search and for Discord links.

**The catalogue tables are not here yet.** Section 11 of the build plan
(`map_meta`, `servers`, `cheat_flags` and the rest) lands in Phase 2, when there
is something to put in them.

## Licence and attribution

Non-commercial community project. Red Faction is a trademark of THQ Nordic AB;
this site is unaffiliated and unendorsed. See the footer notice.
