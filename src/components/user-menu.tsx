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
  /*
   * Nothing at all when sign-in is off, rather than a notice saying so.
   *
   * It used to render "Sign-in pending", which was honest when an account was
   * going to be needed soon. It is not needed: every page here is readable
   * without one, which is the second thing this site promises. A permanent
   * notice about a feature nobody is waiting for is a corner of every page spent
   * apologising for its own absence.
   *
   * The rest of the flow is left intact. If Discord is configured later, the
   * button comes back on its own.
   */
  if (!discordConfigured) return null;

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
          className="rounded-sm bg-rust-500 px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wider text-white transition-colors hover:bg-rust-400"
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
