import type { DefaultSession } from "next-auth";
import type { SiteRole } from "@/lib/db/schema";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      siteRole: SiteRole;
      handle: string | null;
      discordId: string | null;
      inGuild: boolean;
    } & DefaultSession["user"];
  }
}

export {};
