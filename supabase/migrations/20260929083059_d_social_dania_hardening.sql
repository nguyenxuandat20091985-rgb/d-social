-- D Social hardening for the existing Dania Supabase project.
-- Non-destructive: keeps existing tables/data and strengthens indexes, RLS,
-- realtime and public media behavior used by the D Social application.

begin;

create unique index if not exists post_likes_post_user_uidx
  on public.post_likes(post_id, user_id);

create unique index if not exists follows_follower_following_uidx
  on public.follows(follower_id, following_id);

create index if not exists posts_feed_cursor_idx
  on public.posts(created_at desc, id desc);

create index if not exists posts_published_feed_idx
  on public.posts(is_published, created_at desc, id desc);

create index if not exists post_comments_post_created_idx
  on public.post_comments(post_id, created_at desc);

create index if not exists post_likes_post_idx
  on public.post_likes(post_id);

create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at asc);

create index if not exists follows_follower_idx
  on public.follows(follower_id);

create index if not exists follows_following_idx
  on public.follows(following_id);

drop policy if exists "Users can view conversations they participate in" on public.conversations;
create policy "Users can view conversations they participate in"
on public.conversations for select
to authenticated
using (
  exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = conversations.id
      and cp.user_id = auth.uid()
  )
);

drop policy if exists "Users can create conversations" on public.conversations;
create policy "Users can create conversations"
on public.conversations for insert
to authenticated
with check (true);

drop policy if exists "Users can view messages in their conversations" on public.messages;
create policy "Users can view messages in their conversations"
on public.messages for select
to authenticated
using (
  exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = messages.conversation_id
      and cp.user_id = auth.uid()
  )
);

do $$
begin
  begin alter publication supabase_realtime add table public.post_comments; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.post_likes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.follows; exception when duplicate_object then null; end;
end $$;

update storage.buckets
set public = true
where id = 'social-media';

commit;
