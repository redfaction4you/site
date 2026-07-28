/**
 * Reads the header of a Red Faction level file (.rfl).
 *
 * The whole point of this module is one number: the format version at offset 4.
 * A level records the format it was saved in, and clients decline to load a
 * format they do not understand. That is what makes the compatibility split
 * real, per-map, and invisible until somebody's download fails.
 *
 * Layout is from the Red Faction Wiki's RFL page and rafalh/rf-reversed
 * (`rfl.ksy`). All numeric values are little-endian.
 *
 *   offset  size  field
 *   0       4     magic, always 0xD4BADA55
 *   4       4     format version (signed int32)
 *   8       4     unix timestamp of last save
 *   12      4     player start offset
 *   16      4     level info offset
 *   20      4     count of sections
 *   24      4     combined section size, minus 8
 *   28      var   level name, as a length-prefixed string
 *   var     var   mod name, only present when version >= 0xB2
 *
 * We read the header and stop. The rest of the file is a section list, and
 * parsing it is not needed to answer the question we are asking.
 */

/** "badass" in leetspeak, which tells you what era this format is from. */
export const RFL_MAGIC = 0xd4bada55;

/** Fixed part of the header, before the variable-length strings. */
const FIXED_HEADER_BYTES = 28;

/**
 * Level and mod names are stored as a uint16 length followed by that many
 * bytes of ASCII. A name longer than this is a corrupt or hostile file, not a
 * long name, so we refuse rather than allocate.
 */
const MAX_STRING_BYTES = 1024;

export class RflFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RflFormatError";
  }
}

export type RflHeader = {
  /** The format version. This is the field everything else here exists for. */
  version: number;
  /** When the level was last saved, or null if the stamp is absent/implausible. */
  savedAt: Date | null;
  /** Number of sections in the body. We do not read them. */
  sectionCount: number;
  /** Level name as stored by the editor. Often empty in practice. */
  levelName: string;
  /** Mod this level belongs to. Absent before version 0xB2. */
  modName: string | null;
};

function readVString(
  view: DataView,
  offset: number,
  label: string,
): { value: string; next: number } {
  if (offset + 2 > view.byteLength) {
    throw new RflFormatError(`Truncated before ${label} length.`);
  }

  const length = view.getUint16(offset, true);
  if (length > MAX_STRING_BYTES) {
    throw new RflFormatError(
      `${label} claims ${length} bytes, which is not a real level name.`,
    );
  }

  const start = offset + 2;
  if (start + length > view.byteLength) {
    throw new RflFormatError(`Truncated inside ${label}.`);
  }

  const bytes = new Uint8Array(view.buffer, view.byteOffset + start, length);
  // Stored as ASCII. Decoding as latin1 avoids throwing on the odd stray byte
  // in a 25-year-old file; we would rather show a mangled name than fail.
  const value = new TextDecoder("latin1").decode(bytes).replace(/\0+$/, "");

  return { value, next: start + length };
}

/** True if the buffer starts with the RFL magic. Cheap enough to call first. */
export function looksLikeRfl(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, 4);
  return view.getUint32(0, true) === RFL_MAGIC;
}

/**
 * Parses the header. Throws RflFormatError on anything that is not an RFL;
 * callers upload arbitrary files, so this must fail loudly rather than guess.
 */
export function parseRflHeader(bytes: Uint8Array): RflHeader {
  if (bytes.byteLength < FIXED_HEADER_BYTES) {
    throw new RflFormatError(
      `File is ${bytes.byteLength} bytes, too short to be a level.`,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const magic = view.getUint32(0, true);
  if (magic !== RFL_MAGIC) {
    throw new RflFormatError(
      `Not an RFL: magic is 0x${magic.toString(16).padStart(8, "0")}, expected 0x${RFL_MAGIC.toString(16)}.`,
    );
  }

  // Signed in the format spec. A negative version means a corrupt file, and we
  // want that to surface as a rejected upload rather than a nonsense badge.
  const version = view.getInt32(4, true);
  if (version <= 0) {
    throw new RflFormatError(`Level reports version ${version}, which is not valid.`);
  }

  const timestamp = view.getUint32(8, true);
  const sectionCount = view.getUint32(20, true);

  // RF shipped in 2001. A stamp before that, or in the future, is junk rather
  // than history, and dating a map wrongly on its page is worse than not dating it.
  const seconds2001 = 946_684_800; // 2000-01-01
  const nowish = 4_102_444_800; // 2100-01-01
  const savedAt =
    timestamp > seconds2001 && timestamp < nowish ? new Date(timestamp * 1000) : null;

  const level = readVString(view, FIXED_HEADER_BYTES, "level name");

  // Mod name only exists from 0xB2 onward. Reading it unconditionally would
  // consume two bytes of the first section on older levels.
  let modName: string | null = null;
  if (version >= 0xb2) {
    modName = readVString(view, level.next, "mod name").value || null;
  }

  return {
    version,
    savedAt,
    sectionCount,
    levelName: level.value,
    modName,
  };
}
