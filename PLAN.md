# Cynbit Backend Audit — Execution Plan

Backend-perspective audit of **https://www.cynbit.in** for the Backend Developer Intern assessment (Phase 2).
Deadline: **2 Nov 2026, 14:45 IST**. Target submission: **13:30 IST** (75 min buffer).

Deliverables required by the brief:
1. **Backend Technical Audit Report**: observable architecture, API structure, payloads → `REPORT.md`
2. **Security & Performance Findings**: categorized → `REPORT.md` §5–6
3. **Recommended Improvements**: with code snippets → `recommendations/`

---

## Progress tracker (the checkpoint)

Tick a box in the same commit that finishes the step. The first unticked box is where work resumes.

- [x] **0.1** Repo, plan, rules of engagement, findings log
- [x] **1.1** DNS, hosting, email-auth records
- [x] **1.2** Subdomains from Certificate Transparency
- [x] **1.3** TLS certificate and protocol versions
- [x] **1.4** HTTP response headers (security, caching, server leakage)
- [x] **1.5** Public files: robots.txt, sitemap.xml, security.txt
- [x] **1.6** Frontend bundle inspection (framework version, API URLs, exposed keys, source maps)
- [x] **1.7a** Network capture of public pages → endpoint inventory
- [ ] **1.7b** Logged-in assessment-portal flow (own account) → add to endpoint inventory *(needs Kunal)*
- [x] **2.1** Per-endpoint API analysis (methods, schemas, status codes, versioning)
- [x] **2.2** Data handling: over-fetching, PII in payloads, input validation signals
- [x] **2.3** Error handling: 404s, error envelope, stack-trace leakage
- [x] **2.4** CORS, caching and HTTP semantics on API responses
- [ ] **2.5** Rate-limit signals (headers only)
- [ ] **2.6** Auth and session handling (own account only) *(needs Kunal)*
- [ ] **2.7** Framework version vs. public advisories
- [ ] **3.1** Server timing: DNS / TLS / TTFB / total
- [ ] **3.2** Lighthouse / PageSpeed (mobile + desktop)
- [ ] **3.3** Static asset caching, compression, HTTP/2–3, ISR behaviour
- [ ] **3.4** Page weight and request waterfall
- [ ] **4.1** `REPORT.md`: architecture, API structure, findings table
- [ ] **4.2** `REPORT.md`: detailed findings with evidence
- [ ] **5.1** `recommendations/`: code snippets for each Medium+ finding
- [ ] **5.2** Target architecture diagram + prioritized roadmap
- [ ] **6.1** `README.md`: executive summary + links
- [ ] **6.2** Hygiene pass (no tokens/cookies/PII), render check on GitHub
- [ ] **6.3** Submit links on the assessment portal *(Kunal)*

---

## Resume protocol

If work stops at any point:

```bash
cd /d/cynbit-backend-audit
git status                 # uncommitted files = the step that was interrupted
git log --oneline -10      # last commit = last completed checkpoint
```

1. Open this file and find the **first unticked box**.
2. If `git status` shows changes, they belong to that step: review them, finish the step, commit.
3. Raw observations made mid-step are in `notes/findings-log.md`. Read it before continuing so nothing is redone.
4. Continue from the step's instructions below.

**Checkpoint rule:** commit after **every step**, push after **every phase**. Observations go into `notes/findings-log.md` **as soon as they're seen**, not at the end of the step.

Commit message prefixes: `plan:` `recon:` `api:` `perf:` `report:` `recs:` `docs:`.

---

## Rules of engagement (passive only)

The brief permits **passive and authorized** testing only. Every step below follows these rules:

| Allowed | Not allowed |
|---|---|
| Loading pages and assets the way a browser does | Fuzzing, brute force, path/directory scanning |
| Reading response headers, public files, public JS bundles | Sending crafted payloads (SQLi, XSS, SSRF, traversal) |
| Third-party passive sources (DNS-over-HTTPS, crt.sh, PageSpeed) | Bursts of requests to test rate limits |
| Own account only, through the normal UI | Touching other users' data or guessing IDs (IDOR) |
| One request to a non-existent path to see the 404 behaviour | Submitting contact/newsletter forms with junk data |
| Decoding **own** tokens locally | Probing subdomains found only via CT logs |
| | Attempting to confirm a known CVE by exploiting it |

