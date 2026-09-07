-- D Social Network: production-oriented PostgreSQL schema for Supabase
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  avatar_url text,
  bio text,
  is_vip boolean not null default false,
  vip_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (username is null or char_length(username) between 3 and 30),
  constraint profiles_username_format check (username is null or username ~ '^[a-zA-Z0-9_]+$')
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  media_url text,
  media_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint posts_content_or_media check (nullif(trim(content), '') is not null or media_url is not null),
  constraint posts_content_length check (content is null or char_length(content) <= 2000),
  constraint posts_media_type check (media_type is null or media_type in ('image','video'))
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comments_content_length check (char_length(trim(content)) between 1 and 1000)
);

create table if not exists public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint messages_not_self check (sender_id <> recipient_id),
  constraint messages_content_length check (char_length(trim(content)) between 1 and 4000)
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_code bigint unique,
  amount bigint not null check (amount > 0),
  currency text not null default 'VND' check (currency = 'VND'),
  type text not null check (type in ('deposit','vip_purchase','refund')),
  status text not null default 'pending' check (status in ('pending','paid','cancelled','failed')),
  payment_provider text not null default 'payos',
  provider_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_posts_created_at on public.posts (created_at desc, id desc);
create index if not exists idx_posts_author_created_at on public.posts (author_id, created_at desc, id desc);
create index if not exists idx_comments_post_created_at on public.comments (post_id, created_at asc, id asc);
create index if not exists idx_comments_author_created_at on public.comments (author_id, created_at desc);
create index if not exists idx_likes_user_created_at on public.likes (user_id, created_at desc);
create index if not exists idx_messages_conversation_created_at on public.messages (sender_id, recipient_id, created_at desc, id desc);
create index if not exists idx_messages_recipient_created_at on public.messages (recipient_id, created_at desc, id desc);
create index if not exists idx_follows_following on public.follows (following_id, created_at desc);
create index if not exists idx_follows_follower on public.follows (follower_id, created_at desc);
create index if not exists idx_wallet_user_created_at on public.wallet_transactions (user_id, created_at desc);
create index if not exists idx_wallet_status_order on public.wallet_transactions (status, order_code);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at before update on public.posts for each row execute function public.set_updated_at();
drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at before update on public.comments for each row execute function public.set_updated_at();

-- Runs on auth.users insert. It is deliberately locked down and fixes search_path.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.messages enable row level security;
alter table public.follows enable row level security;
alter table public.wallet_transactions enable row level security;

-- Profiles: public read, owner write.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Posts: public read; authenticated users can only create/update/delete their own posts.
drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts for select using (true);
drop policy if exists posts_insert on public.posts;
create policy posts_insert on public.posts for insert to authenticated with check ((select auth.uid()) = author_id);
drop policy if exists posts_update on public.posts;
create policy posts_update on public.posts for update to authenticated using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
drop policy if exists posts_delete on public.posts;
create policy posts_delete on public.posts for delete to authenticated using ((select auth.uid()) = author_id);

-- Comments: public read; only owner can create/edit/delete their comments.
drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments for select using (true);
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated with check ((select auth.uid()) = author_id);
drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments for update to authenticated using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated using ((select auth.uid()) = author_id);

-- Likes: public read; a user may only mutate their own like rows.
drop policy if exists likes_select on public.likes;
create policy likes_select on public.likes for select using (true);
drop policy if exists likes_insert on public.likes;
create policy likes_insert on public.likes for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists likes_delete on public.likes;
create policy likes_delete on public.likes for delete to authenticated using ((select auth.uid()) = user_id);

-- Messages: only sender/recipient can see; sender creates, sender deletes; recipient can mark read.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using ((select auth.uid()) = sender_id or (select auth.uid()) = recipient_id);
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated with check ((select auth.uid()) = sender_id);
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated using ((select auth.uid()) = recipient_id) with check ((select auth.uid()) = recipient_id);
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated using ((select auth.uid()) = sender_id);

-- Follows: public read, owner controls both ends.
drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows for select using (true);
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated with check ((select auth.uid()) = follower_id);
drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete to authenticated using ((select auth.uid()) = follower_id);

-- Payments are private. Provider webhook must use a trusted server/edge function, never the browser.
drop policy if exists wallet_select on public.wallet_transactions;
create policy wallet_select on public.wallet_transactions for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists wallet_insert on public.wallet_transactions;
create policy wallet_insert on public.wallet_transactions for insert to authenticated with check ((select auth.uid()) = user_id and status = 'pending');

-- Realtime publication: enable for chat/feed tables. Safe to run repeatedly.
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.likes;
alter publication supabase_realtime add table public.messages;

-- Storage policies assume a public bucket named "social-media".
-- Create the bucket in Supabase Storage UI/API; do not expose service_role in the browser.
-- Object naming convention: <user-id>/<uuid>.<ext>
drop policy if exists social_media_read on storage.objects;
create policy social_media_read on storage.objects for select using (bucket_id = 'social-media');
drop policy if exists social_media_insert on storage.objects;
create policy social_media_insert on storage.objects for insert to authenticated with check (bucket_id = 'social-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists social_media_update on storage.objects;
create policy social_media_update on storage.objects for update to authenticated using (bucket_id = 'social-media' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'social-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists social_media_delete on storage.objects;
create policy social_media_delete on storage.objects for delete to authenticated using (bucket_id = 'social-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
