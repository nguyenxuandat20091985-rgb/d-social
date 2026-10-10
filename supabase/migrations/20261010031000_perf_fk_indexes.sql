-- Add covering indexes for foreign-key columns identified by Supabase Performance Advisor.
-- Reviewed against existing index definitions on 2026-10-10; these columns are not
-- the leading column of an existing valid index. IF NOT EXISTS makes re-application safe.
-- This migration is intentionally additive: it does not alter data, policies, or constraints.

create index if not exists idx_ai_moderation_log_user_id
  on public.ai_moderation_log (user_id);

create index if not exists idx_blocks_blocked_id
  on public.blocks (blocked_id);

create index if not exists idx_categories_parent_id
  on public.categories (parent_id);

create index if not exists idx_conversation_participants_user_id
  on public.conversation_participants (user_id);

create index if not exists idx_conversations_product_id
  on public.conversations (product_id);

create index if not exists idx_messages_deleted_by
  on public.messages (deleted_by);

create index if not exists idx_notifications_actor_id
  on public.notifications (actor_id);

create index if not exists idx_post_comments_user_id
  on public.post_comments (user_id);

create index if not exists idx_post_likes_user_id
  on public.post_likes (user_id);

create index if not exists idx_product_images_product_id
  on public.product_images (product_id);

create index if not exists idx_reports_reporter_id
  on public.reports (reporter_id);

create index if not exists idx_reports_resolved_by
  on public.reports (resolved_by);

create index if not exists idx_saved_posts_post_id
  on public.saved_posts (post_id);

create index if not exists idx_stories_user_id
  on public.stories (user_id);

create index if not exists idx_wallet_transactions_user_id
  on public.wallet_transactions (user_id);
