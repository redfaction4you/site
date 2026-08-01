import type { Metadata } from "next";
import Link from "next/link";

import { dayLabel } from "@/components/match-archive";
import { adminState } from "@/lib/admin-key";
import { listIdentities } from "@/lib/matches/queries";
import { lock, setDisplayName, unlock } from "./actions";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ key?: string; wrong?: string; saved?: string; problem?: string }>;
};

/**
 * The one page that changes what the archive says.
 *
 * Unlike `/link`, which is open because the worst it can do is attach a video to
 * the wrong match, this decides what people are called across every page. That
 * is worth a key.
 *
 * The key is typed once per browser. `/admin?key=...` sets a signed cookie and
 * redirects to the plain URL, so the secret is not left in the address bar or
 * in history, and the page simply opens from then on. Nothing to remember, no
 * account, no session that expires while you are using it.
 */
export default async function AdminPage({ searchParams }: Props) {
  const params = await searchParams;
  const state = await adminState();

  if (state.state === "unconfigured") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="eyebrow">Admin</h1>
        <p className="mt-4 text-sm leading-relaxed text-steel-400">
          No key is configured, so this page is closed to everybody including
          whoever deployed it. Set <code className="text-steel-200">RF4U_ADMIN_KEY</code>{" "}
          in the environment to at least sixteen characters, then open{" "}
          <code className="text-steel-200">/admin?key=...</code> once on each
          device you want to use it from.
        </p>
      </div>
    );
  }

  if (state.state === "locked") {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <h1 className="eyebrow">Admin</h1>
        <p className="mt-3 text-sm leading-relaxed text-steel-400">
          Type the key once and this browser will remember it.
        </p>
        {params.wrong ? (
          <p className="mt-3 border-l-2 border-rust-500 px-3 py-1 text-sm text-steel-200">
            That key was not right.
          </p>
        ) : null}
        <form action={unlock} className="mt-4 flex gap-2">
          <input
            name="key"
            type="password"
            autoComplete="current-password"
            defaultValue={params.key ?? ""}
            className="min-w-0 flex-1 rounded-sm border border-basalt-600 bg-basalt-850 px-3 py-2 font-mono text-sm text-steel-100 focus:border-rust-500 focus:outline-none"
          />
          <button
            type="submit"
            className="shrink-0 rounded-sm bg-rust-500 px-4 py-2 font-display text-[0.6875rem] font-semibold uppercase tracking-wider text-white hover:bg-rust-400"
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  const identities = await listIdentities();
  const merged = identities.filter((entry) => entry.names.length > 1);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-basalt-800 py-2.5">
        <h1 className="eyebrow">Admin</h1>
        <div className="flex items-baseline gap-4 font-mono text-xs text-steel-600">
          <Link href="/link" className="hover:text-rust-300">
            Add a recording
          </Link>
          <form action={lock}>
            <button type="submit" className="hover:text-rust-300">
              Lock this browser
            </button>
          </form>
        </div>
      </div>

      {params.saved ? (
        <p className="mt-4 border-l-2 border-signal-green px-3 py-1 text-sm text-steel-200">
          Saved. It applies everywhere immediately.
        </p>
      ) : null}

      <h2 className="mt-6 font-display text-lg font-bold text-steel-100">
        Who is who
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel-400">
        The server gives every player an identity that survives a name change, so
        somebody who plays under four names is one person here and their record
        is already added up as one. All this page decides is what to call them.
        Leave a name blank to go back to the one they use most.
      </p>
      <p className="mt-2 max-w-2xl text-xs leading-relaxed text-steel-600">
        The identity comes from the connection, so two people sharing one
        household would be merged and one person on a changing connection could
        still split. It is right far more often than names are, and it is not
        certain.
      </p>

      {merged.length > 0 ? (
        <p className="mt-4 text-xs text-steel-500">
          {merged.length} {merged.length === 1 ? "person has" : "people have"}{" "}
          played under more than one name.
        </p>
      ) : null}

      <ul className="mt-3 space-y-1">
        {identities.map((entry) => (
          <li
            key={entry.identityKey}
            className={
              "border-b border-basalt-800 py-2 " +
              (entry.names.length > 1 ? "bg-rust-500/[0.04]" : "")
            }
          >
            <form
              action={setDisplayName}
              className="flex flex-wrap items-center gap-x-3 gap-y-2"
            >
              <input type="hidden" name="identityKey" value={entry.identityKey} />

              <span className="min-w-0 flex-1">
                <span className="block text-sm text-steel-100">
                  {entry.displayName}
                  {entry.chosen ? (
                    <span className="ml-2 font-mono text-[0.5625rem] uppercase tracking-wider text-rust-400">
                      set
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-steel-500">
                  {entry.names.length > 1 ? (
                    <>known as {entry.names.join(", ")}</>
                  ) : (
                    <span className="text-steel-600">one name only</span>
                  )}
                </span>
              </span>

              <span className="shrink-0 font-mono text-[0.625rem] tabular-nums text-steel-600">
                {entry.matchesPlayed}{" "}
                {entry.matchesPlayed === 1 ? "match" : "matches"}
                {entry.lastSeen ? ` · ${dayLabel(entry.lastSeen)}` : ""}
              </span>

              <input
                name="displayName"
                type="text"
                defaultValue={entry.chosen ? entry.displayName : ""}
                placeholder={entry.displayName}
                aria-label={`Display name for ${entry.displayName}`}
                className="w-40 shrink-0 rounded-sm border border-basalt-600 bg-basalt-850 px-2 py-1 text-sm text-steel-100 placeholder:text-steel-700 focus:border-rust-500 focus:outline-none"
              />
              <button
                type="submit"
                className="shrink-0 rounded-sm border border-basalt-600 px-3 py-1 font-display text-[0.625rem] uppercase tracking-wider text-steel-300 hover:border-rust-500 hover:text-rust-300"
              >
                Save
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
