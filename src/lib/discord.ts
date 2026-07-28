import type { SiteRole } from "@/lib/db/schema";

const DISCORD_API = "https://discord.com/api/v10";

/** Parses a comma-separated env var of role snowflakes into a Set. */
function roleIds(value: string | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
}

export type GuildMembership = {
  /** False when the user is not in our guild, or the lookup failed. */
  inGuild: boolean;
  /** Guild-specific nickname, if set. */
  nickname: string | null;
  /** Role snowflakes the member holds. */
  roles: string[];
};

/**
 * Reads the signed-in user's membership of our guild, using their own OAuth
 * token and the `guilds.members.read` scope. No bot token required.
 *
 * Deliberately never throws. A Discord outage should degrade a member to
 * their stored role, not block sign-in entirely.
 */
export async function fetchGuildMembership(
  accessToken: string,
): Promise<GuildMembership> {
  const guildId = process.env.DISCORD_GUILD_ID;
  const miss: GuildMembership = { inGuild: false, nickname: null, roles: [] };

  if (!guildId) {
    console.warn("[discord] DISCORD_GUILD_ID unset, skipping role sync.");
    return miss;
  }

  try {
    const res = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      // Roles change; never serve this from a cache.
      cache: "no-store",
    });

    // 404 is the normal, expected answer for someone who has not joined yet.
    if (res.status === 404) return miss;

    if (!res.ok) {
      console.warn(
        `[discord] guild member lookup failed: ${res.status} ${res.statusText}`,
      );
      return miss;
    }

    const body = (await res.json()) as {
      nick?: string | null;
      roles?: string[];
    };

    return {
      inGuild: true,
      nickname: body.nick ?? null,
      roles: Array.isArray(body.roles) ? body.roles : [],
    };
  } catch (error) {
    console.warn("[discord] guild member lookup threw:", error);
    return miss;
  }
}

/**
 * Maps guild roles to a site role.
 *
 * OPEN QUESTION from the build plan, section 14.5: which Discord roles should
 * grant Mapper and Admin? Until that is decided, set DISCORD_ROLE_ADMIN and
 * DISCORD_ROLE_MAPPER in the environment. Anyone in the guild is a member;
 * anyone signed in but not in the guild is a visitor.
 */
export function resolveSiteRole(membership: GuildMembership): SiteRole {
  if (!membership.inGuild) return "visitor";

  const held = new Set(membership.roles);
  const admins = roleIds(process.env.DISCORD_ROLE_ADMIN);
  const mappers = roleIds(process.env.DISCORD_ROLE_MAPPER);

  for (const id of held) {
    if (admins.has(id)) return "admin";
  }
  for (const id of held) {
    if (mappers.has(id)) return "mapper";
  }

  return "member";
}

/**
 * Derives a URL-safe handle from a Discord display name.
 * Collisions are resolved by the caller, which appends a numeric suffix.
 */
export function toHandle(input: string): string {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

  return base || `player-${Math.random().toString(36).slice(2, 8)}`;
}
