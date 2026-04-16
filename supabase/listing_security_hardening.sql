create table if not exists public.listing_contacts (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  messenger_type text,
  messenger_handle text,
  telegram_id text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.listing_contacts (listing_id, user_id, messenger_type, messenger_handle, telegram_id, updated_at)
select
  id,
  user_id,
  messenger_type,
  messenger_handle,
  telegram_id,
  updated_at
from public.listings
on conflict (listing_id) do update
set
  user_id = excluded.user_id,
  messenger_type = excluded.messenger_type,
  messenger_handle = excluded.messenger_handle,
  telegram_id = excluded.telegram_id,
  updated_at = excluded.updated_at;

create index if not exists idx_listing_contacts_user_id on public.listing_contacts(user_id);

alter table public.listing_contacts enable row level security;

drop policy if exists "listings_read_all" on public.listings;
drop policy if exists "listings_select_owner_or_admin" on public.listings;
create policy "listings_select_owner_or_admin" on public.listings
for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "listing_contacts_select_authenticated" on public.listing_contacts;
create policy "listing_contacts_select_authenticated" on public.listing_contacts
for select to authenticated using (true);

drop policy if exists "listing_contacts_insert_own" on public.listing_contacts;
create policy "listing_contacts_insert_own" on public.listing_contacts
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "listing_contacts_update_owner_or_admin" on public.listing_contacts;
create policy "listing_contacts_update_owner_or_admin" on public.listing_contacts
for update to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "listing_contacts_delete_owner_or_admin" on public.listing_contacts;
create policy "listing_contacts_delete_owner_or_admin" on public.listing_contacts
for delete to authenticated using (user_id = auth.uid() or public.is_admin());

drop view if exists public.public_listings;
create view public.public_listings as
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
  updated_at
from public.listings;

grant select on public.public_listings to anon, authenticated;
