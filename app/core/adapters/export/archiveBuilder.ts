import {
  type ArchiveBuilder,
  type ArchiveEntry,
  ArchiveError,
} from "@/core/domain/export/ports/archiveBuilder";

/**
 * Minimal in-memory ZIP archive builder.
 *
 * Emits a "stored" (compression-method 0) ZIP per the PKZIP APPNOTE
 * specification. The encoder is self-contained so it runs on the
 * Cloudflare Workers runtime without pulling in a Node-only zip
 * library; trade-offs are deliberate:
 *
 * - No compression. Markdown / HTML payloads compress well, but stored
 *   ZIPs still decompress in every consumer and avoid streaming
 *   compressors that depend on Node's `zlib`.
 * - In-memory only. The full archive is held as a single `ArrayBuffer`
 *   before upload to object storage. Acceptable for the MVP export
 *   sizes documented on the artifact-size invariant; a streaming
 *   adapter is a follow-up.
 * - ZIP64 is not emitted. Per-entry and central-directory offsets are
 *   constrained to 32-bit, matching the artifact-size cap.
 *
 * MVP では未圧縮 (store) のみサポートする。本格的な圧縮や ZIP64 対応は本クラスを差し替えること。
 */
export class InMemoryZipArchiveBuilder implements ArchiveBuilder {
  async createZip(files: AsyncIterable<ArchiveEntry>): Promise<ArrayBuffer> {
    const localChunks: Uint8Array[] = [];
    const centralChunks: Uint8Array[] = [];
    let offset = 0;
    let entryCount = 0;

    for await (const entry of files) {
      const encoded = encodeEntry(entry, offset);
      localChunks.push(encoded.local);
      centralChunks.push(encoded.central);
      offset += encoded.local.byteLength;
      entryCount += 1;
      if (offset > MAX_OFFSET) {
        throw new ArchiveError(
          `ZIP archive exceeds 32-bit offset limit (${offset} > ${MAX_OFFSET})`,
        );
      }
    }

    const centralStart = offset;
    const centralSize = centralChunks.reduce(
      (sum, chunk) => sum + chunk.byteLength,
      0,
    );
    if (centralStart + centralSize > MAX_OFFSET) {
      throw new ArchiveError(
        "ZIP archive central directory exceeds 32-bit offset limit",
      );
    }

    const endRecord = buildEndOfCentralDirectory({
      entryCount,
      centralSize,
      centralStart,
    });

    const total = centralStart + centralSize + endRecord.byteLength;
    const buffer = new Uint8Array(total);
    let cursor = 0;
    for (const chunk of localChunks) {
      buffer.set(chunk, cursor);
      cursor += chunk.byteLength;
    }
    for (const chunk of centralChunks) {
      buffer.set(chunk, cursor);
      cursor += chunk.byteLength;
    }
    buffer.set(endRecord, cursor);

    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
  }
}

const MAX_OFFSET = 0xffffffff;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const VERSION_NEEDED = 20;
const VERSION_MADE_BY = 20;
// Bit 11 declares the filename is UTF-8 — matches our `TextEncoder` output
// so any non-ASCII path round-trips through compliant ZIP readers.
const GENERAL_PURPOSE_FLAG = 0x0800;
const METHOD_STORED = 0;
const CRC_TABLE: Uint32Array = buildCrcTable();

function encodeEntry(
  entry: ArchiveEntry,
  offset: number,
): { local: Uint8Array; central: Uint8Array } {
  const data = new Uint8Array(entry.bytes);
  if (data.byteLength > MAX_OFFSET) {
    throw new ArchiveError(
      `ZIP entry '${entry.path}' exceeds 32-bit size limit`,
    );
  }
  const nameBytes = new TextEncoder().encode(normalizePath(entry.path));
  if (nameBytes.byteLength > 0xffff) {
    throw new ArchiveError(`ZIP entry path '${entry.path}' is too long`);
  }
  const crc = crc32(data);
  const { dosDate, dosTime } = epochDos();

  const local = new Uint8Array(30 + nameBytes.byteLength + data.byteLength);
  const localView = new DataView(local.buffer);
  localView.setUint32(0, LOCAL_FILE_HEADER_SIGNATURE, true);
  localView.setUint16(4, VERSION_NEEDED, true);
  localView.setUint16(6, GENERAL_PURPOSE_FLAG, true);
  localView.setUint16(8, METHOD_STORED, true);
  localView.setUint16(10, dosTime, true);
  localView.setUint16(12, dosDate, true);
  localView.setUint32(14, crc, true);
  localView.setUint32(18, data.byteLength, true);
  localView.setUint32(22, data.byteLength, true);
  localView.setUint16(26, nameBytes.byteLength, true);
  localView.setUint16(28, 0, true);
  local.set(nameBytes, 30);
  local.set(data, 30 + nameBytes.byteLength);

  const central = new Uint8Array(46 + nameBytes.byteLength);
  const centralView = new DataView(central.buffer);
  centralView.setUint32(0, CENTRAL_DIRECTORY_HEADER_SIGNATURE, true);
  centralView.setUint16(4, VERSION_MADE_BY, true);
  centralView.setUint16(6, VERSION_NEEDED, true);
  centralView.setUint16(8, GENERAL_PURPOSE_FLAG, true);
  centralView.setUint16(10, METHOD_STORED, true);
  centralView.setUint16(12, dosTime, true);
  centralView.setUint16(14, dosDate, true);
  centralView.setUint32(16, crc, true);
  centralView.setUint32(20, data.byteLength, true);
  centralView.setUint32(24, data.byteLength, true);
  centralView.setUint16(28, nameBytes.byteLength, true);
  centralView.setUint16(30, 0, true);
  centralView.setUint16(32, 0, true);
  centralView.setUint16(34, 0, true);
  centralView.setUint16(36, 0, true);
  centralView.setUint32(38, 0, true);
  centralView.setUint32(42, offset, true);
  central.set(nameBytes, 46);

  return { local, central };
}

function buildEndOfCentralDirectory(args: {
  entryCount: number;
  centralSize: number;
  centralStart: number;
}): Uint8Array {
  if (args.entryCount > 0xffff) {
    throw new ArchiveError(
      `ZIP archive entry count exceeds 16-bit limit (${args.entryCount})`,
    );
  }
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, END_OF_CENTRAL_DIRECTORY_SIGNATURE, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, args.entryCount, true);
  view.setUint16(10, args.entryCount, true);
  view.setUint32(12, args.centralSize, true);
  view.setUint32(16, args.centralStart, true);
  view.setUint16(20, 0, true);
  return record;
}

function normalizePath(path: string): string {
  // ZIP spec mandates forward-slash separators and no leading slashes.
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.byteLength; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// Deterministic DOS-format timestamp (1980-01-01 00:00:00). Adapters
// that need real clocks can subclass; the export usecase records
// `completedAt` separately on the domain entity, so the archive's
// internal timestamp does not need to match wall-clock.
function epochDos(): { dosDate: number; dosTime: number } {
  return { dosDate: 0x0021, dosTime: 0x0000 };
}
