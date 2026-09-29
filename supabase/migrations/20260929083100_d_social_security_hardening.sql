begin;

create or replace function public.sync_posts_author_user()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.author_id is null and new.user_id is not null then
    new.author_id := new.user_id;
  end if;
  if new.user_id is null and new.author_id is not null then
    new.user_id := new.author_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from anon, authenticated;
revoke execute on function public.sync_posts_author_user() from anon, authenticated;

commit;
