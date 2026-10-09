begin;

-- Anonymous visitors may read only fields needed for public profile cards/pages.
-- Authenticated application flows retain their current grants while the admin/profile
-- query migration is planned separately to avoid breaking the existing dashboard.
revoke select on table public.profiles from anon;
grant select (id, username, full_name, avatar_url, bio, created_at, follower_count, is_verified)
  on table public.profiles to anon;

commit;
