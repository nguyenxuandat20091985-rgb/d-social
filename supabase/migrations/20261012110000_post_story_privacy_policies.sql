begin;

alter table public.posts
  add column if not exists privacy text not null default 'public';
alter table public.stories
  add column if not exists privacy text not null default 'public';

alter table public.posts drop constraint if exists posts_privacy_check;
alter table public.posts add constraint posts_privacy_check
  check (privacy in ('public','friends','private'));
alter table public.stories drop constraint if exists stories_privacy_check;
alter table public.stories add constraint stories_privacy_check
  check (privacy in ('public','friends','private'));

drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
for select to public
using (
  (
    deleted_at is null
    and coalesce(is_published, true) = true
    and (
      coalesce(privacy, 'public') = 'public'
      or (
        coalesce(privacy, 'public') = 'friends'
        and (select auth.uid()) is not null
        and exists (
          select 1 from public.follows f1
          where f1.follower_id = (select auth.uid())
            and f1.following_id = posts.author_id
        )
        and exists (
          select 1 from public.follows f2
          where f2.follower_id = posts.author_id
            and f2.following_id = (select auth.uid())
        )
      )
    )
  )
  or (select auth.uid()) = author_id
  or (select auth.uid()) = user_id
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_admin = true
  )
);

drop policy if exists stories_read_active on public.stories;
create policy stories_read_active on public.stories
for select to authenticated
using (
  expires_at > now()
  and (
    coalesce(privacy, 'public') = 'public'
    or user_id = (select auth.uid())
    or (
      coalesce(privacy, 'public') = 'friends'
      and exists (
        select 1 from public.follows f1
        where f1.follower_id = (select auth.uid())
          and f1.following_id = stories.user_id
      )
      and exists (
        select 1 from public.follows f2
        where f2.follower_id = stories.user_id
          and f2.following_id = (select auth.uid())
      )
    )
  )
);

commit;
