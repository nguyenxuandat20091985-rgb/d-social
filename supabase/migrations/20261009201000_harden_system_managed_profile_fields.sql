begin;

-- Harden every server-managed profile field. Regular users may edit their own
-- public profile content, but cannot self-assign roles, verification, suspension,
-- counters, presence, timestamps, or change the profile identity.
create or replace function public.guard_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean := false;
  caller_role text := coalesce(auth.role(), '');
begin
  if auth.uid() is null then
    if caller_role = 'service_role' then
      return new;
    end if;
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select coalesce(p.is_admin, false)
    into caller_is_admin
    from public.profiles p
    where p.id = auth.uid();

  if not coalesce(caller_is_admin, false) then
    if new.id is distinct from old.id
      or new.is_admin is distinct from old.is_admin
      or new.is_vip is distinct from old.is_vip
      or new.vip_expires_at is distinct from old.vip_expires_at
      or new.is_suspended is distinct from old.is_suspended
      or new.suspended_until is distinct from old.suspended_until
      or new.is_verified is distinct from old.is_verified
      or new.verified_at is distinct from old.verified_at
      or new.verification_status is distinct from old.verification_status
      or new.verification_requested_at is distinct from old.verification_requested_at
      or new.verification_reviewed_at is distinct from old.verification_reviewed_at
      or new.verification_rejection_reason is distinct from old.verification_rejection_reason
      or new.community_violation_count is distinct from old.community_violation_count
      or new.follower_count is distinct from old.follower_count
      or new.is_online is distinct from old.is_online
      or new.last_seen is distinct from old.last_seen
      or new.created_at is distinct from old.created_at then
      raise exception 'Cannot modify system-managed profile fields' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

commit;