- Identify the client honestly: `UA="Mozilla/5.0 (cynbit-backend-audit; passive review)"`.
- Space out repeated requests (≥ 2 s apart); never more than a handful per endpoint.
- Anything that can't be confirmed passively is reported as **Inferred**, never as Confirmed.
- **Never commit** cookies, tokens, HAR files or downloaded third-party JS. They go in `private/` (git-ignored).

---

## Repo layout

```
README.md               executive summary + links            (6.1)
PLAN.md                 this file
REPORT.md               full audit report                    (4.x)
recommendations/        code snippets, one file per theme    (5.x)
evidence/               redacted raw outputs, named by step  (1.x–3.x)
notes/findings-log.md   running observation log (append-only)
private/                git-ignored: HARs, raw JS, own tokens
```

---

## Phase 0 — Setup ✅

Repo created, git pinned to the Kunal874 account, plan written. Initial observations from the target check are in `notes/findings-log.md`.

---

## Phase 1 — Recon & surface mapping

Run from Git Bash in the repo root. Shared variables:

```bash
UA="Mozilla/5.0 (cynbit-backend-audit; passive review)"
H=www.cynbit.in
mkdir -p evidence private/js
```

### 1.1 DNS, hosting, email-auth
Uses Google DNS-over-HTTPS, so no traffic reaches Cynbit.
```bash
for n in cynbit.in www.cynbit.in _dmarc.cynbit.in; do
  for t in A AAAA CNAME NS MX TXT CAA; do
    echo "## $n $t"; curl -s "https://dns.google/resolve?name=$n&type=$t"; echo
  done
done > evidence/1.1-dns.txt
```
Look for: hosting provider (Vercel IPs / CNAME), SPF record and its `-all`/`~all`, DMARC policy (`p=none` = spoofable), CAA (which CAs may issue), MX provider.

### 1.2 Subdomains (Certificate Transparency)
```bash
curl -s "https://crt.sh/?q=%25.cynbit.in&output=json" \
  | grep -o '"name_value":"[^"]*"' | cut -d'"' -f4 | sed 's/\\n/\n/g' | sort -u \
  > evidence/1.2-ct-subdomains.txt
# crt.sh often returns 502, so use Cert Spotter as the fallback:
curl -s "https://api.certspotter.com/v1/issuances?domain=cynbit.in&include_subdomains=true&expand=dns_names" \
  | grep -oE '"[a-z0-9*.-]*cynbit\.in"' | tr -d '"' | sort | uniq -c
```
**Record only.** A subdomain is in scope only if the public site links to it or calls it (confirmed in 1.7). Look for: api.*, admin.*, staging.*, dev.* — exposure of non-prod environments is itself a finding.

### 1.3 TLS
One handshake per check:
```bash
{ echo | openssl s_client -connect $H:443 -servername $H 2>/dev/null \
    | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
  for v in tls1 tls1_1 tls1_2 tls1_3; do
    printf "%s: " $v; echo | openssl s_client -connect $H:443 -servername $H -$v -cipher 'DEFAULT:@SECLEVEL=0' 2>&1 \
      | grep -E '^New,|alert protocol version' | head -1
  done; } > evidence/1.3-tls.txt
```
`New, TLSv1.x, Cipher is …` = accepted; `alert protocol version` / `Cipher is (NONE)` = rejected. Don't grep for `Protocol :` because OpenSSL prints it even when the handshake fails. `@SECLEVEL=0` is needed because OpenSSL 3 won't even offer TLS 1.0/1.1 by default.
Look for: TLS 1.0/1.1 accepted, cert expiry window, issuer, wildcard vs SAN list.

### 1.4 Response headers
```bash
for p in / /about /services /careers /contact /this-page-does-not-exist; do
  echo "## $p"; curl -sS -D - -o /dev/null -A "$UA" "https://$H$p"; sleep 2
done > evidence/1.4-headers.txt
curl -sS -D - -o /dev/null -A "$UA" https://cynbit.in/ > evidence/1.4-headers-apex.txt
```
Adjust the path list to the real routes from `sitemap.xml` (1.5). Checklist:

