create extension pgcrypto;

create table public.profiles (
  id uuid primary key,
  email text not null default '',
  first_name text not null default '',
  last_name text not null default '',
  date_of_birth date,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin'))
);

create table public.bottles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null default '',
  category text not null,
  batch text not null default '',
  line text not null default '',
  age_statement text not null default '',
  abv numeric not null default 0,
  volume_ml integer not null default 750,
  aliases text[] not null default '{}',
  hot_bottle boolean not null default false,
  master_image_url text not null default '',
  master_preview_image_url text not null default '',
  image_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  bottle_id uuid not null references public.bottles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  bottle_name text not null default '',
  category text not null default 'Whisky',
  price numeric not null,
  currency text not null check (currency in ('USD', 'KRW')),
  fx_rate_at_entry numeric not null default 0,
  normalized_price_usd numeric not null default 0,
  approx_price_krw numeric not null default 0,
  quantity integer not null default 1,
  condition text not null default '',
  region text not null default '',
  messenger_type text,
  messenger_handle text,
  telegram_id text not null default '',
  note text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  original_images text[] not null default '{}',
  thumbnail_images text[] not null default '{}',
  image_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.news (
  id text primary key,
  title text not null,
  summary text not null,
  source text not null,
  url text not null unique,
  image_url text not null default '',
  published_at timestamptz not null,
  priority text not null default 'medium',
  type text not null default 'article' check (type in ('article', 'video')),
  created_at timestamptz not null default now(),
  category text not null default 'whisky',
  external boolean not null default true
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  note text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  pair text not null,
  rate numeric not null,
  source text not null default '',
  updated_at timestamptz not null default now()
);

create table public.bottle_reference_prices (
  id uuid primary key default gen_random_uuid(),
  bottle_id uuid not null references public.bottles(id) on delete cascade,
  source text not null,
  reference_price_usd numeric not null,
  reference_price_6m_ago numeric,
  reference_change_percent numeric,
  source_url text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.content_slots (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null unique,
  label text not null default '',
  type text not null default 'hero',
  image_url text not null default '',
  headline text not null default '',
  subcopy text not null default '',
  button_label text not null default '',
  button_link text not null default '',
  is_active boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_email text not null default '',
  action text not null,
  target_type text not null,
  target_id text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

create index idx_bottles_category on public.bottles(category);
create index idx_bottles_hot_bottle on public.bottles(hot_bottle);
create index idx_listings_bottle_id on public.listings(bottle_id);
create index idx_listings_user_id on public.listings(user_id);
create index idx_listings_status on public.listings(status);
create index idx_listings_created_at on public.listings(created_at desc);
create index idx_news_published_at on public.news(published_at desc);
create index idx_reports_status on public.reports(status);
create index idx_fx_rates_pair_updated on public.fx_rates(pair, updated_at desc);
create index idx_bottle_reference_prices_bottle_id on public.bottle_reference_prices(bottle_id);
create index idx_bottle_reference_prices_updated_at on public.bottle_reference_prices(updated_at desc);
create index idx_content_slots_slot_key on public.content_slots(slot_key);
create index idx_content_slots_display_order on public.content_slots(display_order);
create index idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index idx_audit_logs_target on public.audit_logs(target_type, target_id);

alter table public.profiles enable row level security;
alter table public.admins enable row level security;
alter table public.bottles enable row level security;
alter table public.listings enable row level security;
alter table public.news enable row level security;
alter table public.reports enable row level security;
alter table public.fx_rates enable row level security;
alter table public.bottle_reference_prices enable row level security;
alter table public.content_slots enable row level security;
alter table public.audit_logs enable row level security;

create policy "profiles_select_own" on public.profiles
for select to authenticated using (id = auth.uid());

create policy "profiles_insert_own" on public.profiles
for insert to authenticated with check (id = auth.uid());

create policy "profiles_update_own" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "admins_select_own" on public.admins
for select to authenticated using (user_id = auth.uid());

create policy "bottles_read_all" on public.bottles
for select using (true);

create policy "bottles_insert_authenticated" on public.bottles
for insert to authenticated with check (true);

create policy "bottles_update_admin" on public.bottles
for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "bottles_delete_admin" on public.bottles
for delete to authenticated using (public.is_admin());

create policy "listings_read_all" on public.listings
for select using (true);

create policy "listings_insert_own" on public.listings
for insert to authenticated with check (user_id = auth.uid());

create policy "listings_update_owner_or_admin" on public.listings
for update to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy "listings_delete_owner_or_admin" on public.listings
for delete to authenticated using (user_id = auth.uid() or public.is_admin());

create policy "news_read_all" on public.news
for select using (true);

create policy "news_insert_admin" on public.news
for insert to authenticated with check (public.is_admin());

create policy "news_update_admin" on public.news
for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "news_delete_admin" on public.news
for delete to authenticated using (public.is_admin());

create policy "reports_insert_own" on public.reports
for insert to authenticated with check (user_id = auth.uid());

create policy "reports_select_admin" on public.reports
for select to authenticated using (public.is_admin());

create policy "reports_update_admin" on public.reports
for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "fx_rates_read_all" on public.fx_rates
for select using (true);

create policy "fx_rates_write_admin" on public.fx_rates
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "bottle_reference_prices_read_all" on public.bottle_reference_prices
for select using (true);

create policy "bottle_reference_prices_write_admin" on public.bottle_reference_prices
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "content_slots_read_all" on public.content_slots
for select using (true);

create policy "content_slots_write_admin" on public.content_slots
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "audit_logs_read_admin" on public.audit_logs
for select to authenticated using (public.is_admin());

create policy "audit_logs_insert_admin" on public.audit_logs
for insert to authenticated with check (public.is_admin());
