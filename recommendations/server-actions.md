# Server Actions: validation, abuse protection, error contract (F-04, F-12)

## Problem
The site's whole write API is five Server Actions (`submitInquiry`, `submitServiceLead`, `subscribeToNewsletter`, `createBitelevateCashfreeOrder`, `verifyBitelevatePayment`). Their IDs ship in the public JS, so each is a **public POST endpoint** that can be called without the UI. The client checks only `required`/`type=email`. There are no length caps, no CAPTCHA and no rate-limit headers, and results are ad-hoc objects. See [F-04](../REPORT.md#f-04) and [F-12](../REPORT.md#f-12).

The fix is one short pipeline that every action goes through:

```
FormData → [1] zod schema (types + length caps) → [2] rate limit (IP + action) → [3] Turnstile (public forms) → handler → [4] ActionResult
```

---

## 1. Validate on the server with length caps

```ts
// lib/validation/schemas.ts
import { z } from 'zod';

const name = z.string().trim().min(2).max(100);
const email = z.string().trim().toLowerCase().email().max(254);
const text = (max: number) => z.string().trim().max(max);

export const inquirySchema = z.object({
  fullName: name,
  email,
  company: text(120).optional(),
  industry: text(80).optional(),
  message: text(2000).min(10),
});

export const newsletterSchema = z.object({ email });

export const bitelevateOrderSchema = z.object({
  fullName: name,
  email,
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{8,20}$/),
  university: text(120).min(2),
  track: z.enum(['frontend', 'backend', 'fullstack', 'ai-ml']), // match the real <select> values
  duration: z.enum(['60']),
  ambitions: text(1000).min(10),
  referralName: text(100).optional(),
});
```
`z.enum` for `track`/`duration` stops arbitrary values reaching the DB and the Cashfree order notes. The caps bound storage per request, and Next's `bodySizeLimit` (§5) bounds the whole request.

## 2. Rate limit per IP + action (shared store)

In-memory counters **don't work on Vercel**: each serverless instance has its own memory, and requests spread across instances. Use a shared store (Upstash Redis via the Vercel Marketplace), or a Vercel Firewall rate-limit rule on `POST` paths.

```ts
// lib/security/guard.ts
import 'server-only';
import { headers } from 'next/headers';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { fail, type ActionResult } from '@/lib/action-result'; // = recommendations/code/lib.ts

const redis = Redis.fromEnv();
const limits = {
  inquiry:    new Ratelimit({ redis, prefix: 'rl:inquiry',    limiter: Ratelimit.slidingWindow(3, '10 m') }),
  lead:       new Ratelimit({ redis, prefix: 'rl:lead',       limiter: Ratelimit.slidingWindow(3, '10 m') }),
  newsletter: new Ratelimit({ redis, prefix: 'rl:newsletter', limiter: Ratelimit.slidingWindow(5, '1 h') }),
  order:      new Ratelimit({ redis, prefix: 'rl:order',      limiter: Ratelimit.slidingWindow(5, '30 m') }),
  status:     new Ratelimit({ redis, prefix: 'rl:status',     limiter: Ratelimit.slidingWindow(30, '1 m') }),
};

export async function clientIp(): Promise<string> {
  const h = await headers();
  // On Vercel these are set by the platform, not the client.
  return h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export async function guard(
  action: keyof typeof limits,
  turnstileToken?: FormDataEntryValue | null,
): Promise<ActionResult<never> | null> {
  const ip = await clientIp();

  const { success } = await limits[action].limit(ip);
  if (!success) return fail('RATE_LIMITED', 'Too many requests. Please try again later.');

  if (turnstileToken !== undefined && !(await verifyTurnstile(turnstileToken, ip))) {
    return fail('CAPTCHA_FAILED', 'Please complete the verification and try again.');
  }
  return null; // allowed
}
```

## 3. Turnstile on public forms

Add the widget to the contact, lead, newsletter and order forms. It posts a hidden `cf-turnstile-response` field. Verify it server-side:

```ts
// lib/security/guard.ts (continued)
async function verifyTurnstile(token: FormDataEntryValue | null, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new Error('TURNSTILE_SECRET_KEY is not set');
  if (typeof token !== 'string' || token.length === 0) return false;

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success: boolean };
  return data.success;
}
```
Turnstile is free and usually invisible to real users. A honeypot field (`<input name="website" hidden>` that must stay empty) is a zero-cost extra layer.

## 4. One result envelope

Every action returns the same discriminated union, so the UI and the logs can branch on a stable `code` instead of parsing messages. The type and helpers are in [`code/lib.ts`](code/lib.ts) and covered by tests:

```ts
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: 'VALIDATION' | 'RATE_LIMITED' | 'CAPTCHA_FAILED' | 'UPSTREAM' | 'INTERNAL';
      message: string; fieldErrors?: Record<string, string[]> };
```

Putting it together:
```ts
// app/(marketing)/contact/actions.ts
'use server';
import { inquirySchema } from '@/lib/validation/schemas';
import { guard } from '@/lib/security/guard';
import { ok, fail, type ActionResult } from '@/lib/action-result';
import { prisma } from '@/lib/prisma';

export async function submitInquiry(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const blocked = await guard('inquiry', formData.get('cf-turnstile-response'));
  if (blocked) return blocked;

  const parsed = inquirySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail('VALIDATION', 'Please check the highlighted fields.', parsed.error.flatten().fieldErrors);
  }

  try {
    const row = await prisma.inquiry.create({ data: parsed.data, select: { id: true } });
    return ok(row);
  } catch (err) {
    console.error(JSON.stringify({ event: 'inquiry.create_failed', err: String(err) })); // no PII in logs
    return fail('INTERNAL', 'Something went wrong. Please try again.');
  }
}
```
The UI shows `fieldErrors` next to inputs, "slow down" for `RATE_LIMITED`, and a generic message otherwise. Internal errors are never echoed to the client.

## 5. Framework limits and API errors

```ts
// next.config.ts (excerpt)
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '64kb',                 // default 1 MB; these forms need a few KB
      allowedOrigins: ['www.cynbit.in'],     // explicit; Next already rejects cross-origin action POSTs
    },
  },
};
```

For `/api/*` (the Cashfree webhook in [`payments.md`](payments.md), and anything added later), return RFC 9457 problem details, including for unknown routes, which currently return the marketing HTML 404:
```ts
// app/api/[...path]/route.ts — catch-all, lower priority than real API routes
const notFound = () =>
  Response.json(
    { type: 'about:blank', title: 'Not Found', status: 404 },
    { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
  );
export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
```

## How to verify
- Unit tests per schema: oversized `message` (2,001 chars), bad `track`, missing `email` → `VALIDATION` with field errors.
- On a **preview deployment**: the 4th inquiry from one IP within 10 minutes → `RATE_LIMITED`; a request without a Turnstile token → `CAPTCHA_FAILED`.
- `curl -s https://<preview>/api/nope -i` → `404` with `Content-Type: application/problem+json`.
- Vercel logs: failures appear as JSON lines with an `event` field, with no emails or messages in them.
