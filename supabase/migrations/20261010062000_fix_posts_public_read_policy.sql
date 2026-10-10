-- Prevent the legacy unconditional public SELECT policy from bypassing the
-- published/owner/admin checks in posts_select. Public readers should not see
-- unpublished or soft-deleted posts; owners and admins retain review access.
begin;

drop policy if exists "Posts are viewable by everyone" on public.posts;

alter policy posts_select on public.posts
using (
  (
    deleted_at is null
    and coalesce(is_published, true) = true
  )
  or (select auth.uid()) = author_id
  or (select auth.uid()) = user_id
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_admin = true
  )
);

commit;
