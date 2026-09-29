-- D Social ↔ Dania compatibility (NON-DESTRUCTIVE)
-- Goal: reuse existing Dania tables (profiles/posts/messages/follows/...),
-- add missing columns/tables for D Social, never DROP data.

create extension if not exists pgcrypto;

-- PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  avatar_url text,
  bio text,
  is_vip boolean not null default false,
  vip_expires_at timestamptz,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists is_vip boolean not null default false;
alter table public.profiles add column if not exists vip_expires_at timestamptz;
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- POSTS: support both user_id (Dania) and author_id (D Social)
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete cascade,
  content text,
  media_url text,
  media_type text,
  is_published boolean not null default true,
  is_seed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts add column if not exists user_id uuid;
alter table public.posts add column if not exists author_id uuid;
alter table public.posts add column if not exists content text;
alter table public.posts add column if not exists media_url text;
alter table public.posts add column if not exists media_type text;
alter table public.posts add column if not exists is_published boolean not null default true;
alter table public.posts add column if not exists is_seed boolean not null default false;
alter table public.posts add column if not exists created_at timestamptz not null default now();
alter table public.posts add column if not exists updated_at timestamptz not null default now();

update public.posts set author_id = user_id where author_id is null and user_id is not null;
update public.posts set user_id = author_id where user_id is null and author_id is not null;

create or replace function public.sync_posts_author_user()
returns trigger language plpgsql as $$
begin
  if new.author_id is null and new.user_id is not null then new.author_id := new.user_id; end if;
  if new.user_id is null and new.author_id is not null then new.user_id := new.author_id; end if;
  return new;
end;
$$;

drop trigger if exists posts_sync_author_user on public.posts;
create trigger posts_sync_author_user
  before insert or update on public.posts
  for each row execute function public.sync_posts_author_user();

-- COMMENTS / LIKES
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.comments add column if not exists user_id uuid;
update public.comments set user_id = author_id where user_id is null and author_id is not null;
update public.comments set author_id = user_id where author_id is null and user_id is not null;

create table if not exists public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- MESSAGES
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- FOLLOWS / WALLET
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id)
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_code bigint unique,
  amount bigint not null check (amount > 0),
  currency text not null default 'VND',
  type text not null check (type in ('deposit','vip_purchase','refund')),
  status text not null default 'pending' check (status in ('pending','paid','cancelled','failed')),
  payment_provider text not null default 'payos',
  provider_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

-- INDEXES
create index if not exists idx_posts_created_at on public.posts (created_at desc, id desc);
create index if not exists idx_posts_author_created_at on public.posts (author_id, created_at desc, id desc);
create index if not exists idx_posts_user_created_at on public.posts (user_id, created_at desc);
create index if not exists idx_posts_published_feed on public.posts (created_at desc, id desc) where is_published = true;
create index if not exists idx_comments_post_created_at on public.comments (post_id, created_at asc);
create index if not exists idx_messages_conversation on public.messages (sender_id, recipient_id, created_at desc);
create index if not exists idx_messages_recipient on public.messages (recipient_id, created_at desc);

-- PROFILE AUTO-CREATE
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.messages enable row level security;
alter table public.follows enable row level security;
alter table public.wallet_transactions enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select using (
  coalesce(is_published, true) = true
  or (select auth.uid()) = author_id
  or (select auth.uid()) = user_id
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true)
);
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated with check (
  (select auth.uid()) = coalesce(author_id, user_id)
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true)
);
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update to authenticated using (
  (select auth.uid()) = coalesce(author_id, user_id)
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true)
);
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated using (
  (select auth.uid()) = coalesce(author_id, user_id)
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.is_admin = true)
);

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select using (true);
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated with check ((select auth.uid()) = coalesce(author_id, user_id));
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated using ((select auth.uid()) = coalesce(author_id, user_id));

drop policy if exists likes_select on public.likes;
create policy likes_select on public.likes for select using (true);
drop policy if exists likes_insert on public.likes;
create policy likes_insert on public.likes for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists likes_delete on public.likes;
create policy likes_delete on public.likes for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using ((select auth.uid()) = sender_id or (select auth.uid()) = recipient_id);
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated with check ((select auth.uid()) = sender_id);
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated using ((select auth.uid()) = sender_id);

drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows for select using (true);
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated with check ((select auth.uid()) = follower_id);
drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete to authenticated using ((select auth.uid()) = follower_id);

drop policy if exists wallet_select on public.wallet_transactions;
create policy wallet_select on public.wallet_transactions for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists wallet_insert on public.wallet_transactions;
create policy wallet_insert on public.wallet_transactions for insert to authenticated with check ((select auth.uid()) = user_id and status = 'pending');

-- REALTIME
do $$ begin alter publication supabase_realtime add table public.posts; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.comments; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.likes; exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.messages; exception when others then null; end $$;

-- STORAGE
drop policy if exists social_media_read on storage.objects;
create policy social_media_read on storage.objects for select using (bucket_id = 'social-media');
drop policy if exists social_media_insert on storage.objects;
create policy social_media_insert on storage.objects for insert to authenticated with check (bucket_id = 'social-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists social_media_update on storage.objects;
create policy social_media_update on storage.objects for update to authenticated using (bucket_id = 'social-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists social_media_delete on storage.objects;
create policy social_media_delete on storage.objects for delete to authenticated using (bucket_id = 'social-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
