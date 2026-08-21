import { File, FileMode } from 'expo-file-system';

/**
 * A minimal ZIP reader/writer, used to put a backup's photos alongside its
 * JSON in a single shareable file.
 *
 * Why hand-rolled rather than a zip library: the whole point of the archive is
 * to avoid ever holding the payload in memory. A JS zip library builds the
 * archive as one buffer, which for a farm with a thousand photos is a few
 * hundred megabytes — the app is killed long before it finishes. Writing
 * through a file handle keeps peak memory at one photo (~250KB after the
 * downscale in `imageStorage.ts`) no matter how many there are. A native zip
 * module would also work, but it costs a new native dependency and a rebuild,
 * and `expo-file-system` already exposes the file handles this needs.
 *
 * Entries are STOREd, never deflated: the payload is JPEG and PNG, which are
 * already compressed, so deflating them spends CPU to save nothing. The one
 * text entry (the backup JSON) is small enough that the same applies.
 *
 * Deliberately not implemented: Zip64, encryption, and multi-disk archives.
 * The format below is the classic 32-bit one, which caps a single archive at
 * 4GB and 65,535 entries — both far beyond a photo set this app can produce,
 * and `writeZipArchive` refuses rather than silently writing a corrupt file if
 * either is ever exceeded.
 */

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

/** Store, i.e. no compression. */
const METHOD_STORE = 0;
/** The version-needed field for a plain stored entry. */
const VERSION_NEEDED = 20;

const MAX_ENTRIES = 0xffff;
const MAX_ARCHIVE_BYTES = 0xffffffff;

/** How much of a file is read at a time while copying it into the archive. */
const COPY_CHUNK_BYTES = 512 * 1024;

export type ZipSourceEntry = {
  /** Path inside the archive, using forward slashes. */
  name: string;
  file: File;
};

export type ZipEntry = {
  name: string;
  size: number;
  /** Absolute offset of this entry's local header within the archive. */
  headerOffset: number;
};

export class ZipFormatError extends Error {}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Writes `entries` into `destination`, replacing anything already there.
 *
 * Each source file is read twice — once to checksum it, once to copy it — so
 * that the local header can carry a real CRC and size rather than a trailing
 * data descriptor. Both passes are chunked, so a large file never lands in
 * memory whole.
 */
export async function writeZipArchive(
  destination: File,
  entries: ZipSourceEntry[],
  onProgress?: (completed: number, total: number) => void,
  modifiedAt: Date = new Date(),
): Promise<void> {
  if (entries.length > MAX_ENTRIES) {
    throw new ZipFormatError(`An archive can hold at most ${MAX_ENTRIES} files.`);
  }

  if (destination.exists) {
    destination.delete();
  }

  destination.create({ overwrite: true });

  const handle = destination.open(FileMode.ReadWrite);
  const stamp = toDosDateTime(modifiedAt);
  const directory: Array<{ entry: ZipSourceEntry; nameBytes: Uint8Array; crc: number; size: number; offset: number }> = [];
  let offset = 0;

  const write = (bytes: Uint8Array) => {
    handle.writeBytes(bytes);
    offset += bytes.length;

    if (offset > MAX_ARCHIVE_BYTES) {
      throw new ZipFormatError('This backup is too large to write as a single archive.');
    }
  };

  try {
    for (const [index, entry] of entries.entries()) {
      const nameBytes = encodeAscii(entry.name);
      const source = entry.file;

      if (!source.exists) {
        // A photo that vanished between being listed and being written is not
        // worth failing the whole backup for — it is simply not in the
        // archive. Progress still counts it, so a caller driving a progress
        // indicator always reaches the total it was given.
        onProgress?.(index + 1, entries.length);
        continue;
      }

      const { crc, size } = await checksumFile(source);
      const headerOffset = offset;

      write(buildLocalHeader(nameBytes, crc, size, stamp));
      write(nameBytes);
      await copyFileInto(source, size, write);

      directory.push({ entry, nameBytes, crc, size, offset: headerOffset });
      onProgress?.(index + 1, entries.length);
    }

    const centralDirectoryOffset = offset;

    for (const item of directory) {
      write(buildCentralHeader(item.nameBytes, item.crc, item.size, item.offset, stamp));
      write(item.nameBytes);
    }

    write(
      buildEndOfCentralDirectory(
        directory.length,
        offset - centralDirectoryOffset,
        centralDirectoryOffset,
      ),
    );
  } finally {
    handle.close();
  }
}

