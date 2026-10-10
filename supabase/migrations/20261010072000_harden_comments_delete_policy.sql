-- The comments_delete policy already restricts deletes to the canonical author_id
-- (or user_id only when author_id is null). comments.author_id is NOT NULL, so
-- comments_delete_own adds no needed ownership path and can permit mismatched user_id.
drop policy if exists comments_delete_own on public.comments;
