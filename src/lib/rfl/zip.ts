/**
 * A minimal ZIP reader, because most Red Faction maps are distributed as a zip
 * with a .rfl and a readme inside rather than as a packfile.
 *
 * Deliberately small: it reads the central directory, and inflates one named
 * entry on request. It does not write, does not handle ZIP64, and does not do
 * encryption. RF map zips are a few megabytes at most, and a general-purpose
 * zip library is a dependency we do not need to carry to read six fields.
 *
 * Node-only: uses `node:zlib`. Anything importing this must run on the Node
 * runtime, not the edge runtime.
 */
import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

const EOCD_MIN_BYTES = 22;
/** The trailing comment is a uint16 length, so the record is within 64KB of the end. */
const EOCD_SEARCH_BYTES = 0xffff + EOCD_MIN_BYTES;

const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

/**
 * Refuse to inflate anything larger than this from a single entry. A level file
 * is well under a megabyte; this is a zip-bomb guard, not a real limit.
 */
const MAX_INFLATED_BYTES = 64 * 1024 * 1024;

export class ZipFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipFormatError";
  }
}

export type ZipEntry = {
  /** Path within the archive, forward-slashed. */
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  localHeaderOffset: number;
};

/** True if the buffer starts with a local file header. */
export function looksLikeZip(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, 4);
  return view.getUint32(0, true) === LOCAL_SIGNATURE;
}

let crcTable: Uint32Array | null = null;

function crc32Table(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  crcTable = table;
  return table;
}

/** Standard CRC-32. CRC-32 of "123456789" is 0xCBF43926. */
export function crc32(bytes: Uint8Array): number {
  const table = crc32Table();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function findEocd(view: DataView): number {
  const from = Math.max(0, view.byteLength - EOCD_SEARCH_BYTES);
  // Scan backwards: the last match is the real one when a comment happens to
  // contain the signature bytes.
  for (let at = view.byteLength - EOCD_MIN_BYTES; at >= from; at--) {
    if (view.getUint32(at, true) === EOCD_SIGNATURE) return at;
  }
  throw new ZipFormatError(
    "No end-of-central-directory record. Not a zip, or truncated.",
  );
}

/** Lists the archive contents. Reads the directory only; inflates nothing. */
export function listZipEntries(bytes: Uint8Array): ZipEntry[] {
  if (bytes.byteLength < EOCD_MIN_BYTES) {
    throw new ZipFormatError(`File is ${bytes.byteLength} bytes, too short to be a zip.`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view);

  const count = view.getUint16(eocd + 10, true);
  const directoryOffset = view.getUint32(eocd + 16, true);

  if (directoryOffset === 0xffffffff || count === 0xffff) {
    throw new ZipFormatError(
      "ZIP64 archive. Not supported: no Red Faction map needs it, so if you are " +
        "seeing this the file is probably not what it claims to be.",
    );
  }
  if (directoryOffset >= bytes.byteLength) {
    throw new ZipFormatError("Central directory offset points past the end of the file.");
  }

  const decoder = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];
  let at = directoryOffset;

  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.byteLength) {
      throw new ZipFormatError("Central directory is truncated.");
    }
    if (view.getUint32(at, true) !== CENTRAL_SIGNATURE) {
      throw new ZipFormatError(`Bad central directory entry at ${at}.`);
    }

    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const nameAt = at + 46;

    if (nameAt + nameLength > bytes.byteLength) {
      throw new ZipFormatError("Entry name runs past the end of the file.");
    }

    entries.push({
      name: decoder.decode(
        new Uint8Array(bytes.buffer, bytes.byteOffset + nameAt, nameLength),
      ),
      method: view.getUint16(at + 10, true),
      crc32: view.getUint32(at + 16, true),
      compressedSize: view.getUint32(at + 20, true),
      uncompressedSize: view.getUint32(at + 24, true),
      localHeaderOffset: view.getUint32(at + 42, true),
    });

    at = nameAt + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * Inflates one entry and verifies its CRC.
 *
 * The CRC check is not ceremony. This site's second commitment is that nothing
 * here disappears or rots, and serving a quietly corrupt map would break that
 * more thoroughly than a 404.
 */
export function readZipEntry(bytes: Uint8Array, entry: ZipEntry): Uint8Array {
  if (entry.uncompressedSize > MAX_INFLATED_BYTES) {
    throw new ZipFormatError(
      `Entry "${entry.name}" claims ${entry.uncompressedSize} bytes uncompressed. Refusing.`,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = entry.localHeaderOffset;

  if (header + 30 > bytes.byteLength) {
    throw new ZipFormatError(`Local header for "${entry.name}" is past the end.`);
  }
  if (view.getUint32(header, true) !== LOCAL_SIGNATURE) {
    throw new ZipFormatError(`Bad local header for "${entry.name}".`);
  }

  // The local header repeats the name and extra-field lengths, and they are
  // allowed to differ from the central directory's. Trust the local ones here.
  const nameLength = view.getUint16(header + 26, true);
  const extraLength = view.getUint16(header + 28, true);
  const dataAt = header + 30 + nameLength + extraLength;

  if (dataAt + entry.compressedSize > bytes.byteLength) {
    throw new ZipFormatError(`Data for "${entry.name}" runs past the end of the file.`);
  }

  const compressed = bytes.subarray(dataAt, dataAt + entry.compressedSize);

  let output: Uint8Array;
  if (entry.method === METHOD_STORED) {
    output = compressed;
  } else if (entry.method === METHOD_DEFLATE) {
    output = new Uint8Array(inflateRawSync(compressed));
  } else {
    throw new ZipFormatError(
      `Entry "${entry.name}" uses compression method ${entry.method}. ` +
        `Only stored and deflate are supported.`,
    );
  }

  const actual = crc32(output);
  if (actual !== entry.crc32) {
    throw new ZipFormatError(
      `Checksum mismatch on "${entry.name}": the archive says ` +
        `0x${entry.crc32.toString(16)}, the data is 0x${actual.toString(16)}. ` +
        `The file is corrupt.`,
    );
  }

  return output;
}
