// Browser-safe UUID v5 implementation for the file:// renderer.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseUuid(value) {
  if (!UUID_RE.test(value)) throw new TypeError('Invalid UUID');
  const compact = value.replaceAll('-', '');
  const bytes = new Uint8Array(16);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(compact.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function rotateLeft(value, amount) {
  return (value << amount) | (value >>> (32 - amount));
}

function sha1(bytes) {
  const constants = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6];
  const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const padded = new Uint8Array(bytes.length + 1);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const blockCount = Math.ceil((padded.length / 4 + 2) / 16);
  const message = new Uint8Array(blockCount * 64);
  message.set(padded);
  const bitLength = bytes.length * 8;
  const highLength = Math.floor(bitLength / 0x100000000);
  message[message.length - 8] = (highLength >>> 24) & 0xff;
  message[message.length - 7] = (highLength >>> 16) & 0xff;
  message[message.length - 6] = (highLength >>> 8) & 0xff;
  message[message.length - 5] = highLength & 0xff;
  message[message.length - 4] = (bitLength >>> 24) & 0xff;
  message[message.length - 3] = (bitLength >>> 16) & 0xff;
  message[message.length - 2] = (bitLength >>> 8) & 0xff;
  message[message.length - 1] = bitLength & 0xff;

  for (let block = 0; block < blockCount; block += 1) {
    const words = new Uint32Array(80);
    for (let index = 0; index < 16; index += 1) {
      const offset = block * 64 + index * 4;
      words[index] = (message[offset] << 24)
        | (message[offset + 1] << 16)
        | (message[offset + 2] << 8)
        | message[offset + 3];
    }
    for (let index = 16; index < 80; index += 1) {
      words[index] = rotateLeft(
        words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16],
        1,
      );
    }

    let [a, b, c, d, e] = state;
    for (let index = 0; index < 80; index += 1) {
      const round = Math.floor(index / 20);
      const functionValue = round === 0
        ? ((b & c) ^ (~b & d))
        : round === 1
          ? (b ^ c ^ d)
          : round === 2
            ? ((b & c) ^ (b & d) ^ (c & d))
            : (b ^ c ^ d);
      const next = (rotateLeft(a, 5) + functionValue + e + constants[round] + words[index]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30) >>> 0;
      b = a;
      a = next;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
  }

  return Uint8Array.from(state.flatMap((value) => [
    value >>> 24,
    value >>> 16,
    value >>> 8,
    value,
  ]));
}

function stringifyUuid(bytes) {
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uuidv5(value, namespace) {
  const namespaceBytes = parseUuid(namespace);
  const valueBytes = new TextEncoder().encode(String(value));
  const input = new Uint8Array(namespaceBytes.length + valueBytes.length);
  input.set(namespaceBytes);
  input.set(valueBytes, namespaceBytes.length);
  const hash = sha1(input);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return stringifyUuid(hash.slice(0, 16));
}

export default uuidv5;
