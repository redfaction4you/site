import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// Type-only import: erased at compile time, so drizzle-kit never has to
// resolve it. Keeps the client list in one place rather than duplicating it.
import type { RfClient } from "../rfl/clients.ts";
import type {
  PublicFlagEvent,
  PublicKill,
  PublicRosterEvent,
  PublicWeaponStat,
} from "../matches/sanitize.ts";

/**
 * Phase 1 identity tables, plus the Phase 2 catalogue.
 *
 * The catalogue is what turns this from a homepage into a resource, so it is
 * modelled around the two things the build plan promises: every file labelled
 * honestly with what can load it, and nothing here disappearing.
 */

/** Site roles, ordered least to most privileged. */
export const SITE_ROLES = ["visitor", "member", "mapper", "admin"] as const;
export type SiteRole = (typeof SITE_ROLES)[number];

/** True when `role` is at least as privileged as `minimum`. */
export function roleAtLeast(role: SiteRole, minimum: SiteRole): boolean {
  return SITE_ROLES.indexOf(role) >= SITE_ROLES.indexOf(minimum);
}

// ---------------------------------------------------------------------------
// Auth.js core tables
// Column names here are the ones @auth/drizzle-adapter expects. Renaming them
// breaks the adapter, so the camelCase oddities are deliberate.
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),

  // --- RF4You additions ---

  /** URL-safe public handle, e.g. /members/romek. Assigned on first sign-in. */
  handle: text("handle").unique(),

  /** Derived from Discord guild roles on every sign-in. Never edited by hand. */
  siteRole: text("site_role").$type<SiteRole>().default("member").notNull(),

  /** Discord snowflake. Kept denormalised so we can look a member up fast. */
  discordId: text("discord_id").unique(),

  /** Whether the user is currently in our Discord guild. */
  inGuild: boolean("in_guild").default(false).notNull(),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
    index("accounts_user_id_idx").on(account.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("sessionToken").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (session) => [index("sessions_user_id_idx").on(session.userId)],
);

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// ---------------------------------------------------------------------------
// Phase 2: the catalogue
//
// One `items` table rather than five. Maps, mods, models, weapons and tools
// differ in almost nothing a database cares about, title, author, files,
// screenshots, and the one genuine difference, level compatibility, lives in
// its own table. Five near-identical tables would mean five of every query,
// five upload paths and five ways to drift apart.
// ---------------------------------------------------------------------------

