-- D-Social Home Featured: rank public posts by valid engagement in the rolling last 24 hours.
-- Non-destructive: adds one RPC and supporting indexes only.
begin;

create index if not exists post_likes_created_post_idx
  on public.post_likes(created_at desc, post_id);
create index if not exists post_comments_created_post_idx
  on public.post_comments(created_at desc, post_id);

create or replace function public.get_home_featured_posts()
returns table (
  id uuid,
  score numeric,
  likes_24h bigint,
  comments_24h bigint,
  unique_engagers bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with eligible_posts as (
    select p.id
    from public.posts p
    where coalesce(p.is_published, true) = true
      and (to_jsonb(p)->>'deleted_at' is null or to_jsonb(p)->>'deleted_at' = '')
  ),
  likes as (
    select l.post_id, l.user_id, l.created_at
    from public.post_likes l
    join eligible_posts ep on ep.id = l.post_id
    where l.created_at >= now() - interval '24 hours'
      and l.created_at <= now()
  ),
  comments as (
    select c.post_id, c.user_id, c.created_at
    from public.post_comments c
    join eligible_posts ep on ep.id = c.post_id
    where c.created_at >= now() - interval '24 hours'
      and c.created_at <= now()
  ),
  interaction_counts as (
    select ep.id,
      count(distinct l.user_id)::bigint as likes_24h,
      count(distinct c.id)::bigint as comments_24h,
      count(distinct engager.user_id)::bigint as unique_engagers,
      count(*) filter (where engager.created_at >= now() - interval '2 hours')::bigint as last_2h_events,
      count(*) filter (where engager.created_at < now() - interval '2 hours')::bigint as prior_22h_events
    from eligible_posts ep
    left join likes l on l.post_id = ep.id
    left join comments c on c.post_id = ep.id
    left join lateral (
      select l2.user_id, l2.created_at from likes l2 where l2.post_id = ep.id
      union all
      select c2.user_id, c2.created_at from comments c2 where c2.post_id = ep.id
    ) engager on true
    group by ep.id
  )
  select ic.id,
    (ic.likes_24h + 3 * ic.comments_24h
      + least(10::numeric, ic.unique_engagers * 0.5)
      + least(10::numeric, greatest(0::numeric,
          ic.last_2h_events * 0.5 - (ic.prior_22h_events / 11.0) * 0.5
        ))
    )::numeric as score,
    ic.likes_24h,
    ic.comments_24h,
    ic.unique_engagers
  from interaction_counts ic
  where ic.likes_24h > 0 or ic.comments_24h > 0
  order by score desc, ic.unique_engagers desc, ic.comments_24h desc, ic.id
  limit 5;
$$;

revoke all on function public.get_home_featured_posts() from public;
grant execute on function public.get_home_featured_posts() to authenticated;

commit;
