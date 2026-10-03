-- D-Social AI verification system
-- Non-destructive and idempotent.

alter table public.profiles
  add column if not exists follower_count integer not null default 0,
  add column if not exists is_verified boolean not null default false,
  add column if not exists verification_status text not null default 'none',
  add column if not exists verification_requested_at timestamptz,
  add column if not exists verification_reviewed_at timestamptz,
  add column if not exists verification_rejection_reason text,
  add column if not exists verified_at timestamptz,
  add column if not exists community_violation_count integer not null default 0;

alter table public.profiles
  drop constraint if exists profiles_verification_status_check;
alter table public.profiles
  add constraint profiles_verification_status_check
  check (verification_status in ('none','pending','approved','rejected'));

alter table public.profiles
  drop constraint if exists profiles_verification_followers_check;
alter table public.profiles
  add constraint profiles_verification_followers_check
  check (follower_count >= 0 and community_violation_count >= 0);

create index if not exists idx_profiles_verification_status
  on public.profiles (verification_status, verification_requested_at desc);

update public.profiles p
set follower_count = (
  select count(*) from public.follows f where f.following_id = p.id
);

create or replace function public.protect_verification_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  admin_user boolean := false;
begin
  if uid is null then
    return new;
  end if;

  select coalesce(is_admin, false) into admin_user
  from public.profiles where id = uid;

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
    raise exception 'verification fields are managed by D-Social verification service';
  end if;

  if new.verification_status = 'pending' and old.verification_status = 'pending'
     and new.verification_requested_at is distinct from old.verification_requested_at then
    raise exception 'verification request already pending';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_verification_fields on public.profiles;
create trigger profiles_protect_verification_fields
before update on public.profiles
for each row execute function public.protect_verification_fields();
