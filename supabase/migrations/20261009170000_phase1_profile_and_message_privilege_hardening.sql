begin;
-- Anonymous clients must never have write privileges on profile data.
revoke insert, update, delete, truncate, references, trigger on table public.profiles from anon;
-- Remove a legacy public-role policy that duplicates the authenticated own-profile update policy.
drop policy if exists "Users can update own profile" on public.profiles;
-- Remove legacy permissive message policy: authenticated users are governed by messages_insert,
-- which also requires a non-null recipient and disallows sending to oneself.
drop policy if exists "Users can send messages" on public.messages;
commit;
