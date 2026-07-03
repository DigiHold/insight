import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Standard TOTP (RFC 6238) with SHA-1, 6 digits, 30-second steps: the exact
// scheme every authenticator app uses (Google Authenticator, 1Password, Authy).
// Implemented on Node's crypto so there is no third-party OTP dependency to keep
// current, and it is validated against the RFC 6238 test vectors.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // RFC 4648 base32
const DIGITS = 6;
const PERIOD = 30;

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const bin =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return (bin % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

// A fresh base32 secret (20 bytes = 160 bits, the RFC-recommended length).
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

// The otpauth:// URI an authenticator app scans, spelling out the parameters.
export function keyuri(label: string, issuer: string, secret: string): string {
  const account = encodeURIComponent(`${issuer}:${label}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(PERIOD) });
  return `otpauth://totp/${account}?${params.toString()}`;
}

export function generateToken(secret: string, atMs: number = Date.now()): string {
  return hotp(base32Decode(secret), Math.floor(atMs / 1000 / PERIOD));
}


// Verify a code, accepting the adjacent 30s steps to tolerate clock drift.
// Constant-time comparison, and it never throws on malformed input.
export function verifyToken(token: string, secret: string, window = 1): boolean {
  const code = (token || '').replace(/\D/g, '');
  if (code.length !== DIGITS || !secret) return false;
  const key = base32Decode(secret);
  const step = Math.floor(Date.now() / 1000 / PERIOD);
  const given = Buffer.from(code);
  for (let w = -window; w <= window; w++) {
    const expected = Buffer.from(hotp(key, step + w));
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}
