import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

import { db } from "@/lib/db";
import {
  accounts,
  roleAtLeast,
  sessions,
  users,
  verificationTokens,
  type SiteRole,
} from "@/lib/db/schema";
import { fetchGuildMembership, resolveSiteRole, toHandle } from "@/lib/discord";

/**
 * True once the Discord application exists and its credentials are in the
 * environment. Until then we register no providers at all, so `auth()` still
 * returns null cleanly instead of throwing a configuration error on every
 * request. `auth()` runs in the site header, so without this the entire site
 * 500s when Discord is not yet set up.
 *
 * Components import this to render an honest "not configured" state rather
 * than a sign-in button that leads nowhere.
 */
export const discordConfigured = Boolean(
  process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET,
);

/**
 * Discord OAuth only. No passwords, ever, per the build plan section 5.
 *
 * `guilds.members.read` is the scope that lets us read the signed-in user's
 * roles in our own guild without running a bot.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
  pages: {
    signIn: "/signin",
    error: "/signin",
  },
  providers: discordConfigured
    ? [
        Discord({
          clientId: process.env.AUTH_DISCORD_ID,
          clientSecret: process.env.AUTH_DISCORD_SECRET,
          authorization:
            "https://discord.com/api/oauth2/authorize?scope=identify+email+guilds+guilds.members.read",
        }),
      ]
    : [],
  callbacks: {
    async session({ session, user }) {
      // Surface our own columns on the session so pages can read them without
      // a second query.
      const row = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: { siteRole: true, handle: true, discordId: true, inGuild: true },
      });

      session.user.id = user.id;
      session.user.siteRole = row?.siteRole ?? "visitor";
      session.user.handle = row?.handle ?? null;
      session.user.discordId = row?.discordId ?? null;
      session.user.inGuild = row?.inGuild ?? false;

      return session;
    },
  },
  events: {
    /**
     * Role sync happens on every sign-in rather than on a schedule. It costs one
     * Discord request at login and means a promotion in Discord takes effect the
     * next time someone signs in, with no admin action on the site.
     */
    async signIn({ user, account }) {
      if (!user.id) return;

      const accessToken = account?.access_token;
      const membership = accessToken
        ? await fetchGuildMembership(accessToken)
        : { inGuild: false, nickname: null, roles: [] };

      const siteRole = resolveSiteRole(membership);
      const discordId = account?.providerAccountId ?? null;

      // Assign a handle once, on first sign-in, then leave it alone. Changing
      // handles later would rot every /members/[handle] link.
      const existing = await db.query.users.findFirst({
        where: eq(users.id, user.id),
        columns: { handle: true },
      });

      let handle = existing?.handle ?? null;
      if (!handle) {
        handle = await allocateHandle(
          membership.nickname ?? user.name ?? "player",
        );
      }

      await db
        .update(users)
        .set({
          siteRole,
          handle,
          discordId,
          inGuild: membership.inGuild,
          lastSeenAt: new Date(),
        })
        .where(eq(users.id, user.id));
    },
  },
});

/** Finds a free handle, appending -2, -3 and so on when taken. */
async function allocateHandle(source: string): Promise<string> {
  const base = toHandle(source);

  for (let suffix = 0; suffix < 50; suffix++) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const clash = await db.query.users.findFirst({
      where: eq(users.handle, candidate),
      columns: { id: true },
    });
    if (!clash) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Guard for server components and route handlers.
 * Returns the session, or null when the visitor lacks the required role.
 */
export async function requireRole(minimum: SiteRole) {
  const session = await auth();
  if (!session?.user) return null;
  if (!roleAtLeast(session.user.siteRole, minimum)) return null;
  return session;
}
