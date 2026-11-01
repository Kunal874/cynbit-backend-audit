# Security headers and hardening (F-05, F-11, F-13)

## Problem
No route sends `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy` or `Permissions-Policy`. `X-Powered-By: Next.js` is present. HSTS doesn't cover subdomains. There's no CAA record and no `security.txt`. JSON-LD is injected without escaping `<`. See [F-05](../REPORT.md#f-05), [F-11](../REPORT.md#f-11) and [F-13](../REPORT.md#f-13).

---

## 1. Static security headers (5 minutes, no risk)

```ts
// next.config.ts
import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },                              // legacy browsers; CSP frame-ancestors below
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' }, // keeps payment popups working
];

const nextConfig: NextConfig = {
  poweredByHeader: false, // F-11: drop X-Powered-By
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
```
These headers are added to static (edge-cached) responses as well, so they cost no performance.

## 2. Content-Security-Policy: start realistic, then tighten

**The trade-off.** The App Router streams page data through inline scripts (`self.__next_f.push(...)`). A strict nonce-based CSP needs a fresh nonce per request, which forces **every page to be dynamic**. That would undo the edge caching recommended in [`rendering-and-caching.md`](rendering-and-caching.md). For a mostly static marketing site, the better first step is a **static allow-list CSP** that keeps `'unsafe-inline'` for scripts but locks down everything else: framing, plugins, `<base>` hijacking, form targets, and where the page can connect or load from.

```ts
// next.config.ts (add to securityHeaders)
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://sdk.cashfree.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://images.unsplash.com https://www.googletagmanager.com https://*.google-analytics.com https://*.google.com https://*.google.co.in https://*.doubleclick.net",
  "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://stats.g.doubleclick.net https://*.cashfree.com",
  "frame-src https://*.cashfree.com https://challenges.cloudflare.com",
  "frame-ancestors 'none'",       // clickjacking protection for /bitelevate and /contact
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.cashfree.com",
  'upgrade-insecure-requests',
].join('; ');

// Week 1: observe only
{ key: 'Content-Security-Policy-Report-Only', value: csp }
// Week 2+: once the browser console / reports show no violations from real flows (checkout included)
{ key: 'Content-Security-Policy', value: csp }
```
The origin list comes from what the site actually loads ([`evidence/1.7-endpoints.md`](../evidence/1.7-endpoints.md)), plus Turnstile from [`server-actions.md`](server-actions.md). Running Report-Only first is what makes this safe: any Cashfree or Google host the list missed shows up as a console warning, not a broken checkout.

**Later:** if the site gains authenticated pages (portal/admin), give *those* routes a nonce-based CSP in `middleware.ts`. They're dynamic anyway, so a nonce costs nothing there.

## 3. Transport and disclosure

**HSTS for subdomains.** Vercel sends `max-age=63072000` for the apex and `www`. Once `portal.`, `support.` and `bitelevate.` are confirmed HTTPS-only, extend it (and optionally submit to hstspreload.org):
```ts
{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }
```
Don't add `includeSubDomains` before checking every subdomain. It's sticky in browsers for two years.

**CAA record** (GoDaddy DNS). `www` already inherits Vercel's CAA through its CNAME. Mirror it on the apex so only these CAs can issue certificates for `cynbit.in`:
```
cynbit.in.  CAA  0 issue "letsencrypt.org"
cynbit.in.  CAA  0 issue "pki.goog"
cynbit.in.  CAA  0 issue "globalsign.com"
cynbit.in.  CAA  0 issue "sectigo.com"
cynbit.in.  CAA  0 iodef "mailto:security@cynbit.in"
```

**`security.txt`** (RFC 9116), so researchers have a disclosure channel:
```
# public/.well-known/security.txt
Contact: mailto:security@cynbit.in
Expires: 2027-11-01T00:00:00.000Z
Preferred-Languages: en, hi
Canonical: https://www.cynbit.in/.well-known/security.txt
```

## 4. Safe JSON-LD

`JSON.stringify` doesn't escape `<`, so a DB value containing `</script>` would break out of the `<script type="application/ld+json">` tag. One shared component fixes every page:

```tsx
// components/json-ld.tsx
import { safeJsonLd } from '@/lib/security'; // = recommendations/code/lib.ts (tested)

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }} />;
}
```
`safeJsonLd` replaces `<` with `<`, which is still valid JSON and parses back to the same object. The test in [`code/lib.test.ts`](code/lib.test.ts) checks both properties.

## How to verify
```bash
curl -sI https://www.cynbit.in/ | grep -iE 'content-security|x-frame|x-content-type|referrer-policy|permissions-policy|x-powered-by'
```
- Expect five security headers and **no** `X-Powered-By`.
- securityheaders.com grade moves from **F** to **A** (A+ once CSP is enforced without `unsafe-inline` on dynamic routes).
- Try to frame the site: `<iframe src="https://www.cynbit.in/bitelevate">` on any other origin is refused.
- `dig CAA cynbit.in` lists the four CAs; `https://www.cynbit.in/.well-known/security.txt` returns 200 `text/plain`.
