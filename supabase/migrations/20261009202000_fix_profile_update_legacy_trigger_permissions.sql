begin;

-- The legacy trigger queried profiles as the caller. Because authenticated users
-- intentionally lack SELECT on private profile columns, that query raised
-- "permission denied for table profiles" during otherwise-valid profile updates.
-- Run this narrow check with the function owner's privileges; keep a fixed path.
create or replace function public.protect_verification_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  admin_user boolean := false;
begin
  -- Trusted backend operations have no end-user auth.uid().
  if uid is null then
    if coalesce(auth.role(), '') = 'service_role' then
      return new;
    end if;
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select coalesce(p.is_admin, false)
    into admin_user
    from public.profiles p
    where p.id = uid;

  if admin_user then
    return new;
  end if;

  if new.is_verified is distinct from old.is_verified
     or new.follower_count is distinct from old.follower_count
     or new.community_violation_count is distinct from old.community_violation_count
     or new.verification_reviewed_at is distinct from old.verification_reviewed_at
     or new.verified_at is distinct from old.verified_at
     or new.verification_rejection_reason is distinct from old.verification_rejection_reason
     or new.verification_status not in ('none','pending') then
    raise exception 'verification fields are managed by D-Social verification service'
      using errcode = '42501';
  end if;

  if new.verification_status = 'pending' and old.verification_status = 'pending' then
    if new.verification_requested_at is distinct from old.verification_requested_at then
      raise exception 'verification request already pending' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.protect_verification_fields() from public, anon, authenticated;

commit;
