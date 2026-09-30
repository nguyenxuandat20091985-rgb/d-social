-- Phase 2 step 1: audit log for admin actions (optional, non-destructive)
begin;

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (char_length(action) between 2 and 80),
  target_type text,
  target_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_created on public.admin_audit_log (created_at desc);
create index if not exists idx_admin_audit_admin on public.admin_audit_log (admin_id, created_at desc);

alter table public.admin_audit_log enable row level security;

drop policy if exists admin_audit_select on public.admin_audit_log;
create policy admin_audit_select on public.admin_audit_log for select to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true)
  );

drop policy if exists admin_audit_insert on public.admin_audit_log;
create policy admin_audit_insert on public.admin_audit_log for insert to authenticated
  with check (
    (select auth.uid()) = admin_id
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true)
  );

-- Helpful index for following feed
create index if not exists idx_follows_follower_following on public.follows (follower_id, following_id);

commit;
