/**
 * Works out what a downloadable actually is, and which clients can load it.
 *
 * This is the entry point Phase 2's upload path calls. Give it the bytes of
 * whatever somebody uploaded and it will find the levels inside — bare .rfl,
 * .vpp packfile, .zip, or a .zip containing a .vpp — read each one's format
 * version, and return the compatibility for the upload as a whole.
 *
 * Detection is by content, never by file extension. Extensions are a claim made
 * by whoever renamed the file last.
 *
 * NOT DONE HERE: `required_features`. The build plan lists it alongside
 * `rfl_version` and `plays_on`, but unlike those two it cannot be read from the
 * header — it needs the section list parsed and each Alpine event type
 * recognised. The version alone answers "will this load", which is the question
 * that costs people a broken download. Feature detail is a later increment.
 */
import {
  compatibilityForRflVersion,
  intersectClients,
  type RfClient,
} from "./clients.ts";
import { looksLikeRfl, parseRflHeader, type RflHeader } from "./format.ts";
import { listVppEntries, looksLikeVpp, readVppEntry } from "./vpp.ts";
import { listZipEntries, looksLikeZip, readZipEntry } from "./zip.ts";

export * from "./clients.ts";
export * from "./format.ts";
export * from "./vpp.ts";
export * from "./zip.ts";

export type ContainerKind = "rfl" | "vpp" | "zip";

export type InspectedLevel = {
  /** Where it was found, e.g. "maps.vpp/dm_ruins.rfl". */
  path: string;
  header: RflHeader;
  playsOn: RfClient[];
  confidence: "known" | "unknown";
  note: string;
};

export type ArchiveInspection = {
  container: ContainerKind;
  levels: InspectedLevel[];
  /**
   * The highest version found. This is the binding constraint: a pack is only
   * as loadable as its most demanding level.
   */
  rflVersion: number | null;
  /** Clients that can load every level in the upload. */
  playsOn: RfClient[];
  confidence: "known" | "unknown";
  /**
   * Things a human should look at: an unreadable level inside an otherwise fine
   * pack, an unrecognised version, an archive with no levels in it. Never
   * silently dropped — an archive that quietly ignores what it cannot read is
   * how a catalogue fills up with lies.
   */
  warnings: string[];
};

function isRflName(name: string): boolean {
  return name.toLowerCase().endsWith(".rfl");
}

function isVppName(name: string): boolean {
  return name.toLowerCase().endsWith(".vpp");
}

/** Directory entries and the junk macOS puts in zips. */
function isNoise(name: string): boolean {
  return name.endsWith("/") || name.startsWith("__MACOSX/") || name.includes("/._");
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function inspectOneLevel(bytes: Uint8Array, path: string): InspectedLevel {
  const header = parseRflHeader(bytes);
  const compatibility = compatibilityForRflVersion(header.version);
  return {
    path,
    header,
    playsOn: compatibility.playsOn,
    confidence: compatibility.confidence,
    note: compatibility.note,
  };
}

function collectFromVpp(
  bytes: Uint8Array,
  prefix: string,
  levels: InspectedLevel[],
  warnings: string[],
): void {
  for (const entry of listVppEntries(bytes)) {
    if (!isRflName(entry.name)) continue;
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    try {
      levels.push(inspectOneLevel(readVppEntry(bytes, entry), path));
    } catch (error) {
      warnings.push(`${path}: ${describe(error)}`);
    }
  }
}

/**
 * Inspects an uploaded file.
 *
 * Throws only when the container itself is unreadable. A level inside a
 * readable container that fails to parse becomes a warning, so that one bad map
 * does not reject a nineteen-map pack.
 */
export function inspectUpload(bytes: Uint8Array): ArchiveInspection {
  const levels: InspectedLevel[] = [];
  const warnings: string[] = [];
  let container: ContainerKind;

  if (looksLikeRfl(bytes)) {
    container = "rfl";
    levels.push(inspectOneLevel(bytes, "level.rfl"));
  } else if (looksLikeVpp(bytes)) {
    container = "vpp";
    collectFromVpp(bytes, "", levels, warnings);
  } else if (looksLikeZip(bytes)) {
    container = "zip";
    for (const entry of listZipEntries(bytes)) {
      if (isNoise(entry.name)) continue;

      // One level of nesting only: a zip holding a packfile is a normal way to
      // ship RF maps. A zip holding a zip is not, and we will not chase it.
      if (isVppName(entry.name)) {
        try {
          collectFromVpp(readZipEntry(bytes, entry), entry.name, levels, warnings);
        } catch (error) {
          warnings.push(`${entry.name}: ${describe(error)}`);
        }
        continue;
      }

      if (!isRflName(entry.name)) continue;

      try {
        levels.push(inspectOneLevel(readZipEntry(bytes, entry), entry.name));
      } catch (error) {
        warnings.push(`${entry.name}: ${describe(error)}`);
      }
    }
  } else {
    throw new Error(
      "Unrecognised file. Expected a Red Faction level (.rfl), a packfile (.vpp), " +
        "or a zip containing one.",
    );
  }

  if (levels.length === 0) {
    warnings.push(
      "No level files found. This may be a mod, a model or a tool rather than a map.",
    );
  }

  const rflVersion = levels.length
    ? Math.max(...levels.map((level) => level.header.version))
    : null;

  return {
    container,
    levels,
    rflVersion,
    playsOn: intersectClients(levels.map((level) => level.playsOn)),
    // If any single level is a guess, the whole answer is a guess.
    confidence: levels.some((level) => level.confidence === "unknown")
      ? "unknown"
      : "known",
    warnings,
  };
}
