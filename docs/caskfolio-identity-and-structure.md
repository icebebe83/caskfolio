# Caskfolio Identity and Structure

This document defines what Caskfolio is, what it is not, and how the project is structured so future product, data, and admin work stays consistent.

## Product Identity

Caskfolio is a bottle market archive and price index for collectors.

The product exists to help users observe secondary-market bottle pricing, compare historical listing snapshots, and reference external global pricing data when reliable matches exist.

Caskfolio is not a marketplace.

It does not provide:

- payments
- escrow
- internal messaging
- transaction mediation
- bottle authentication
- investment advice

All user-to-user communication happens outside the platform through supported messenger links.

## Brand Positioning

Name: Caskfolio

Core idea:

- A portfolio-style archive for bottle prices.
- A collector-focused index, not a shop.
- Trust and clarity matter more than maximum coverage.

Current tagline direction:

- Track real bottle market prices.
- Discover real bottle market prices.
- Collector-focused bottle price index and market archive.

Tone:

- direct
- premium
- data-oriented
- practical
- not salesy

## Primary User Flows

### Public Visitor

Public visitors can:

- browse the market homepage
- explore bottle index data
- view bottle detail pages
- read curated news
- view active listings
- use EN/KR language toggle

Public visitors cannot:

- create listings
- upload images
- edit data
- run admin operations

### Signed-In User

Signed-in users can:

- register bottle listings
- upload listing images
- manage their own listings from My Page
- contact sellers through external messenger links
- report listings

Signed-in users do not own bottle master data. Listings are user-owned price snapshots, while bottles are canonical catalog entities.

### Admin

Admins can:

- manage listings
- manage bottles
- edit bottle aliases and bottle metadata
- set hot bottles
- upload master bottle images
- manage homepage banners
- manage news
- manually edit news thumbnails
- run news import
- manage reports
- view users
- assign admin roles
- enter or edit global reference prices
- view dashboard KPIs

Admin operations should stay lightweight and operational. Avoid overbuilding CMS-style complexity unless the actual workflow requires it.

## Core Product Boundaries

### Bottles vs Listings

Bottles are canonical catalog records.

They represent the thing being indexed:

- name
- brand
- category
- batch / edition
- age statement
- ABV
- volume
- aliases
- master image
- hot bottle flag

Listings are user-submitted market snapshots.

They represent one user-submitted availability or historical price observation:

- bottle reference
- price
- currency
- FX rate at entry
- normalized USD price
- approximate KRW price
- condition
- region
- messenger contact
- uploaded listing images
- active / inactive status

Do not merge these responsibilities. Bottle data is catalog-level. Listing data is market-event-level.

### Global Reference Price

Global Reference Price must only come from real external sources.

Allowed source priority:

1. Wine-Searcher
2. SpiritRadar
3. WhiskyFindr
4. No external match: hide global reference price

Do not use Caskfolio internal median as a fake global reference fallback.

If confidence is low, do not save or display the match.

### News

News is a curated external content feed.

Current behavior:

- Admin can run news import.
- Existing news is preserved.
- New items are appended or existing URLs are refreshed.
- News page displays latest first.
- News page paginates 16 items per page.
- Admin can manually add news.
- Admin can edit Image URL for existing news thumbnails.

News import should not delete old rows as part of normal refresh behavior.

### Homepage Banners

Homepage banners are managed as content slots.

Current behavior:

- Admin can manage up to multiple rotating homepage banners.
- Banners support image, label, headline/copy linkage, active state, type, and display order.
- Homepage uses the admin-managed banner data.

This structure should support future promotions, ads, and seasonal campaigns without redesigning the homepage.

## Application Structure

### Main App Routes

Source root:

- `/src/app`

Important routes:

- `/` market homepage
- `/bottle` bottle index and bottle detail state
- `/news` curated news
- `/submit` listing registration
- `/mypage` user listing archive
- `/login` auth flow
- `/admin` admin dashboard
- `/terms-of-service`
- `/privacy-policy`
- `/listing-policy`

The app uses Next.js App Router with static export for Netlify.

### Component Layer

Source root:

- `/src/components`

Responsibilities:

- shared UI components
- listing cards
- header
- language provider
- empty states
- chart components
- report button

Components should not own data policy. Data normalization, image fallback, and business rules should live in `/src/lib`.

### Data Layer

