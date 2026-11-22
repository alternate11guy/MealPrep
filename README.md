# Mise: personal nutrition and meal prep

A private, single-user web app (installable as a PWA) that plans a week of meals to exact macro targets, builds the grocery list, schedules batch-cooking sessions, tracks inventory and what you actually eat, and adds a Claude assistant that proposes changes you approve.

## Run it

```bash
npm install
cp .env.example .env.local   # optional; everything has a default
npm run dev                  # http://localhost:3210 (port 3210 so it never clashes with apps on 3000)
```

On first visit you create a passcode (8+ characters), then onboarding asks about you and your targets. You can start with a clearly labelled demonstration week or start empty.

Production: `npm run build && npm start`.

### Environment

| Variable | Needed for | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Assistant, online recipe search, recipe adaptation, meal descriptions and photos, receipt reading | Those features show a notice; everything else works |
| `DATABASE_URL` | Hosted Postgres or Supabase | Embedded Postgres (PGlite) in `./.data/pg` |
| `MISE_DATA_DIR` | Moving the embedded database | `./.data/pg` |
| `APP_PASSCODE` | Setting the passcode from the server instead of the first-run screen | Set in the app |
| `SESSION_SECRET` | Signing session cookies | Generated and stored in the database |
| `APP_TIMEZONE` | Deciding what "today" is | `Africa/Cairo` |

## What's inside

- **Nutrition engine** (`lib/nutrition`): USDA SR28 (8,789 foods, bundled, per 100 g) with raw-to-cooked yields, missing-value flags, and a 4/4/9 energy check. Nutrition is always calculated from ingredient weights, never copied or estimated by AI.
- **Optimizer** (`lib/nutrition/optimizer.ts`): sets portions to hit min, max, range or exact targets. When a combination can't work, an LP feasibility check names the conflicting targets.
- **Planner** (`lib/services/planner.ts`): Generate My Week (meals per day, budget, prep time, cooking sessions, cuisines, ingredients to use or exclude, repeats, supplements). It keeps locked, eaten and prepared meals and leaves past days alone. Also covers replace with portion re-balancing, lock, regenerate unlocked, copy, duplicate, templates, drag and drop, and an optional weekly proposal that must be confirmed.
- **Recipes**: 27 original house recipes plus imports from reputable sites (JSON-LD, robots.txt respected, source credited) and Claude-adapted versions that keep the original.
- **Grocery, prep, inventory**: aisle-grouped list with honest price labels (your price, estimate, demo) in EGP, QAR or USD. Prep sessions follow USDA FSIS fridge limits, with cooking mode, timers and printable labels. Confirming prep deducts inventory, soonest-expiring first.
- **Logging and analytics**: USDA search, recipes, natural language, photo (labelled as an estimate), barcode (Open Food Facts) and restaurant entries. Analytics show 7, 30, 90 or custom days, planned vs eaten, compliance, weight, spending and waste.

## Photos

Recipes show a labelled placeholder until an accurately matching, licensed photo is added in `lib/data/photos.ts` (with credit, licence and source). Stock photos that don't match a dish are never used.

## Tests

```bash
npm test          # nutrition data, targets, optimizer, planner, grocery, prep, import mapping
npm run typecheck
```

Not medical advice. Targets are never changed automatically; low-energy targets are flagged with sources.
