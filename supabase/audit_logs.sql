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

create index idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index idx_audit_logs_target on public.audit_logs(target_type, target_id);

alter table public.audit_logs enable row level security;

create policy "audit_logs_read_admin" on public.audit_logs
for select to authenticated using (public.is_admin());

create policy "audit_logs_insert_admin" on public.audit_logs
for insert to authenticated with check (public.is_admin());