/** The catalogue sections. One per top-level route. */
export const ITEM_KINDS = ["map", "mod", "model", "weapon", "tool"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/**
 * `draft`    , uploaded, not visible to the public.
 * `published`, live.
 * `hidden`   , pulled by an admin. Deliberately not deleted: commitment 2 says
 *               things do not disappear, and a broken or mislabelled upload
 *               should stop being served without the record evaporating.
 */
export const ITEM_STATUSES = ["draft", "published", "hidden"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const items = pgTable(
  "items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    kind: text("kind").$type<ItemKind>().notNull(),

    /** URL segment, e.g. /maps/glass-house. Unique within a kind, not globally. */
    slug: text("slug").notNull(),

    title: text("title").notNull(),

    /** One line for cards and search results. */
    summary: text("summary"),

    /** Full description, markdown. */
    description: text("description"),

    /**
     * Who made it, as free text.
     *
     * Deliberately not a foreign key. Most of this archive was made twenty-odd
     * years ago by people who will never hold an account here, and crediting
     * them is the whole point. `uploaderId` records who put it on the site,
     * which is a different question and must never be conflated with authorship.
     */
    authorName: text("author_name"),

    /** Set when the author does have an account here. */
    authorUserId: text("author_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    /** Who uploaded it to this site. Not the author. */
    uploaderId: text("uploader_id").references(() => users.id, {
      onDelete: "set null",
    }),

    status: text("status").$type<ItemStatus>().default("draft").notNull(),

    /**
     * When the thing was originally released, if known. Distinct from
     * `createdAt`, which is when we archived it. An archive that cannot tell
     * "made in 2003" from "uploaded in 2026" is not much of an archive.
     */
    releasedOn: date("released_on"),

    /** Free-form tags for filtering: "ctf", "dm", "single-player", "large". */
    tags: text("tags").array().$type<string[]>().default([]).notNull(),

    downloadCount: integer("download_count").default(0).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (item) => [
    // The URL is (kind, slug), so /maps/foo and /mods/foo can coexist.
    unique("items_kind_slug_key").on(item.kind, item.slug),
    index("items_kind_status_idx").on(item.kind, item.status),
    index("items_uploader_idx").on(item.uploaderId),
  ],
);

/**
 * The actual downloadables. An item usually has one, but a map might ship a
 * level plus a texture pack, and a tool might have a Windows build and source.
 */
export const files = pgTable(
  "files",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),

    /** Object key in R2. The permanent URL is derived from this. */
    storageKey: text("storage_key").notNull().unique(),

    /** Name to serve it under, which is not necessarily the key. */
    filename: text("filename").notNull(),

    /** bigint because integer tops out at 2GB and someone will test that. */
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),

    /**
     * Hex SHA-256 of the bytes.
     *
     * This is how "nothing here disappears" gets verified rather than merely
     * asserted: it detects silent corruption in storage, and it makes an
     * accidental re-upload of the same file obvious.
     */
    sha256: text("sha256").notNull(),

    contentType: text("content_type"),

    /** The one users click. Exactly one per item should be true. */
    isPrimary: boolean("is_primary").default(false).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (file) => [
    index("files_item_idx").on(file.itemId),
    index("files_sha256_idx").on(file.sha256),
  ],
);

/**
 * What the RFL reader found. One row per item that contains levels.
 *
 * Everything here is derived from the file at upload by
 * `inspectUpload()` in src/lib/rfl, never typed in by hand. If the detection
 * is wrong, fix the parser and re-run it; do not edit the row.
 */
export const mapMeta = pgTable(
  "map_meta",
  {
    itemId: text("item_id")
      .primaryKey()
      .references(() => items.id, { onDelete: "cascade" }),

    /**
     * Highest RFL format version found. A pack is only as loadable as its most
     * demanding level, so this is the binding constraint, not an average.
     */
    rflVersion: integer("rfl_version"),

    /** Clients that can load every level in the item. */
    playsOn: jsonb("plays_on").$type<RfClient[]>().default([]).notNull(),

    /**
     * "known"  , the version sits in a documented range.
     * "unknown", real version, undocumented range. Show the caveat, do not
     *             invent a badge.
     */
    detectionConfidence: text("detection_confidence")
      .$type<"known" | "unknown">()
      .default("known")
      .notNull(),

    /**
     * Reserved. Cannot be read from the RFL header, it needs the section list
     * parsed and Alpine event types recognised. Empty until that is built,
     * rather than absent, so adding it later is not a migration.
     */
    requiredFeatures: jsonb("required_features")
      .$type<string[]>()
      .default([])
      .notNull(),

    /** Every level found, as returned by the parser: path, version, name. */
    levels: jsonb("levels")
      .$type<{ path: string; version: number; levelName: string }[]>()
      .default([])
      .notNull(),

    /** Anything a human should look at: unreadable level, unknown version. */
    warnings: jsonb("warnings").$type<string[]>().default([]).notNull(),

    /** Which parser run produced this, so a fixed parser can re-scan old rows. */
    detectedAt: timestamp("detected_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (meta) => [index("map_meta_rfl_version_idx").on(meta.rflVersion)],
);

/** Screenshots. Ordered, because the first one is the card image. */
export const screenshots = pgTable(
  "screenshots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    itemId: text("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),

    storageKey: text("storage_key").notNull().unique(),
    caption: text("caption"),
    position: integer("position").default(0).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (shot) => [uniqueIndex("screenshots_item_position_idx").on(shot.itemId, shot.position)],
);

// ---------------------------------------------------------------------------
// Match archive
//
// Populated by the dedicated server, which posts a day's results to
// /api/rf4u/archive/ingest. Stored as tables rather than day-sized documents
// because the point of keeping this data is eventually to answer questions
// across matches, a player's accuracy over a month, captures in a season,
// and a per-day document cannot answer those without reading all of them.
//
// PRIVACY: everything the public sees is sanitised at ingest. The one field
// that never leaves the server is `match_players.identity_key`. Read the
// comment on it before using it anywhere.
// ---------------------------------------------------------------------------

export const matches = pgTable(
  "matches",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** The match id as the dedicated server knows it. Not unique across servers. */
    sourceMatchId: integer("source_match_id").notNull(),

    /** Which server produced it. Part of the identity of a match. */
    server: text("server").notNull(),

    /**
     * The RF4U calendar day, in America/Los_Angeles, a match night that runs
     * past midnight UTC still belongs to the evening it started. Timestamps
     * stay UTC; only the grouping is local.
     */
    archiveDay: date("archive_day").notNull(),

    status: text("status").notNull().default("unknown"),
    mapName: text("map_name").notNull(),
    mode: text("mode").notNull().default("CTF"),

    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),

    redScore: integer("red_score").default(0).notNull(),
    blueScore: integer("blue_score").default(0).notNull(),
    overtime: boolean("overtime").default(false).notNull(),
    winner: text("winner"),

    /**
     * Bulk event streams, kept as documents rather than rows.
     *
     * A single match can carry thousands of kill events. They are shown as
     * optional detail on one match's page and never queried across matches,
     * so rows would cost a great deal and buy nothing. Captures are different
     *, they drive the timeline and are worth querying, so they get a table.
     */
    kills: jsonb("kills").$type<PublicKill[]>().default([]).notNull(),
    flagEvents: jsonb("flag_events").$type<PublicFlagEvent[]>().default([]).notNull(),
    rosterEvents: jsonb("roster_events")
      .$type<PublicRosterEvent[]>()
      .default([])
      .notNull(),

    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    /**
     * A short machine-written report of the match.
     *
     * Generated once from the scoreboard and event log, then stored. Not
     * regenerated per view: it would cost money for nothing and would read
     * differently every time. Null means it has not been written yet, or that
     * generation is not configured, and the page simply omits it.
     *
     * Always labelled as machine-written wherever it is shown. This sits on an
     * archive whose value is that its information can be trusted, and prose
     * nobody wrote should say so.
     */
    report: text("report"),
    reportModel: text("report_model"),
    reportAt: timestamp("report_at", { withTimezone: true }),
  },
  (match) => [
    // The dedicated server re-sends recent days on every sync, so ingest has to
    // be idempotent. This is the key it upserts on.
    unique("matches_server_source_id_key").on(match.server, match.sourceMatchId),
    index("matches_archive_day_idx").on(match.archiveDay),
    index("matches_started_at_idx").on(match.startedAt),
  ],
);

