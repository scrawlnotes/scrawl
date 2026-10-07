// QuickXorHash, the digest OneDrive gives of every file in personal and work accounts alike:
// each byte is XORed into a 160-bit block at a place that moves 11 bits further with every byte,
// round the block, and the length is XORed into the block's last 8 bytes. See
// https://learn.microsoft.com/onedrive/developer/code-snippets/quickxorhash

const WIDTH = 160;
const SHIFT = 11;
/** How much of a file is read at a time. */
const SLICE = 4 * 1024 * 1024;

/** The QuickXorHash of some content, in base64 as OneDrive gives it (`file.hashes.quickXorHash`). */
export async function quickXorHash(data: Blob): Promise<string> {
  // Every 160th byte lands in the same place (160 × 11 is a whole turn of the block), so the
  // bytes are first folded into 160 by their place, then each of those goes into the block once.
  const folded = new Uint8Array(WIDTH);
  let at = 0;
  for (let offset = 0; offset < data.size; offset += SLICE) {
    const bytes = new Uint8Array(await data.slice(offset, offset + SLICE).arrayBuffer());
    for (let i = 0; i < bytes.length; i++) {
      folded[at] = folded[at]! ^ bytes[i]!;
      if (++at === WIDTH) at = 0;
    }
  }
  const block = new Uint8Array(WIDTH / 8);
  for (let n = 0; n < WIDTH; n++) {
    const value = folded[n]!;
    if (value === 0) continue;
    const bit = (n * SHIFT) % WIDTH;
    const byte = bit >> 3;
    const shift = bit & 7;
    block[byte] = block[byte]! ^ ((value << shift) & 0xff);
    const next = (byte + 1) % block.length;
    if (shift > 0) block[next] = block[next]! ^ (value >> (8 - shift));
  }
  // The length, 64 bits little-endian, into the last 8 bytes.
  let length = data.size;
  for (let i = block.length - 8; i < block.length; i++) {
    block[i] = block[i]! ^ (length % 256);
    length = Math.floor(length / 256);
  }
  return toBase64(block);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
