-- Phase 1: civilized social + scale foundations (non-destructive)

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','user','message')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  ai_score int,
  ai_action text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id)
);
create index if not exists idx_reports_status_created on public.reports (status, created_at desc);
create index if not exists idx_reports_target on public.reports (target_type, target_id);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.project_catalog (
  id text primary key,
  name text not null,
  title text not null,
  description text,
  url text not null,
  tags text[] not null default '{}',
  status text not null default 'live' check (status in ('live','beta','archive')),
  sort_order int not null default 100,
  is_published boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;
alter table public.blocks enable row level security;
alter table public.project_catalog enable row level security;

drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check ((select auth.uid()) = reporter_id);
drop policy if exists reports_select on public.reports;
create policy reports_select on public.reports for select to authenticated
  using (
    (select auth.uid()) = reporter_id
    or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true)
  );
drop policy if exists reports_update_admin on public.reports;
create policy reports_update_admin on public.reports for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true));

drop policy if exists blocks_all_own on public.blocks;
create policy blocks_all_own on public.blocks for all to authenticated
  using ((select auth.uid()) = blocker_id)
  with check ((select auth.uid()) = blocker_id);

drop policy if exists project_catalog_public_read on public.project_catalog;
create policy project_catalog_public_read on public.project_catalog for select
  using (is_published = true);
drop policy if exists project_catalog_admin_write on public.project_catalog;
create policy project_catalog_admin_write on public.project_catalog for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true));

create index if not exists idx_posts_author_published on public.posts (author_id, created_at desc)
  where coalesce(is_published, true) = true;
create index if not exists idx_likes_user on public.likes (user_id);
create index if not exists idx_comments_author on public.comments (author_id, created_at desc);

insert into public.project_catalog (id, name, title, description, url, tags, status, sort_order)
values
  ('d-social','d-social','D Social Network','Mạng xã hội realtime','https://d-social.vercel.app',array['social','supabase'],'live',1),
  ('taxi-promax','taxi-promax','Taxi Promax','Công nghệ vận tải Việt','https://github.com/nguyenxuandat20091985-rgb/taxi-promax',array['taxi'],'live',2),
  ('agentflow','AgentFlow','AgentFlow AI','AI Subagents tự động hóa','https://github.com/nguyenxuandat20091985-rgb/AgentFlow',array['ai','agents'],'live',3),
  ('gia-pha','gia-pha-nguyen-family-tree','Gia Phả Họ Nguyễn','Cây phả hệ','https://github.com/nguyenxuandat20091985-rgb/gia-pha-nguyen-family-tree',array['family'],'live',4),
  ('video-ai','MultiPlatformAIVideoGenerator','AI Video Generator','Video dọc đa nền tảng','https://github.com/nguyenxuandat20091985-rgb/MultiPlatformAIVideoGenerator',array['ai','video'],'beta',5)
on conflict (id) do update set title = excluded.title, description = excluded.description, url = excluded.url, tags = excluded.tags, status = excluded.status;
