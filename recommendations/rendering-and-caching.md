# Rendering and caching (F-02, F-06, F-07, F-10, F-15)

The edge layer is already fast: SSG pages return in **30 ms**. Most of the user-facing slowness comes from the app working against that: hiding the HTML it prerendered, rendering static content per request, and loading 1.1 MB of icons. The fixes below are ordered by impact per line changed.

---

## 1. Don't hide server-rendered HTML
**Finding:** [F-02](../REPORT.md#f-02). Mobile FCP 9.1 s, LCP render delay 10.4 s.

The server HTML for every page in `(marketing)` starts as:
```html
<div style="opacity:0;transform:translateY(10px)"> …page… </div>
```
That's what a Framer Motion entrance animation in `app/(marketing)/template.tsx` produces when it's written like this (inferred from the output):

```tsx
// before: content is invisible until JS hydrates and runs the animation
'use client';
import { motion } from 'framer-motion';

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      {children}
    </motion.div>
  );
}
```

**Option A (recommended): CSS-only, no JS on the critical path.** The page is visible in the first paint and the animation still plays:
```tsx
// app/(marketing)/template.tsx: a Server Component now, no 'use client'
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-enter">{children}</div>;
}
```
```css
/* globals.css */
@keyframes page-enter { from { transform: translateY(10px); } to { transform: none; } }
.animate-page-enter { animation: page-enter 0.4s ease-out both; }
@media (prefers-reduced-motion: reduce) { .animate-page-enter { animation: none; } }
```
Only `transform` is animated, never `opacity`, so the text is paintable (and counts for LCP) from the first frame.

**Option B: keep Framer Motion.** Skip the initial animation on first load and animate only on client-side navigations:
```tsx
<motion.div initial={false} animate={{ opacity: 1, y: 0 }}>{children}</motion.div>
```

**Verify:** `curl -s https://www.cynbit.in/ | grep -c 'opacity:0'` returns `0` for the page wrapper. Lighthouse mobile FCP should drop from ~9 s to the CSS/font-bound time (≈ 1–2 s).

---

## 2. Cache content that rarely changes
**Finding:** [F-06](../REPORT.md#f-06). `/careers`, `/blog`, `/blog/[slug]`, `/case-studies` and `/sitemap.xml` are `private, no-store`, rendered per request in 500–850 ms, vs 60 ms for static pages.

**Step 1: find what opts each route out of static rendering.** `next build` prints it:
```
Route (app)                      Size
┌ ○ /                           …     ○ static
├ ƒ /blog                       …     ƒ dynamic  ← investigate
├ ƒ /blog/[slug]
├ ƒ /careers
```
The usual causes are reading `searchParams` (filters, pagination), calling `cookies()`/`headers()`, a `fetch(..., { cache: 'no-store' })`, or `export const dynamic = 'force-dynamic'`. Prisma queries alone do **not** make a route dynamic.

**Step 2: make them static with timed + on-demand revalidation.**
```tsx
// app/(marketing)/blog/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';

export const revalidate = 3600;      // background refresh at most hourly
export const dynamicParams = false;  // unknown slugs → static 404, no function call, no DB hit

export async function generateStaticParams() {
  return prisma.post.findMany({ where: { published: true }, select: { slug: true } });
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await prisma.post.findUnique({ where: { slug } });
  if (!post) notFound();
  // …render
}
```
`dynamicParams = false` is what closes the **random-slug amplification** path: `/blog/<anything>` now returns a prebuilt 404 from the edge instead of a 1.2 s render plus DB lookup. The trade-off is that a new post needs a rebuild. That suits this site, whose content is seeded in batches (all posts share one `lastmod` second). Trigger a Vercel **Deploy Hook** when publishing. If posts get published often, keep `dynamicParams = true` and rely on `revalidatePath` (below), with the rate limiting from [`server-actions.md`](server-actions.md).

When content changes through an admin action:
```ts
'use server';
import { revalidatePath } from 'next/cache';

export async function publishPost(slug: string) {
  // …auth check + DB write
  revalidatePath('/blog');
  revalidatePath(`/blog/${slug}`);
  revalidatePath('/sitemap.xml');
}
```

**`/careers` has no DB data at all**, so once its dynamic API is removed it becomes plain SSG. If it reads `searchParams` for filtering, move the filter to the client (the data set is tiny) or to path segments (`/careers/[team]`) generated statically.

**Prefetch fan-out.** Once these routes are static, the 9 background prefetches on the home page become cheap edge hits. Until then, `prefetch={false}` on links to dynamic routes stops ≥ 3 function calls per home-page view.

**Verify:** `curl -sI https://www.cynbit.in/blog | grep -iE 'x-vercel-cache|cache-control'` shows `HIT`/`STALE` and `public`; TTFB ≈ static pages (~60 ms server time).

---

## 3. Subset the icon font
**Finding:** [F-07](../REPORT.md#f-07). 1,139,560 B render-blocking font for 88 icons (66 % of page weight).

Google Fonts can return only the icons you name (`icon_names`, alphabetical order). Measured on 2026-11-01:

| Request | woff2 size |
|---|---|
| current: `wght,FILL@100..700,0..1`, all icons | 1,139,560 B |
| `icon_names` + same axes | 33,180 B (−97.1 %) |
| `icon_names` + `wght,FILL@400,0..1` | **14,840 B (−98.7 %)** |

```tsx
// app/layout.tsx (head)
// The 88 icons found on the 8 crawled pages. Re-generate from the codebase before shipping:
//   grep -rhoE 'material-symbols-outlined[^>]*>[a-z_]+<' app components | sed -E 's/.*>([a-z_]+)</\1/' | sort -u
const ICONS = [
  'ac_unit','account_tree','alternate_email','analytics','apartment','architecture','arrow_forward','auto_awesome',
  'auto_fix','auto_graph','auto_stories','badge','bolt','brush','bug_report','call','campaign','check','cloud',
  'cloud_done','commit','dashboard','dashboard_customize','description','domain','done_all','east','engineering',
  'event','expand_more','fact_check','fork_right','format_quote','grid_view','group','groups','history',
  'history_edu','home','home_work','hub','layers','local_fire_department','location_automation','location_on',
  'lock','mail','menu','model_training','monitoring','mood','north_east','notification_important',
  'notifications_active','phone_in_talk','play_circle','psychology','public','query_stats','rate_review',
  'reviews','rocket_launch','route','schedule','school','search','security','send','sensors','settings_suggest',
  'shield_person','shopping_bag','star','stars','support_agent','terminal','timer','translate','trending_up',
  'troubleshoot','verified','verified_user','video_chat','volunteer_activism','west','work','work_history',
  'workspace_premium',
].sort().join(',');

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
<link
  rel="stylesheet"
  href={`https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@400,0..1&icon_names=${ICONS}&display=block`}
/>
```
`display=block` is Google's recommendation for icon fonts. It avoids a flash of raw ligature text like "arrow_forward".

**Longer term:** switch to SVG icon components (e.g. `lucide-react`). They're tree-shaken per icon, add no third-party origin, and aren't render-blocking.

**Verify:** in DevTools Network the `fonts.gstatic.com` woff2 is ~15 KB; Lighthouse "Total byte weight" drops from ~1,684 KiB to ~590 KiB.

---

## 4. Canonical host and sitemap
**Finding:** [F-10](../REPORT.md#f-10). Apex → www is a 307 that's never cached; the sitemap and metadata point at the apex; `lastmod` = request time.

1. **Vercel → Project → Settings → Domains → `cynbit.in` → Redirect to `www.cynbit.in` → 308 Permanent.** Browsers and crawlers then cache the hop.
2. One source of truth for the site URL:
```ts
// app/layout.tsx
export const metadata = {
  metadataBase: new URL('https://www.cynbit.in'),
  alternates: { canonical: '/' },
  // openGraph.url, JSON-LD @id/url derive from the same constant
};
```
3. A cached sitemap with real dates:
```ts
// app/sitemap.ts
import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

export const revalidate = 86400;
const SITE = 'https://www.cynbit.in';
const STATIC_ROUTES = ['', '/story', '/team', '/contact', '/careers', '/services', '/products',
  '/case-studies', '/impact', '/bitelevate', '/bitelevate/paths', '/diaries', '/blog', '/privacy', '/terms', '/cookies'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await prisma.post.findMany({ where: { published: true }, select: { slug: true, updatedAt: true } });
  return [
    ...STATIC_ROUTES.map((p) => ({ url: `${SITE}${p}` })),  // no lastModified rather than a fake one
    ...posts.map((p) => ({ url: `${SITE}/blog/${p.slug}`, lastModified: p.updatedAt })),
  ];
}
```
Also update `robots.txt` → `Sitemap: https://www.cynbit.in/sitemap.xml`.

**Verify:** `curl -sI https://cynbit.in/` → `308`; `curl -s https://www.cynbit.in/sitemap.xml | grep -c 'https://cynbit.in'` → `0`; two fetches a minute apart return identical XML.

---

## 5. Images and public assets
**Finding:** [F-15](../REPORT.md#f-15). Placeholder avatars from `i.pravatar.cc`; `max-age=0` on `/_next/image` and `public/` files.

```ts
// next.config.ts (excerpt; merge with security-headers.md)
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }], // drop i.pravatar.cc, self-host avatars
    minimumCacheTTL: 60 * 60 * 24 * 31,                                       // 31 days for optimised images
  },
  async headers() {
    return [
      {
        source: '/:file(.+\\.(?:svg|png|jpg|jpeg|webp|avif|ico))',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
    ];
  },
};
export default nextConfig;
```
Files in `public/` aren't content-hashed, so they get one day plus a week of stale-while-revalidate rather than `immutable`. Rename a file to force an update.

Replace the random-face avatar stack with real, self-hosted images (or remove it). Also download the `transparenttextures.com` background into `public/`.

**Verify:** `curl -sI 'https://www.cynbit.in/logo.svg' | grep -i cache-control` shows `max-age=86400`; no requests to `i.pravatar.cc` or `transparenttextures.com` in DevTools.
