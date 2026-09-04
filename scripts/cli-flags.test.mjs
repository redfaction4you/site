/**
 * The flag rescue, and a guard against the next script that forgets it.
 *
 * `npm run <script> -- --go` does not pass `--go` to the script on Windows. npm
 * treats it as one of its own options, warns `Unknown cli config "--go"`, and
 * drops it. Proven on this machine on 3 September 2026:
 *
 *     > npm run rfl -- somefile.rfl --go
 *     npm warn Unknown cli config "--go".
 *     > node scripts/inspect-level.mjs somefile.rfl
 *
 * Every destructive script here is dry-run by default, so the run that was
 * meant to write prints its dry-run report, says nothing was written, and exits
 * 0. It is indistinguishable from a successful no-op. Three scripts were doing
 * this silently before it was noticed: refs:push, apply:welcome and map:remove.
 *
 * The second test is the important one. It reads the other scripts and fails if
 * any of them goes back to reading a flag straight off argv, because that is
 * exactly the change somebody makes while adding a new option and never sees
 * fail.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describeFlags, flag, option, positionals } from "./cli-flags.mjs";

const SCRIPTS = path.join(import.meta.dirname);

/** Runs a body with a pretend argv and environment, then puts them back. */
function withCli(argv, env, body) {
  const realArgv = process.argv;
  const realEnv = process.env;
  process.argv = ["node", "script.mjs", ...argv];
  process.env = { ...realEnv, ...env };
  try {
    body();
  } finally {
    process.argv = realArgv;
    process.env = realEnv;
  }
}

test("a flag on the command line is read, the way bash delivers it", () => {
  withCli(["maps", "--go"], {}, () => {
    assert.equal(flag("go"), true);
    assert.equal(flag("publish"), false);
  });
});

test("a flag npm swallowed is still read, which is the whole point", () => {
  // What PowerShell actually produces: argv has the path only, and npm
  // re-exposes the flag it ate as npm_config_go.
  withCli(["maps"], { npm_lifecycle_event: "ingest", npm_config_go: "true" }, () => {
    assert.equal(flag("go"), true);
  });
});

test("a stray shell variable cannot turn writing on", () => {
  // Same variable, but npm did not invoke us, so it is somebody's leftover
  // environment rather than a flag they typed.
  withCli(["maps"], { npm_config_go: "true", npm_lifecycle_event: undefined }, () => {
    assert.equal(flag("go"), false);
  });
});

test("only the string true counts, so npm_config_go=false cannot enable a run", () => {
  withCli(["maps"], { npm_lifecycle_event: "ingest", npm_config_go: "false" }, () => {
    assert.equal(flag("go"), false);
  });
  withCli(["maps"], { npm_lifecycle_event: "ingest", npm_config_go: "1" }, () => {
    assert.equal(flag("go"), false);
  });
});

test("a value option is read from either place, in its equals form", () => {
  withCli(["--kind=asset"], {}, () => assert.equal(option("kind"), "asset"));
  withCli([], { npm_lifecycle_event: "ingest", npm_config_kind: "asset" }, () => {
    assert.equal(option("kind"), "asset");
  });
  withCli([], {}, () => assert.equal(option("kind", "map"), "map"));
});

test("the space form is not rescued, because there is nothing left to rescue", () => {
  /*
   * `--kind asset` makes npm record the flag as "true" and pass `asset` on as a
   * positional, so the value and the flag have already come apart by the time
   * the script runs. Returning the fallback is right: a caller that guessed
   * here would file every item under the wrong shelf.
   */
  withCli(["asset"], { npm_lifecycle_event: "ingest", npm_config_kind: "true" }, () => {
    assert.equal(option("kind", "map"), "map");
  });
});

test("positionals drop anything flag-shaped, whichever shell delivered it", () => {
  withCli(["maps", "--go", "other"], {}, () => {
    assert.deepEqual(positionals(), ["maps", "other"]);
  });
  withCli(["maps"], {}, () => assert.deepEqual(positionals(), ["maps"]));
});

test("the resolved options print in a form an operator can check", () => {
  assert.equal(
    describeFlags({ kind: "map", author: null, go: false, publish: true }),
    "kind=map  author=(none)  go=no  publish=yes",
  );
});

/*
 * The guard. Everything above tests the helper; this tests that the helper is
 * actually used, which is the part that decays.
 */
test("no script reads a --go style flag straight off argv", () => {
  const offenders = [];
  for (const name of readdirSync(SCRIPTS)) {
    if (!name.endsWith(".mjs") || name.endsWith(".test.mjs")) continue;
    if (name === "cli-flags.mjs") continue;

    const source = readFileSync(path.join(SCRIPTS, name), "utf8");
    const lines = source.split("\n");
    lines.forEach((line, index) => {
      // A comment explaining why NOT to do this is not an offence.
      const code = line.split("//")[0];
      if (/argv[\s\S]*\.includes\(\s*["'`]--/.test(code)) {
        offenders.push(`${name}:${index + 1}  ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(
    offenders,
    [],
    "These read a flag from argv, which npm strips on Windows, so the run that\n" +
      "was meant to act would report a dry run and change nothing:\n  " +
      offenders.join("\n  ") +
      '\n\nUse flag("go") from ./cli-flags.mjs instead.',
  );
});
