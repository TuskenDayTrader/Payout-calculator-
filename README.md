# Tradeify Payout & Risk Utility Calculator

A production-ready, mobile-first Tradeify utility app built with Next.js, TypeScript, Tailwind CSS, Zustand, Zod, Recharts, Vitest, and Playwright.

## Features

- Data-driven rule engine with JSON seed data, effective dates, inheritance, and payout-tier overrides
- Dashboard for payout eligibility, safe request sizing, daily targets, and red-flag detection
- Rule-aware consistency, buffer, payout planner, and cycle simulator calculators
- Admin rule editor with safe JSON validation, rules version switching, and last-updated timestamps
- Local persistence, session snapshots, CSV export, print-to-PDF workflow, and shareable read-only links
- Demo profiles, formula transparency drawers, dark/light themes, and accessible mobile-first controls

## Getting started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Scripts

```bash
npm run lint
npm run build
npm run test
npm run test:e2e
```

## Project structure

- `src/rules/tradeify-rules.json` – seeded Tradeify rule config with versioning and inheritance
- `src/lib/calculators.ts` – deterministic formula engine
- `src/components/tradeify-calculator-app.tsx` – main dashboard and tools UI
- `src/app/formulas/page.tsx` – formula documentation page
- `docs/quick-start.md` – quick-start guide for non-technical users
- `public/demo-profiles.json` – sample demo profiles
- `public/screenshots/` – captured desktop/mobile screenshots

## Testing

- **Vitest** covers the core calculator formulas.
- **Playwright** provides desktop and mobile smoke coverage.

## Rule notes

The seeded values are intentionally easy to update. If a Tradeify rule is missing, the app surfaces a clear validation message instead of silently guessing.
