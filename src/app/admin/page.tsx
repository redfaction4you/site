import type { Metadata } from "next";
import Link from "next/link";

import { dayLabel } from "@/components/match-archive";
import { adminState } from "@/lib/admin-key";
import { SYNC_STALE_MINUTES, lastSyncAt } from "@/lib/health";
import {
  archiveTotals,
  listDays,
  listIdentities,
  listMerges,
  nightForVetting,
} from "@/lib/matches/queries";
import { vetNight } from "@/lib/matches/vet";
import { listMapPacks } from "@/lib/map-packs";
import { MapPackAdmin } from "@/components/map-pack-admin";
import { FeatureAdmin } from "@/components/feature-admin";
import {
  lock,
  mergeIdentities,
  setDisplayName,
  unlock,
  unmergeIdentity,
} from "./actions";

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
          in the environment to at least eight characters, then open{" "}
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

  const [identities, merges, days, totals, lastSync, packs] = await Promise.all([
    listIdentities(),
    listMerges(),
    listDays(),
    archiveTotals(),
    lastSyncAt(),
    listMapPacks(),
  ]);
  const merged = identities.filter((entry) => entry.names.length > 1);

  // What a merged-away identity now answers to, for the undo list.
  const nameOf = new Map(identities.map((e) => [e.identityKey, e.displayName]));

  /*
   * What the vetting found, on the page rather than only in a terminal.
   *
   * `npm run vet` has been reporting problems for weeks and nothing consumed
   * what it produced, which is how 1067% accuracy stayed published: the failure
   * was never detection. Recent nights only, because the check that matters is
   * the one on a night somebody might still be reading about.
   */
  const recent = days.slice(0, 5);
  const vetted = (
    await Promise.all(
      recent.map(async (day) => ({
        day: day.archiveDay,
        anomalies: vetNight(day.archiveDay, await nightForVetting(day.archiveDay)),
      })),
    )
  ).filter((night) => night.anomalies.length > 0);

  const errors = vetted.flatMap((night) =>
    night.anomalies.filter((a) => a.severity === "error").map((a) => ({ ...a, day: night.day })),
  );

  const syncMinutes = lastSync
    ? Math.round((Date.now() - lastSync.getTime()) / 60_000)
    : null;
  const syncStale = syncMinutes === null || syncMinutes > SYNC_STALE_MINUTES;

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

      {/* Is anything broken, and where do I go. Both before the editing. */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <section>
          <h2 className="rule-heading">State of the archive</h2>
          <dl className="mt-2 space-y-1 text-xs">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-steel-500">Results last received</dt>
              <dd className={syncStale ? "text-oxide-400" : "text-steel-200"}>
                {syncMinutes === null
                  ? "never"
                  : syncMinutes < 60
                    ? `${syncMinutes} min ago`
                    : `${Math.round(syncMinutes / 60)} hours ago`}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-steel-500">Archive</dt>
              <dd className="text-steel-200">
                {totals.matchCount} matches · {totals.dayCount} nights
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-steel-500">People</dt>
              <dd className="text-steel-200">
                {identities.length}
                {merged.length > 0 ? ` · ${merged.length} renamed` : ""}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-steel-500">Vetting</dt>
              <dd className={errors.length > 0 ? "text-rust-400" : "text-steel-200"}>
                {errors.length > 0
                  ? `${errors.length} to look at`
                  : "nothing wrong in the last five nights"}
              </dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="rule-heading">Things you can do</h2>
          <ul className="mt-2 space-y-1 text-xs">
            <li>
              <Link href="/link" className="text-rust-400 hover:text-rust-300">
                Add a recording
              </Link>
              <span className="text-steel-600"> — attach a video to a match</span>
            </li>
            <li>
              <Link href="/matches" className="text-steel-300 hover:text-rust-300">
                The archive
              </Link>
              <span className="text-steel-600"> — every night on record</span>
            </li>
            <li>
              <Link href="/server" className="text-steel-300 hover:text-rust-300">
                Server
              </Link>
              <span className="text-steel-600"> — who is playing right now</span>
            </li>
            <li>
              <a
                href="/api/health"
                target="_blank"
                rel="noreferrer"
                className="text-steel-300 hover:text-rust-300"
              >
                Health
              </a>
              <span className="text-steel-600"> — what UptimeRobot polls</span>
            </li>
          </ul>
        </section>
      </div>

      {/*
        Anomalies, named. The point is not that a check ran, it is that somebody
        reads what it found: every wrong figure this site has published was
        already being reported by something nobody was looking at.
      */}
      {vetted.length > 0 ? (
        <section className="mt-7">
          <h2 className="rule-heading">Worth checking</h2>
          <ul className="mt-2 space-y-1">
            {vetted.flatMap((night) =>
              night.anomalies.map((anomaly, i) => (
                <li
                  key={`${night.day}-${anomaly.check}-${i}`}
                  className="flex flex-wrap items-baseline gap-x-2 border-b border-basalt-800 py-1 text-xs"
                >
                  <span
                    className={
                      "shrink-0 font-mono text-[0.5625rem] uppercase tracking-wider " +
                      (anomaly.severity === "error"
                        ? "text-rust-400"
                        : "text-steel-600")
                    }
                  >
                    {anomaly.check}
                  </span>
                  <Link
                    href={`/matches/${night.day}`}
                    className="shrink-0 font-mono text-[0.625rem] text-steel-600 hover:text-rust-300"
                  >
                    {dayLabel(night.day)}
                  </Link>
                  <span className="min-w-0 flex-1 text-steel-400">
                    {anomaly.detail}
                  </span>
                </li>
              )),
            )}
          </ul>
          <p className="mt-2 text-[0.6875rem] leading-snug text-steel-600">
            Nothing here is hidden from the site. A flawed record beats no
            record, so the rows stay as sent and the figures they contradict are
            withheld where they would mislead.
          </p>
        </section>
      ) : null}

      <MapPackAdmin packs={packs} />

      <FeatureAdmin />

      <h2 className="mt-10 font-display text-lg font-bold text-steel-100">
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
        certain. Where it has split somebody, join them below.
      </p>

      {/*
        Joining two identities.

        The connection-derived grouping is wrong in two directions and only one
        of them is fixable from here. One person on a new address, a VPN or a
        second machine arrives as two people with their record divided; somebody
        who knows says so and every total adds up as one from then on. Two people
        behind one connection cannot be separated, because the archive holds
        nothing that tells them apart, and the text says so rather than leaving
        somebody hunting for the control that would do it.

        Deliberately a plain pair of selects. This is used a handful of times a
        year by one person who already knows the answer, so the work is in making
        the consequence legible, not the interaction quick.
      */}
      <section className="mt-6 border-t border-basalt-800 pt-4">
        <h3 className="rule-heading">Same person, two identities</h3>
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-steel-500">
          Everything the first one did is credited to the second, everywhere on
          the site, including in writing that has already been published. No rows
          are deleted and nothing is lost, so this can be undone.
        </p>

        <form
          action={mergeIdentities}
          className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2"
        >
          <label className="text-xs text-steel-500">
            <span className="block pb-1">This person</span>
            <select
              name="source"
              required
              className="w-48 rounded-sm border border-basalt-600 bg-basalt-850 px-2 py-1 text-sm text-steel-100 focus:border-rust-500 focus:outline-none"
            >
              <option value="">choose</option>
              {identities.map((entry) => (
                <option key={entry.identityKey} value={entry.identityKey}>
                  {entry.displayName} ({entry.matchesPlayed})
                </option>
              ))}
            </select>
          </label>

          <span className="pb-1.5 text-xs text-steel-600">is really</span>

          <label className="text-xs text-steel-500">
            <span className="block pb-1">This person</span>
            <select
              name="target"
              required
              className="w-48 rounded-sm border border-basalt-600 bg-basalt-850 px-2 py-1 text-sm text-steel-100 focus:border-rust-500 focus:outline-none"
            >
              <option value="">choose</option>
              {identities.map((entry) => (
                <option key={entry.identityKey} value={entry.identityKey}>
                  {entry.displayName} ({entry.matchesPlayed})
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-0 flex-1 text-xs text-steel-500">
            <span className="block pb-1">Why (optional)</span>
            <input
              name="note"
              type="text"
              placeholder="e.g. confirmed in Discord, changed ISP"
              className="w-full rounded-sm border border-basalt-600 bg-basalt-850 px-2 py-1 text-sm text-steel-100 placeholder:text-steel-700 focus:border-rust-500 focus:outline-none"
            />
          </label>

          <button
            type="submit"
            className="shrink-0 rounded-sm border border-basalt-600 px-3 py-1 font-display text-[0.625rem] uppercase tracking-wider text-steel-300 hover:border-rust-500 hover:text-rust-300"
          >
            Join
          </button>
        </form>

        {merges.length > 0 ? (
          <ul className="mt-4 space-y-1">
            {merges.map((merge) => (
              <li
                key={merge.identityKey}
                className="flex flex-wrap items-baseline gap-x-3 border-b border-basalt-800 py-1.5 text-xs"
              >
                <span className="text-steel-300">
                  {merge.sourceName ?? "an identity with no matches"}
                  <span className="text-steel-600"> is </span>
                  {nameOf.get(merge.mergedInto) ?? "somebody no longer on record"}
                </span>
                {merge.note ? (
                  <span className="text-steel-600">{merge.note}</span>
                ) : null}
                <form action={unmergeIdentity} className="ml-auto">
                  <input type="hidden" name="identityKey" value={merge.identityKey} />
                  <button
                    type="submit"
                    className="font-mono text-[0.625rem] text-steel-600 hover:text-rust-300"
                  >
                    undo
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-steel-600">
            Nothing has been joined by hand. Every person below is grouped
            exactly as the server grouped them.
          </p>
        )}

        <p className="mt-3 max-w-2xl text-[0.6875rem] leading-snug text-steel-600">
          Two people who share a connection are one identity here and cannot be
          separated: the archive holds nothing that tells them apart. That one
          needs the telemetry to stop keying on the address.
        </p>
      </section>

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
                  {entry.serverKeys > 1 ? (
                    <span className="text-oxide-400">
                      {" "}
                      · {entry.serverKeys} identities joined by hand
                    </span>
                  ) : null}
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
