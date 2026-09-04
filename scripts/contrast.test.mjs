/**
 * The one house rule with no automatic guard, until now.
 *
 * `globals.css` records a measurement taken on 10 August 2026: `steel-500`,
 * `600` and `700` score 3.82, 3.51 and 3.20 against the page and 3.45, 3.17 and
 * 2.89 on a `.plate`, against a 4.5:1 floor. There is no readable grey below
 * `steel-400` on this background. Lifting the token values was tried and undone,
 * because clearing the floor on a plate needs about `#868279`, which is
 * `steel-400` to the eye, so the four greys collapse into one.
 *
 * **The fix is therefore which token gets used, not what it is worth**: quiet
 * text is `steel-400`, and 500 to 700 are for borders, rules, placeholders and
 * struck-through marks. Nothing enforced that. Nothing under `scripts/` read
 * `src/components` at all, so any new component could reintroduce unreadable
 * body text and every check would stay green, which is how 354 of these got
 * here in the first place.
 *
 * This is a ratchet rather than a sweep. Fixing all 354 at once would restyle
 * most of the site in a commit nobody could review, and the reasoning in
 * `globals.css` says that is the owner's call rather than a tidy-up. So:
 *
 *   1. The downloads section must contain ZERO. It was built clean and must
 *      stay clean.
 *   2. The site-wide count must never rise above what it was when this was
 *      written. It can only go down.
 *
 * When you fix a page, lower BASELINE in the same commit. If this test fails
 * with a number BELOW the baseline, that is the good direction and the fix is
 * to lower the constant, not to raise it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.join(import.meta.dirname, "..", "src");

/**
 * The legitimate uses, and why each one is legitimate.
 *
 * A struck-through client pill in `CompatBadge` is a disabled mark: it says
 * "this one does NOT load the file", and the line through it carries the
 * meaning whether or not the grey is readable. A placeholder is browser
 * furniture inside an input that already has a label. Both are named in the
 * rule in `globals.css` as allowed.
 */
const ALLOWED = /line-through|placeholder:/;

/** Text colour only. `bg-steel-500/[0.04]` and `border-steel-600` are fine. */
const OFFENCE = /(?<![-\w:])text-steel-[567]00/g;

/**
 * Files that must hold none at all.
 *
 * The downloads section, built 3 September 2026 against this rule. Extend this
 * list as other pages are cleaned up, which is how the ratchet tightens beyond
 * the raw count.
 */
const MUST_BE_CLEAN = [
  "components/download-row.tsx",
  "components/catalogue-page.tsx",
  "components/item-detail.tsx",
  "components/item-gallery.tsx",
  "components/item-updates.tsx",
  "app/downloads/page.tsx",
  "app/assets/page.tsx",
  "app/assets/[slug]/page.tsx",
  "app/maps/page.tsx",
  "app/maps/[slug]/page.tsx",
];

/**
 * Measured 3 September 2026, with the downloads section already clean.
 *
 * Lower this when you fix a page. Never raise it.
 */
const BASELINE = 344;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Every offending line in one file, with its line number. */
function offencesIn(file) {
  const found = [];
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (ALLOWED.test(line)) return;
    const matches = line.match(OFFENCE);
    if (matches) found.push({ line: index + 1, count: matches.length, text: line.trim() });
  });
  return found;
}

const files = walk(SRC);

test("the downloads section uses no grey that cannot be read", () => {
  for (const relative of MUST_BE_CLEAN) {
    const full = path.join(SRC, ...relative.split("/"));
    let found;
    try {
      found = offencesIn(full);
    } catch {
      // A file in the list that no longer exists is a rename, and a stale entry
      // here would quietly stop guarding a real file. Fail loudly instead.
      assert.fail(
        `${relative} is in MUST_BE_CLEAN but could not be read. If it moved, update the list.`,
      );
    }
    assert.equal(
      found.length,
      0,
      `${relative} uses unreadable grey as text:\n` +
        found.map((f) => `  line ${f.line}: ${f.text}`).join("\n") +
        `\n\nQuiet text is text-steel-400. steel-500, 600 and 700 are for borders, rules and placeholders.`,
    );
  }
});

test("the rest of the site does not get worse", () => {
  let total = 0;
  const worst = [];
  for (const file of files) {
    const found = offencesIn(file);
    const count = found.reduce((sum, f) => sum + f.count, 0);
    if (count) worst.push([path.relative(SRC, file), count]);
    total += count;
  }

  worst.sort((a, b) => b[1] - a[1]);

  assert.ok(
    total <= BASELINE,
    `Unreadable grey used as text rose from ${BASELINE} to ${total}.\n` +
      `Worst files:\n` +
      worst.slice(0, 8).map(([f, n]) => `  ${n.toString().padStart(3)}  ${f}`).join("\n") +
      `\n\nQuiet text is text-steel-400.`,
  );

  // Says so out loud when the number improves, because a ratchet nobody tightens
  // is just a number that used to be true.
  if (total < BASELINE) {
    console.log(
      `\n  contrast: ${total} uses, below the baseline of ${BASELINE}. ` +
        `Lower BASELINE in scripts/contrast.test.mjs to lock the improvement in.\n`,
    );
  }
});
