const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = (CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosTime(date) {
  return (
    ((date.getSeconds() >> 1) & 0x1f) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getHours() & 0x1f) << 11)
  );
}

function dosDate(date) {
  return (
    (date.getDate() & 0x1f) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (((date.getFullYear() - 1980) & 0x7f) << 9)
  );
}

// Creates an uncompressed (STORE method) ZIP archive from an array of
// { name: string, data: Buffer } entries. Returns a Buffer.
export function createZip(files) {
  const chunks = [];
  const centralDirEntries = [];
  let offset = 0;

  const now = new Date();
  const modTime = dosTime(now);
  const modDate = dosDate(now);

  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name, "utf8");
    const checksum = crc32(data);
    const size = data.length;

    const localHeader = Buffer.alloc(30 + nameBytes.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(modTime, 10);
    localHeader.writeUInt16LE(modDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(size, 18);
    localHeader.writeUInt32LE(size, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBytes.copy(localHeader, 30);

    centralDirEntries.push({ nameBytes, checksum, size, offset, modTime, modDate });
    chunks.push(localHeader, data);
    offset += localHeader.length + size;
  }

  const centralDirOffset = offset;

  for (const entry of centralDirEntries) {
    const { nameBytes, checksum, size, offset: localOffset, modTime, modDate } = entry;
    const cdEntry = Buffer.alloc(46 + nameBytes.length);
    cdEntry.writeUInt32LE(0x02014b50, 0);
    cdEntry.writeUInt16LE(20, 4);
    cdEntry.writeUInt16LE(20, 6);
    cdEntry.writeUInt16LE(0x0800, 8);
    cdEntry.writeUInt16LE(0, 10);
    cdEntry.writeUInt16LE(modTime, 12);
    cdEntry.writeUInt16LE(modDate, 14);
    cdEntry.writeUInt32LE(checksum, 16);
    cdEntry.writeUInt32LE(size, 20);
    cdEntry.writeUInt32LE(size, 24);
    cdEntry.writeUInt16LE(nameBytes.length, 28);
    cdEntry.writeUInt16LE(0, 30);
    cdEntry.writeUInt16LE(0, 32);
    cdEntry.writeUInt16LE(0, 34);
    cdEntry.writeUInt16LE(0, 36);
    cdEntry.writeUInt32LE(0, 38);
    cdEntry.writeUInt32LE(localOffset, 42);
    nameBytes.copy(cdEntry, 46);
    chunks.push(cdEntry);
    offset += cdEntry.length;
  }

  const centralDirSize = offset - centralDirOffset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(centralDirEntries.length, 8);
  eocd.writeUInt16LE(centralDirEntries.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);
  chunks.push(eocd);

  return Buffer.concat(chunks);
}
