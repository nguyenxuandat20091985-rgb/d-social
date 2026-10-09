create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('image','video')),
  caption text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists stories_active_created_at_idx on public.stories (expires_at, created_at desc);

alter table public.stories enable row level security;

drop policy if exists stories_read_active on public.stories;
create policy stories_read_active on public.stories
  for select to authenticated
  using (expires_at > now());

drop policy if exists stories_insert_own on public.stories;
create policy stories_insert_own on public.stories
  for insert to authenticated
  with check (auth.uid() = user_id and expires_at > now());

drop policy if exists stories_delete_own on public.stories;
create policy stories_delete_own on public.stories
  for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.stories to authenticated;