function buildLocalHeader(
  nameBytes: Uint8Array,
  crc: number,
  size: number,
  stamp: { time: number; date: number },
) {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);

  view.setUint32(0, LOCAL_HEADER_SIGNATURE, true);
  view.setUint16(4, VERSION_NEEDED, true);
  view.setUint16(6, 0, true); // flags
  view.setUint16(8, METHOD_STORE, true);
  view.setUint16(10, stamp.time, true);
  view.setUint16(12, stamp.date, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true); // compressed size
  view.setUint32(22, size, true); // uncompressed size
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true); // extra field length

  return header;
}

function buildCentralHeader(
  nameBytes: Uint8Array,
  crc: number,
  size: number,
  headerOffset: number,
  stamp: { time: number; date: number },
) {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);

  view.setUint32(0, CENTRAL_HEADER_SIGNATURE, true);
  view.setUint16(4, VERSION_NEEDED, true); // version made by
  view.setUint16(6, VERSION_NEEDED, true); // version needed
  view.setUint16(8, 0, true); // flags
  view.setUint16(10, METHOD_STORE, true);
  view.setUint16(12, stamp.time, true);
  view.setUint16(14, stamp.date, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true); // extra field length
  view.setUint16(32, 0, true); // comment length
  view.setUint16(34, 0, true); // disk number
  view.setUint16(36, 0, true); // internal attributes
  view.setUint32(38, 0, true); // external attributes
  view.setUint32(42, headerOffset, true);

  return header;
}

function buildEndOfCentralDirectory(count: number, directorySize: number, directoryOffset: number) {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);

  view.setUint32(0, END_OF_CENTRAL_DIRECTORY_SIGNATURE, true);
  view.setUint16(4, 0, true); // disk number
  view.setUint16(6, 0, true); // disk with central directory
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, directorySize, true);
  view.setUint32(16, directoryOffset, true);
  view.setUint16(20, 0, true); // comment length

  return record;
}

async function checksumFile(file: File) {
  const handle = file.open(FileMode.ReadOnly);

  try {
    const size = handle.size ?? 0;
    let crc = 0xffffffff;
    let remaining = size;

    while (remaining > 0) {
      const chunk = handle.readBytes(Math.min(COPY_CHUNK_BYTES, remaining));

      if (chunk.length === 0) {
        break;
      }

      crc = updateCrc32(crc, chunk);
      remaining -= chunk.length;
    }

    return { crc: (crc ^ 0xffffffff) >>> 0, size: size - remaining };
  } finally {
    handle.close();
  }
}

