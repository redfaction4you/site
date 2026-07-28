import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/**
 * Phase 1 schema.
 *
 * This covers Auth.js's required tables plus the small number of RF4You columns
 * that identity needs from day one. The catalogue tables (map_meta, servers,
 * cheat_flags and the rest of section 11 of the build plan) land in Phase 2,
 * because they are meaningless until uploads exist.
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
