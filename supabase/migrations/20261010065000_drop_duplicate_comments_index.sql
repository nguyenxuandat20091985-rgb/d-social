-- Remove the duplicate non-unique comments index. Both indexes cover
-- (post_id, created_at); retain idx_comments_post_created, which had the higher
-- observed scan count during the 2026-10-10 advisor review.
drop index if exists public.idx_comments_post_created_at;
