# Findings log (append-only)

Raw observations as they happen, newest at the bottom. Format: `[date time IST] [step] observation, evidence pointer`.
Promoted to `REPORT.md` in Phase 4.

---

- [2026-11-01 22:40] [0.1] Target confirmed: `https://www.cynbit.in` (Cynbit Technologies, Jaipur). Page title repeats the brand: "Cynbit Technologies | AI Automation & Software Solutions Jaipur | Cynbit Technologies".
- [2026-11-01 22:40] [0.1] Hosting: `Server: Vercel`, `X-Vercel-Id: bom1::…` → Vercel edge, Mumbai region.
- [2026-11-01 22:40] [0.1] Framework: `X-Nextjs-Prerender: 1`, `X-Nextjs-Stale-Time: 300`, `X-Vercel-Cache: HIT` → Next.js, prerendered (SSG/ISR), served from edge cache.
- [2026-11-01 22:40] [0.1] Apex `https://cynbit.in` → `307 Temporary Redirect` → `https://www.cynbit.in/`. Temporary, so not cached by browsers/crawlers as canonical; 308 is the permanent equivalent. Candidate Low (perf + SEO).
- [2026-11-01 22:40] [0.1] `Strict-Transport-Security: max-age=63072000` with no `includeSubDomains` / `preload`. Candidate Low. Verify in 1.4.
- [2026-11-01 23:00] [1.1] DNS hosted at GoDaddy (`ns33/ns34.domaincontrol.com`). Apex A `216.198.79.1` (Vercel anycast); `www` CNAME → `e12d688042344235.vercel-dns-017.com`. → `evidence/1.1-dns.txt`
- [2026-11-01 23:00] [1.1] Email on Microsoft 365 provisioned via GoDaddy (MX `cynbit-in.mail.protection.outlook.com`, TXT `NETORG20603639.onmicrosoft.com`).
- [2026-11-01 23:00] [1.1] SPF `v=spf1 include:secureserver.net -all`. Checked the chain: `secureserver.net` → `spf-0.secureserver.net` → `include:spf.protection.outlook.com`, so M365 is authorised and `-all` is strict. **Good practice, not a finding.**
- [2026-11-01 23:00] [1.1] DMARC `v=DMARC1; p=none;` with no `rua`/`ruf`. Spoofed `From: …@cynbit.in` mail is not quarantined/rejected, and nobody receives reports. Relevant because the company emails job candidates (fake-offer phishing risk). Candidate **Medium** (Security).
- [2026-11-01 23:00] [1.1] No CAA record on apex `cynbit.in`, so any CA may issue certificates for it (`www` inherits Vercel's CAA via CNAME). Candidate **Low**.
- [2026-11-01 23:01] [1.2] crt.sh 502; Cert Spotter shows 8 certs naming `support.`, `portal.`, `bitelevate.`, `www.`, apex. Recorded only; check in 1.7 whether the site links to them. → `evidence/1.2-ct-subdomains.txt`
- [2026-11-01 23:02] [1.3] TLS 1.0/1.1 rejected (protocol_version alert); TLS 1.2 + 1.3 accepted with AEAD ciphers. Let's Encrypt cert (YR2), 90-day, SAN `www.cynbit.in` only, valid to 2026-12-24 (Vercel auto-renews). **Good, Info.** (A first run falsely showed 1.0/1.1 "accepted" because the grep matched `Protocol :`, which OpenSSL prints on failure too; fixed in PLAN.) → `evidence/1.3-tls.txt`
- [2026-11-01 23:03] [1.5] `robots.txt` disallows `/api/`, `/admin/`, `/portal/`, which reveals that an admin area and a portal exist. robots.txt is not access control, so those must be protected server-side (can't verify passively). **Info.**
- [2026-11-01 23:03] [1.5] `sitemap.xml`: 82 URLs, all on apex `https://cynbit.in/...`, which 307-redirects to `www`. Every sitemap URL costs crawlers an extra redirect hop and points at a non-canonical host. `og:url`, JSON-LD `@id`/`url` also use apex. Candidate **Low** (SEO + crawl efficiency).
- [2026-11-01 23:03] [1.5] Static pages' `<lastmod>` = `2026-11-01T17:28:39.452Z` ≈ time of the request, so the sitemap is generated with `new Date()`. lastmod carries no signal and crawlers learn to ignore it. Blog/diary entries have ms-distinct timestamps all on `2026-05-20T09:19:43`, which suggests posts come from a DB/CMS and were batch-seeded. Candidate **Low** (data correctness).
- [2026-11-01 23:03] [1.5] No `/.well-known/security.txt` (returns the 404 page), so there is no vulnerability-disclosure channel (RFC 9116). Candidate **Low**.
- [2026-11-01 23:03] [1.5] 404 page: correct `404` status, `<meta name="robots" content="noindex">`, custom page, no stack trace. Reveals Next.js App Router (`self.__next_f` RSC payload), build ID `x-Rd73BtzTiCyyJyTHd5H`, GA4 `G-LK6CQWCWX0`. **Good, Info.**
- [2026-11-01 23:03] [1.5] Products named in metadata: TenantEase, Cynbit Studio, BitElevate.
