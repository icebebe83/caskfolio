create table if not exists public.collector_notes (
  id uuid primary key default gen_random_uuid(),
  bottle_id uuid not null references public.bottles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null default 'Collector',
  content text not null check (char_length(content) between 1 and 300),
  helpful_count integer not null default 0,
  status text not null default 'approved' check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collector_note_votes (
  note_id uuid not null references public.collector_notes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, user_id)
);

alter table public.collector_notes
alter column status set default 'approved';

create index if not exists idx_collector_notes_bottle_status_created
on public.collector_notes (bottle_id, status, created_at desc);

create index if not exists idx_collector_notes_status_created
on public.collector_notes (status, created_at desc);

alter table public.collector_notes enable row level security;
alter table public.collector_note_votes enable row level security;

grant select on public.collector_notes to anon, authenticated;
grant insert, delete on public.collector_notes to authenticated;
revoke update on public.collector_notes from authenticated;
grant update (content, status, updated_at) on public.collector_notes to authenticated;
grant select on public.collector_note_votes to anon, authenticated;
grant insert, delete on public.collector_note_votes to authenticated;

drop policy if exists "collector_notes_select_public_approved" on public.collector_notes;
create policy "collector_notes_select_public_approved" on public.collector_notes
for select using (status = 'approved');

drop policy if exists "collector_notes_select_own_or_admin" on public.collector_notes;
create policy "collector_notes_select_own_or_admin" on public.collector_notes
for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "collector_notes_insert_qualified" on public.collector_notes;
create policy "collector_notes_insert_qualified" on public.collector_notes
for insert to authenticated
with check (
  user_id = auth.uid()
  and status = 'approved'
  and char_length(content) between 1 and 300
  and exists (
    select 1
    from public.listings
    where listings.user_id = auth.uid()
      and listings.bottle_id = collector_notes.bottle_id
  )
);

drop policy if exists "collector_notes_update_admin" on public.collector_notes;
create policy "collector_notes_update_admin" on public.collector_notes
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "collector_notes_update_owner_content" on public.collector_notes;
create policy "collector_notes_update_owner_content" on public.collector_notes
for update to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and status in ('approved', 'hidden')
  and char_length(content) between 1 and 300
);

drop policy if exists "collector_notes_delete_admin" on public.collector_notes;
create policy "collector_notes_delete_admin" on public.collector_notes
for delete to authenticated using (public.is_admin());

drop policy if exists "collector_notes_delete_owner" on public.collector_notes;
create policy "collector_notes_delete_owner" on public.collector_notes
for delete to authenticated using (user_id = auth.uid());

drop policy if exists "collector_note_votes_select_public" on public.collector_note_votes;
create policy "collector_note_votes_select_public" on public.collector_note_votes
for select using (true);

drop policy if exists "collector_note_votes_insert_own_approved" on public.collector_note_votes;
create policy "collector_note_votes_insert_own_approved" on public.collector_note_votes
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.collector_notes
    where collector_notes.id = collector_note_votes.note_id
      and collector_notes.status = 'approved'
  )
);

drop policy if exists "collector_note_votes_delete_own" on public.collector_note_votes;
create policy "collector_note_votes_delete_own" on public.collector_note_votes
for delete to authenticated using (user_id = auth.uid());

create or replace function public.refresh_collector_note_helpful_count()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.collector_notes
  set helpful_count = (
    select count(*)::integer
    from public.collector_note_votes
    where note_id = coalesce(new.note_id, old.note_id)
  ),
  updated_at = now()
  where id = coalesce(new.note_id, old.note_id);

  return coalesce(new, old);
end;
$$;

drop trigger if exists collector_note_votes_refresh_helpful_count_insert on public.collector_note_votes;
create trigger collector_note_votes_refresh_helpful_count_insert
after insert on public.collector_note_votes
for each row execute function public.refresh_collector_note_helpful_count();

drop trigger if exists collector_note_votes_refresh_helpful_count_delete on public.collector_note_votes;
create trigger collector_note_votes_refresh_helpful_count_delete
after delete on public.collector_note_votes
for each row execute function public.refresh_collector_note_helpful_count();
