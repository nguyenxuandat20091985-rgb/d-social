begin;

-- Avoid referencing restricted profile columns directly from RLS expressions.
-- Column-level SELECT restrictions can otherwise cause UPDATE to fail with
-- "permission denied for table profiles" on PostgREST updates.
create or replace function public.guard_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean;
begin
  if auth.uid() is null then
    if current_user in ('postgres', 'service_role', 'supabase_admin') then
      return new;
    end if;
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select coalesce(p.is_admin, false)
    into caller_is_admin
    from public.profiles p
    where p.id = auth.uid();

  if not coalesce(caller_is_admin, false) then
    if new.is_admin is distinct from old.is_admin
      or new.is_vip is distinct from old.is_vip
      or new.vip_expires_at is distinct from old.vip_expires_at then
      raise exception 'Cannot modify privileged profile fields' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_profile_privileged_fields() from public, anon, authenticated;
drop trigger if exists guard_profile_privileged_fields on public.profiles;
create trigger guard_profile_privileged_fields
before update on public.profiles
for each row execute function public.guard_profile_privileged_fields();

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
for update to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

commit;
