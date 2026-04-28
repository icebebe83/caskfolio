# Caskfolio

Caskfolio is a collector-focused bottle price index and listing archive for spirits. It tracks bottle listings, curates market news, stores normalized USD reference data, and keeps contact outside the platform.

The current stack is intentionally lightweight:

- Next.js App Router
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Static export plus local preview utilities
- No payments, escrow, or internal marketplace flow

## Product scope

- Categories: Bourbon, Whisky, Rum, Tequila
- Excludes wine
- Focused on price indexing and listing archive behavior
- Collectors can share listing contact details through supported messengers
- Contact stays external to the platform through messenger deep links
- UI supports English and Korean with a lightweight header toggle

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Recharts

## Key docs

- Product identity and structure:
  - [/Users/darren/Desktop/Vibe cording/Liquor v.Codex/docs/caskfolio-identity-and-structure.md](/Users/darren/Desktop/Vibe%20cording/Liquor%20v.Codex/docs/caskfolio-identity-and-structure.md)
- Image pipeline:
  - [/Users/darren/Desktop/Vibe cording/Liquor v.Codex/docs/image-pipeline.md](/Users/darren/Desktop/Vibe%20cording/Liquor%20v.Codex/docs/image-pipeline.md)
- RLS and storage policy:
  - [/Users/darren/Desktop/Vibe cording/Liquor v.Codex/docs/rls-and-storage.md](/Users/darren/Desktop/Vibe%20cording/Liquor%20v.Codex/docs/rls-and-storage.md)

## Project tree

```text
.
├── .env.example
├── .gitignore
├── README.md
├── next.config.ts
├── next-env.d.ts
├── package.json
├── postcss.config.js
├── public
│   └── favicon.svg
├── seed
│   └── README.md
├── src
│   ├── app
│   │   ├── admin
│   │   │   └── page.tsx
│   │   ├── bottle
│   │   │   └── page.tsx
│   │   ├── explore
│   │   │   └── page.tsx
│   │   ├── login
│   │   │   └── page.tsx
│   │   ├── submit
│   │   │   └── page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── not-found.tsx
│   │   └── page.tsx
│   ├── components
│   │   ├── bottle-selector.tsx
│   │   ├── empty-state.tsx
│   │   ├── listing-card.tsx
│   │   ├── price-history-chart.tsx
│   │   ├── providers.tsx
│   │   ├── report-listing-button.tsx
│   │   ├── setup-notice.tsx
│   │   ├── site-header.tsx
│   │   └── stat-card.tsx
│   └── lib
│       ├── constants.ts
│       ├── backend
│       │   └── client.ts
│       ├── data
│       │   ├── news.ts
│       │   └── store.ts
│       ├── format.ts
│       ├── media
│       │   └── images.ts
│       ├── seed.ts
│       └── types.ts
├── tailwind.config.ts
└── tsconfig.json
```

## Supabase schema assumptions

The canonical schema lives in:

- [/Users/darren/Desktop/Vibe cording/Liquor v.Codex/supabase/schema.sql](/Users/darren/Desktop/Vibe%20cording/Liquor%20v.Codex/supabase/schema.sql)

### `bottles`

Required fields:

- `id`
- `category`
- `name`
- `brand`
- `line`
- `batch`
- `ageStatement`
- `abv`
- `volumeMl`
- `aliases`
- `masterImageUrl`
- `imageUrl`
- `createdAt`
- `updatedAt`

Example document id:

