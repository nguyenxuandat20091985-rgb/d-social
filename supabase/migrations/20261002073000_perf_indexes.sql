-- Indexes only. Safe to re-run. Does not change data or policies.
create index if not exists idx_posts_published_created
  on public.posts (created_at desc, id desc)
  where is_published = true and deleted_at is null;

create index if not exists idx_messages_recipient_unread
  on public.messages (recipient_id, created_at desc)
  where read_at is null;

create index if not exists idx_likes_post
  on public.likes (post_id);

create index if not exists idx_comments_post_created
  on public.comments (post_id, created_at);
