begin;

create or replace function public.get_my_private_profile()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(p)
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.admin_is_current_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.is_admin
    from public.profiles p
    where p.id = auth.uid()
  ), false);
$$;

create or replace function public.admin_list_profiles(p_mode text default 'users')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if auth.uid() is null or not coalesce((
    select p.is_admin from public.profiles p where p.id = auth.uid()
  ), false) then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  if p_mode = 'users' then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into result
    from (
      select id, username, full_name, avatar_url, is_online, last_seen,
             is_vip, vip_expires_at, is_admin, is_suspended, suspended_until, created_at
      from public.profiles
      order by created_at desc
      limit 100
    ) x;
  elsif p_mode = 'verification' then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into result
    from (
      select id, username, full_name, avatar_url, follower_count, is_verified,
             verification_status, verification_requested_at, verification_reviewed_at,
             verification_rejection_reason, community_violation_count
      from public.profiles
      where verification_status <> 'none'
      order by verification_requested_at desc
      limit 100
    ) x;
  else
    raise exception 'Unsupported profile mode' using errcode = '22023';
  end if;
  return result;
end;
$$;

revoke all on function public.get_my_private_profile() from public, anon;
grant execute on function public.get_my_private_profile() to authenticated, service_role;
revoke all on function public.admin_is_current_user() from public, anon;
grant execute on function public.admin_is_current_user() to authenticated, service_role;
revoke all on function public.admin_list_profiles(text) from public, anon;
grant execute on function public.admin_list_profiles(text) to authenticated, service_role;

-- Remove broad row access grants, then allow only fields intended for regular client reads.
-- Admin-only/private profile fields are returned through the guarded RPC above.
revoke select on table public.profiles from anon, authenticated;
grant select (id, username, full_name, avatar_url, bio, created_at, follower_count, is_verified)
  on table public.profiles to anon, authenticated;

commit;