export const matchPlayers = pgTable(
  "match_players",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    team: text("team").notNull().default(""),
    spectator: boolean("spectator").default(false).notNull(),

    score: integer("score").default(0).notNull(),
    kills: integer("kills").default(0).notNull(),
    deaths: integer("deaths").default(0).notNull(),
    caps: integer("caps").default(0).notNull(),
    maxStreak: integer("max_streak").default(0).notNull(),

    accuracy: doublePrecision("accuracy").default(0).notNull(),
    shotsHit: doublePrecision("shots_hit").default(0).notNull(),
    shotsFired: doublePrecision("shots_fired").default(0).notNull(),
    damageGiven: doublePrecision("damage_given").default(0).notNull(),
    damageTaken: doublePrecision("damage_taken").default(0).notNull(),

    flagHoldMs: integer("flag_hold_ms").default(0).notNull(),
    flagPickups: integer("flag_pickups").default(0).notNull(),
    flagDrops: integer("flag_drops").default(0).notNull(),
    flagReturns: integer("flag_returns").default(0).notNull(),
    flagCarrierKills: integer("flag_carrier_kills").default(0).notNull(),
    flagCarrierDeaths: integer("flag_carrier_deaths").default(0).notNull(),
    captureAssists: integer("capture_assists").default(0).notNull(),
    flagRecoveries: integer("flag_recoveries").default(0).notNull(),
    successfulFlagDrives: integer("successful_flag_drives").default(0).notNull(),
    successfulCarryMs: integer("successful_carry_ms").default(0).notNull(),
    fastestCaptureMs: integer("fastest_capture_ms"),

    /**
     * Credit for moving the flag, reconstructed from the event log.
     *
     * The scoreboard gives one person the cap: whoever touched it down. A flag
     * often changes hands first, and the player who carried it most of the way
     * and died at the door currently shows up nowhere. These separate that out.
     *
     * `leadCarries` is the number that did not exist before: drives this player
     * carried longest and somebody else finished.
     *
     * Computed at ingest by src/lib/matches/drives.ts. If the dedicated server
     * ever populates its own capture_assists and drive_participants fields,
     * prefer those and retire this.
     */
    /**
     * Per weapon shooting, from the 2.1 broadcaster onward.
     *
     * Empty for every match archived before the upgrade, and permanently so:
     * earlier telemetry recorded the weapon on a frag but not on every shot,
     * so the data was never captured and cannot be reconstructed.
     */
    weaponStats: jsonb("weapon_stats")
      .$type<PublicWeaponStat[]>()
      .default([])
      .notNull(),

    /**
     * The quickest flag journey this player completed alone, stand to capture.
     *
     * Distinct from `fastest_capture_ms` above, which is the server's own figure
     * and is kept because it is what arrived. That one is a scalar per player
     * per match with no link to a particular capture, so what it measured could
     * never be checked, and it put a 2.7 second capture at the top of a board.
     *
     * This is computed at ingest by `drives.ts` from the flag event log: the
     * time from the flag leaving its stand to being touched down, on drives one
     * person carried the whole way. Those are the only captures where the flag's
     * journey and a player's possession are the same thing.
     *
     * Null where no solo capture was made, or where the log lost the pickup and
     * the journey cannot be measured.
     */
    fastestSoloCaptureMs: integer("fastest_solo_capture_ms"),

    soloCaps: integer("solo_caps").default(0).notNull(),
    relayCaps: integer("relay_caps").default(0).notNull(),
    leadCarries: integer("lead_carries").default(0).notNull(),
    winningCarryMs: integer("winning_carry_ms").default(0).notNull(),

    /**
     * PRIVATE. Never send this to a browser.
     *
     * The dedicated server's own stable handle for a player. An RF player name
     * is neither unique nor stable, so this is the only thing that could ever
     * reliably link a Discord account to an in-game identity, which the build
     * plan calls the hard part of player statistics, not the charts.
     *
     * It is kept because it cannot be reconstructed later: discard it now and
     * every past match becomes unattributable forever. It is not exposed
     * because nobody browsing a scoreboard needs it. Every read path in
     * src/lib/matches.ts selects columns explicitly, and none of them select
     * this one.
     */
    identityKey: text("identity_key"),
  },
  (player) => [
    index("match_players_match_idx").on(player.matchId),
    // Stats by name today, by identity once the mapping exists.
    index("match_players_name_idx").on(player.name),
    index("match_players_identity_idx").on(player.identityKey),
  ],
);

export const matchCaptures = pgTable(
  "match_captures",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),

    elapsedSeconds: integer("elapsed_seconds").default(0).notNull(),
    team: text("team").notNull().default(""),
    redScore: integer("red_score").default(0).notNull(),
    blueScore: integer("blue_score").default(0).notNull(),
    quantity: integer("quantity").default(1).notNull(),

    playerName: text("player_name"),
    assists: jsonb("assists").$type<string[]>().default([]).notNull(),
    driveParticipants: jsonb("drive_participants")
      .$type<{ name: string; carry_ms: number }[]>()
      .default([])
      .notNull(),

    message: text("message").default("").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }),
  },
  (capture) => [
    index("match_captures_match_idx").on(capture.matchId),
    index("match_captures_elapsed_idx").on(capture.matchId, capture.elapsedSeconds),
  ],
);

