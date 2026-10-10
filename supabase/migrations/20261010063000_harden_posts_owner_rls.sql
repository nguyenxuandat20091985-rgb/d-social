-- Prevent regular users from spoofing or transferring post ownership through
-- overlapping permissive policies. The application writes both owner columns
-- to the signed-in user's ID; admins retain the existing moderation capability.
begin;

drop policy if exists "Users can insert own posts" on public.posts;
drop policy if exists "Users can update own posts" on public.posts;
drop policy if exists posts_update_own on public.posts;
drop policy if exists "Users can delete own posts" on public.posts;
drop policy if exists posts_delete_own on public.posts;

alter policy posts_insert on public.posts
with check (
  (
    (select auth.uid()) = user_id
    and (select auth.uid()) = author_id
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_admin = true
  )
);

alter policy posts_update on public.posts
using (
  (select auth.uid()) = coalesce(author_id, user_id)
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_admin = true
  )
)
with check (
  (
    (select auth.uid()) = user_id
    and (select auth.uid()) = author_id
  )
  or exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_admin = true
  )
);

commit;