```json
{
  "category": "Bourbon",
  "name": "Stagg Jr Batch 18",
  "brand": "Buffalo Trace",
  "line": "Stagg Jr",
  "batch": "Batch 18",
  "ageStatement": "NAS",
  "abv": 65.2,
  "volumeMl": 750,
  "aliases": ["Stagg 18", "SJ18"],
  "masterImageUrl": "https://...",
  "imageUrl": "https://...",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### `listings`

Required fields:

- `id`
- `bottleId`
- `bottleName`
- `category`
- `inputPriceValue`
- `inputCurrency`
- `fxRateAtEntry`
- `normalizedPriceUsd`
- `approxPriceKrw`
- `quantity`
- `condition`
- `region`
- `telegramId`
- `note`
- `originalImages`
- `thumbnailImages`
- `imageUrl`
- `status`
- `createdAt`
- `updatedAt`
- `createdBy`

Notes:

- USD is the canonical comparison currency.
- If the seller enters KRW, the submit flow converts it into USD using the latest stored `USD/KRW` rate from `fx_rates`.
- The original input value and currency are both stored.
- Historical listings are never recalculated after creation.
- `approxPriceKrw` is stored at entry time for UI display.
- `imageUrl` is kept as a backward-compatible lightweight preview field.
- `originalImages[]` stores full-size listing photos.
- `thumbnailImages[]` stores generated `card-*` and `preview-*` images.

### `fx_rates`

Required fields:

- `pair`
- `rate`
- `updatedAt`
- `source`

Example document id:

- `USD_KRW`

### `reports`

Assumed fields for the moderation flow:

- `id`
- `listingId`
- `reason`
- `note`
- `createdBy`
- `status`
- `createdAt`
- `updatedAt`

### `admins`

Assumed fields for role checks:

- `uid`
- `email`
- `role`
- `createdAt`

The app treats a row in `public.admins` as admin authorization.

## Image architecture

The project now separates images into three storage layers:

- Bottle master image
  - Database: `bottles.master_image_url`
  - Storage: `bottles/{bottleId}/master/main.jpg`
  - Used for canonical bottle imagery
- Listing original images
  - Database: `listings.original_images[]`
  - Storage: `listings/{listingId}/original/{fileName}`
  - Used for the listing archive and any detailed listing view
- Listing thumbnail images
  - Database: `listings.thumbnail_images[]`
  - Storage: `listings/{listingId}/thumb/{fileName}`
  - Generated at upload time in:
    - `card-*` around `400px`
    - `preview-*` around `800px`

Current helpers:

- `uploadBottleMasterImage`
- `uploadListingOriginalImages`
- `saveListingImageMetadata`
- `getBottleCardImage`
- `getListingPreviewImage`

## Search strategy

To stay free-tier friendly, search is intentionally simple:

- Fetch a bounded listing set from Supabase
- Fetch bottle metadata once
- Join listings with bottle aliases client-side
- Filter by bottle name, brand, line, batch, and aliases in memory

This avoids paid infrastructure and avoids introducing a custom search backend.

## Security model

Policy summary:

- Public read access for bottles, listings, and FX rates
- Authenticated users can create listings and reports
- Admins can update moderation data, alias mappings, and FX rates
- Bottle master images are written only by admins into `bottles/{bottleId}/master/...`
- Listing originals and thumbnails are written only by the authenticated listing owner into `listings/{listingId}/original/...` and `listings/{listingId}/thumb/...`

For the current authoritative access model, see:

- [/Users/darren/Desktop/Vibe cording/Liquor v.Codex/docs/rls-and-storage.md](/Users/darren/Desktop/Vibe%20cording/Liquor%20v.Codex/docs/rls-and-storage.md)

## Seed example data

Seed fixtures live in:

- [`src/lib/seed.ts`](/Users/darren/Desktop/Vibe%20cording/Liquor%20v.Codex/src/lib/seed.ts)

Included:

- Sample bottles across all four categories
- Sample listings with mixed USD and KRW inputs
- A sample `USD/KRW` rate

How to load them:

1. Create a Supabase user with email/password.
2. Add that user to `admins` manually in Supabase.
3. Sign in.
4. Open `/admin`.
5. Click `Seed example data`.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create local environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. Fill `.env.local` with your Supabase values:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET`
   - `SUPABASE_SERVICE_ROLE_KEY`

4. Bootstrap the first admin manually in Supabase after creating a user account:

   Collection: `admins`

   Document id:

   - `<supabase-auth-uid>`

   Fields:

   ```json
   {
     "uid": "<supabase-auth-uid>",
     "email": "admin@example.com",
     "role": "admin",
     "createdAt": "timestamp"
   }
   ```

5. Start local development:

   ```bash
   npm run dev
   ```

## Deployment

Build the static site with:

```bash
npm run build
```

## Operational notes

- No custom server is deployed.
- No scheduled jobs are required for the MVP.
- FX rates are assumed to be written by an admin manually or by a future Google-native automation.
- Supabase queries are intentionally minimal because filtering happens client-side.
- If the listing volume grows materially, the first upgrade path should be denormalized search tokens and stricter pagination, not new paid infrastructure.