async function copyFileInto(file: File, size: number, write: (bytes: Uint8Array) => void) {
  const handle = file.open(FileMode.ReadOnly);

  try {
    let remaining = size;

    while (remaining > 0) {
      const chunk = handle.readBytes(Math.min(COPY_CHUNK_BYTES, remaining));

      if (chunk.length === 0) {
        throw new ZipFormatError(`Could not read all of ${file.name}.`);
      }

      write(chunk);
      remaining -= chunk.length;
    }
  } finally {
    handle.close();
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** True when the file starts with a ZIP local-header or empty-archive signature. */
export function isZipFile(file: File) {
  if (!file.exists) {
    return false;
  }

  const handle = file.open(FileMode.ReadOnly);

  try {
    const head = handle.readBytes(4);

    return (
      head.length === 4 &&
      head[0] === 0x50 &&
      head[1] === 0x4b &&
      (head[2] === 0x03 || head[2] === 0x05 || head[2] === 0x07)
    );
  } catch {
    return false;
  } finally {
    handle.close();
  }
}

/**
 * Lists the archive's entries by reading its central directory, which is the
 * authoritative index and sits at the end of the file.
 */
export function readZipEntries(source: File): ZipEntry[] {
  const handle = source.open(FileMode.ReadOnly);

  try {
    const size = handle.size ?? 0;

    if (size < 22) {
      throw new ZipFormatError('This file is too small to be an archive.');
    }

    // The end record is the last 22 bytes unless the archive carries a
    // comment, so scan backwards over the largest a comment can be.
    const tailLength = Math.min(size, 22 + 0xffff);
    handle.offset = size - tailLength;
    const tail = handle.readBytes(tailLength);
    const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);

    let endOffset = -1;

    for (let index = tail.length - 22; index >= 0; index -= 1) {
      if (tailView.getUint32(index, true) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
        endOffset = index;
        break;
      }
    }

    if (endOffset === -1) {
      throw new ZipFormatError('This file is not a readable archive.');
    }

    const count = tailView.getUint16(endOffset + 10, true);
    const directorySize = tailView.getUint32(endOffset + 12, true);
    const directoryOffset = tailView.getUint32(endOffset + 16, true);

    handle.offset = directoryOffset;
    const directory = handle.readBytes(directorySize);
    const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
    const entries: ZipEntry[] = [];
    let cursor = 0;

    for (let index = 0; index < count; index += 1) {
      if (cursor + 46 > directory.length || view.getUint32(cursor, true) !== CENTRAL_HEADER_SIGNATURE) {
        throw new ZipFormatError('This archive’s index is damaged.');
      }

      const entrySize = view.getUint32(cursor + 24, true);
      const nameLength = view.getUint16(cursor + 28, true);
      const extraLength = view.getUint16(cursor + 30, true);
      const commentLength = view.getUint16(cursor + 32, true);
      const headerOffset = view.getUint32(cursor + 42, true);
      const name = decodeAscii(directory.subarray(cursor + 46, cursor + 46 + nameLength));

      entries.push({ name, size: entrySize, headerOffset });
      cursor += 46 + nameLength + extraLength + commentLength;
    }

    return entries;
  } finally {
    handle.close();
  }
}

/**
 * Copies one entry's bytes out to `destination`, chunk by chunk. The entry's
 * own local header is re-read for its name and extra-field lengths, because
 * those are what say where the data actually starts.
 */
export function extractZipEntry(source: File, entry: ZipEntry, destination: File) {
  const reader = source.open(FileMode.ReadOnly);

  try {
    reader.offset = entry.headerOffset;
    const header = reader.readBytes(30);
    const headerView = new DataView(header.buffer, header.byteOffset, header.byteLength);

    if (header.length < 30 || headerView.getUint32(0, true) !== LOCAL_HEADER_SIGNATURE) {
      throw new ZipFormatError(`Entry ${entry.name} is damaged.`);
    }

    if (headerView.getUint16(8, true) !== METHOD_STORE) {
      throw new ZipFormatError(`Entry ${entry.name} uses an unsupported compression method.`);
    }

    const nameLength = headerView.getUint16(26, true);
    const extraLength = headerView.getUint16(28, true);
    reader.offset = entry.headerOffset + 30 + nameLength + extraLength;

    if (destination.exists) {
      destination.delete();
    }

    destination.create({ overwrite: true, intermediates: true });
    const writer = destination.open(FileMode.ReadWrite);

    try {
      let remaining = entry.size;

      while (remaining > 0) {
        const chunk = reader.readBytes(Math.min(COPY_CHUNK_BYTES, remaining));

        if (chunk.length === 0) {
          throw new ZipFormatError(`Entry ${entry.name} ended earlier than its index said.`);
        }

        writer.writeBytes(chunk);
        remaining -= chunk.length;
      }
    } finally {
      writer.close();
    }
  } finally {
    reader.close();
  }
}

// ---------------------------------------------------------------------------
// Bits and pieces
// ---------------------------------------------------------------------------

/**
 * Entry names are ASCII by construction — `backup.json` and the generated
 * photo filenames, which are `<prefix>-<timestamp>-<random>.<ext>`. Anything
 * outside ASCII would need the UTF-8 flag set in the header, so it is rejected
 * rather than written as something a reader would mis-decode.
 */
function encodeAscii(value: string) {
  const bytes = new Uint8Array(value.length);

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code > 0x7f) {
      throw new ZipFormatError(`Archive entry names must be ASCII: ${value}`);
    }

    bytes[index] = code;
  }

  return bytes;
}

function decodeAscii(bytes: Uint8Array) {
  let value = '';

  for (let index = 0; index < bytes.length; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }

  return value;
}

/**
 * ZIP stores timestamps in the MS-DOS format: a 16-bit date and a 16-bit time,
 * counting years from 1980 and seconds in twos. Leaving these zero writes a
 * date no calendar has, which browsers and Finder render as `00-00-1980` —
 * harmless to a program, but it reads as a corrupt file to a person opening
 * the archive on a computer.
 */
function toDosDateTime(value: Date) {
  const year = Math.max(1980, value.getFullYear());

  return {
    time:
      (value.getHours() << 11) | (value.getMinutes() << 5) | (Math.floor(value.getSeconds() / 2) & 0x1f),
    date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
  };
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
})();

function updateCrc32(crc: number, bytes: Uint8Array) {
  let value = crc;

  for (let index = 0; index < bytes.length; index += 1) {
    value = CRC32_TABLE[(value ^ bytes[index]) & 0xff] ^ (value >>> 8);
  }

  return value >>> 0;
}

/** CRC32 of a whole buffer — exposed for verifying an extracted entry. */
export function crc32(bytes: Uint8Array) {
  return (updateCrc32(0xffffffff, bytes) ^ 0xffffffff) >>> 0;
}
