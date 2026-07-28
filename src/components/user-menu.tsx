import Image from "next/image";
import Link from "next/link";
import type { Session } from "next-auth";

import { discordConfigured, signIn, signOut } from "@/lib/auth";

const ROLE_LABEL: Record<string, string> = {
  visitor: "Visitor",
  member: "Member",
  mapper: "Mapper",
  admin: "Admin",
};

export function UserMenu({ session }: { session: Session | null }) {
  // Discord app not created yet. Say so instead of offering a dead button.
  if (!discordConfigured) {
    return (
      <span
        className="hidden text-xs font-semibold uppercase tracking-[0.12em] text-steel-500 sm:inline"
        title="Set AUTH_DISCORD_ID and AUTH_DISCORD_SECRET in .env.local to enable sign-in."
      >
        Sign-in pending
      </span>
    );
  }

  if (!session?.user) {
    return (
      <form
        action={async () => {
          "use server";
          await signIn("discord", { redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="rounded-sm bg-rust-500 px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wider text-steel-100 transition-colors hover:bg-rust-400"
        >
          Sign in
        </button>
      </form>
    );
  }

  const { user } = session;

  return (
    <div className="flex items-center gap-2.5">
      <Link
        href={user.handle ? `/members/${user.handle}` : "/"}
        className="flex items-center gap-2"
        title={`${user.name ?? "Member"} · ${ROLE_LABEL[user.siteRole] ?? user.siteRole}`}
      >
        {user.image ? (
          <Image
            src={user.image}
            alt=""
            width={28}
            height={28}
            className="rounded-full border border-basalt-600"
          />
        ) : null}
        <span className="hidden text-sm text-steel-200 sm:inline">
          {user.name ?? "Member"}
        </span>
        {user.siteRole !== "member" ? (
          <span className="hidden rounded-sm border border-rust-700 px-1.5 py-0.5 font-display text-[0.65rem] font-semibold uppercase tracking-wider text-rust-300 sm:inline">
            {ROLE_LABEL[user.siteRole] ?? user.siteRole}
          </span>
        ) : null}
      </Link>

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button
          type="submit"
          className="font-display text-xs font-semibold uppercase tracking-wider text-steel-400 transition-colors hover:text-steel-200"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