Source root:

- `/src/lib/data`

Responsibilities:

- Supabase reads and writes
- DTO mapping
- admin operations
- bottle operations
- listing operations
- news operations
- report operations
- audit log writes

Data functions should keep UI components simple and avoid duplicating query logic in pages.

Important files:

- `/src/lib/data/bottles.ts`
- `/src/lib/data/listings.ts`
- `/src/lib/data/news.ts`
- `/src/lib/data/admin.ts`
- `/src/lib/data/reports.ts`
- `/src/lib/data/audit.ts`
- `/src/lib/data/content-slots.ts`

### Media Layer

Source root:

- `/src/lib/media/images.ts`

Image selection and fallback rules should stay centralized here.

Current image surfaces:

- market cards
- bottle cards
- listing cards
- My Page cards
- bottle detail hero
- detail archive cards
- listing originals

Do not reimplement image fallback logic directly inside page components.

See:

- `/docs/image-pipeline.md`

### Admin Server Actions

Client-side admin action helpers:

- `/src/lib/admin/actions.ts`

Netlify serverless functions:

- `/netlify/functions/news-import.mjs`

Reference sync and news import are server-side operations. They must not rely on terminal access in production.

Secrets such as `SUPABASE_SERVICE_ROLE_KEY` must only exist in server-side environments.

## Scripts

Source root:

- `/scripts`

Current script groups:

- `/scripts/news`
  - news import and thumbnail utilities
- `/scripts/reference`
  - external reference price sync
- `/scripts/db`
  - Supabase import and validation utilities
- `/scripts/dev`
  - local preview tooling
- `/scripts/shared`
  - shared script helpers

Operational scripts should stay separate from runtime UI code.

## Database Responsibility

Canonical database:

- Supabase Postgres

Core tables:

- `bottles`
- `listings`
- `listing_contacts`
- `news`
- `reports`
- `profiles`
- `admins`
- `fx_rates`
- `bottle_reference_prices`
- `content_slots`
- `audit_logs`

Schema reference:

- `/supabase/schema.sql`

Access policy reference:

- `/docs/rls-and-storage.md`

## Storage Responsibility

Storage provider:

- Supabase Storage

Current bucket:

- `caskindex-images`

The bucket name is an internal storage path and should not be renamed just because public branding changed to Caskfolio.

Storage paths:

- bottle master images
- bottle master previews
- listing originals
- listing thumbnails
- homepage content images

Storage path stability is more important than brand naming consistency.

## Deployment Model

Hosting:

- Netlify

Backend:

- Supabase

Build output:

- static export to `/out`

Required production environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

`SUPABASE_SERVICE_ROLE_KEY` must never be exposed as `NEXT_PUBLIC_*`.

## Language Support

Current language support:

- English
- Korean

Implementation style:

- lightweight client-side language toggle
- no i18n routing yet
- same URLs for both languages
- Admin can remain English-only unless explicitly expanded

Visible public UI text should use the shared language provider and translation helpers where possible.

## Operational Rules

### Data Trust

Prefer no data over misleading data.

Examples:

- Hide global reference price when no reliable external match exists.
- Do not show internal median as an external benchmark.
- Do not invent news thumbnails when no usable image exists; use fallback or allow Admin Image URL edit.

### Admin Practicality

Admin UI should remain compact and task-oriented.

Add functionality without redesigning layout unless a flow is genuinely blocked.

### Performance

Avoid loading everything at once when data can grow.

Current examples:

- Bottle index uses paginated/lazy loading.
- News page uses 16 items per page.
- Listing cards use thumbnails instead of originals.

### Auditability

Admin mutations should write audit logs when practical.

Audit logs are for operational traceability, not user-facing analytics.

## Near-Term Maintenance Priorities

Keep these areas stable before adding larger features:

- Admin/public DTO separation
- local fallback scope reduction
- image pipeline consistency
- content slot structure
- news import reliability
- reference sync reliability
- RLS/storage policy documentation
- audit log coverage
- production environment variable discipline

## Non-Goals For Now

Do not implement unless explicitly prioritized:

- payments
- escrow
- internal chat
- subscription system
- full marketplace checkout
- full i18n routing
- complex CMS
- multi-role enterprise admin

## Decision Principle

When in doubt, choose the option that protects data quality, avoids misleading users, and keeps the product lightweight enough to operate.
