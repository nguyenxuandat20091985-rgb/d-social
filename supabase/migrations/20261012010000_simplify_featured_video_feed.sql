-- Featured now queries the newest eligible video posts directly with keyset-compatible
-- timestamp ordering and client pagination. Remove the obsolete scoring RPC.
drop function if exists public.get_home_featured_posts();

-- Keep newest-first video pages efficient as the community grows.
create index if not exists posts_featured_video_created_at_idx
  on public.posts (created_at desc)
  where media_url is not null
    and is_published = true
    and deleted_at is null;
