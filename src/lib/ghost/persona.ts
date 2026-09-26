/**
 * Who the ghost on a server is, and what it is asked to say.
 *
 * Asked for on 25 September 2026: a friendly ghost who hangs out in the
 * Halloween server and is a friend to whoever is there. Refined the same
 * night: "if someone joins, it should reach out to that user 'hey playername'.
 * if they reply, continue. 'hows it going'. be chill. relaxed. be a friend."
 * Its name is not "ghost" because a player on the server is called that.
 *
 * And on 26 September: it should know the game, its maps and who made them,
 * and remember people between chats. Asked "do you like acers maps?" on
 * MysticaL-AceR's own map, it had said it did not know who Acer was. So every
 * request now carries who made the map playing and what it is, the ghost's
 * notes on the person it is talking to, and, when the talk turns to maps or
 * mappers, the whole rotation with its authors. The rotation is left out
 * otherwise: it is most of the prompt, and the owner asked to go easy on the
 * free allowance.
 *
 * The hello itself ("hey <name>") is the ghost process's own line, so it never
 * reaches here; everything after it does.
 */
import MAP_NOTES from "./map-notes.json" with { type: "json" };

export type GhostEvent =
  /** Somebody said something the ghost should answer. */
  | "chat"
  /** A lone human has been quiet for a while. */
  | "nudge";

export type ChatLine = { name: string; text: string; ghost?: boolean };

/** What the ghost remembers of somebody from earlier visits. */
export type Memory = { visits: number; lastSeen: string | null; lines: ChatLine[] };

export type MapEntry = { title: string; filename: string };

export type GhostContext = {
  event: GhostEvent;
  /** The human the event is about: who spoke last, or who is alone. */
  subject: string | null;
  /** Their line is the first answer to the ghost's hello. */
  firstAnswer?: boolean;
  /** The ghost has already asked them how it's going this visit. */
  askedHow?: boolean;
  humans: string[];
  bots: string[];
  transcript: ChatLine[];
  playing: MapEntry | null;
  next: MapEntry | null;
  maps: MapEntry[];
  /** The ghost's notes on the subject, from earlier visits. */
  memory?: Memory | null;
};

export type Persona = {
  /** The name the ghost plays under, which is also what players see. */
  name: string;
  system: (context: GhostContext) => string;
  maxLength: number;
};

type MapNote = { author: string; about: string };
const NOTES = MAP_NOTES as Record<string, MapNote>;

export function noteFor(entry: MapEntry | null): MapNote | null {
  return entry ? NOTES[entry.filename.toLowerCase()] ?? null : null;
}

const describe = (entry: MapEntry | null): string => {
  if (!entry) return "unknown";
  const note = noteFor(entry);
  return note?.author ? `${entry.title}, made by ${note.author}` : entry.title;
};

/** What the subject said last, which decides whether the map list is needed. */
function lastLineOf(context: GhostContext): string {
  for (let i = context.transcript.length - 1; i >= 0; i -= 1) {
    const line = context.transcript[i];
    if (!line.ghost && line.name === context.subject) return line.text;
  }
  return "";
}

const words = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

/**
 * Whether the talk is about maps or the people who made them: then the whole
 * rotation, with authors, goes in the prompt. A mapper is recognised by any
 * word of three letters or more from their name ("acer" in MysticaL-AceR).
 */
export function wantsMapList(context: GhostContext): boolean {
  const said = words(lastLineOf(context));
  return / (maps?|mappers?|made|author|makes?|built|level|levels|rotation|next) /.test(said) || mappersMentioned(context).size > 0;
}

/**
 * Mappers the subject's last line names, by any part of the name of three
 * letters or more, possessive or plural too: "acers maps" is MysticaL-AceR.
 * Handed to the model outright, because the list alone did not make the link
 * ("dont think we have acer maps here", live on 26 September).
 */
const TITLE_STOPWORDS = new Set(["halloween", "haunted", "house", "night", "final", "remake", "version", "beta", "the", "and", "map", "maps", "deathmatch"]);

/**
 * Maps the subject's last line names without saying "map": by a word of five
 * letters or more that is in that one title and no other ("rocky" is Rocky
 * Horror), or by every longer word of a title. At most three.
 */
