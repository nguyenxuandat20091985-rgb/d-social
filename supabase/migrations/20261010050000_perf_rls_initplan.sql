-- Performance-only rewrite for policies flagged by Supabase's auth_rls_initplan advisor.
-- Wrap auth.uid() in a scalar SELECT so PostgreSQL can evaluate it once per statement.
-- Policy roles, commands, and ownership predicates remain unchanged.
begin;

alter policy "Participants can view" on public.conversation_participants
  using (user_id = (select auth.uid()));

alter policy "Users can view conversations they participate in" on public.conversations
  using (exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = conversations.id
      and cp.user_id = (select auth.uid())
  ));

alter policy "Users can follow" on public.follows
  with check ((select auth.uid()) = follower_id);

alter policy "Users can unfollow" on public.follows
  using ((select auth.uid()) = follower_id);

alter policy "Users can comment" on public.post_comments
  with check ((select auth.uid()) = user_id);

alter policy "Users can delete own comments" on public.post_comments
  using ((select auth.uid()) = user_id);

alter policy "Users can like" on public.post_likes
  with check ((select auth.uid()) = user_id);

alter policy "Users can unlike" on public.post_likes
  using ((select auth.uid()) = user_id);

alter policy "Users can delete own posts" on public.posts
  using ((select auth.uid()) = user_id);

alter policy "Users can insert own posts" on public.posts
  with check ((select auth.uid()) = user_id);

alter policy "Users can update own posts" on public.posts
  using ((select auth.uid()) = user_id);

alter policy "Users can insert product images" on public.product_images
  with check (exists (
    select 1
    from public.products
    where products.id = product_images.product_id
      and products.user_id = (select auth.uid())
  ));

alter policy "Users can delete own products" on public.products
  using ((select auth.uid()) = user_id);

alter policy "Users can insert own products" on public.products
  with check ((select auth.uid()) = user_id);

alter policy "Users can update own products" on public.products
  using ((select auth.uid()) = user_id);

alter policy stories_delete_own on public.stories
  using ((select auth.uid()) = user_id);

alter policy stories_insert_own on public.stories
  with check (((select auth.uid()) = user_id) and (expires_at > now()));

commit;