/**
 * One written column per match night.
 *
 * Play happens in a batch: a handful of matches back to back, then everyone
 * stops until the same time tomorrow. That shape is what makes a daily column
 * possible, because there is a natural moment when the night is over and there
 * is something to write about.
 */
export const nightColumns = pgTable(
  "night_columns",
  {
    archiveDay: date("archive_day").primaryKey(),

    headline: text("headline").notNull(),
    body: text("body").notNull(),

    /**
     * How many matches the night had when this was written.
     *
     * If people come back and play more on the same day, the column is stale
     * and gets rewritten. Without this it would describe half an evening
     * forever.
     */
    matchCount: integer("match_count").notNull(),

    model: text("model"),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),

    /**
     * The illustration, generated once from the finished column.
     *
     * An R2 key rather than a URL, for the same reason files are: the public
     * URL is a function of the key, so the bucket can move without rewriting
     * rows. Null is normal and means no picture was made, which is what happens
     * whenever generation is unconfigured, out of quota, or simply failed.
     *
     * The prompt is kept because it is the only record of why a given picture
     * exists. Without it a regeneration is a guess and an odd image is
     * undiagnosable.
     */
    imageKey: text("image_key"),
    imagePrompt: text("image_prompt"),
    imageModel: text("image_model"),

    /** Set once it has been announced, so it is never posted twice. */
    postedAt: timestamp("posted_at", { withTimezone: true }),

    /**
     * When a delivery was attempted and did not confirm.
     *
     * `posted_at` is claimed *before* the request is sent, deliberately: the
     * comment on `announcePendingColumns` explains why, and the short version is
     * that a lost acknowledgement used to put the same piece in the channel four
     * times. Claiming first makes delivery at-most-once.
     *
     * The cost of that trade was supposed to be visible. The code said a failed
     * piece "is visible in /api/health as a pending item", and it was not:
     * `pending` counts rows whose `posted_at` is null, and a failed piece has
     * just had `posted_at` set. So the 18 August column and opinion were both
     * claimed against a webhook that had been deleted, health reported
     * `pending: 0`, and the only symptom was somebody noticing the channel had
     * gone quiet. That is the exact failure the six-hour alarm was built for,
     * and the alarm could not see it.
     *
     * Null is the ordinary case. Set, it means the row is claimed and did not
     * arrive, which is recoverable by clearing `posted_at` by hand -- and which
     * health now reports rather than leaving for somebody to notice.
     */
    announceFailedAt: timestamp("announce_failed_at", { withTimezone: true }),
  },
  (column) => [index("night_columns_generated_idx").on(column.generatedAt)],
);

/**
 * Orion: one opinion piece per night, about who plays with whom.
 *
 * Its own table rather than more columns on `night_columns`, because it is a
 * different kind of writing with a different guard. The column reports and is
 * fact checked against the night; Orion has a view, and a view cannot be fact
 * checked the way a report can. Keeping them apart means a page can never
 * accidentally present one as the other.
 *
 * Keyed by the night it follows. A night gets at most one, and it is rewritten
 * only if it was never written, since an opinion does not go stale the way a
 * summary of an unfinished evening does.
 */