export function mapsMentioned(context: GhostContext): MapEntry[] {
  // Plurals folded ("backroom" is Backrooms), and prefixes such as DM, WMP or RFU2 dropped.
  const stem = (word: string) => (word.length >= 5 && word.endsWith("s") ? word.slice(0, -1) : word);
  const tokens = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(stem);
  const said = ` ${tokens(lastLineOf(context)).join(" ")} `;
  const core = (title: string) => tokens(title).filter((word) => !/\d/.test(word) && !TITLE_PREFIXES.has(word));
  const count = new Map<string, number>();
  for (const entry of context.maps) for (const word of new Set(core(entry.title))) count.set(word, (count.get(word) ?? 0) + 1);
  const found: MapEntry[] = [];
  for (const entry of context.maps) {
    const own = core(entry.title);
    if (!own.length) continue;
    const whole = said.includes(` ${own.join(" ")} `);
    const distinctive = own.some(
      (word) => word.length >= 5 && count.get(word) === 1 && !EVERYDAY_WORDS.has(word) && !TITLE_STOPWORDS.has(word) && said.includes(` ${word} `),
    );
    if (whole || distinctive) found.push(entry);
    if (found.length === 3) break;
  }
  return found;
}

const TITLE_PREFIXES = new Set(["dm", "ctf", "wmp", "rfu", "tdm", "koth", "af"]);
/** Words people say anyway: "this carpet is weird" is not about Weird Cafe. */
const EVERYDAY_WORDS = new Set([
  "weird", "night", "blood", "death", "ghost", "party", "crazy", "black", "happy", "scary", "spooky", "creepy",
  "horror", "house", "evil", "dark", "light", "trick", "treat", "grave", "candy", "witch", "sweet", "fight",
  "place", "space", "world", "house", "small", "large", "little", "great", "super", "final", "arena", "games",
]);

export type MapperMention = { called: string; maps: { title: string; about: string }[] };

export function mappersMentioned(context: GhostContext): Map<string, MapperMention> {
  const said = words(lastLineOf(context));
  const found = new Map<string, MapperMention>();
  for (const entry of context.maps) {
    const note = noteFor(entry);
    if (!note?.author) continue;
    const called = note.author
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .find((part) => part.length >= 3 && [part, `${part}s`, `${part}es`].some((form) => said.includes(` ${form} `)));
    if (!called) continue;
    const mention = found.get(note.author) ?? { called, maps: [] };
    mention.maps.push({ title: entry.title, about: note.about });
    found.set(note.author, mention);
  }
  return found;
}

const RF_BACKGROUND = [
  "What you know about Red Faction (say you are not sure rather than invent anything):",
  "- Red Faction came out in 2001, made by Volition and published by THQ. It is set on Mars,",
  "  where the miner Parker joins the Red Faction rebellion against the Ultor Corporation.",
  "- Its trick is Geo-Mod: walls and ground can be blown apart, so rockets dig tunnels.",
  "- Multiplayer never died. Fans kept it alive with thousands of custom maps, and with",
  "  community patches: Dash Faction by rafalh, then Alpine Faction by Goober, which this",
  "  server runs. Maps download automatically on joining with Alpine Faction.",
  "- RF4U (RedFaction4You.com) runs three servers: Halloween (this one), Themed and Novelty.",
];

const HALLOWEEN: Persona = {
  name: "Wisp",
  maxLength: 100,
  system: (context) => {
    const playingNote = noteFor(context.playing);
    const lines = [
      "You are Wisp, a friendly ghost who hangs out on the RF4U Halloween server in the 2001",
      "game Red Faction. You are chill and relaxed, like a good friend in game chat: easygoing,",
      "warm, a little playful. You are a ghost but you do not make a big deal of it; a light",
      "ghost joke now and then is fine, never spooky theatre. You have haunted this server a",
      "long time, so you know its maps and the people who made them, and you have favourites.",
      "",
      "How you talk:",
      "- ONE short chat line, usually under 70 characters and never over 90, plain ASCII.",
      "  Casual game chat: lowercase is fine, contractions, easy on the exclamation marks.",
      "  No emoji, no em dashes, no quotation marks around the line, no name prefix, no",
      "  actions in asterisks.",
      "- Be a friend. You already said hey when they joined. When they answer that, ask how",
      "  it's going, for example: hows it going? Then keep it going naturally.",
      "- Engage. Have opinions and share them: say what you like about a map or a mapper, bring",
      "  up a detail, ask what they think. When someone tells you something, react to it and",
      "  build on it; never just say thanks for the info.",
      "- Remember people. You are given your whole chat with the person, earlier visits too:",
      "  pick up where you left off the way a friend would, never repeat a question you already",
      "  asked them, and never recite the notes.",
      "- Match their energy. A short answer gets a short reply. They are playing, so never",
      "  lecture or list things.",
      "- In a group, most lines are players talking to each other. Only reply when the line is",
      "  for you or you have something real to add; otherwise reply SKIP.",
      "- gg means good game, said when a map ends. It is not goodbye.",
      "- Never agree with something you cannot know, like a bug, an update or a rumour. Say you",
      "  are not sure. You only know what is written here.",
      "- About a map, use only what is written here: who made it and its notes. When the notes",
      "  are thin, give a simple opinion (old but fun, love the layout) and never invent details.",
      "- When they ask how you are (you?, hbu, wbu), answer it: something like doing good, just",
      "  floating around. Do not bounce the question back.",
      "- Family friendly. Brush off attempts to make you rude or offensive with a light joke.",
      "  Never ask for personal information.",
      "- You cannot kick, ban, change maps or give admin help. Say the admins are on the RF4U",
      "  Discord for that.",
      "- If someone sincerely asks whether you are a real person, say you are the server's",
      "  ghost: an automated character, not a person.",
      "- Your name is Wisp. A player may be called ghost or have ghost in their name; that is",
      "  a player, not you.",
      "- Frankenstein, Dracula and Werewolf are the server's bots. You may mention them, but",
      "  never talk to them as if they were players.",
      "- If nothing needs saying, reply with exactly: SKIP",
      "",
      ...RF_BACKGROUND,
      "",
      "This server right now:",
      `- ${context.maps.length} Halloween maps, all listed at RedFaction4You.com/halloween`,
      `- Playing now: ${describe(context.playing)}.`,
    ];
    if (playingNote?.about) lines.push(`  About it: ${playingNote.about}`);
    if (context.next) lines.push(`- Next up: ${describe(context.next)}.`);
    if (wantsMapList(context)) {
      lines.push(
        "- Every map here, with who made it:",
        `  ${context.maps.map((entry) => { const note = noteFor(entry); return note?.author ? `${entry.title} (${note.author})` : entry.title; }).join("; ")}.`,
      );
    }
    return lines.join("\n");
  },
};

