alter table public.listings
add column if not exists purchase_date date;

create or replace view public.public_listings as
select
  id,
  bottle_id,
  user_id,
  bottle_name,
  category,
  price,
  currency,
  fx_rate_at_entry,
  normalized_price_usd,
  approx_price_krw,
  quantity,
  condition,
  region,
  note,
  status,
  original_images,
  thumbnail_images,
  image_url,
  created_at,
  updated_at,
  purchase_date
from public.listings;

grant select on public.public_listings to anon, authenticated;
