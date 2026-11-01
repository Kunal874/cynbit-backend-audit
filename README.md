# Cynbit Backend Audit

A passive, backend-focused technical audit of **[www.cynbit.in](https://www.cynbit.in)**: API behaviour, data handling, security, performance and architecture, with evidence for every finding and ready-to-use fixes.

> Submitted for the **Backend Developer Intern** assessment (Phase 2) by Kunal Chandrakar · 1–2 November 2026

## Summary

Cynbit runs a **Next.js 15.5 App Router** app on **Vercel's Mumbai edge**. It has no REST API: every write (contact, leads, newsletter and a **Cashfree payment flow** for the ₹3,999 BitElevate programme) goes through **five public Server Actions**, backed by what looks like **Prisma over SQL**. The foundations are solid: TLS 1.2/1.3 only, no leaked secrets, server-side pricing, no over-fetching, and 30 ms edge responses. The main risks are a **framework 10 security patches behind**, **server-rendered pages hidden until JavaScript runs** (mobile first paint 9.1 s), a **payment completion flow that returns login credentials to the browser**, and **write endpoints with no visible abuse controls or security headers**. Most fixes are small.

**15 findings: 2 High · 6 Medium · 7 Low, plus 12 things done well.**

| ID | Top findings | Severity | Fix |
|---|---|---|---|
| [F-01](REPORT.md#f-01) | Next.js 15.5.18 is 10 patches behind; 2 High + 1 Medium advisories match this architecture | High | [patch + Dependabot](recommendations/dependencies.md) |
| [F-02](REPORT.md#f-02) | Prerendered HTML ships with `opacity:0`; mobile FCP **9.1 s** despite a **30 ms** server response | High | [CSS-only animation](recommendations/rendering-and-caching.md#1-dont-hide-server-rendered-html) |
| [F-03](REPORT.md#f-03) | Payment verify returns **login credentials** from a URL token that GA4 records; browser-triggered fulfilment | Medium | [signed webhook + email link](recommendations/payments.md) |
| [F-04](REPORT.md#f-04) | 5 public Server Actions: no length caps, CAPTCHA or rate-limit signals | Medium | [zod + Upstash + Turnstile](recommendations/server-actions.md) |
| [F-05](REPORT.md#f-05) | No CSP, frame protection, nosniff, Referrer- or Permissions-Policy | Medium | [headers + CSP](recommendations/security-headers.md) |
| [F-06](REPORT.md#f-06) | Blog/careers/case studies rendered per request (8–14× slower); random slugs force uncached DB lookups | Medium | [ISR + static params](recommendations/rendering-and-caching.md#2-cache-content-that-rarely-changes) |

All 15, with evidence: **[REPORT.md](REPORT.md)**

## What's in this repo

| Path | Contents |
|---|---|
| [`REPORT.md`](REPORT.md) | **The audit report:** architecture (diagrams), API structure and payloads, findings table, 15 detailed findings, positives, verification gaps |
| [`recommendations/`](recommendations/) | **Fixes with code** (Next.js / TypeScript), one file per theme, plus [target architecture and roadmap](recommendations/architecture.md) |
| [`recommendations/code/`](recommendations/code/) | Shared helpers (webhook signature check, safe JSON-LD, `ActionResult`) with tests |
| [`evidence/`](evidence/) | Raw, redacted outputs for every step (headers, DNS, TLS, bundle analysis, timings, Lighthouse, advisories) |
| [`notes/findings-log.md`](notes/findings-log.md) | Timestamped observations, written as they were made |
| [`PLAN.md`](PLAN.md) | Methodology, rules of engagement and step tracker. Commit history follows it step by step. |

## Methodology

Passive and non-intrusive only. I made the same requests a browser makes, identified with the User-Agent `cynbit-backend-audit; passive review` and spaced at least 2 s apart. I also used third-party passive sources (DNS-over-HTTPS, Certificate Transparency, the GitHub Advisory Database) and read the public JavaScript bundles to map the backend surface. **No** fuzzing, payloads, brute force, rate-limit testing, form submissions, payment replays or authenticated access. Anything that couldn't be observed from outside is marked **Inferred** and listed in [REPORT §7](REPORT.md#7-what-passive-testing-could-not-verify).

Tools: `curl`, `openssl`, Lighthouse 12.8.2, browser DevTools / Resource Timing API, GitHub CLI.

## Run the code checks

```bash
node --test recommendations/code/lib.test.ts   # Node ≥ 23 (runs TypeScript natively), no install needed
```
