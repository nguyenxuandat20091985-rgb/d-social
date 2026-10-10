-- Remove only identical permissive policies. The retained public-role policy
-- already applies to authenticated users; the duplicated authenticated policy
-- does not add access and is not needed for correctness.
begin;

drop policy if exists follows_select on public.follows;
drop policy if exists follows_insert on public.follows;
drop policy if exists follows_delete on public.follows;
drop policy if exists profiles_select on public.profiles;

commit;
