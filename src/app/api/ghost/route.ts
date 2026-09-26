import { timingSafeEqual } from "node:crypto";

import { speak } from "@/lib/ghost/speak";
import { personaFor, promptFor, type ChatLine, type GhostEvent, type Memory } from "@/lib/ghost/persona";
import { rotationForServer } from "@/lib/map-packs";
import { nextAfter, positionOfLevel } from "@/lib/server-rotation";
import { serverBySlug } from "@/lib/servers";

/**
 * What the ghost on a server should say next.
 *
 * Called by the ghost process on the VPS with the same bearer secret the
 * rotation applier uses. It sends what it saw (who joined, who said what,
 * which level is loaded) and gets back one chat line, or `line: null` when no
 * free model could produce one, in which case it says a scripted line of its
 * own. See `src/lib/ghost/speak.ts` for why only free providers are called.
 *
 * Every field is capped here, not trusted: a garbled or hostile body must not
 * turn into a prompt of any size.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EVENTS: GhostEvent[] = ["chat", "nudge"];

function authorized(request: Request): boolean {
  const expected = process.env.RF4U_ARCHIVE_SYNC_SECRET ?? "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (expected.length < 16 || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/[\x00-\x1f]/g, " ").trim().slice(0, max) : "";

const names = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((entry) => text(entry, 32)).filter(Boolean).slice(0, 32) : [];

/** The ghost's notes on the subject, capped like everything else here. */
function memoryOf(value: unknown): Memory | null {
  if (!value || typeof value !== "object") return null;
  const memory = value as Record<string, unknown>;
  const visits = Number.isFinite(memory.visits) ? Math.max(0, Math.min(10_000, Math.floor(Number(memory.visits)))) : 0;
  const lines: ChatLine[] = Array.isArray(memory.lines)
    ? memory.lines.slice(-10).map((entry) => {
        const line = (entry ?? {}) as Record<string, unknown>;
        return { name: text(line.name, 32), text: text(line.text, 160), ghost: line.ghost === true };
      }).filter((line) => line.name && line.text)
    : [];
  return { visits, lastSeen: text(memory.lastSeen, 20) || null, lines };
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }

  const slug = text(body.server, 20);
  const server = serverBySlug(slug);
  const persona = personaFor(slug);
  if (!server || !persona) {
    return Response.json({ error: `No ghost for server "${slug}"` }, { status: 404 });
  }

  const event = EVENTS.includes(body.event as GhostEvent) ? (body.event as GhostEvent) : null;
  if (!event) return Response.json({ error: "Unknown event" }, { status: 400 });

  const transcript: ChatLine[] = Array.isArray(body.transcript)
    ? body.transcript.slice(-20).map((entry) => {
        const line = (entry ?? {}) as Record<string, unknown>;
        return { name: text(line.name, 32), text: text(line.text, 260), ghost: line.ghost === true };
      }).filter((line) => line.name && line.text)
    : [];

  const pack = await rotationForServer(server);
  const maps = pack?.maps ?? [];
  const at = positionOfLevel(text(body.levelFile, 64) || null, null, maps);
  const levelFile = text(body.levelFile, 64);
  const entryOf = (entry: { filename: string; title?: string } | null | undefined) =>
    entry ? { title: entry.title?.trim() || entry.filename.replace(/\.rfl$/i, ""), filename: entry.filename } : null;

  const context = {
    event,
    subject: text(body.subject, 32) || null,
    firstAnswer: body.firstAnswer === true,
    askedHow: body.askedHow === true,
    humans: names(body.humans),
    bots: names(body.bots),
    transcript,
    playing: at !== null ? entryOf(maps[at]) : levelFile ? entryOf({ filename: levelFile }) : null,
    next: entryOf(nextAfter(at, maps)),
    maps: maps.map((entry) => ({ title: entry.title?.trim() || entry.filename.replace(/\.rfl$/i, ""), filename: entry.filename })),
    memory: memoryOf(body.memory),
  };

  const spoken = await speak(persona.system(context), promptFor(context), persona.name, persona.maxLength);
  return Response.json(
    { line: spoken ? spoken.line || null : null, skipped: spoken?.line === "", provider: spoken?.provider ?? null },
    { headers: { "cache-control": "no-store" } },
  );
}
