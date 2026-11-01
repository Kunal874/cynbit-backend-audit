# Email authentication, analytics consent and structured data (F-08, F-09, F-14)

---

## 1. DKIM for Microsoft 365
**Finding:** [F-08](../REPORT.md#f-08). `selector1._domainkey.cynbit.in` and `selector2._domainkey.cynbit.in` don't exist, so Microsoft 365 signs outgoing mail with the `*.onmicrosoft.com` domain, which isn't aligned with `cynbit.in`.

1. **Microsoft Defender portal → Email & collaboration → Policies → Email authentication settings → DKIM → `cynbit.in`.**
2. Copy the two CNAME values the portal shows and add them in GoDaddy DNS. They look like:
   ```
   selector1._domainkey.cynbit.in  CNAME  selector1-cynbit-in._domainkey.<tenant>.<…>   (use the portal's exact value)
   selector2._domainkey.cynbit.in  CNAME  selector2-cynbit-in._domainkey.<tenant>.<…>
   ```
3. Wait for DNS, then toggle **Sign messages for this domain with DKIM signatures** on.

## 2. DMARC: report, then enforce

Today: `v=DMARC1; p=none;`, which means no enforcement and no reports.

| Stage | Record (`_dmarc.cynbit.in` TXT) | Duration |
|---|---|---|
| 1. Monitor | `v=DMARC1; p=none; rua=mailto:dmarc@cynbit.in; fo=1` | 2–4 weeks: read the aggregate reports, find every legitimate sender (M365, website notification mail, any CRM/newsletter tool) and give each SPF/DKIM alignment |
| 2. Quarantine | `v=DMARC1; p=quarantine; pct=25; rua=mailto:dmarc@cynbit.in` → raise `pct` to 100 | 2 weeks |
| 3. Reject | `v=DMARC1; p=reject; sp=reject; rua=mailto:dmarc@cynbit.in` | permanent |

A free aggregator (e.g. Cloudflare DMARC Management, dmarcian, Postmark DMARC) turns the `rua` XML into a readable dashboard.

**Why it matters here:** Cynbit hires interns and sells a paid programme to students. Fake "offer letter + pay the fee" emails from `hr@cynbit.in` are a common scam pattern, and `p=reject` is what makes Gmail/Outlook refuse them.

**Verify:** `nslookup -type=TXT _dmarc.cynbit.in` shows the new policy. Send a test mail to a Gmail address, then *Show original* shows `DKIM: PASS with domain cynbit.in` and `DMARC: PASS`.

---

## 3. Analytics consent and URL redaction
**Finding:** [F-09](../REPORT.md#f-09). GA4 and Google Signals (`ads/ga-audiences`) fire on first load with no consent. [F-03](../REPORT.md#f-03): payment URLs reach GA.

**Zero-code fixes in the GA4 admin:**
- **Admin → Data streams → Web → Redact data → URL query parameters:** add `token`, `order_id`. This removes them from everything GA collects.
- **Admin → Data collection:** turn **Google Signals off** unless ad remarketing is actually used.

**Consent Mode v2** (deny by default, update on consent):
```tsx
// app/layout.tsx (inside <head>, before the GA component)
import Script from 'next/script';

<Script id="consent-default" strategy="beforeInteractive">{`
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', {
    ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    analytics_storage: 'denied', wait_for_update: 500
  });
`}</Script>
```
```tsx
// components/consent-banner.tsx (minimal)
'use client';
import { useEffect, useState } from 'react';

declare global { interface Window { gtag?: (...args: unknown[]) => void } }

export function ConsentBanner() {
  const [choice, setChoice] = useState<string | null>('pending');
  useEffect(() => setChoice(localStorage.getItem('consent')), []);
  if (choice !== null) return null; // already answered (or still reading storage)

  const decide = (granted: boolean) => {
    const v = granted ? 'granted' : 'denied';
    window.gtag?.('consent', 'update', { analytics_storage: v }); // ads stay denied unless needed
    localStorage.setItem('consent', v);
    setChoice(v);
  };
  return (
    <div role="dialog" aria-label="Cookie consent" className="fixed bottom-4 inset-x-4 …">
      We use analytics cookies to improve this site.
      <button onClick={() => decide(true)}>Accept</button>
      <button onClick={() => decide(false)}>Decline</button>
    </div>
  );
}
```
On returning visits, replay the stored choice with `gtag('consent','update', …)` before the GA config runs. India's DPDP Act 2023 requires consent that is free, specific and informed, with withdrawal as easy as giving it. Link the footer "Cookies" page to a "change choice" control.

**Verify:** a fresh incognito visit makes no `collect` / `ga-audiences` requests until Accept is clicked; GA4 DebugView shows `page_location` without `token`.

---

## 4. Structured data
**Finding:** [F-14](../REPORT.md#f-14). `/bitelevate` is marked up as a `JobPosting` with `baseSalary: 3999 INR`, but ₹3,999 is the fee the participant **pays**.

Model it as what it is: a paid programme with an offer.
```tsx
<JsonLd data={{
  '@context': 'https://schema.org',
  '@type': 'Course',
  name: 'BitElevate Remote Software Engineering Internship Programme',
  description: '60-day project-based programme …',
  provider: { '@type': 'Organization', name: 'Cynbit Technologies', sameAs: 'https://www.cynbit.in' },
  offers: { '@type': 'Offer', price: '3999', priceCurrency: 'INR', category: 'Paid', availability: 'https://schema.org/InStock' },
  hasCourseInstance: { '@type': 'CourseInstance', courseMode: 'Online', courseWorkload: 'P60D' },
}} />
```
(`JsonLd` is the escaping component from [`security-headers.md`](security-headers.md#4-safe-json-ld).) If a real paid internship role exists separately, it can keep a `JobPosting`, with `baseSalary` reflecting what the intern is paid.

**Verify:** Google Rich Results Test on `/bitelevate` shows a *Course* item and no *Job posting* with salary ₹3,999.