| Header | Expect |
|---|---|
| `Strict-Transport-Security` | max-age ≥ 1y, `includeSubDomains`, `preload` |
| `Content-Security-Policy` | present, no `unsafe-inline` for scripts |
| `X-Frame-Options` / CSP `frame-ancestors` | clickjacking protection |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` or stricter |
| `Permissions-Policy` | restrict camera/mic/geolocation |
| `Server`, `X-Powered-By` | no version leakage |
| `Cache-Control`, `X-Vercel-Cache`, `X-Nextjs-*` | caching / ISR strategy |
| apex → www | 308/301 (permanent) vs 307 (temporary) |

### 1.5 Public files
```bash
for f in robots.txt sitemap.xml .well-known/security.txt; do
  echo "## /$f"; curl -sS -A "$UA" -w "\n[HTTP %{http_code}]\n" "https://$H/$f"; sleep 2
done > evidence/1.5-public-files.txt
```
Look for: disallowed paths that reveal admin/API routes, sitemap route list (feeds 1.4 / 1.7), missing `security.txt` (no vulnerability-disclosure channel).

### 1.6 Frontend bundle inspection
Bundles are public static files. Download into `private/js` (never committed), and commit only the extracted notes.
```bash
curl -sS -A "$UA" "https://$H/" > private/home.html
grep -oE '/_next/static/[^"]+\.js' private/home.html | sort -u > private/js-list.txt
while read -r p; do curl -sS -A "$UA" "https://$H$p" -o "private/js/$(basename "$p")"; sleep 1; done < private/js-list.txt

