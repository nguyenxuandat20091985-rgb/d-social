-- Public posts visibility + admin content management
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

alter table public.posts
  add column if not exists is_published boolean not null default true,
  add column if not exists is_seed boolean not null default false;

create index if not exists idx_posts_published_feed
  on public.posts (created_at desc, id desc)
  where is_published = true;

drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
  for select
  using (
    is_published = true
    or (select auth.uid()) = author_id
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_admin = true
    )
  );

drop policy if exists posts_admin_update on public.posts;
create policy posts_admin_update on public.posts
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

drop policy if exists posts_admin_delete on public.posts;
create policy posts_admin_delete on public.posts
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_admin = true
    )
  );
