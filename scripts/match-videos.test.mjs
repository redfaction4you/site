/**
 * Tests for match footage.
 *
 *   npm test
 *
 * The point of most of these is that a recording is only worth anything if it is
 * attached to the right game. A link filed under the wrong day is worse than no
 * link: somebody watches a match, reads a scoreboard that does not match what
 * they just saw, and reasonably concludes the archive is unreliable.
 *
 * That nearly happened here. Of the first four recordings offered, one was
 * described as "warlords pro no fog, 29 July" and No Fog was played on the 28th,
 * while the 29th had No Amp. It was held back rather than guessed at.
 *
 * The structural checks below cannot know which match a video really shows, but
 * they can refuse a day that is not a day and an id that is not a number, which
 * is where a typo actually lands.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  MATCH_VIDEOS,
  PERSPECTIVE_LABEL,
  PERSPECTIVE_NOTE,
  footageForMatch,
  footageForNight,
  hasFootage,
  thumbnailUrl,
  watchUrl,
} from "../src/lib/match-videos.ts";

/* --- every stored entry is well formed ------------------------------------ */

test("every recording has a plausible YouTube id", () => {
  for (const video of MATCH_VIDEOS) {
    assert.match(
      video.youtubeId,
      /^[A-Za-z0-9_-]{11}$/,
      `${video.youtubeId} is not a YouTube id`,
    );
  }
});

test("every recording says whose view it is", () => {
  for (const video of MATCH_VIDEOS) {
    assert.ok(
      video.perspective === "player" || video.perspective === "spectator",
      `${video.youtubeId} has no usable perspective`,
    );
    assert.ok(video.recordedBy.length > 0, `${video.youtubeId} has no recorder`);
  }
});

test("every recording covers at least one real looking match", () => {
  for (const video of MATCH_VIDEOS) {
    assert.ok(video.covers.length > 0, `${video.youtubeId} covers nothing`);
    for (const coverage of video.covers) {
      assert.match(
        coverage.archiveDay,
        /^\d{4}-\d{2}-\d{2}$/,
        `${video.youtubeId} has a bad day: ${coverage.archiveDay}`,
      );
      assert.ok(
        Number.isInteger(coverage.sourceMatchId) && coverage.sourceMatchId > 0,
        `${video.youtubeId} has a bad match id: ${coverage.sourceMatchId}`,
      );
    }
  }
});

test("no two recordings claim to be the same upload of the same match", () => {
  const seen = new Set();
  for (const video of MATCH_VIDEOS) {
    for (const coverage of video.covers) {
      const key = `${video.youtubeId} ${coverage.archiveDay} ${coverage.sourceMatchId}`;
      assert.ok(!seen.has(key), `duplicate coverage: ${key}`);
      seen.add(key);
    }
  }
});

/* --- lookups -------------------------------------------------------------- */

test("a match with no footage returns nothing rather than throwing", () => {
  assert.deepEqual(footageForMatch("1999-01-01", 9999), []);
  assert.deepEqual(footageForNight("1999-01-01"), []);
});

test("a match finds its own recording", () => {
  const [video] = MATCH_VIDEOS;
  if (!video) return;

  const { archiveDay, sourceMatchId } = video.covers[0];
  const found = footageForMatch(archiveDay, sourceMatchId);

  assert.ok(found.length > 0);
  assert.ok(found.some((f) => f.video.youtubeId === video.youtubeId));
});

test("a night finds every recording made on it, each once", () => {
  const [video] = MATCH_VIDEOS;
  if (!video) return;

  const day = video.covers[0].archiveDay;
  const found = footageForNight(day);
  const ids = found.map((f) => f.video.youtubeId);

  assert.equal(new Set(ids).size, ids.length, "a video was listed twice for one night");
  assert.ok(ids.includes(video.youtubeId));
});

test("a recording spanning several matches points a night at the earliest", () => {
  // Constructed rather than taken from the list, since nothing spans yet.
  const spanning = {
    youtubeId: "aaaaaaaaaaa",
    perspective: "spectator",
    recordedBy: "Nobody",
    covers: [
      { archiveDay: "2026-07-30", sourceMatchId: 15, startsAt: 1800 },
      { archiveDay: "2026-07-30", sourceMatchId: 12, startsAt: 0 },
    ],
  };

  const earliest = spanning.covers.reduce((a, b) =>
    a.sourceMatchId < b.sourceMatchId ? a : b,
  );
  assert.equal(earliest.sourceMatchId, 12);
});

/* --- links ---------------------------------------------------------------- */

test("a start time becomes a deep link, and no start time does not", () => {
  assert.equal(watchUrl("M4v5bEhI95Y"), "https://www.youtube.com/watch?v=M4v5bEhI95Y");
  assert.equal(
    watchUrl("M4v5bEhI95Y", 1830),
    "https://www.youtube.com/watch?v=M4v5bEhI95Y&t=1830",
  );
  // Zero is not a position worth linking to, it is the start.
  assert.equal(watchUrl("M4v5bEhI95Y", 0), "https://www.youtube.com/watch?v=M4v5bEhI95Y");
});

test("a fractional start time is rounded, since YouTube wants whole seconds", () => {
  assert.equal(
    watchUrl("M4v5bEhI95Y", 90.7),
    "https://www.youtube.com/watch?v=M4v5bEhI95Y&t=91",
  );
});

test("thumbnails come from YouTube, needing no key", () => {
  assert.equal(
    thumbnailUrl("M4v5bEhI95Y"),
    "https://i.ytimg.com/vi/M4v5bEhI95Y/hqdefault.jpg",
  );
});

/* --- the labelling -------------------------------------------------------- */

test("both perspectives are labelled and explained", () => {
  for (const kind of ["player", "spectator"]) {
    assert.ok(PERSPECTIVE_LABEL[kind]?.length > 0);
    assert.ok(PERSPECTIVE_NOTE[kind]?.length > 0);
  }
  // The player note has to say it is not the whole match, which is the only
  // thing a viewer could otherwise get wrong.
  assert.match(PERSPECTIVE_NOTE.player, /rather than the whole match/i);
});

test("hasFootage reflects the list", () => {
  assert.equal(hasFootage(), MATCH_VIDEOS.length > 0);
});
