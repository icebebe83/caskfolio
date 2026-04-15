# Image Pipeline

This project uses a fixed image pipeline so public surfaces stay consistent and data usage stays predictable.

## Storage variants

- `bottles/{bottleId}/master/main.jpg`
  - Representative bottle master image.
- `bottles/{bottleId}/master/preview.jpg`
  - Lighter bottle master image for runtime display.
- `listings/{listingId}/original/{fileName}`
  - Original upload, reserved for detail-oriented usage.
- `listings/{listingId}/thumb/card-{fileName}.jpg`
  - Smallest thumbnail for cards and grids.
- `listings/{listingId}/thumb/preview-{fileName}.jpg`
  - Mid-sized thumbnail for larger detail presentation.

## Surface rules

- `market-card`
  - Uses listing `card` thumbnail, then bottle master preview, then placeholder.
- `listing-card`
  - Uses listing `card` thumbnail, then bottle master preview, then placeholder.
- `mypage-card`
  - Uses listing `card` thumbnail, then bottle master preview, then placeholder.
- `detail-archive-card`
  - Uses listing `card` thumbnail, then bottle master preview, then placeholder.
- `detail-related-card`
  - Uses listing `card` thumbnail, then bottle master preview, then placeholder.
- `detail-hero`
  - Uses listing `preview` thumbnail, then bottle master preview, then placeholder.
- `listing-original`
  - Uses original upload only for detail-oriented rendering.

## Central policy

All runtime image selection should go through:

- `getBottleImageForSurface(...)`
- `getListingImageForSurface(...)`

Both live in [/Users/darren/Desktop/Vibe cording/Liquor v.Codex/src/lib/media/images.ts](/Users/darren/Desktop/Vibe%20cording/Liquor%20v.Codex/src/lib/media/images.ts).

Avoid re-implementing fallback logic in page or component files.
