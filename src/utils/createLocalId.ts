const HEX = Array.from({ length: 256 }, (_, value) => value.toString(16).padStart(2, '0'));

export function createUuid() {
  const platformUuid = globalThis.crypto?.randomUUID;

  if (typeof platformUuid === 'function') {
    return platformUuid.call(globalThis.crypto);
  }

  const bytes = new Uint8Array(16);
  const getRandomValues = globalThis.crypto?.getRandomValues;

  if (typeof getRandomValues === 'function') {
    getRandomValues.call(globalThis.crypto, bytes);
  } else {
    let timestamp = Date.now() + (globalThis.performance?.now?.() ?? 0);

    for (let index = 0; index < bytes.length; index += 1) {
      timestamp = (timestamp + Math.random() * 0x1_0000_0000) % 0x1_0000_0000;
      bytes[index] = timestamp & 0xff;
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return [
    bytes.slice(0, 4),
    bytes.slice(4, 6),
    bytes.slice(6, 8),
    bytes.slice(8, 10),
    bytes.slice(10, 16),
  ]
    .map((section) => Array.from(section, (byte) => HEX[byte]).join(''))
    .join('-');
}

export function createUniqueUuid(existingIds: Iterable<string>) {
  const existing = new Set(existingIds);
  let candidate = createUuid();

  while (existing.has(candidate)) {
    candidate = createUuid();
  }

  return candidate;
}
