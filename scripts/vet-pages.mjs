/**
 * Vets the pages, not the data.
 *
 *   npm run vet:pages                                    # a local dev server
 *   npm run vet:pages -- https://redfaction4you.com      # production
 *   npm run vet:pages -- 2026-07-31                      # one night
 *
 * **Pass the URL bare, not as `--base`.** npm swallows `--base` as one of its
 * own flags before this script ever sees it, so `-- --base <url>` silently vets
 * localhost instead. `node scripts/vet-pages.mjs --base <url>` still works.
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

/*
 * A URL is a base URL however it arrives, and anything else is an error.
 *
 * `--base` used to be the only way to say it, and there is one thing wrong with
 * that: `npm run vet:pages -- --base https://redfaction4you.com`, which is what
 * the docs said, does not work. npm parses `--base` as one of its own config
 * flags, warns about it on a line nobody reads, and passes the bare URL through.
 * This script then ignored the positional argument and vetted localhost, and
 * printed "0 disagreements on http://localhost:3000" in letters small enough to
 * be taken for the production run that was asked for.
 *
 * So a bare URL is now the base, `--base` still works for anybody with it in
 * their fingers, and an argument that is neither a URL nor a date stops the run
 * rather than being dropped. The failure mode this whole script exists to catch
 * is a confident number about the wrong thing; it should not have one of its own.
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const URL_LIKE = /^https?:\/\//i;

let base = null;
let only = null;
let isRetry = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === "--retry") {
    isRetry = true;
    continue;
  }

  if (arg === "--base") {
    base = args[++i];
    if (!base) {
      console.error("--base needs a URL after it.");
      process.exit(2);
    }
    continue;
  }

  if (URL_LIKE.test(arg)) {
    base = arg;
    continue;
  }

  if (DATE.test(arg)) {
    only = arg;
    continue;
  }

  console.error(
    `Unrecognised argument: ${arg}\n` +
      "Expected a base URL (http:// or https://), a date as YYYY-MM-DD, or neither.",
  );
  process.exit(2);
}

const BASE = (base ?? "http://localhost:3000").replace(/\/$/, "");

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
  // A zero is drawn as a dash, and the tables use a real en dash rather than the
  // entity, so it never passes through `decode`.
  if (cleaned === "" || cleaned === "-" || cleaned === "–") return 0;
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
  const line = /(\d[\d,]*) match(?:es)? · (\d[\d,]*) players? · (\d[\d,]*) frags · (\d[\d,]*) captures/.exec(
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

/* --- the pages that total the whole archive -------------------------------- */

/**
 * `/players` and `/matches/maps` against the nights they are made of.
 *
 * Every night page carries the frags and captures of that night, and these two
 * pages carry the same quantities cut a different way: by person and by level.
 * Three cuts of one set of rows, so they have to agree, and none of the checks
 * needs to know what the right answer is.
 *
 * This is the cut that was missing when the night page was found wrong. The
 * scoreboard there was unfiltered while the header beside it was filtered, and
 * nothing compared either against the boards, which were filtered. Any one of
 * the three disagreeing now says so.
 */
