/**
 * Reading a command line flag that npm may have eaten.
 *
 * **`npm run <script> -- --go` does not pass `--go` to the script on Windows.**
 * npm parses anything after `--` that looks like one of its own options, warns
 * `Unknown cli config "--go"`, and drops it. Proven on this machine:
 *
 *     > npm run rfl -- somefile.rfl --go
 *     npm warn Unknown cli config "--go".
 *     > node scripts/inspect-level.mjs somefile.rfl        <- no --go
 *
 * Every destructive script here is dry-run by default and writes only with
 * `--go`, so the failure mode is the worst kind available: the run that was
 * meant to change something prints its dry-run report, says nothing was
 * written, exits 0, and looks exactly like a successful no-op. `refs:push`,
 * `apply:welcome` and `map:remove` were all reading `process.argv` alone and
 * had been silently refusing to act under PowerShell.
 *
 * This is the same shape as the `--base` bug already recorded in the handover,
 * where npm ate `--base <url>` from `vet:pages`, the script fell back to
 * localhost, and it printed a clean bill of health for a dev server while
 * appearing to check production. **When a check is run wrongly it reports
 * success**, and that is twice now from the same cause.
 *
 * What npm swallows it re-exposes as `npm_config_<name>`, so that is read as
 * well. The environment is only consulted when npm actually invoked us, keyed
 * on `npm_lifecycle_event`, so an unrelated `npm_config_go` left in somebody's
 * shell can never be the thing that turns writing on.
 */

/** True when npm is the one running this script, so its variables are ours. */
function underNpm() {
  return Boolean(process.env.npm_lifecycle_event);
}

/**
 * A boolean flag, from the command line or from what npm did with it.
 *
 * `--go` on the command line and `npm_config_go=true` both count. Nothing else
 * does: npm records a bare flag as the string "true", and treating any other
 * value as truthy would let `npm_config_go=false` enable a live run.
 */
export function flag(name) {
  if (process.argv.includes(`--${name}`)) return true;
  if (!underNpm()) return false;
  return process.env[`npm_config_${name}`] === "true";
}

/**
 * A flag that carries a value: `--kind=map`.
 *
 * Only the `=` form is supported, and that is a deliberate limit rather than an
 * oversight. Written with a space, npm records the flag as `true` and passes
 * the value on as though it were a positional argument, so `--kind map` would
 * arrive as a path called `map`. There is nothing left to recover, so callers
 * should refuse that form by name rather than guess.
 */
export function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);

  if (underNpm()) {
    const fromNpm = process.env[`npm_config_${name}`];
    // "true" means npm saw the bare flag with its value split off, which is the
    // space form above and is not a value.
    if (fromNpm && fromNpm !== "true") return fromNpm;
  }

  return fallback;
}

/**
 * Positional arguments, with anything flag-shaped removed.
 *
 * npm usually strips the flags before we see them, but a run from bash or from
 * plain `node` does not, so both have to be handled or the same command means
 * two different things depending on the shell it was typed into.
 */
export function positionals() {
  return process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
}

/**
 * One line naming what was actually understood, for the script to print first.
 *
 * The whole failure this module exists for is invisible, so the defence is to
 * say out loud what the run resolved to. An operator who typed `--go` and reads
 * `go=no` has been told, which is the difference between a bug and a surprise.
 */
export function describeFlags(values) {
  return Object.entries(values)
    .map(([key, value]) => {
      if (value === true) return `${key}=yes`;
      if (value === false) return `${key}=no`;
      return `${key}=${value ?? "(none)"}`;
    })
    .join("  ");
}
