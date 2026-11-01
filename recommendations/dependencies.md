# Dependencies: close the Next.js advisory gap (F-01)

## Problem
Production runs **Next.js 15.5.18**. The latest 15.5.x is **15.5.28**. Three advisories match this exact architecture (App Router + Server Actions): two High DoS and one Medium endpoint disclosure. Their only fix is upgrading. Details: [`evidence/2.7-advisories.md`](../evidence/2.7-advisories.md).

## 1. Patch now (same minor line, no breaking changes)

```bash
npm install next@15.5.28 eslint-config-next@15.5.28   # keep eslint-config-next in lockstep if present
npm ls next                                          # confirm a single 15.5.28 in the tree
npm run build && npm run start                       # smoke-test forms and the BitElevate checkout (Cashfree sandbox)
```

Deploy a Vercel **preview** first, test the five Server Actions there, then promote. Rollback is a one-click "Promote previous deployment".

## 2. Never fall 10 patches behind again

`.github/dependabot.yml`:
```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
    groups:
      next-react:                     # framework packages move together
        patterns: ["next", "eslint-config-next", "react", "react-dom", "@next/*"]
      minor-and-patch:
        update-types: ["minor", "patch"]
```
Also enable **Dependabot security updates** under *Settings → Code security*. Security PRs then open the day an advisory is published, not on the weekly schedule.

`.github/workflows/ci.yml` (gate merges on a clean build and no high-severity advisories in runtime deps):
```yaml
name: ci
on: [pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm audit --omit=dev --audit-level=high
      - run: npx tsc --noEmit
      - run: npm run build
```
Vercel already builds a preview for every PR, so together this gives *advisory → PR → green CI → preview → merge* with no manual tracking.

## Why this works
Patch releases within `15.5.x` contain only fixes, so the upgrade risk is low. The real problem was missing automation: a security fix existed for weeks without being applied.

## How to verify
- In the browser console on production: `window.next.version` → `"15.5.28"`.
- Re-run the advisory query; it should list nothing that applies:
  ```bash
  gh api -X GET advisories -f ecosystem=npm -f affects=next@15.5.28 --jq '.[].ghsa_id'
  ```
