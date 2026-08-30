/**
 * Shared auth helpers for the server-side session cookie.
 *
 * The old login checked a NEXT_PUBLIC_* password in the browser bundle — the
 * secret was ship-inspector-readable. Now the credentials only exist server-side
 * (process.env.ADMIN_ID / ADMIN_PASSWORD / SESSION_SECRET) and the browser gets
 * an HttpOnly, HMAC-signed, expiring cookie that the API middleware verifies.
 *
 * Uses Web Crypto (crypto.subtle) so it runs in both the Edge middleware and
 * Node.js API routes.
 */

export const SESSION_COOKIE = 'snooker_session';
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

function secret(): string {
  // Never fall back to a NEXT_PUBLIC_ env var — those are bundled into the browser.
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || 'break-and-game-dev-secret';
}

function encode(s: string): Uint8Array<ArrayBuffer> {
  // Copy into a fresh ArrayBuffer-backed view so it satisfies WebCrypto's
  // BufferSource type on all TS lib versions.
  const bytes = new TextEncoder().encode(s);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

async function hmacSign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Issue a signed session token valid for 12h. */
export async function issueSession(): Promise<{ token: string; maxAgeSeconds: number }> {
  const exp = Date.now() + SESSION_MAX_AGE_MS;
  const payload = `s1_${exp}`;
  const sig = await hmacSign(payload);
  return { token: `${payload}.${sig}`, maxAgeSeconds: Math.floor(SESSION_MAX_AGE_MS / 1000) };
}

/** Verify a session token: signature matches and not expired. */
export async function isSessionValid(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const lastDot = token.lastIndexOf('.');
  if (lastDot <= 0) return false;
  const payload = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);

  const m = /^s1_(\d+)$/.exec(payload);
  if (!m) return false;
  if (Number(m[1]) < Date.now()) return false; // expired

  const expected = await hmacSign(payload);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}