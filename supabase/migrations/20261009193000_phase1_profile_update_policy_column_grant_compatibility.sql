begin;

create or replace function public.current_user_is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select is_admin from public.profiles where id = auth.uid()), false); $$;

create or replace function public.current_user_is_vip()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select is_vip from public.profiles where id = auth.uid()), false); $$;

create or replace function public.current_user_vip_expires_at()
returns timestamptz
language sql stable security definer set search_path = public
as $$ select vip_expires_at from public.profiles where id = auth.uid(); $$;

revoke all on function public.current_user_is_admin() from public, anon;
grant execute on function public.current_user_is_admin() to authenticated, service_role;
revoke all on function public.current_user_is_vip() from public, anon;
grant execute on function public.current_user_is_vip() to authenticated, service_role;
revoke all on function public.current_user_vip_expires_at() from public, anon;
grant execute on function public.current_user_vip_expires_at() to authenticated, service_role;

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check (
  (select auth.uid()) = id
  and coalesce(is_admin, false) = public.current_user_is_admin()
  and coalesce(is_vip, false) = public.current_user_is_vip()
  and not (vip_expires_at is distinct from public.current_user_vip_expires_at())
);

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
for update to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

commit;
