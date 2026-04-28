# RLS and Storage Policy

This document defines the current Supabase access model for Caskfolio. Use it as the operational reference before changing schema, storage policies, or admin tooling.

## Architecture summary

- Database: Supabase Postgres
- Auth: Supabase Auth
- Media storage: Supabase Storage
- Public runtime reads: browser client with anon key
- Authenticated writes: browser client with user session
- Server-side privileged scripts only:
  - `scripts/news/import-news.mjs`
  - `scripts/reference/sync-reference-prices.mjs`
  - `scripts/db/validate-supabase.mjs` when a service role key is present

## Role boundaries

### Public / anon

Public visitors may read:

- `bottles`
- `listings`
- `news`
- `fx_rates`
- `bottle_reference_prices`
- `content_slots`

Public visitors must not write database rows or upload media.

### Authenticated user

Signed-in users may:

- read their own `profiles` row
- create and update their own `profiles` row
- create `listings` where `user_id = auth.uid()`
- update or delete their own `listings`
- create `reports` where `user_id = auth.uid()`
- create and delete their own `bottle_wishlists` rows
- upload images to the shared storage bucket from the browser

Signed-in users must not:

- edit other users' listings
- write `news`
- write `fx_rates`
- write `bottle_reference_prices`
- write `content_slots`
- grant admin roles

### Admin

Admins are users with a row in `public.admins`.

Admins may additionally:

- update any `bottles` row
- update or delete any `listings` row
- read and resolve `reports`
- write `fx_rates`
- write `bottle_reference_prices`
- write `content_slots`
- manage admin-only operations from the Admin UI

### Service role

The Supabase service role key is server-side only.

Allowed usage:

- news ingestion
- reference price sync
- validation scripts

Never expose `SUPABASE_SERVICE_ROLE_KEY` to client code, browser bundles, or `NEXT_PUBLIC_*` variables.

## Current row-level security model

The canonical policy source is:

- [/Users/darren/Desktop/Vibe cording/Liquor v.Codex/supabase/schema.sql](/Users/darren/Desktop/Vibe%20cording/Liquor%20v.Codex/supabase/schema.sql)

### Public read tables

- `bottles`
  - `bottles_read_all`
- `listings`
  - `listings_read_all`
- `news`
  - `news_read_all`
- `fx_rates`
  - `fx_rates_read_all`
- `bottle_reference_prices`
  - `bottle_reference_prices_read_all`
- `content_slots`
  - `content_slots_read_all`

### User-owned tables

- `profiles`
  - `profiles_select_own`
  - `profiles_insert_own`
  - `profiles_update_own`
- `listings`
  - `listings_insert_own`
  - `listings_update_owner_or_admin`
  - `listings_delete_owner_or_admin`
- `reports`
  - `reports_insert_own`
- `bottle_wishlists`
  - `bottle_wishlists_select_own`
  - `bottle_wishlists_insert_own`
  - `bottle_wishlists_delete_own`

### Admin-controlled tables

- `bottles`
  - `bottles_update_admin`
- `reports`
  - `reports_select_admin`
  - `reports_update_admin`
- `fx_rates`
  - `fx_rates_write_admin`
- `bottle_reference_prices`
  - `bottle_reference_prices_write_admin`
- `content_slots`
  - `content_slots_write_admin`
- `audit_logs`
  - `audit_logs_read_admin`
  - `audit_logs_insert_admin`

## Storage model

Bucket:

- `caskindex-images`

Configured in runtime here:

- [/Users/darren/Desktop/Vibe cording/Liquor v.Codex/src/lib/media/images.ts](/Users/darren/Desktop/Vibe%20cording/Liquor%20v.Codex/src/lib/media/images.ts)

### Path structure

- `bottles/{bottleId}/master/main.jpg`
- `bottles/{bottleId}/master/preview.jpg`
- `listings/{listingId}/original/{fileName}`
- `listings/{listingId}/thumb/card-{fileName}.jpg`
- `listings/{listingId}/thumb/preview-{fileName}.jpg`
- `site-content/{slotKey}/hero.jpg`

### Runtime write rules

Browser uploads require a real authenticated Supabase session.

Current upload helpers:

- `uploadBottleMasterImage(...)`
- `uploadHomepageHeroImage(...)`
- `uploadListingOriginalImages(...)`

All three call `supabase.auth.getSession()` before uploading and fail early when no session is present.

### Required bucket policy shape

At minimum, the bucket must permit authenticated users to:

- insert objects
- update objects
- delete objects

This repo previously used the following SQL pattern for `storage.objects`:

```sql
create policy "authenticated_uploads_caskindex_images"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'caskindex-images');

create policy "authenticated_updates_caskindex_images"
on storage.objects
for update
to authenticated
using (bucket_id = 'caskindex-images')
with check (bucket_id = 'caskindex-images');

create policy "authenticated_deletes_caskindex_images"
on storage.objects
for delete
to authenticated
using (bucket_id = 'caskindex-images');
```

The app currently uses `getPublicUrl(...)`, so the bucket is expected to be public-readable or otherwise expose stable public object URLs.

Admin-only image uploads for bottle master images and homepage banners are defined here:

- [/Users/darren/Desktop/Vibe cording/Liquor v.Codex/supabase/storage_admin_image_policies.sql](/Users/darren/Desktop/Vibe%20cording/Liquor%20v.Codex/supabase/storage_admin_image_policies.sql)

Apply that SQL in Supabase SQL Editor if Admin image uploads fail with `new row violates row-level security policy`.

## Data ownership model

### Bottles

- One canonical bottle row per catalog entity
- Holds brand/category/master image metadata
- Admin-maintained

### Listings

- User-owned price snapshots
- References a bottle by `bottle_id`
- Owns uploaded originals and thumbnails

### News

- Curated external content
- Server-ingested only

### Wishlist

- User-owned saved bottle list
- References canonical `bottles`
- Read/write limited to the signed-in user

### Content slots

- CMS-style display slots for homepage banners and future promos
- Public read, admin write

### Audit logs

- Append-only operational history for admin actions
- Admin read, admin insert
- Not exposed on public pages

## Operational checklist

When adding a new admin feature, confirm all of the following:

1. The table has explicit RLS policies for read and write.
2. Public pages only touch tables intended for anon read.
3. Browser uploads use the authenticated client only.
4. Service-role scripts stay under `scripts/` and never move into `src/`.
5. Any new storage path is documented in [docs/image-pipeline.md](/Users/darren/Desktop/Vibe%20cording/Liquor%20v.Codex/docs/image-pipeline.md).

## Known gaps

- `content_slots` still needs to be present in the live database everywhere the Admin banner UI is used.
- Storage policies are not stored in `supabase/schema.sql`; they must be applied to `storage.objects` separately in Supabase.
- Audit logging is not implemented yet.
