// Shared helpers referenced by the recommendation docs.
// Dependency-free so they run under `node --test` (Node ≥ 23 strips TS types natively).

import { createHmac, timingSafeEqual } from 'node:crypto';

// ---- F-03: Cashfree webhook signature -------------------------------------------
// Cashfree signs `timestamp + rawBody` with HMAC-SHA256 using the app's client secret
// and sends base64(signature) in `x-webhook-signature`, the timestamp (epoch ms) in
// `x-webhook-timestamp`. Confirm header names/encoding for the API version in use.
export function verifyCashfreeSignature(
  rawBody: string,
  timestamp: string,
  signature: string,
  secret: string,
  nowMs: number = Date.now(),
  toleranceMs: number = 5 * 60_000,
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs - ts) > toleranceMs) return false; // replay window

  const expected = Buffer.from(createHmac('sha256', secret).update(timestamp + rawBody).digest('base64'));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

// ---- F-13: JSON-LD that cannot break out of <script> --------------------------------
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

// ---- F-12: one result envelope for every Server Action ------------------------------
export type ActionErrorCode = 'VALIDATION' | 'RATE_LIMITED' | 'CAPTCHA_FAILED' | 'UPSTREAM' | 'INTERNAL';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: ActionErrorCode; message: string; fieldErrors?: Record<string, string[]> };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (
  code: ActionErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> => ({ ok: false, code, message, fieldErrors });
