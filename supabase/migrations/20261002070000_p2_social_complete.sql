-- P2 Social Complete: notifications, saved_posts, message media/soft-delete, post soft helpers
-- Non-destructive. Safe to re-run on Supabase (Dania).

begin;

-- ---------------------------------------------------------------------------
-- 1) NOTIFICATIONS (real table + unread)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('like','comment','follow','message','mention','system')),
  target_type text,
  target_id uuid,
  title text,
  body text,
  meta jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_user_unread
  on public.notifications (user_id, is_read, created_at desc)
  where is_read = false;

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists notifications_insert_system on public.notifications;
create policy notifications_insert_system on public.notifications
  for insert to authenticated
  with check (
    (select auth.uid()) = actor_id
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_admin = true
    )
  );

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2) SAVED POSTS (server-side bookmark)
-- ---------------------------------------------------------------------------
create table if not exists public.saved_posts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists idx_saved_posts_user
  on public.saved_posts (user_id, created_at desc);

alter table public.saved_posts enable row level security;

drop policy if exists saved_posts_all_own on public.saved_posts;
create policy saved_posts_all_own on public.saved_posts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3) MESSAGES: media + soft delete
-- ---------------------------------------------------------------------------
alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists media_type text;
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages add column if not exists deleted_by uuid references public.profiles(id) on delete set null;

create index if not exists idx_messages_pair_created
  on public.messages (sender_id, recipient_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4) POSTS / COMMENTS: soft-delete helpers (optional columns)
-- ---------------------------------------------------------------------------
alter table public.posts add column if not exists deleted_at timestamptz;
alter table public.comments add column if not exists deleted_at timestamptz;
alter table public.comments add column if not exists updated_at timestamptz default now();

-- Ensure authors can update/delete own posts & comments (idempotent policies)
drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
  for update to authenticated
  using ((select auth.uid()) = author_id or (select auth.uid()) = user_id)
  with check ((select auth.uid()) = author_id or (select auth.uid()) = user_id);

drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts
  for delete to authenticated
  using ((select auth.uid()) = author_id or (select auth.uid()) = user_id);

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments
  for update to authenticated
  using ((select auth.uid()) = author_id)
  with check ((select auth.uid()) = author_id);

drop policy if exists comments_delete_own on public.comments;
create policy comments_delete_own on public.comments
  for delete to authenticated
  using ((select auth.uid()) = author_id);

-- ---------------------------------------------------------------------------
-- 5) Helper function: create notification (callable from client safely)
-- ---------------------------------------------------------------------------
create or replace function public.create_notification(
  p_user_id uuid,
  p_actor_id uuid,
  p_type text,
  p_target_type text default null,
  p_target_id uuid default null,
  p_title text default null,
  p_body text default null,
  p_meta jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  nid uuid;
begin
  if p_user_id is null or p_type is null then
    return null;
  end if;
  if p_user_id = p_actor_id then
    return null;
  end if;
  insert into public.notifications (user_id, actor_id, type, target_type, target_id, title, body, meta)
  values (p_user_id, p_actor_id, p_type, p_target_type, p_target_id, p_title, p_body, coalesce(p_meta, '{}'::jsonb))
  returning id into nid;
  return nid;
end;
$$;

grant execute on function public.create_notification(uuid, uuid, text, text, uuid, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Unread message count helper
-- ---------------------------------------------------------------------------
create or replace function public.unread_message_count(p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from public.messages m
  where m.recipient_id = p_user_id
    and m.read_at is null
    and m.deleted_at is null;
$$;

grant execute on function public.unread_message_count(uuid) to authenticated;

commit;