export const opinionPieces = pgTable(
  "opinion_pieces",
  {
    archiveDay: date("archive_day").primaryKey(),

    headline: text("headline").notNull(),
    body: text("body").notNull(),

    /**
     * Matches on record when this was written.
     *
     * Not a staleness check, unlike the one on `night_columns`. It is here so a
     * reader can see how much the archive held when the opinion was formed,
     * which is the main thing that qualifies it.
     */
    matchCount: integer("match_count").notNull(),

    model: text("model"),

    /**
     * When this was announced, or null.
     *
     * The same shape the columns use, and for the same reason: announcing is a
     * separate pass from writing, so a Discord outage cannot cost the piece and
     * an unannounced one is retried on the next sync rather than lost.
     */
    postedAt: timestamp("posted_at", { withTimezone: true }),

    /**
     * When a delivery was attempted and did not confirm.
     *
     * `posted_at` is claimed *before* the request is sent, deliberately: the
     * comment on `announcePendingColumns` explains why, and the short version is
     * that a lost acknowledgement used to put the same piece in the channel four
     * times. Claiming first makes delivery at-most-once.
     *
     * The cost of that trade was supposed to be visible. The code said a failed
     * piece "is visible in /api/health as a pending item", and it was not:
     * `pending` counts rows whose `posted_at` is null, and a failed piece has
     * just had `posted_at` set. So the 18 August column and opinion were both
     * claimed against a webhook that had been deleted, health reported
     * `pending: 0`, and the only symptom was somebody noticing the channel had
     * gone quiet. That is the exact failure the six-hour alarm was built for,
     * and the alarm could not see it.
     *
     * Null is the ordinary case. Set, it means the row is claimed and did not
     * arrive, which is recoverable by clearing `posted_at` by hand -- and which
     * health now reports rather than leaving for somebody to notice.
     */
    announceFailedAt: timestamp("announce_failed_at", { withTimezone: true }),

    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (piece) => [index("opinion_pieces_generated_idx").on(piece.generatedAt)],
);

/**
 * A short written profile per player.
 *
 * The numbers say what somebody did. A profile says what they are like to play
 * against: who grinds out frags, who lives on the objective, who dies a lot
 * getting the flag home anyway. That is the thing people actually say about
 * each other, and it is derivable from the record.
 *
 * Keyed by lowercased name, matching how every other player query groups. It
 * inherits the same limitation: two people sharing a name become one profile.
 */
export const playerProfiles = pgTable(
  "player_profiles",
  {
    /** lower(name). The join key everywhere players are aggregated. */
    nameKey: text("name_key").primaryKey(),

    /** As last seen, for display. Case can drift between matches. */
    displayName: text("display_name").notNull(),

    body: text("body").notNull(),

    /**
     * Matches played when this was written.
     *
     * A profile describing someone after three matches is stale once they have
     * played thirty. Comparing this to the current count is how it knows.
     */
    matchCount: integer("match_count").notNull(),

    model: text("model"),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (profile) => [index("player_profiles_generated_idx").on(profile.generatedAt)],
);

/**
 * One person, however many names they have played under.
 *
 * The server issues every player an identity derived from their connection, and
 * the archive has been storing it on each row since the beginning without ever
 * reading it. Names are neither unique nor stable here and people change them
 * between matches for fun, so grouping by name splits one player into four: one
 * person on this server has played as Chill Hippo, Skuldug, s9 and s9!nX, and
 * appeared four times on every board.
 *
 * This table only holds the decision a person made about the display name. The
 * grouping itself needs no table: it is the identity the server already sent.
 * Absent a row, the most used name wins, which is right often enough that this
 * exists for the cases where it is not.
 *
 * **`identityKey` is a hash and stays server side**, exactly as it does on
 * `match_players`. It is the primary key here because it is the only stable
 * handle on a person, and it must never reach a page.
 */
/**
 * Deathmatch, which is a different game and gets different tables.
 *
 * The obvious approach was the `mode` column that `matches` already has. It was
 * tried and measured: the query guard reported 65 reads of the match tables
 * that would each have to remember a mode filter, and a rule applied in most
 * places and missed in one is the failure this archive has had three times
 * over. Rows that cannot be seen by a CTF query are safer than rows that must
 * be filtered out by every one of them.
 *
 * **Deathmatch is not match based.** It is whoever is on the server, whenever.
 * The telemetry still emits a round per map rotation and those are kept here for
 * provenance — so a total can be traced back to something — but nothing browses
 * them. There are no DM night pages and no DM match pages, because "which
 * evening was that" is not a question anybody asks about a free-for-all server.
 * What a reader wants is the cumulative record.
 */
export const dmRounds = pgTable(
  "dm_rounds",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** Which server sent this, so two DM servers could never merge by accident. */
    server: text("server").notNull(),
    /** The broadcaster's own id for the round, for idempotent re-sends. */
    sourceRoundId: integer("source_round_id").notNull(),

    /**
     * Which day's document this arrived in, and nothing a reader ever sees.
     *
     * There are no DM night pages and there will not be, so this is not here to
     * group anything. It is here because the unit the VPS syncs is a day, and a
     * round that has been deleted upstream can only be deleted here by sweeping
     * the day it belonged to for rounds the document no longer mentions. The
     * CTF ingest does exactly this with `matches.archiveDay`, and without the
     * column the deathmatch archive could only ever grow.
     */
    archiveDay: date("archive_day").notNull(),

    mapName: text("map_name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),

    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (round) => [
    // The VPS re-sends recent data on every sync, exactly as it does for CTF,
    // so this has to be the key an ingest can upsert on.
    unique("dm_rounds_server_source_id_key").on(round.server, round.sourceRoundId),
    index("dm_rounds_started_at_idx").on(round.startedAt),
    index("dm_rounds_archive_day_idx").on(round.server, round.archiveDay),
  ],
);

/**
 * One player's shooting in one round.
 *
 * Deliberately much narrower than `match_players`. There are no flags in
 * deathmatch, so no captures, hold time, returns, pickups, carrier kills or
 * reconstructed drives, and no teams, so no side. Everything absent here is
 * absent because the game does not have it, rather than because it was not
 * worth storing.
 *
 * `identityKey` is the same HMAC the CTF server issues, from the same salt, so
 * one person is one person across both servers and a merge made on `/admin`
 * applies to both. It is stored and never served, exactly as on `match_players`.
 */
export const dmPlayers = pgTable(
  "dm_players",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    roundId: text("round_id")
      .notNull()
      .references(() => dmRounds.id, { onDelete: "cascade" }),

    name: text("name").notNull(),

    /**
     * The side, on the rare round that has them, and null on a free-for-all.
     *
     * Team deathmatch is coming and it is a third thing rather than a flavour
     * of this one: it is scored on frags, so it belongs nowhere near a board
     * built on flags, and it has sides, which plain deathmatch does not. The
     * column exists before the first TDM round rather than after, because the
     * VPS only re-sends its three most recent days — a round played before the
     * column existed would keep everybody's shooting and forget who they were
     * playing with, and only be recoverable for three days.
     */
    team: text("team"),

    kills: integer("kills").default(0).notNull(),
    deaths: integer("deaths").default(0).notNull(),
    score: integer("score").default(0).notNull(),
    maxStreak: integer("max_streak").default(0).notNull(),

    /**
     * Fractional on purpose, the same as on `match_players`: the Automatic
     * Shotgun fires eight pellets, so three landing is three eighths of a hit.
     * See `accuracy.ts`; the same soundness rule applies to these counters.
     */
    shotsHit: doublePrecision("shots_hit").default(0).notNull(),
    shotsFired: doublePrecision("shots_fired").default(0).notNull(),
    damageGiven: doublePrecision("damage_given").default(0).notNull(),
    damageTaken: doublePrecision("damage_taken").default(0).notNull(),

    /**
     * When this person arrived and when they were last seen, in this round.
     *
     * **The deathmatch record is built on these.** The unit here is time spent
     * on the server, not a match: maps load, people join, people play, and
     * voting a map in to start it as a contest is a CTF habit that will only
     * occasionally happen here. That makes time the headline rather than a
     * column, which is also where the prior art lands — XonStat ranks Xonotic's
     * front page on time played.
     *
     * There is no `seconds_played` in the export and there never was. These two
     * are in it, and they are real session spans rather than snapshot windows:
     * measured against match 42, all four players had a single row spanning
     * 1,077 seconds, which is that match exactly.
     */
    firstSeen: timestamp("first_seen", { withTimezone: true }),
    lastSeen: timestamp("last_seen", { withTimezone: true }),

    /**
     * The span above in seconds, worked out at ingest.
     *
     * Derived and stored rather than computed on every read, because it is the
     * denominator of every rate on the DM pages — frags per minute and the
     * rest — and on a server where nobody ever wins, a rate is the honest
     * headline. A total only measures attendance.
     */
    secondsPlayed: integer("seconds_played").default(0).notNull(),

    weaponStats: jsonb("weapon_stats")
      .$type<PublicWeaponStat[]>()
      .default([])
      .notNull(),

    /**
     * Powerup pickups, emitted since the 7 August continuous-telemetry DLL:
     * the damage amp, invulnerability, super armor and super health. Some maps
     * have them and some do not, and who controls them says something the frag
     * count does not — the owner asked for exactly these four.
     */
    powerupAmps: integer("powerup_amps").default(0).notNull(),
    powerupInvulns: integer("powerup_invulns").default(0).notNull(),
    powerupSuperArmors: integer("powerup_super_armors").default(0).notNull(),
    powerupSuperHealths: integer("powerup_super_healths").default(0).notNull(),

    /** Private. Stored, never served. */
    identityKey: text("identity_key"),
  },
  (row) => [
    index("dm_players_round_idx").on(row.roundId),
    index("dm_players_identity_idx").on(row.identityKey),
    index("dm_players_name_idx").on(row.name),
  ],
);

/**
 * What each day's payload looked like the last time it was written.
 *
 * The VPS re-sends its three most recent days every fifteen minutes, whether or
 * not anything about them changed, and 31 July has been re-sent every fifteen
 * minutes for a week. Each of those did real work: every match upserted, and
 * every player and capture row for that day deleted and re-inserted. Two costs
 * came out of that, and the second is the one a reader sees.
 *
 * The waste is 288 rewrites a day of data that cannot change. The visible
 * problem is that the replace is a delete followed by an insert, so between
 * them a match has no players at all, and a page rendered in that window shows
 * an empty scoreboard or a total short by one match. At sixteen matches every
 * fifteen minutes that is about fifteen hundred openings a day, and it is what
 * produced a `vet:pages` failure that could not be reproduced a minute later.
 *
 * So a day is fingerprinted and only rewritten when the fingerprint moves.
 *
 * **The hash is written last, after the rows.** A run that fails partway leaves
 * the old fingerprint, so the next sync tries again rather than trusting a
 * write that did not finish.
 */
export const archiveDays = pgTable(
  "archive_days",
  {
    server: text("server").notNull(),
    archiveDay: date("archive_day").notNull(),

    /** SHA-256 of the sanitised day, as it was when last stored. */
    contentHash: text("content_hash").notNull(),

    /**
     * When the rows were last actually written, as opposed to checked.
     *
     * A matching hash is not proof the rows are right: somebody can delete one
     * by hand, and until now the next sync always put it back. Keeping that
     * property costs one full rewrite every few hours rather than ninety-six a
     * day. See `REVERIFY_AFTER_MS` in ingest.ts.
     */
    writtenAt: timestamp("written_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (row) => [primaryKey({ columns: [row.server, row.archiveDay] })],
);

/**
 * When each server last reached the ingest, whether or not it had news.
 *
 * `/api/health` used to answer "is the VPS still syncing" with
 * `max(matches.ingested_at)`, which was the same question until 6 August. Then
 * unchanged days stopped being rewritten — 288 pointless rewrites a day of data
 * that could not have changed — and the two questions came apart. A quiet
 * afternoon writes nothing, so the newest `ingested_at` sits still, so health
 * reported the sync stale and answered 503, and `vet-live` failed on it every
 * six hours. It was doing that today with the VPS syncing perfectly every
 * fifteen minutes and saying `unchanged` in its own log each time.
 *
 * **An alarm that is usually wrong is worse than no alarm**, because the
 * response to it becomes ignoring it. So arrival is recorded separately from
 * writing: one row per server, one update per sync, and it answers exactly what
 * it is asked.
 *
 * Deliberately not folded into `archive_days.written_at`. That column is half
 * of the decision to re-verify a day every six hours, and touching it on every
 * sync would mean the re-verify never fires.
 */
export const syncPings = pgTable("sync_pings", {
  /** The server as the payload names it, so the two games are separate rows. */
  server: text("server").primaryKey(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
});

export const playerIdentities = pgTable("player_identities", {
  identityKey: text("identity_key").primaryKey(),

  /** What to call them. Overrides the most used name when set. */
  displayName: text("display_name").notNull(),

  /**
   * Another identity this one is the same person as, decided by hand.
   *
   * The server's identity is an HMAC of the connection, which is the best signal
   * available and is wrong in two directions: a household shares one connection
   * and becomes one player, and one person on a changing address, a VPN or a
   * second machine becomes several. The first cannot be fixed from here. The
   * second can, by somebody who knows, and this is where they say so.
   *
   * **One level only, and never a chain.** `identities.ts` resolves a key
   * through this column exactly once, so pointing A at B when B already points
   * at C would silently leave A on B. The admin action flattens instead: it
   * follows the target to its end and repoints anything aimed at the source, so
   * this column always holds a final answer.
   *
   * Null is the ordinary case and means "the server's grouping was right".
   */
  mergedInto: text("merged_into"),

  /** Why, for whoever reads this table in a year. */
  note: text("note"),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * Recordings of a match, added through the site rather than through a commit.
 *
 * Footage used to live in a typed file, which is the right home for data that
 * is small and rarely changes and the wrong home for data somebody wants to add
 * from their phone the moment a video finishes uploading. A commit and a deploy
 * is too much friction for a link, and the friction is why recordings went
 * unlinked.
 *
 * One row per match a video covers, rather than a video with a list of matches
 * inside it. A single upload is often a whole evening, and one row per coverage
 * means attaching, correcting or removing one match of six is a row rather than
 * an edit to a nested array.
 *
 * The typed file stays as the seed. Anything in it keeps working and the two are
 * merged on read, so this table only ever has to hold what was added since.
 */
export const matchVideos = pgTable(
  "match_videos",
  {
    id: text("id").primaryKey(),

    /** The YouTube id, not the URL. Parsed from whatever form was pasted. */
    youtubeId: text("youtube_id").notNull(),

    /** The archive day, which is a Pacific calendar date. */
    archiveDay: date("archive_day").notNull(),

    /** The server's own match id, which is the number in the match URL. */
    sourceMatchId: integer("source_match_id").notNull(),

    /**
     * Seconds into the recording where this match starts.
     *
     * Null for a video of one match. A forty minute upload of six games needs
     * it, because sending somebody to the top of it to find the one they were
     * reading about is a chore rather than a link.
     */
    startsAt: integer("starts_at"),

    /**
     * The title and channel as YouTube reported them when this was added.
     *
     * Stored rather than fetched on render: a page should not depend on a third
     * party answering, and a video that gets renamed or deleted later should
     * still show what it was when somebody vouched for it.
     */
    title: text("title"),
    authorName: text("author_name"),
    authorUrl: text("author_url"),

    /** Anything worth saying about the recording. Usually nothing. */
    note: text("note"),

    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (video) => [
    // The same video cannot be attached to the same match twice, which is the
    // shape a double submit takes.
    unique("match_videos_unique").on(
      video.youtubeId,
      video.archiveDay,
      video.sourceMatchId,
    ),
    index("match_videos_day_idx").on(video.archiveDay),
  ],
);

// ---------------------------------------------------------------------------
// Relations. These add no SQL of their own; they are what lets
// db.query.items.findMany({ with: { files: true } }) work in one round trip
// instead of a query per item.
// ---------------------------------------------------------------------------

export const itemsRelations = relations(items, ({ one, many }) => ({
  files: many(files),
  screenshots: many(screenshots),
  mapMeta: one(mapMeta, {
    fields: [items.id],
    references: [mapMeta.itemId],
  }),
  uploader: one(users, {
    fields: [items.uploaderId],
    references: [users.id],
    relationName: "uploader",
  }),
  author: one(users, {
    fields: [items.authorUserId],
    references: [users.id],
    relationName: "author",
  }),
}));

/**
 * One map inside a pack.
 *
 * `filename` is the only field the server needs — everything else exists so
 * the public page can credit the mapper and link somewhere to download it.
 */
export type MapPackEntry = {
  /** As the server loads it, e.g. "dm04.rfl". The one required field. */
  filename: string;
  /** What to call it on the page. Falls back to the filename. */
  title?: string;
  /** Who made it, for the mapper-highlight packs this exists for. */
  author?: string;
  /** Where to get it: a FactionFiles page, usually. */
  url?: string;
  /**
   * True when FactionFiles matched the filename by guessing rather than exactly.
   *
   * Kept rather than discarded, because the two honest options are different and
   * a page should be able to choose. An exact match is a link somebody can
   * follow; a guess is a probable match that could point at a different map with
   * a similar name, and a download link to the wrong map is worse than none.
   */
  guessed?: boolean;
  /** A line about this map, shown under it. */
  note?: string;
};

/**
 * A themed set of maps for the deathmatch server.
 *
 * Mapper highlights, a Halloween pack, a Christmas pack — defined here,
 * switched on from /admin, and applied by the VPS, which polls for the active
 * one. The site is the source of truth because it is the thing with a UI and
 * a database; the VPS pulls because Vercel cannot reach it.
 *
 * Activating a pack rewrites three fields of `rf4u-dm.toml` and nothing else:
 * the level list, the server name, and the welcome message. Every other
 * setting on that server — rules, votes, and the rcon password, which must
 * never reach this database — is left exactly as it was.
 */
export const mapPacks = pgTable(
  "map_packs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** The URL, and the stable name the VPS logs against. */
    slug: text("slug").notNull(),
    name: text("name").notNull(),

    /**
     * Which server runs this pack, by its slug in `src/lib/servers.ts`.
     *
     * A pack used to belong to nothing, because there was one server that took
     * packs. With three, "the active pack" stopped being a single answer: the
     * unique index below now covers `(server, active)` so each server has
     * exactly one, and the applier on the VPS asks for its own rather than for
     * the one active pack anywhere.
     *
     * Not a foreign key, because the servers are a typed file rather than a
     * table. A slug that names no server is a pack nothing applies, which is
     * inert rather than dangerous.
     */
    server: text("server").notNull().default("themed-maps"),
    /** A paragraph for the public page: what this pack is and why. */
    blurb: text("blurb"),

    /**
     * What the server calls itself while this pack is on.
     *
     * Null leaves the name alone, and null is now the right answer almost
     * always. The servers were renamed on 26 August so that the *server* is the
     * stable thing and the pack is the content that rotates through it: Themed
     * Maps runs a Halloween pack in October without becoming a Halloween server.
     *
     * Kept because it very nearly caused a silent regression and the story is
     * the warning. The applier writes this straight into the `.toml`, so the
     * stored pack still saying "RedFaction4You.com [DM] — Stock Favourites"
     * would have renamed the server back on its next edit. Set this only when a
     * pack genuinely should rename the server for its run.
     */
    serverName: text("server_name"),

    /**
     * The in-game welcome message. Null builds one from the pack's name and
     * maps, which is the usual case and saves writing it twice.
     */
    welcomeMessage: text("welcome_message"),

    maps: jsonb("maps").$type<MapPackEntry[]>().default([]).notNull(),

    /**
     * Exactly one pack is active **per server**. Enforced by a partial unique
     * index rather than by remembering to clear the others: two active packs on
     * one server would have its applier flip-flopping between them every poll.
     *
     * It was one active pack across the whole table, which was the same answer
     * while one server took packs and the wrong one the moment a second did.
     */
    active: boolean("active").default(false).notNull(),

    /** When it was last switched on, for the public page's "since". */
    activatedAt: timestamp("activated_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (row) => [
    uniqueIndex("map_packs_slug_idx").on(row.slug),
    uniqueIndex("map_packs_one_active_idx")
      .on(row.server, row.active)
      .where(sql`${row.active}`),
  ],
);

/**
 * A longer piece about one subject, rather than one night.
 *
 * The nightly opinion answers "what happened this evening"; when a pairing
 * people had been asking about finally happened, that answer gave it a
 * paragraph and moved on. Some subjects want a whole article: every match two
 * players shared a side, what each did in them, how the flags actually moved.
 * That is a different shape from a column tied to a date, so it is a different
 * table rather than a `kind` column on `opinion_pieces` — a nightly piece has
 * exactly one per day and these have none, or several, about anything.
 *
 * Written on request rather than on a schedule. Nothing generates these
 * automatically, because "which subject deserves a feature" is a judgement and
 * the model is not the one making it.
 */
export const featurePieces = pgTable(
  "feature_pieces",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** The URL. Derived from the headline when it is written. */
    slug: text("slug").notNull(),
    headline: text("headline").notNull(),
    body: text("body").notNull(),

    /** One line under the headline saying what this is about. */
    standfirst: text("standfirst"),

    /**
     * Who or what it is about, as display names. Used to link the piece from
     * the player pages it concerns and to say what it covers.
     */
    subjects: jsonb("subjects").$type<string[]>().default([]).notNull(),

    /**
     * The matches it was written from, as `archiveDay/sourceMatchId`, so a
     * reader can go and check every claim against the scoreboards.
     */
    matchRefs: jsonb("match_refs").$type<string[]>().default([]).notNull(),

    model: text("model"),

    /**
     * When it was announced, or null.
     *
     * Null does NOT queue it for announcement the way `opinion_pieces` does:
     * nothing sweeps this table. Publishing a feature to Discord is a decision
     * somebody makes, which is the whole reason these are written on request.
     */
    postedAt: timestamp("posted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (row) => [uniqueIndex("feature_pieces_slug_idx").on(row.slug)],
);

export const filesRelations = relations(files, ({ one }) => ({
  item: one(items, { fields: [files.itemId], references: [items.id] }),
}));

export const screenshotsRelations = relations(screenshots, ({ one }) => ({
  item: one(items, { fields: [screenshots.itemId], references: [items.id] }),
}));

export const mapMetaRelations = relations(mapMeta, ({ one }) => ({
  item: one(items, { fields: [mapMeta.itemId], references: [items.id] }),
}));

export const matchesRelations = relations(matches, ({ many }) => ({
  players: many(matchPlayers),
  captures: many(matchCaptures),
}));

export const matchPlayersRelations = relations(matchPlayers, ({ one }) => ({
  match: one(matches, { fields: [matchPlayers.matchId], references: [matches.id] }),
}));

export const matchCapturesRelations = relations(matchCaptures, ({ one }) => ({
  match: one(matches, { fields: [matchCaptures.matchId], references: [matches.id] }),
}));
