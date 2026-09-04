import type { Metadata } from "next";
import Link from "next/link";

import { dayLabel } from "@/components/match-archive";
import { adminState } from "@/lib/admin-key";
import { SYNC_STALE_MINUTES, lastSyncAt } from "@/lib/health";
import { listSyncPings } from "@/lib/sync-ping";
import { dmTotals } from "@/lib/dm/queries";
import { dmIntegrity } from "@/lib/dm/integrity";
import { listFeatures } from "@/lib/ai/feature";
import { timePlayed } from "@/lib/dm/format";
import { collidingNames } from "@/lib/matches/display-name";
import {
  archiveTotals,
  listDays,
  listIdentities,
  listMerges,
  listPlayers,
  nightForVetting,
} from "@/lib/matches/queries";
import { vetNight } from "@/lib/matches/vet";
import { listMapPacks } from "@/lib/map-packs";
import { listAllItems } from "@/lib/catalogue";
import { MapPackAdmin } from "@/components/map-pack-admin";
import { FeatureAdmin } from "@/components/feature-admin";
import { CatalogueAdmin } from "@/components/catalogue-admin";
import { serverLabel } from "@/lib/matches/server-names";
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

/** What each refusal means, in the words of somebody who has to act on it. */
const PROBLEMS: Record<string, string> = {
  "feature-input":
    "Nothing was written: the form needs two different names, or a match reference like 2026-08-07/46.",
  "feature-no-record":
    "Nothing was written: the archive has no completed matches for that subject. For a pairing they must have shared a side, for a rivalry they must have been on opposite sides, and a name has to be the one the site shows rather than one of their older ones.",
  "feature-unwritten":
    "Nothing was written: three attempts were made and each was refused by the fact check, or the model could not be reached. Model quota is the usual cause — npm run ai:quota says. Trying again later is reasonable.",
  "name-not-on-record":
    "Not renamed: nobody has played under that name, and a player page is found by name — so it would put that label on every board and a 404 behind every link to it. Use one of the names listed beside them.",
  "name-ambiguous":
    "Not renamed: somebody else has played under that name too, so a page reached by it would have to pick one of them. cowboy dan is the live example — two different people have used it.",
  "pack-exists":
    "Not saved: a pack with that name already exists. Saving would have replaced its maps and its blurb. Edit that one, or choose a different name.",
  "pack-missing":
    "Nothing was switched on: that pack no longer exists. Whatever was on has been left alone.",
  "pack-active":
    "Not deleted: that pack is the one currently on. Switch it off first — deleting it would leave the server running a rotation the site no longer knows about.",
  "pack-name":
    "Not saved: a pack needs a name with at least one letter or number in it, because the slug in its URL is made from the name.",
  "pack-empty":
    "Not saved: no maps. A pack with an empty level list would leave the server with nothing to load, so it is refused here rather than sent.",
  "feature-missing": "Nothing was posted: that piece no longer exists.",
  "feature-posted":
    "Nothing was posted: that piece has already gone to Discord, and a message cannot be unsent. Post it again from Discord itself if a second copy is really wanted.",
  "feature-announce-rejected":
    "Nothing was posted: no Discord webhook is configured, so there was nowhere to send it. /api/health reports whether announcing can work at all.",
  "feature-announce-failed":
    "Nothing was posted: Discord refused the message. The piece is unchanged and the button is still there.",
  "feature-announce-unknown":
    "Discord did not answer, so it is not known whether the message arrived. The piece has deliberately NOT been marked as posted — check the channel before pressing again, because pressing it will send a second copy.",
  "merge-incomplete": "Nothing was joined: pick a person in both boxes.",
  "merge-same":
    "Nothing was joined: those are the same person. The two boxes are for two identities the server told apart and you know are one.",
  "merge-ring":
    "Nothing was joined: that would make a ring, with each pointing at the other and neither being the answer. Join both into whichever of them is the person you want the site to show.",
  "item-missing":
    "Nothing was changed: that item no longer exists. Somebody deleted it, or the page had been open a while. Everything else is untouched.",
  "item-no-file":
    "Not published: this item has no file. Its page would list a download panel with nothing in it and its shelf would count a map nobody can have, so publishing is refused rather than half done. Re-run the ingest for it, then publish.",
  "item-not-published":
    "Nothing was pulled: that item is not live. Pulling means taking down a page people could read, and a draft has never had one. It has been left as a draft rather than marked as something that was pulled.",
  "item-title":
    "Not saved: an item needs a title. It is what every card, shelf listing and link renders, so a blank one would put a nameless row on a shelf.",
  "item-category":
    "Not saved: that category is not one of that shelf's facets, so nothing would ever find the item under it. Mods and tools have no facets at all. Pick one from the list, or leave it as none.",
  "item-date":
    "Not saved: the release date has to be a full date or a bare year, like 2003-11-04 or 2003. Nothing was written, rather than the date being quietly cleared while the page said it had saved.",
  "item-update-title":
    "Nothing was added: a changelog entry needs a line saying what changed. That line is the whole entry on the item's page.",
  "item-update-date":
    "Nothing was added: that release date could not be read. Leave it blank to record today, or give a date like 2004-06-12.",
  default: "That was refused, and nothing was changed.",
};

