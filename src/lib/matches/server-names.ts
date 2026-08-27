/**
 * What to call a server on screen, as opposed to what it is called in the data.
 *
 * `RF_SERVER_NAME` on the VPS is an identity, not a label. The website upserts
 * matches on `(server, source_match_id)` and the deathmatch cleanup filters on
 * the same string, so renaming it at source does not rename anything: it forks
 * the archive. The `.env.rf4u` comment records the arithmetic, checked on
 * 6 August 2026 -- 35 matches would have come back as new, and the sweep that
 * removes duplicates would have skipped the old ones because it looks for this
 * very value.
 *
 * There is a second trap behind that one. `sync_pings` is keyed on the same
 * string, and `quietSince` treats any server that stops calling in as a fault
 * until somebody deletes its row. A rename would therefore leave the old name
 * silent forever, holding health red and mailing a failure every six hours,
 * while the new name synced perfectly beside it.
 *
 * So the identity stays and the presentation moves. A label is a fact about how
 * we write a name down; it can change as often as anybody likes and nothing
 * downstream cares.
 *
 * An unmapped identity is returned unchanged rather than hidden or prefixed,
 * because a server nobody has renamed is not an error and its own name is the
 * best thing to call it.
 *
 * Deliberately free of imports so `node --test` can load it directly.
 */

/**
 * Identity as stored, to the name a person should read.
 *
 * Keyed case-insensitively on the stored value. Add a line here to rename a
 * server anywhere it is displayed; never edit `RF_SERVER_NAME` on the VPS.
 *
 * Both servers are here, and for the same reason: each was renamed in its own
 * `.toml`, which is the name players see in the browser, while the stored name
 * stayed put because it is an identity. `RF_SERVER_NAME` on the VPS is the value
 * the archive upserts on, so it can never follow a rename; this map is how the
 * two are kept looking the same without touching it.
 */
const LABELS: Record<string, string> = {
  "rf4u competitive [match]": "RedFaction4You.com (Match)",
  "redfaction4you.com [dm]": "RedFaction4You.com (Themed)",
};

/**
 * The deathmatch archive stores its server with a `dm:` prefix.
 *
 * `archive_days` namespaces the two games that way so a deathmatch night and a
 * capture night on the same date are separate rows. The prefix is routing and
 * has no business on a page, so it is stripped before the lookup and not put
 * back: the label is expected to say which game it is.
 */
const DM_PREFIX = "dm:";

/** What to call this server on screen. */
export function serverLabel(identity: string): string {
  const bare = identity.startsWith(DM_PREFIX)
    ? identity.slice(DM_PREFIX.length)
    : identity;

  return LABELS[bare.toLocaleLowerCase("en-US")] ?? bare;
}

/** Every rename in force, for a page that wants to show the mapping. */
export function renamedServers(): { identity: string; label: string }[] {
  return Object.entries(LABELS).map(([identity, label]) => ({ identity, label }));
}
