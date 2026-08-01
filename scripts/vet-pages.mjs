/**
 * Vets the pages, not the data.
 *
 *   npm run vet:pages                                    # a local dev server
 *   npm run vet:pages -- --base https://redfaction4you.com
 *   npm run vet:pages -- 2026-07-31                      # one night
 *
 * `npm run vet` reads the archive and asks whether it contradicts itself. This
 * reads the rendered page and asks whether it contradicts itself, which is a
 * different question with a worse failure mode: the data can be perfectly
 * consistent and the page still wrong, because a figure on it was queried one
 * way and the table under it another.
 *
 * That is what happened. `MATCH_COMPLETED` was applied to a night's totals and
 * not to the scoreboard beneath them, so the header of 31 July read 2,090 frags
 * above rows that summed to 2,102, and everybody's attendance read "8 / 8" for
 * a night of seven matches. Nothing in the database was wrong. Both figures came
 * from correct rows. A person spotted it.
 *
 * So the checks here are agreements rather than values: a number that appears
 * twice on a page has to be the same number both times, and a total has to equal
 * the rows it is a total of. None of them needs to know what the right answer
 * is, which is what makes them worth keeping.
 *
 * **It reads what the reader reads.** Two rounds of review have been wasted on
 * work verified against localhost while the user was looking at production, so
 * the base URL is printed at the top of every run and belongs in any claim made
 * from it.
 *
 * Read only, over HTTP. It touches no database and can be pointed at anything.
 */

const args = process.argv.slice(2);
const baseArg = args.indexOf("--base");
const BASE = (baseArg >= 0 ? args[baseArg + 1] : "http://localhost:3000").replace(
  /\/$/,
  "",
);
const only = args.find((arg) => /^\d{4}-\d{2}-\d{2}$/.test(arg));

const problems = [];
const checked = [];

/** Anything the page says that the page also contradicts. */
function fail(where, detail) {
  problems.push({ where, detail });
}

async function page(path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { "user-agent": "rf4u-vet-pages" },
  });
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return response.text();
}

/* --- reading a page ------------------------------------------------------- */

const ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&ndash;": "-",
  "&mdash;": "-",
  "&rsquo;": "'",
  "&nbsp;": " ",
  "&middot;": "·",
};

function decode(text) {
  return text.replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity] ?? entity);
}

/** Tags out, whitespace collapsed. What a reader sees, roughly. */
function text(html) {
  return decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * A number as the site prints it. `-` is how a zero is shown in a table, and
 * thousands separators are how a big one is.
 */
function number(cell) {
  const cleaned = cell.replace(/[,\s*]/g, "");
  if (cleaned === "" || cleaned === "-") return 0;
  const value = Number(cleaned.replace("%", ""));
  return Number.isNaN(value) ? null : value;
}

/** Every table on the page, as arrays of cell text, with its headings. */
function tables(html) {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/g)].map((match) => {
    const block = match[0];
    const rows = [...block.matchAll(/<tr[\s\S]*?<\/tr>/g)].map((row) =>
      [...row[0].matchAll(/<t[dh][\s\S]*?<\/t[dh]>/g)].map((cell) => text(cell[0])),
    );
    return { headings: rows[0] ?? [], rows: rows.slice(1) };
  });
}

/* --- the night page ------------------------------------------------------- */

/** "7 matches · 9 players · 2090 frags · 23 captures · 122 min" */
function nightHeader(body) {
  const line = /(\d[\d,]*) matches? · (\d[\d,]*) players? · (\d[\d,]*) frags · (\d[\d,]*) captures/.exec(
    body,
  );
  if (!line) return null;
  return {
    matches: number(line[1]),
    players: number(line[2]),
    frags: number(line[3]),
    captures: number(line[4]),
  };
}