type Props = {
  searchParams: Promise<{
    wrong?: string;
    saved?: string;
    problem?: string;
    /** A pack slug to load into the map pack form. */
    pack?: string;
    /** A catalogue item id to expand for editing. */
    item?: string;
    /** Filenames a refused pack could not use, and how many were not listed. */
    bad?: string;
    more?: string;
  }>;
};

/**
 * The one page that changes what the archive says.
 *
 * Unlike `/link`, which is open because the worst it can do is attach a video to
 * the wrong match, this decides what people are called across every page. That
 * is worth a key.
 *
 * The key is typed once per browser, into the box below. The form post sets a
 * signed cookie and redirects to the plain URL, and the page simply opens from
 * then on. Nothing to remember, no account, no session that expires while you
 * are using it.
 *
 * `?key=` in the URL does nothing, deliberately. See `admin-key.ts`: only a
 * form post can set a cookie, so the parameter never unlocked anything, and
 * pre-filling the box from it put the secret in the address bar and in history
 * while looking like the supported way in.
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
          in the environment to at least eight characters, and it will ask for
          it here. A key in the URL does nothing.
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
          {/* Never pre-filled from the URL: see the note above the component. */}
          <input
            name="key"
            type="password"
            autoComplete="current-password"
            aria-label="Admin key"
            className="min-w-0 flex-1 rounded-sm border border-basalt-600 bg-basalt-850 px-3 py-2 font-mono text-sm text-steel-100 focus:border-rust-500 focus:outline-none"
          />
          <button
            type="submit"
            className="shrink-0 rounded-sm bg-rust-500 px-4 py-2 font-display text-xs font-semibold uppercase tracking-wider text-white hover:bg-rust-400"
          >
            Unlock
          </button>
        </form>
      </div>
    );
  }

  const [
    identities,
    merges,
    days,
    totals,
    lastSync,
    packs,
    pings,
    dm,
    dmChecks,
    features,
    players,
    catalogue,
  ] = await Promise.all([
    listIdentities(),
    listMerges(),
    listDays(),
    archiveTotals(),
    lastSyncAt(),
    listMapPacks(),
    listSyncPings(),
    dmTotals(),
    dmIntegrity(),
    listFeatures(),
    listPlayers(),
    // The one read on this page that can see a draft. Everything else in
    // `catalogue.ts` filters to published, deliberately.
    listAllItems(),
  ]);

  /*
   * Who actually has a page, so a name here only links where a page exists.
   *
   * This list is everyone who took part in anything; `/players/[name]` is built
   * from completed matches and calls `notFound()` otherwise. Somebody whose
   * only appearance was in a cancelled start therefore belongs on this page,
   * because they still need naming, and has nowhere to link to.
   */
  const hasPage = new Set(
    players.map((player) => player.name.toLocaleLowerCase("en-US")),
  );

  // The pack `?pack=` asked to edit. Unknown slugs fall back to a blank form
  // rather than an error: the only way to get one is a stale link.
  const editingPack = params.pack
    ? (packs.find((pack) => pack.slug === params.pack) ?? null)
    : null;

  // Same arrangement for the catalogue row `?item=` asked to open. An id that
  // no longer exists collapses back to the plain list rather than erroring: the
  // only way to hold one is a page left open while somebody deleted the item.
  const editingItem = params.item
    ? (catalogue.find((entry) => entry.id === params.item) ?? null)
    : null;

  // People who have played under more than one name. Not "renamed": most of
  // them were never touched on this page, and calling them renamed is how the
  // stat below came to say something that was not true.
  const multiNamed = identities.filter((entry) => entry.names.length > 1);

  /*
   * Two people the site shows under one name.
   *
   * Nothing on the page could produce this until now — `setDisplayName` refuses
   * an ambiguous name — but `DISPLAY_NAME` falls back to the most used name, so
   * two people who have only ever played as the same thing collide with nobody
   * having typed anything. It matters because a player page is found by name.
   */
  const colliding = collidingNames(identities);

  const dmBroken = dmChecks.untimed > 0 || dmChecks.phantoms > 0;

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

  /*
   * One row per check, not per anomaly.
   *
   * `side-reshuffled` fires once for each colour on every night the sides
   * moved, so five ordinary nights produce ten rows of the same sentence. A
   * list where the same finding repeats is a list nobody reads to the bottom of,
   * which is the failure this section exists to avoid.
   */
  const byCheck = [
    ...vetted
      .flatMap((night) => night.anomalies.map((anomaly) => ({ ...anomaly, day: night.day })))
      .reduce((grouped, anomaly) => {
        const existing = grouped.get(anomaly.check);
        if (existing) {
          existing.count += 1;
          if (!existing.days.includes(anomaly.day)) existing.days.push(anomaly.day);
          // An error among warnings colours the whole group as one.
          if (anomaly.severity === "error") existing.severity = "error";
        } else {
          grouped.set(anomaly.check, {
            check: anomaly.check,
            severity: anomaly.severity,
            detail: anomaly.detail,
            days: [anomaly.day],
            count: 1,
          });
        }
        return grouped;
      }, new Map<string, { check: string; severity: string; detail: string; days: string[]; count: number }>())
      .values(),
  ].sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === "error" ? -1 : 1));

  const errors = vetted.flatMap((night) =>
    night.anomalies.filter((a) => a.severity === "error").map((a) => ({ ...a, day: night.day })),
  );

  /*
   * Each server on its own, which is the reading health had to be rewritten to.
   *
   * This said "Results last received" and took it from `max(matches.ingested_at)`
   * — how long since something was **written**. That is the exact metric
   * `/api/health` abandoned on 7 August: once unchanged days stopped being
   * rewritten, a quiet afternoon wrote nothing and the answer read as a dead
   * pipeline while the VPS synced every fifteen minutes. It was also blind to
   * the deathmatch server, because it only ever looked at `matches`.
   *
   * `lastIngest` is kept, because "when did the archive last actually change"
   * is a real and different question and this is the page where it is useful.
   */
  const now = Date.now();

  const writeMinutes = lastSync
    ? Math.round((now - lastSync.getTime()) / 60_000)
    : null;

  const ago = (minutes: number): string =>
    minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} hours ago`;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-basalt-800 py-2.5">
        <h1 className="eyebrow">Admin</h1>
        <div className="flex items-baseline gap-4 font-mono text-xs text-steel-400">
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
          {params.saved === "posted"
            ? "Posted to Discord, and marked as posted so it cannot go twice."
            : "Saved. It applies everywhere immediately."}
        </p>
      ) : null}

      {/*
        Every action here redirects with `?problem=` when it refuses, and until
        9 August nothing rendered it: a commission that failed looked exactly
        like a button that did nothing, and was reported as one. The three
        feature failures are said apart because they need different answers.
      */}
      {params.problem ? (
        <p className="mt-4 border-l-2 border-rust-500 px-3 py-1 text-sm leading-relaxed text-steel-200">
          {params.problem === "pack-filenames" ? (
            <>
              Not saved, and nothing was changed. Every filename has to end in{" "}
              <code className="text-steel-100">.rfl</code>, and{" "}
              {params.more ? "these do not" : "this does not"}:{" "}
              <span className="font-mono text-rust-300">{params.bad}</span>
              {params.more ? `, and ${params.more} more` : ""}. The server drops
              a map it cannot load and runs a shorter rotation without saying
              so, which is why this is refused here.
            </>
          ) : (
            (PROBLEMS[params.problem] ?? PROBLEMS.default)
          )}
        </p>
      ) : null}

      {/* Is anything broken, and where do I go. Both before the editing. */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <section>
          <h2 className="rule-heading">State of the archive</h2>
          <dl className="mt-2 space-y-1.5 text-sm">
            {/* One row per server, because one row for all of them is how a
                dark server hides behind a live one. */}
            {pings.length === 0 ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-steel-500">Servers reporting</dt>
                <dd className="text-oxide-400">none yet</dd>
              </div>
            ) : (
              pings.map((ping) => {
                const minutes = Math.round((now - ping.lastSeenAt.getTime()) / 60_000);
                return (
                  <div
                    key={ping.server}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <dt className="text-steel-500">
                      {serverLabel(ping.server)} last called in
                    </dt>
                    <dd
                      className={
                        minutes > SYNC_STALE_MINUTES ? "text-rust-400" : "text-steel-200"
                      }
                    >
                      {ago(minutes)}
                    </dd>
                  </div>
                );
              })
            )}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-steel-500">Archive last changed</dt>
              <dd className="text-steel-200">
                {writeMinutes === null ? "never" : ago(writeMinutes)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-steel-500">Capture the Flag</dt>
              <dd className="text-steel-200">
                {totals.matchCount} matches · {totals.dayCount} nights
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-steel-500">Deathmatch</dt>
              <dd className="text-steel-200">
                {dm.rounds} {dm.rounds === 1 ? "round" : "rounds"} ·{" "}
                {timePlayed(dm.secondsPlayed)} played
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-steel-500">People</dt>
              <dd className="text-steel-200">
                {identities.length}
                {multiNamed.length > 0
                  ? ` · ${multiNamed.length} with more than one name`
                  : ""}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-steel-500">Vetting, capture the flag</dt>
              <dd className={errors.length > 0 ? "text-rust-400" : "text-steel-200"}>
                {errors.length > 0
                  ? `${errors.length} to look at`
                  : "nothing wrong in the last five nights"}
              </dd>
            </div>
            {/*
              The two deathmatch alarms `vet-live` watches, which lived only in
              the health answer. The person who would fix them was looking at a
              page that knew about capture the flag and nothing else.
            */}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-steel-500">Vetting, deathmatch</dt>
              <dd className={dmBroken ? "text-rust-400" : "text-steel-200"}>
                {dmBroken
                  ? [
                      dmChecks.untimed > 0 ? `${dmChecks.untimed} untimed` : null,
                      dmChecks.phantoms > 0 ? `${dmChecks.phantoms} phantom` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "nothing contradicting itself"}
              </dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="rule-heading">Things you can do</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            <li>
              <Link href="/link" className="text-rust-400 hover:text-rust-300">
                Add a recording
              </Link>
              <span className="text-steel-400"> — attach a video to a match</span>
            </li>
            <li>
              <Link href="/matches" className="text-steel-300 hover:text-rust-300">
                The archive
              </Link>
              <span className="text-steel-400"> — every night on record</span>
            </li>
            <li>
              <Link href="/servers" className="text-steel-300 hover:text-rust-300">
                Server
              </Link>
              <span className="text-steel-400"> — who is playing right now</span>
            </li>
            <li>
              <Link href="/servers/map-packs" className="text-steel-300 hover:text-rust-300">
                Map packs
              </Link>
              <span className="text-steel-400">
                {" "}
                — the rotation as a reader sees it
              </span>
            </li>
            <li>
              <Link href="/stats/dm" className="text-steel-300 hover:text-rust-300">
                Deathmatch record
              </Link>
              <span className="text-steel-400"> — time on the server, ranked</span>
            </li>
            <li>
              <Link href="/analyst" className="text-steel-300 hover:text-rust-300">
                The analyst
              </Link>
              <span className="text-steel-400"> — columns and features</span>
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
              {/* Named for what actually polls it. `vet-live` is in the repo;
                  whether a monitor also watches it is not knowable from here. */}
              <span className="text-steel-400">
                {" "}
                — what vet-live polls after every deploy
              </span>
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
          {/*
            Grouped by check rather than one row per anomaly.
            `side-reshuffled` fires twice a night, once for each colour, so five
            nights filled the screen with ten rows of the same sentence and the
            one row that mattered would have been lost among them. The finding
            is the check; the nights are how often.
          */}
          <ul className="mt-3 space-y-2">
            {byCheck.map((group) => (
              <li
                key={group.check}
                className="border-b border-basalt-800 pb-2 sm:flex sm:items-baseline sm:gap-4"
              >
                <span
                  className={
                    "block shrink-0 font-mono text-xs uppercase tracking-wider sm:w-44 " +
                    (group.severity === "error" ? "text-rust-400" : "text-oxide-400")
                  }
                >
                  {group.check}
                  <span className="text-steel-400"> ×{group.count}</span>
                </span>
                <span className="mt-1 block min-w-0 flex-1 text-sm leading-snug text-steel-300 sm:mt-0">
                  {group.detail}
                </span>
                <span className="mt-1 flex shrink-0 flex-wrap gap-x-2 sm:mt-0">
                  {group.days.map((day) => (
                    <Link
                      key={day}
                      href={`/matches/${day}`}
                      className="font-mono text-xs text-steel-400 hover:text-rust-300"
                    >
                      {dayLabel(day)}
                    </Link>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm leading-snug text-steel-400">
            Nothing here is hidden from the site. A flawed record beats no
            record, so the rows stay as sent and the figures they contradict are
            withheld where they would mislead.
          </p>
        </section>
      ) : null}

      {/*
        Before the map packs, because this is the section with a work queue in
        it. An ingest run leaves drafts that are invisible everywhere else on
        the site, and the point of putting them first is that somebody who came
        here for something else still sees them waiting.
      */}
      <CatalogueAdmin items={catalogue} editing={editingItem} />

      <MapPackAdmin packs={packs} editing={editingPack} />

      <FeatureAdmin written={features} />

      <h2 className="mt-10 font-display text-lg font-bold text-steel-100">
        Who is who
      </h2>
      <p className="max-w-2xl text-sm leading-relaxed text-steel-300">
        The server gives every player an identity that survives a name change, so
        somebody who plays under four names is one person here and their record
        is already added up as one. All this page decides is what to call them.
        Leave a name blank to go back to the one they use most.
      </p>
      <p className="max-w-2xl text-sm leading-relaxed text-steel-400">
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
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-steel-400">
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

          <span className="pb-1.5 text-xs text-steel-400">is really</span>

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
            className="shrink-0 rounded-sm border border-basalt-600 px-3 py-1 font-display text-xs uppercase tracking-wider text-steel-300 hover:border-rust-500 hover:text-rust-300"
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
                {/*
                  Two shapes, because a merge is about connections and only
                  sometimes about names. Joining somebody's second address when
                  they played under the same name both times rendered as "J!nX
                  is J!nX", which reads as a mistake rather than as the ordinary
                  case it is.
                */}
                <span className="text-steel-300">
                  {merge.sourceName === null ? (
                    <>
                      An identity with no matches
                      <span className="text-steel-400"> is </span>
                      {nameOf.get(merge.mergedInto) ?? "somebody no longer on record"}
                    </>
                  ) : merge.sourceName === nameOf.get(merge.mergedInto) ? (
                    <>
                      {merge.sourceName}
                      <span className="text-steel-400">
                        {" "}
                        &mdash; a second connection of theirs
                      </span>
                    </>
                  ) : (
                    <>
                      {merge.sourceName}
                      <span className="text-steel-400"> is </span>
                      {nameOf.get(merge.mergedInto) ?? "somebody no longer on record"}
                    </>
                  )}
                </span>
                {merge.note ? (
                  <span className="text-steel-400">{merge.note}</span>
                ) : null}
                <form action={unmergeIdentity} className="ml-auto">
                  <input type="hidden" name="identityKey" value={merge.identityKey} />
                  <button
                    type="submit"
                    className="font-mono text-xs text-steel-400 hover:text-rust-300"
                  >
                    undo
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-steel-400">
            Nothing has been joined by hand. Every person below is grouped
            exactly as the server grouped them.
          </p>
        )}

        <p className="mt-3 max-w-2xl text-sm leading-snug text-steel-400">
          Two people who share a connection are one identity here and cannot be
          separated: the archive holds nothing that tells them apart. That one
          needs the telemetry to stop keying on the address.
        </p>
      </section>

      {/*
        Two people under one name, before the list rather than inside it.
        Everything that finds a person by name has to pick one of them, and a
        player page is found by name, so this is worth acting on rather than
        noticing.
      */}
      {colliding.length > 0 ? (
        <p className="mt-4 border-l-2 border-rust-500 px-3 py-1 text-xs leading-relaxed text-steel-200">
          More than one person is shown as{" "}
          <span className="text-steel-100">{colliding.join(", ")}</span>. A player
          page is reached by name, so one of them is unreachable. Give each a
          name of their own below, or join them if they are the same person.
        </p>
      ) : null}

      {multiNamed.length > 0 ? (
        <p className="mt-4 text-xs text-steel-500">
          {multiNamed.length}{" "}
          {multiNamed.length === 1 ? "person has" : "people have"} played under
          more than one name.
        </p>
      ) : null}

      {/*
        Two columns on a wide screen, because this is fifteen rows and grows by
        one every time somebody new turns up. One column ran the page to twice
        the height of everything else on it for no reason: a row is a name, a
        line about it and a box, none of which wants the full width.
      */}
      <ul className="mt-3 grid gap-x-8 lg:grid-cols-2">
        {identities.map((entry) => (
          <li
            key={entry.identityKey}
            className={
              "border-b border-basalt-800 px-2 py-2 " +
              (entry.names.length > 1 ? "bg-rust-500/[0.04]" : "")
            }
          >
            <form
              action={setDisplayName}
              className="flex flex-wrap items-center gap-x-3 gap-y-2"
            >
              <input type="hidden" name="identityKey" value={entry.identityKey} />

              <span className="min-w-0 flex-1">
                <span className="block text-base text-steel-100">
                  {/*
                    Straight to the page this name decides. Renaming somebody
                    without being able to look at them was the gap: the name is
                    a judgement about a person, and their record is the thing
                    that says who they are.
                  */}
                  {hasPage.has(entry.displayName.toLocaleLowerCase("en-US")) ? (
                    <Link
                      href={`/players/${encodeURIComponent(entry.displayName)}`}
                      className="hover:text-rust-300"
                    >
                      {entry.displayName}
                    </Link>
                  ) : (
                    entry.displayName
                  )}
                  {entry.chosen ? (
                    <span className="ml-2 font-mono text-xs uppercase tracking-wider text-rust-400">
                      set
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-sm text-steel-400">
                  {entry.names.length > 1 ? (
                    <>known as {entry.names.join(", ")}</>
                  ) : (
                    <span className="text-steel-500">one name only</span>
                  )}
                  {entry.serverKeys > 1 ? (
                    <span className="text-oxide-400">
                      {" "}
                      · {entry.serverKeys} identities joined
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block font-mono text-xs tabular-nums text-steel-500">
                  {entry.matchesPlayed}{" "}
                  {entry.matchesPlayed === 1 ? "match" : "matches"}
                  {entry.lastSeen ? ` · ${dayLabel(entry.lastSeen)}` : ""}
                </span>
              </span>

              <input
                name="displayName"
                type="text"
                defaultValue={entry.chosen ? entry.displayName : ""}
                placeholder={entry.displayName}
                aria-label={`Display name for ${entry.displayName}`}
                className="w-36 shrink-0 rounded-sm border border-basalt-600 bg-basalt-850 px-2 py-1 text-sm text-steel-100 placeholder:text-steel-700 focus:border-rust-500 focus:outline-none"
              />
              <button
                type="submit"
                className="shrink-0 rounded-sm border border-basalt-600 px-3 py-1 font-display text-xs uppercase tracking-wider text-steel-300 hover:border-rust-500 hover:text-rust-300"
              >
                Save
              </button>
            </form>

            {/*
              Unpinning, as a button rather than a piece of folklore.
              Going back to the most used name meant clearing the box and
              saving, which is written in a paragraph at the top of the section
              and nowhere near the row it applies to. A separate form because a
              form cannot be nested inside another one.
            */}
            {entry.chosen ? (
              <form action={setDisplayName} className="mt-1">
                <input type="hidden" name="identityKey" value={entry.identityKey} />
                <input type="hidden" name="displayName" value="" />
                <button
                  type="submit"
                  className="font-mono text-xs text-steel-500 hover:text-rust-300"
                  title="Go back to the name they have used most"
                >
                  unset
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
