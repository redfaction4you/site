import { relations } from "drizzle-orm";
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
// differ in almost nothing a database cares about — title, author, files,
// screenshots — and the one genuine difference, level compatibility, lives in
// its own table. Five near-identical tables would mean five of every query,
// five upload paths and five ways to drift apart.
// ---------------------------------------------------------------------------

/** The catalogue sections. One per top-level route. */
export const ITEM_KINDS = ["map", "mod", "model", "weapon", "tool"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/**
 * `draft`     — uploaded, not visible to the public.
 * `published` — live.
 * `hidden`    — pulled by an admin. Deliberately not deleted: commitment 2 says
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
     * "known"   — the version sits in a documented range.
     * "unknown" — real version, undocumented range. Show the caveat, do not
     *             invent a badge.
     */
    detectionConfidence: text("detection_confidence")
      .$type<"known" | "unknown">()
      .default("known")
      .notNull(),

    /**
     * Reserved. Cannot be read from the RFL header — it needs the section list
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
// across matches — a player's accuracy over a month, captures in a season —
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
     * The RF4U calendar day, in America/Los_Angeles — a match night that runs
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
     * — they drive the timeline and are worth querying — so they get a table.
     */
    kills: jsonb("kills").$type<unknown[]>().default([]).notNull(),
    flagEvents: jsonb("flag_events").$type<unknown[]>().default([]).notNull(),
    rosterEvents: jsonb("roster_events").$type<unknown[]>().default([]).notNull(),

    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
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
     * PRIVATE. Never send this to a browser.
     *
     * The dedicated server's own stable handle for a player. An RF player name
     * is neither unique nor stable, so this is the only thing that could ever
     * reliably link a Discord account to an in-game identity — which the build
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