async function vetTotalsPages(nights, archiveMatches) {
  const html = await page("/players");
  const board = tables(html).find(
    (table) => table.headings.includes("Matches") && table.headings.includes("Frags"),
  );

  if (!board) {
    fail("/players", "could not find the player table");
  } else {
    const at = (label) => board.headings.indexOf(label);
    let frags = 0;
    let caps = 0;

    for (const row of board.rows) {
      frags += number(row[at("Frags")]) ?? 0;
      caps += number(row[at("Caps")]) ?? 0;

      const played = number(row[at("Matches")]) ?? 0;
      if (archiveMatches !== null && played > archiveMatches) {
        fail(
          "/players",
          `${row[0]} is credited with ${played} matches from an archive of ${archiveMatches}`,
        );
      }
    }

    if (frags !== nights.frags) {
      fail(
        "/players",
        `the players total ${frags} frags, the nights total ${nights.frags}`,
      );
    }
    if (caps !== nights.captures) {
      fail(
        "/players",
        `the players total ${caps} captures, the nights total ${nights.captures}`,
      );
    }

    // `/stats` is the same set of people ranked, so it should be the same
    // number of them.
    const stats = text(await page("/stats"));
    const counted = /(\d[\d,]*) players?/.exec(stats);
    if (counted && number(counted[1]) !== board.rows.length) {
      fail(
        "/stats",
        `the header says ${counted[1]} players, /players lists ${board.rows.length}`,
      );
    }
    checked.push("/players", "/stats");
  }

  /*
   * The maps index, which is the archive cut by level. Read from the cards
   * rather than the page text so a map whose name contains a number cannot be
   * mistaken for a count.
   */
  const mapsHtml = await page("/matches/maps");
  const anchors = [
    ...mapsHtml.matchAll(/<a[^>]*href="\/matches\/map\/([^"]*)"[\s\S]*?<\/a>/g),
  ];
  const cards = anchors.map((match) => text(match[0]));
  const slugs = anchors.map((match) => match[1]);

  if (cards.length === 0) {
    fail("/matches/maps", "could not find any maps");
    return;
  }

  let mapMatches = 0;
  let mapCaptures = 0;
  const perMap = [];
  for (const [index, card] of cards.entries()) {
    const counts = /(\d[\d,]*) match(?:es)? · (\d[\d,]*) captures?/.exec(card);
    if (!counts) {
      fail("/matches/maps", `could not read the figures for ${card.slice(0, 40)}`);
      continue;
    }
    mapMatches += number(counts[1]) ?? 0;
    mapCaptures += number(counts[2]) ?? 0;
    perMap.push({
      slug: slugs[index],
      matches: number(counts[1]),
      captures: number(counts[2]),
    });
  }

  // And the page behind every card, which is where the figures are read.
  for (const card of perMap) {
    if (card.slug) await vetMapPage(card.slug, card);
  }

  if (archiveMatches !== null && mapMatches !== archiveMatches) {
    fail(
      "/matches/maps",
      `the maps total ${mapMatches} matches, the archive says ${archiveMatches}`,
    );
  }
  if (mapCaptures !== nights.captures) {
    fail(
      "/matches/maps",
      `the maps total ${mapCaptures} captures, the nights total ${nights.captures}`,
    );
  }

  checked.push("/matches/maps");
}

/**
 * One map's own page, against the index row that points at it.
 *
 * The index already has to agree with the nights; this checks that the page
 * behind each card agrees with the card, and that the page agrees with itself.
 * Everything here is a figure that appears twice in different forms, which is
 * the only kind of check this file makes: captures as a total and as an average
 * of the matches it counts, wins as a split and as a decided count, and the
 * player table's own captures against the map's.
 *
 * Written first as a throwaway during an audit, where it caught a usual length
 * that rounded twice and read a second longer than the matches it averaged.
 */
async function vetMapPage(slug, card) {
  const where = `/matches/map/${slug}`;
  const html = await page(where);
  const body = text(html);

  const read = (label, pattern) => {
    const found = pattern.exec(body);
    if (!found) {
      fail(where, `could not read ${label}`);
      return null;
    }
    return number(found[1]);
  };

  const matches = read("matches", /Matches (\d[\d,]*)/);
  const captures = read("captures", /Captures (\d[\d,]*) ·/);
  const perMatch = read("captures a match", /Captures \d[\d,]* · ([\d.]+) a match/);

  if (matches !== null && card.matches !== null && matches !== card.matches) {
    fail(where, `says ${matches} matches, the maps index says ${card.matches}`);
  }
  if (captures !== null && card.captures !== null && captures !== card.captures) {
    fail(where, `says ${captures} captures, the maps index says ${card.captures}`);
  }
  if (matches && captures !== null && perMatch !== null) {
    const worked = Number((captures / matches).toFixed(1));
    if (worked !== perMatch) {
      fail(where, `says ${perMatch} captures a match, ${captures} over ${matches} is ${worked}`);
    }
  }

  /*
   * The same captures, counted per person instead of per match.
   *
   * This list is an `ol` of rows rather than a `table`, so it is read row by row
   * here: rank, name, played, score, frags, deaths, captures, returns, accuracy,
   * streak, and a best run where the map has one. A name can contain spaces and
   * punctuation, which is why the name is the one lazy field and everything
   * after it is anchored to the shape of the numbers.
   */
  const list = [...html.matchAll(/<ol[\s\S]*?<\/ol>/g)].find((match) =>
    match[0].includes('href="/players/'),
  );

  if (list) {
    const rows = [...list[0].matchAll(/<li[\s\S]*?<\/li>/g)].map((row) => text(row[0]));
    let tableCaps = 0;
    let read = 0;
    for (const row of rows) {
      // Dashes are en dashes, and an accuracy can carry an asterisk marking
      // matches left out of it.
      const cells =
        /^\d+ .+? (\d+) (\d+) (\d+) (\d+) (\d+|[-–]) (\d+|[-–]) (?:[\d.]+%|[-–])\s*\*?/.exec(
          row,
        );
      if (!cells) {
        fail(where, `could not read the row "${row.slice(0, 40)}"`);
        continue;
      }
      read += 1;
      tableCaps += number(cells[5]) ?? 0;
    }
    if (read > 0 && captures !== null && tableCaps !== captures) {
      fail(where, `the header says ${captures} captures, the players total ${tableCaps}`);
    }
  } else if (matches) {
    fail(where, "could not find the player list");
  }

  // A decided match was won by one side or the other.
  const split = /How it goes (\d+) \/ (\d+)/.exec(body);
  const drawn = /· (\d+) drawn/.exec(body);
  if (split && matches !== null) {
    const decided = number(split[1]) + number(split[2]) + (drawn ? number(drawn[1]) : 0);
    if (decided !== matches) {
      fail(where, `${split[1]} red, ${split[2]} blue${drawn ? ` and ${drawn[1]} drawn` : ""} is ${decided} of ${matches} matches`);
    }
  }

  checked.push(where);
}