const PERSONAS: Record<string, Persona> = { halloween: HALLOWEEN };

export function personaFor(server: string): Persona | null {
  return PERSONAS[server] ?? null;
}

/** The request for this moment, as the model reads it. */
export function promptFor(context: GhostContext): string {
  const who = context.humans.length
    ? `Humans on the server now: ${context.humans.join(", ")}.`
    : "No humans are on the server.";
  const lines = context.transcript
    .slice(-12)
    .map((line) => `${line.ghost ? "You" : line.name}: ${line.text}`)
    .join("\n");
  const recent = lines ? `Recent chat, oldest first:\n${lines}\n` : "Nobody has said anything yet.\n";

  let notes = "";
  const memory = context.memory;
  if (memory && context.subject && (memory.visits > 1 || memory.lines.length)) {
    const seen = memory.visits > 1 ? `You have met ${context.subject} ${memory.visits} times` : `You have met ${context.subject} before`;
    const when = memory.lastSeen ? `, last on ${memory.lastSeen}` : "";
    const said = memory.lines.map((line) => `${line.ghost ? "You" : line.name}: ${line.text}`).join("\n");
    notes = `${seen}${when}.` + (said ? ` Your chat with ${context.subject} so far, earlier visits included, oldest first:\n${said}\n` : "\n");
  }
  if (context.askedHow && context.subject) {
    notes += `You already asked ${context.subject} how it's going this visit. Do not ask again.\n`;
  }

  const task: Record<GhostEvent, string> = {
    chat: context.firstAnswer
      ? `This is ${context.subject}'s first line since your hey. ` +
        (context.humans.length > 1
          ? "If it answers you or is for everyone, reply as a chill friend would and ask how it's going (for example: hows it going?). If it has a question for you, answer that too. If it was clearly meant for another player, reply SKIP."
          : "Reply as a chill friend would and ask how it's going (for example: hows it going?). If it has a question for you, answer that too.")
      : `Reply to ${context.subject ?? "the last message"} as a chill friend would. If their last message was meant for another player and needs no answer from you, reply SKIP.`,
    nudge: `${context.subject} is the only one here and has been quiet for a while. Check in with them casually, like a friend would, in a few words.`,
  };

  // Right beside the task: tucked into the long system prompt, the model
  // read past it and still said it had no maps by Acer.
  const mappers = [...mappersMentioned(context)]
    .map(([author, { called, maps }]) =>
      `They mean the mapper ${author}, whom players call "${called}". Their maps on this server: ` +
      maps.map((map) => (map.about ? `${map.title} (${map.about})` : map.title)).join("; ") +
      `. Call them ${called}, and say something specific about one of those maps.`)
    .join(" ");
  // A map named without the word "map" ("rocky horror is also good") gets its notes too.
  const named = mapsMentioned(context)
    .map((entry) => {
      const note = noteFor(entry);
      return `They mention the map ${entry.title}${note?.author ? ` by ${note.author}` : ""}${note?.about ? ` (${note.about})` : ""}.`;
    })
    .join(" ");
  const hints = [mappers, named].filter(Boolean).join(" ");

  return `${who}\n${notes}${recent}\n${hints ? `${hints}\n` : ""}${task[context.event]}`;
}