async function vetNightPage(day) {
  const html = await page(`/matches/${day}`);
  const body = text(html);
  const where = `/matches/${day}`;

  const header = nightHeader(body);
  if (!header) {
    fail(where, "could not read the night's header figures");
    return null;
  }

  /*
   * The rows, and which of them are marked as not counting.
   *
   * Row by row rather than by counting the word on the page. The marker also
   * appears in the note explaining it, and that note is written on the match
   * page and carried in the row's tooltip, so a page with one cancelled match
   * says "cancelled" three times. Asking each row about itself is both correct
   * and what a reader does.
   */
  const rows = [...html.matchAll(/<li\b[\s\S]*?<\/li>/g)]
    .map((match) => match[0])
    .filter((row) => new RegExp(`/matches/${day}/\\d+`).test(row));

  const listed = new Set(
    rows.flatMap((row) =>
      [...row.matchAll(new RegExp(`/matches/${day}/(\\d+)`, "g"))].map((m) => m[1]),
    ),
  );
  const cancelled = rows.filter((row) => / cancelled /.test(` ${text(row)} `)).length;
  const counting = listed.size - cancelled;

  if (counting !== header.matches) {
    fail(
      where,
      `the header says ${header.matches} matches, the list shows ${listed.size} of which ` +
        `${cancelled} are marked cancelled, which is ${counting}`,
    );
  }

  const scoreboard = tables(html).find((table) => table.headings.includes("Played"));
  if (!scoreboard) {
    fail(where, "could not find the night's scoreboard");
    return header;
  }

  const column = (label) => scoreboard.headings.indexOf(label);
  const frags = column("Frags");
  const caps = column("Caps");
  const played = column("Played");

  let fragTotal = 0;
  let capTotal = 0;

  for (const row of scoreboard.rows) {
    fragTotal += number(row[frags]) ?? 0;
    capTotal += number(row[caps]) ?? 0;

    // "6 / 7": matches they were in, of the matches there were.
    const attendance = /(\d+)\s*\/\s*(\d+)/.exec(row[played] ?? "");
    if (!attendance) {
      fail(where, `${row[0]} has no attendance figure`);
      continue;
    }
    const [, mine, all] = attendance.map(Number);
    if (all !== header.matches) {
      fail(
        where,
        `${row[0]} is shown as playing ${mine} of ${all} matches on a night the ` +
          `header calls ${header.matches} matches`,
      );
    }
    if (mine > all) {
      fail(where, `${row[0]} is shown as playing ${mine} of ${all} matches`);
    }
  }

  if (scoreboard.rows.length !== header.players) {
    fail(
      where,
      `the header says ${header.players} players, the scoreboard lists ` +
        `${scoreboard.rows.length}`,
    );
  }

  if (fragTotal !== header.frags) {
    fail(
      where,
      `the header says ${header.frags} frags, the scoreboard rows sum to ${fragTotal}`,
    );
  }

  if (capTotal !== header.captures) {
    fail(
      where,
      `the header says ${header.captures} captures, the scoreboard rows sum to ${capTotal}`,
    );
  }

  checked.push(where);
  return header;
}

/* --- the archive index ---------------------------------------------------- */

async function vetIndex() {
  const html = await page("/matches");
  const body = text(html);

  const days = [...new Set([...html.matchAll(/\/matches\/(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]))];
  if (days.length === 0) throw new Error("no nights linked from /matches");

  const headline = /(\d[\d,]*) matches? · (\d[\d,]*) nights?/.exec(body);
  if (!headline) fail("/matches", "could not read the archive totals");

  checked.push("/matches");
  return {
    days: days.sort().reverse(),
    totals: headline
      ? { matches: number(headline[1]), nights: number(headline[2]) }
      : null,
  };
}

/* --- run ------------------------------------------------------------------ */

console.log(`\nReading ${BASE}\n`);

const index = await vetIndex();
const days = only ? [only] : index.days;

let counted = 0;
for (const day of days) {
  const header = await vetNightPage(day);
  if (header) counted += header.matches;
}

/*
 * The archive's own total against the nights it is a total of. Only when every
 * night was read, since a single-night run has nothing to compare.
 */
if (!only && index.totals) {
  if (index.totals.nights !== index.days.length) {
    fail(
      "/matches",
      `the header says ${index.totals.nights} nights, the page links to ${index.days.length}`,
    );
  }
  if (index.totals.matches !== counted) {
    fail(
      "/matches",
      `the header says ${index.totals.matches} matches, the nights add up to ${counted}`,
    );
  }
}

for (const problem of problems) {
  console.log(`  ! ${problem.where}`);
  console.log(`    ${problem.detail}`);
}

console.log(
  `\n${checked.length} ${checked.length === 1 ? "page" : "pages"} read on ${BASE}: ` +
    `${problems.length} ${problems.length === 1 ? "disagreement" : "disagreements"}.\n`,
);

process.exit(problems.length > 0 ? 1 : 0);
