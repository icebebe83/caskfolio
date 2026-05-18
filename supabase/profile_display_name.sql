alter table public.profiles
add column if not exists display_name text not null default '';

update public.profiles
set display_name = coalesce(nullif(split_part(email, '@', 1), ''), 'Collector')
where display_name = '';

with ranked_display_names as (
  select
    id,
    display_name,
    row_number() over (
      partition by lower(trim(display_name))
      order by id
    ) as display_name_rank
  from public.profiles
  where trim(display_name) <> ''
)
update public.profiles as profiles
set display_name = left(ranked_display_names.display_name, 24) || '-' || substr(profiles.id::text, 1, 6)
from ranked_display_names
where profiles.id = ranked_display_names.id
  and ranked_display_names.display_name_rank > 1;

create unique index if not exists profiles_display_name_unique_idx
on public.profiles (lower(trim(display_name)))
where trim(display_name) <> '';