grep -ohE 'https?://[a-zA-Z0-9.-]+(/[a-zA-Z0-9._/-]*)?' private/js/*.js | sort -u > private/urls.txt
grep -ohE '"/api/[^"]*"' private/js/*.js | sort -u                                   # internal API routes
grep -ohE 'AIza[0-9A-Za-z_-]{35}|sk_(live|test)_[0-9A-Za-z]+|pk_(live|test)_[0-9A-Za-z]+|eyJ[A-Za-z0-9_-]{20,}' private/js/*.js | sort -u   # keys/tokens
grep -oh 'NEXT_PUBLIC_[A-Z_]*' private/js/*.js | sort -u
grep -l 'sourceMappingURL' private/js/*.js                                            # exposed source maps?
grep -oh 'self.__next_f\|__NEXT_DATA__' private/home.html | sort -u                  # App Router vs Pages Router
```
Write a summary to `evidence/1.6-bundle-notes.md`: router type, Next.js/React version if found (also check `window.next.version` in the browser console), third-party services (analytics, forms, CMS, email), API base URLs, any key found + whether it's meant to be public (e.g. a restricted Maps key is fine, a secret key is critical). Mask keys in the notes (`AIza…last4`).

### 1.7 Network capture → endpoint inventory
Browser DevTools → Network → *Preserve log*, *Disable cache*. Visit every page in the sitemap, open menus and modals, and view forms (without submitting junk). **(Kunal)** Then the logged-in assessment portal flow with your own account.
- Export HAR to `private/` (contains cookies, so never commit it).
- Write `evidence/1.7-endpoints.md`:

| # | Method | Host + path | Status | Content-Type | Size | Time | Auth? | Cache-Control | Notes |
|---|---|---|---|---|---|---|---|---|---|

Include third-party calls (analytics, form services, CMS) since they show the backend architecture.

**Checkpoint:** commit per step; push at end of phase → `git push`.

---

## Phase 2 — API behaviour, data handling, auth

Only endpoints from `evidence/1.7-endpoints.md`. Only normal inputs.

### 2.1 Per-endpoint analysis
For each endpoint record: REST conventions (nouns, correct verbs), versioning (`/api/v1`), response envelope consistency, status-code correctness (e.g. `200` with `{error}` in body), pagination, naming style (camelCase vs snake_case mixed?), content negotiation. Save trimmed, redacted sample payloads in `evidence/2.1-payloads.md`.

### 2.2 Data handling
- **Over-fetching:** fields returned but never rendered (internal IDs, emails, timestamps, other users' data).
- **PII in responses** or in URLs/query strings.
- **Validation signals:** client-side only (HTML `required`, zod in bundle) vs evidence of server-side checks. Server-side validation can't be confirmed passively, so report it as **Inferred** with a recommendation.

### 2.3 Error handling
One request each:
```bash
curl -sS -i -A "$UA" "https://$H/this-page-does-not-exist" | head -40 > evidence/2.3-errors.txt
curl -sS -i -A "$UA" "https://$H/api/this-route-does-not-exist" | head -40 >> evidence/2.3-errors.txt
```
Plus any errors observed naturally in 1.7. Look for: framework default pages, stack traces, internal paths, inconsistent error shapes between endpoints, HTML returned from an API route.

### 2.4 CORS, caching, HTTP semantics
From 1.7 responses: `Access-Control-Allow-Origin` (`*` on an authenticated endpoint is a finding), `Access-Control-Allow-Credentials`, `Vary: Origin`, `Cache-Control` on API responses (private data cached publicly?), ETag / 304 support.
Optional, public GET endpoints only, one request each, no credentials:
```bash
curl -sS -D - -o /dev/null -A "$UA" -H "Origin: https://example.com" "https://$H/api/<public-endpoint>"
```

### 2.5 Rate limiting
Headers only: `RateLimit-*`, `X-RateLimit-*`, `Retry-After`. **No bursts.** If absent on a write endpoint (forms, auth), report as **Inferred** and recommend.

### 2.6 Auth & session (own account) *(Kunal)*
- Where is the session kept: httpOnly cookie vs `localStorage` (DevTools → Application)?
- Cookie flags: `Secure`, `HttpOnly`, `SameSite`, `Domain`, `Max-Age`.
- If JWT: decode **locally** (`echo "$payload" | base64 -d`), check `alg`, `exp − iat` lifetime, PII in claims. Save only claim **names** + lifetime to evidence, never the token.
- Logout: does it call a server endpoint (server-side invalidation) or only clear client storage?
- OAuth / magic link / OTP flow: note the provider and redirect parameters.

### 2.7 Framework version vs. advisories
Using the version from 1.6, check the GitHub Security Advisories for `next` and `react` (e.g. middleware auth bypass CVE-2025-29927 for Next < 15.2.3 / 14.2.25; RSC advisories for React Server Components). Report as "version X is within the affected range per advisory Y". **Do not attempt to verify exploitability.**

**Checkpoint:** commit per step; push at end of phase.

---

## Phase 3 — Performance

### 3.1 Server timing
3 runs per URL, 2 s apart:
```bash
for u in https://cynbit.in/ https://$H/ https://$H/<heaviest-page>; do for i in 1 2 3; do
  curl -sS -o /dev/null -A "$UA" -w "$u dns=%{time_namelookup} conn=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer} total=%{time_total} bytes=%{size_download} http=%{http_version} redirects=%{num_redirects}\n" -L "$u"; sleep 2
done; done > evidence/3.1-timing.txt
```
Note: the cost of the apex→www redirect hop, cache HIT vs MISS TTFB.

### 3.2 Lighthouse / PageSpeed
PageSpeed Insights API (Google runs the test):
```bash
for s in mobile desktop; do
  curl -s "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://$H/&strategy=$s&category=performance&category=best-practices&category=seo" > private/psi-$s.json
done
```
Save scores + LCP, CLS, TBT, TTFB, and the top 5 opportunities into `evidence/3.2-pagespeed.md`.

### 3.3 Caching, compression, protocol
- `/_next/static/*` should be `public, max-age=31536000, immutable`.
- Images via `/_next/image`: format (AVIF/WebP), cache TTL.
- `Content-Encoding: br` on HTML/JS/CSS.
- HTTP/2 or HTTP/3 (`alt-svc`).
- ISR/SSG: `X-Nextjs-Prerender`, `X-Nextjs-Stale-Time`, `X-Vercel-Cache` HIT/MISS/STALE.
```bash
curl -sS -D - -o /dev/null -A "$UA" -H "Accept-Encoding: br, gzip" "https://$H$(head -1 private/js-list.txt)" > evidence/3.3-static-headers.txt
```

### 3.4 Page weight & waterfall
From the HAR: total requests, total transferred bytes, JS bytes, largest 5 assets, render-blocking resources, sequential API chains, duplicate calls. → `evidence/3.4-weight.md`.

**Checkpoint:** commit per step; push at end of phase.

---

## Phase 4 — Report (`REPORT.md`)

### 4.1 Structure
1. Executive summary (5 lines + top findings)
2. Scope, methodology, rules of engagement
3. Observed architecture: Mermaid diagram (client → Vercel edge `bom1` → Next.js SSG/ISR → API routes / third-party services)
4. API structure & payloads (from 2.1)
5. Findings summary table: ID · title · category · severity · confidence · effort
6. Detailed findings
7. What passive testing could not verify (and how to verify with access)

Categories: **Security · Performance · Data validation · Authentication · Error handling · Architecture**.

### 4.2 Finding template
```markdown
### F-03: <short title>
**Category:** Security · **Severity:** Medium · **Confidence:** Confirmed / Inferred · **Effort:** S/M/L

**Evidence:** `evidence/1.4-headers.txt` L12–18
<trimmed output, redacted>

**Impact:** what an attacker / user / the business actually experiences.

**Recommendation:** one paragraph → [`recommendations/security-headers.md`](recommendations/security-headers.md)
```

Severity scale (keep it calibrated, since inflated severities read badly):
- **High**: observed data exposure, secret in client, auth weakness with a direct path to impact
- **Medium**: a missing control with realistic impact (no CSP, no rate limit on a public write endpoint, vulnerable framework version)
- **Low**: hardening (HSTS without preload, version-leaking headers, 307 instead of 308)
- **Info**: neutral observation or good practice worth noting

**Checkpoint:** commit + push.

---

## Phase 5 — Recommended improvements (`recommendations/`)

One file per theme, **only for themes backed by findings**. Each file: *problem → code → why it works → how to verify*. Code matches their stack (TypeScript, Next.js App/Pages Router, Vercel).

Likely themes (keep only the ones the evidence supports):
- `security-headers.md`: `next.config` `headers()` + nonce-based CSP in `middleware.ts`
- `api-validation-errors.md`: zod schema validation + one error envelope (RFC 9457 `application/problem+json`)
- `rate-limiting.md`: Upstash Redis sliding window (an in-memory limiter doesn't work across serverless instances)
- `auth-sessions.md`: httpOnly + `SameSite` cookies, short-lived access token + refresh rotation, server-side logout
- `caching.md`: `Cache-Control` / `revalidate` / `stale-while-revalidate` for API and pages
- `observability.md`: request IDs, structured logs, health endpoint, error tracking
- `architecture.md` (5.2): target-state Mermaid diagram + prioritized roadmap (quick wins → medium → long-term)

**Checkpoint:** commit per file; push at end of phase.

---

## Phase 6 — Finalize & submit

### 6.1 `README.md`
Title, one-paragraph summary, top findings table (≤ 6 rows), links to REPORT / recommendations / evidence, methodology line, passive-testing disclaimer.

### 6.2 Hygiene pass
Every command must come back empty:
```bash
git grep -nE 'eyJ[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9._-]{10,}|Set-Cookie:.*=[^;]{16,}|sk_(live|test)_'
git grep -nE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}' -- ':!PLAN.md'   # review any hit
git ls-files private/ '*.har'
```
Then open the repo on GitHub and check that the Mermaid diagrams render, the links work, and the tables display.

### 6.3 Submit *(Kunal)*
- **Primary link:** `https://github.com/Kunal874/cynbit-backend-audit`
- Additional: link to `REPORT.md`, link to `recommendations/`

---

## Time budget (IST)

| Window | Work |
|---|---|
| 1 Nov 22:45 – 2 Nov 01:00 | Phase 1 (1.7 logged-in part can move to the morning) |
| 2 Nov 08:00 – 10:00 | Phase 2 + 1.7 / 2.6 logged-in parts |
| 10:00 – 11:00 | Phase 3 |
| 11:00 – 12:30 | Phases 4–5 |
| 12:30 – 13:30 | Phase 6, submit |
| 13:30 – 14:45 | Buffer |
