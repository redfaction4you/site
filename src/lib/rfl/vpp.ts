/**
 * Reads a Red Faction VPP packfile far enough to pull the level files out.
 *
 * VPP version 1, as used by Red Faction (2001). Layout from Heiko Herrmann's
 * specification on the Red Faction Wiki and rafalh/rf-reversed
 * (`vpp_format.h`):
 *
 *   0x0000  4     signature, always 0x51890ACE
 *   0x0004  4     version, 1 for RF1
 *   0x0008  4     number of files
 *   0x000C  4     total file size
 *   ...           padded out to 0x0800
 *   0x0800  64/ea directory: 60-byte NUL-padded filename, then uint32 size
 *   ...           file data, starting at the next 0x0800 boundary
 *
 * Nothing is compressed, which is why this is a seek-and-slice rather than a
 * decoder.
 */

/** 0x51890ACE. */
export const VPP_SIGNATURE = 0x51890ace;

/** The only version Red Faction 1 uses. RF2 packfiles are version 2. */
export const VPP_VERSION_RF1 = 1;

/** Everything in a VPP is aligned to a 2048-byte block. */
const BLOCK = 0x800;

/** Directory entry: 60 bytes of name, 4 bytes of size. */
const ENTRY_BYTES = 64;
const NAME_BYTES = 60;

/**
 * A pack claiming more entries than this is corrupt or hostile. 10,000 files
 * is far past any real RF pack and still cheap to reject.
 */
const MAX_ENTRIES = 10_000;

export class VppFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VppFormatError";
  }
}

export type VppEntry = {
  /** Filename as stored, e.g. "dm_ruins.rfl". */
  name: string;
  /** Byte length of the file's data. */
  size: number;
  /** Offset of the data within the pack. */
  offset: number;
};

function align(value: number): number {
  return Math.ceil(value / BLOCK) * BLOCK;
}

/** True if the buffer starts with the VPP signature. */
export function looksLikeVpp(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, 4);
  return view.getUint32(0, true) === VPP_SIGNATURE;
}

/**
 * Lists the files in a pack without copying any of their data.
 *
 * NOTE: data offsets assume each file is padded up to the next 2048-byte
 * boundary, which is what Heiko's specification describes.
 *
 * Checked against real packs for the first time on 3 September 2026: three
 * `.vpp` files off the live game server ("DM-Combat Arena.vpp", "dm_space.vpp"
 * and "kma Dm s7.vpp") all read correctly, level name, save date and RFL
 * version and all, so the assumption holds where it has been tested.
 *
 * It has been tested less far than that sounds. Each of those packs holds
 * exactly one file, so what is confirmed is the first data offset, 0x1000, and
 * nothing else. The running alignment from one entry to the next, which is
 * where a wrong padding rule would actually show up, is still unexercised: it
 * needs a pack with several files in it, such as the game's own. If offsets
 * come out wrong on one of those, this is still the assumption to question
 * first.
 */
export function listVppEntries(bytes: Uint8Array): VppEntry[] {
  if (bytes.byteLength < BLOCK) {
    throw new VppFormatError(
      `File is ${bytes.byteLength} bytes, smaller than a VPP header block.`,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const signature = view.getUint32(0, true);
  if (signature !== VPP_SIGNATURE) {
    throw new VppFormatError(
      `Not a VPP: signature is 0x${signature.toString(16).padStart(8, "0")}.`,
    );
  }

  const version = view.getUint32(4, true);
  if (version !== VPP_VERSION_RF1) {
    throw new VppFormatError(
      `VPP version ${version} is not supported. Red Faction 1 packs are version 1; ` +
        `version 2 is Red Faction II, which this archive does not cover.`,
    );
  }

  const count = view.getUint32(8, true);
  if (count > MAX_ENTRIES) {
    throw new VppFormatError(`Pack claims ${count} files, which is not credible.`);
  }

  const directoryEnd = BLOCK + count * ENTRY_BYTES;
  if (directoryEnd > bytes.byteLength) {
    throw new VppFormatError(
      `Pack claims ${count} files but is only ${bytes.byteLength} bytes.`,
    );
  }

  const decoder = new TextDecoder("latin1");
  const entries: VppEntry[] = [];
  let dataOffset = align(directoryEnd);

  for (let i = 0; i < count; i++) {
    const at = BLOCK + i * ENTRY_BYTES;
    const raw = new Uint8Array(bytes.buffer, bytes.byteOffset + at, NAME_BYTES);

    // Names are NUL-padded to 60 bytes. Cut at the first NUL, not the last.
    const end = raw.indexOf(0);
    const name = decoder.decode(end === -1 ? raw : raw.subarray(0, end)).trim();
    const size = view.getUint32(at + NAME_BYTES, true);

    if (dataOffset + size > bytes.byteLength) {
      throw new VppFormatError(
        `Entry "${name}" runs past the end of the pack. Truncated download?`,
      );
    }

    entries.push({ name, size, offset: dataOffset });
    dataOffset = align(dataOffset + size);
  }

  return entries;
}

/** Slices one entry's bytes out of the pack. No copy is made. */
export function readVppEntry(bytes: Uint8Array, entry: VppEntry): Uint8Array {
  return bytes.subarray(entry.offset, entry.offset + entry.size);
}
