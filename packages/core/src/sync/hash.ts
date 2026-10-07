/** The SHA-256 digest of some content, in hex: how the engine tells whether two contents are the same. */
export async function sha256(data: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await data.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
