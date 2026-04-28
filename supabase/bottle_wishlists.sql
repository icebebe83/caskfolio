create table if not exists public.bottle_wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  bottle_id uuid not null references public.bottles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, bottle_id)
);

create index if not exists idx_bottle_wishlists_user_created
on public.bottle_wishlists(user_id, created_at desc);

create index if not exists idx_bottle_wishlists_bottle_id
on public.bottle_wishlists(bottle_id);

alter table public.bottle_wishlists enable row level security;

drop policy if exists "bottle_wishlists_select_own" on public.bottle_wishlists;
create policy "bottle_wishlists_select_own" on public.bottle_wishlists
for select to authenticated using (user_id = auth.uid());

drop policy if exists "bottle_wishlists_insert_own" on public.bottle_wishlists;
create policy "bottle_wishlists_insert_own" on public.bottle_wishlists
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "bottle_wishlists_delete_own" on public.bottle_wishlists;
create policy "bottle_wishlists_delete_own" on public.bottle_wishlists
for delete to authenticated using (user_id = auth.uid());
