-- Secure aggregate count for saved short videos.
-- Users can see aggregate counts without being able to inspect other users' saved lists.
begin;

create or replace function public.short_video_save_count(p_post_id uuid)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  return (
    select count(*)::bigint
    from public.saved_posts as sp
    where sp.post_id = p_post_id
  );
end;
$$;

revoke all on function public.short_video_save_count(uuid) from public;
revoke all on function public.short_video_save_count(uuid) from anon;
grant execute on function public.short_video_save_count(uuid) to authenticated;

commit;
