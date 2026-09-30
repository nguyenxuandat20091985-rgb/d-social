-- P0: protect is_admin + ensure follows usable + message read helpers
-- Non-destructive. Safe to re-run.

begin;

-- 1) Profiles: users cannot self-grant is_admin / is_vip via client update
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check (
    (select auth.uid()) = id
    and coalesce(is_admin, false) = coalesce(
      (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
      false
    )
    and coalesce(is_vip, false) = coalesce(
      (select p.is_vip from public.profiles p where p.id = (select auth.uid())),
      false
    )
    and vip_expires_at is not distinct from (
      select p.vip_expires_at from public.profiles p where p.id = (select auth.uid())
    )
  );

-- Admin may update any profile (for moderation / support)
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_admin = true
    )
  );

-- 2) Ensure follows table + RLS exist (idempotent)
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);
create index if not exists idx_follows_following on public.follows (following_id, created_at desc);
create index if not exists idx_follows_follower on public.follows (follower_id, created_at desc);
alter table public.follows enable row level security;

drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows for select using (true);
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated
  with check ((select auth.uid()) = follower_id);
drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete to authenticated
  using ((select auth.uid()) = follower_id);

-- 3) Blocks already in civil migration; ensure present
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;
drop policy if exists blocks_all_own on public.blocks;
create policy blocks_all_own on public.blocks for all to authenticated
  using ((select auth.uid()) = blocker_id)
  with check ((select auth.uid()) = blocker_id);

-- 4) Messages: allow recipient to set read_at only
-- (base policy already restricts update to recipient)

commit;