/* --- the archive index ---------------------------------------------------- */

async function vetIndex() {
  const html = await page("/matches");
  const body = text(html);

  const days = [...new Set([...html.matchAll(/\/matches\/(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]))];
  if (days.length === 0) throw new Error("no nights linked from /matches");

  const headline = /(\d[\d,]*) match(?:es)? · (\d[\d,]*) nights?/.exec(body);
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
const nights = { frags: 0, captures: 0 };
for (const day of days) {
  const header = await vetNightPage(day);
  if (!header) continue;
  counted += header.matches;
  nights.frags += header.frags;
  nights.captures += header.captures;
}

/*
 * The whole-archive pages, only on a whole-archive run. Comparing every
 * player's career total against one night's frags would fail on arithmetic
 * rather than on anything being wrong.
 */
if (!only) {
  await vetTotalsPages(nights, index.totals?.matches ?? null);
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

/*
 * A disagreement is read twice before it is believed.
 *
 * This reads nineteen pages one after another over HTTP, and the VPS syncs
 * every fifteen minutes. A sync landing between the fetch of `/players` and the
 * fetch of the nights it is compared against produces exactly the output a real
 * bug produces: two totals that differ by about one match. It has happened
 * here, twice: a run reporting 6,691 frags against 6,838 was followed by two
 * consecutive clean runs on the same deployment with nothing changed.
 *
 * The archive moving is not a fault in the pages and must not fail a build.
 * `vet-live` runs on a schedule with nobody watching, and a check that cries
 * wolf every few days is a check people learn to ignore, which is worse than
 * not having it. A real disagreement is still there on the second reading; a
 * sync is not.
 *
 * Re-run rather than re-read in place, because the whole file is one top to
 * bottom pass and a second pass through it is a second process. `--retry` is
 * what stops that going on forever.
 */
if (problems.length > 0 && !isRetry) {
  console.log(
    `\n${problems.length} ${problems.length === 1 ? "disagreement" : "disagreements"} on the first reading. ` +
      "Reading again, in case the archive moved during it.\n",
  );

  const again = spawnSync(process.execPath, [process.argv[1], ...args, "--retry"], {
    stdio: "inherit",
  });
  process.exit(again.status ?? 1);
}

for (const problem of problems) {
  console.log(`  ! ${problem.where}`);
  console.log(`    ${problem.detail}`);
}

console.log(
  `\n${checked.length} ${checked.length === 1 ? "page" : "pages"} read on ${BASE}: ` +
    `${problems.length} ${problems.length === 1 ? "disagreement" : "disagreements"}` +
    `${isRetry ? ", on a second reading" : ""}.\n`,
);

process.exit(problems.length > 0 ? 1 : 0);
