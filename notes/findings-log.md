# Findings log (append-only)

Raw observations as they happen, newest at the bottom. Format: `[date time IST] [step] observation, evidence pointer`.
Promoted to `REPORT.md` in Phase 4.

---

- [2026-11-01 22:40] [0.1] Target confirmed: `https://www.cynbit.in` (Cynbit Technologies, Jaipur). Page title repeats the brand: "Cynbit Technologies | AI Automation & Software Solutions Jaipur | Cynbit Technologies".
- [2026-11-01 22:40] [0.1] Hosting: `Server: Vercel`, `X-Vercel-Id: bom1::…` → Vercel edge, Mumbai region.
- [2026-11-01 22:40] [0.1] Framework: `X-Nextjs-Prerender: 1`, `X-Nextjs-Stale-Time: 300`, `X-Vercel-Cache: HIT` → Next.js, prerendered (SSG/ISR), served from edge cache.
- [2026-11-01 22:40] [0.1] Apex `https://cynbit.in` → `307 Temporary Redirect` → `https://www.cynbit.in/`. Temporary, so not cached by browsers/crawlers as canonical; 308 is the permanent equivalent. Candidate Low (perf + SEO).
- [2026-11-01 22:40] [0.1] `Strict-Transport-Security: max-age=63072000` with no `includeSubDomains` / `preload`. Candidate Low. Verify in 1.4.
