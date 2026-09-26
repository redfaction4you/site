/**
 * Builds src/lib/ghost/map-notes.json: who made each Halloween map and what
 * the mapper says about it, for the server ghost.
 *
 *   node scripts/build-map-notes.mjs <authors.json>
 *
 * The input is FactionFiles' autodownload record for each map in the rotation
 * (filename, title, author, description). The owner, 26 September 2026: "not
 * all of them have real descriptions, sometimes its the uploader or a default
 * but sometimes the mapper writes info about the map which is nice to see,
 * like the story behind it, the lore in it, theme, size". So boilerplate is
 * dropped, email addresses and links are stripped (nobody's contact details go
 * to a model), readme clutter goes, and what the mapper actually wrote stays.
 *
 * `about` is a line for lists; `story` is the fuller text, sent only for the
 * map being played or a map somebody names, to go easy on the free allowance.
 */
import fs from "node:fs";

const [input] = process.argv.slice(2);
if (!input) {
  console.error("usage: node scripts/build-map-notes.mjs <authors.json>");
  process.exit(1);
}

const ascii = (text) =>
  String(text ?? "")
    .normalize("NFKD")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "");

/** Readme fields that say nothing about the map itself. */
const CLUTTER =
  /^(title|version|release date|filename|file name|author\(s\)|author|email( address)?|e-mail|url|web ?site|homepage|game|level name|single player|cooperative|difficulty settings|new sounds|new textures|new music|new graphics|known bugs|build time|editor\(s\) used|construction|base|other files|installation|copyright|permissions|you may|distribution|deathmatch|capture the flag|team deathmatch|unzip|extract|install|place the|put the|copy the|to play)\b.*$/i;

export function cleanDescription(raw) {
  let text = ascii(raw);
  text = text.replace(/\[\/?[a-z]+[^\]]*\]/gi, " "); // BBCode: [tt], [i], [url=...]
  text = text.replace(/\bthis file was auto-imported from the l4y[^.]*\.?/gi, " ");
  text = text.replace(/the following description was auto-imported from a text file included with the map:?/gi, " ");
  text = text.replace(/no description was provided for this [a-z]+\.?/gi, " ");
  text = text.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, " "); // email addresses
  text = text.replace(/\b(https?:\/\/|www\.)\S+/gi, " "); // links
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^[=\-_*#~.]{3,}$/.test(line) && !CLUTTER.test(line))
    .map((line) => line.replace(/^-{2,}\s*(.+?)\s*-{2,}$/, "$1:").replace(/\s*:\s*\t+\s*/g, ": ").replace(/\t+/g, " "))
    .filter((line) => !/:\s*$/.test(line) || line.length > 25); // an empty "Field:" line
  // Legal small print ("may NOT be modified without the author's express permission") is not the map.
  const sentences = lines.join(" ").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
  return sentences.filter((sentence) => !/permission|modif|distribut|copyright|may not|as a base|all rights|not allowed|commercial|no changes made/i.test(sentence)).join(" ").trim();
}

function cut(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 3).replace(/\s+\S*$/, "")}...`;
}

const maps = JSON.parse(fs.readFileSync(input, "utf8"));
const notes = {};
let withStory = 0;
for (const map of maps) {
  const story = cleanDescription(map.description);
  // Too short to say anything, or only the map's own title back.
  const real = story.length >= 12 && story.toLowerCase() !== String(map.title ?? "").toLowerCase();
  if (real) withStory += 1;
  notes[String(map.filename).toLowerCase()] = {
    author: ascii(map.author).replace(/\s+/g, " ").trim(),
    about: real ? cut(story, 220) : "",
    story: real && story.length > 220 ? cut(story, 700) : "",
  };
}
fs.writeFileSync("src/lib/ghost/map-notes.json", `${JSON.stringify(notes, null, 1)}\n`);
console.log(`${maps.length} maps, ${withStory} with something the mapper wrote`);
