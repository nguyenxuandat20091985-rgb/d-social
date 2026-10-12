-- Correct Home Featured ranking to use the likes table used by Home PostCard.
begin;
create index if not exists likes_created_post_idx on public.likes(created_at desc, post_id);
create or replace function public.get_home_featured_posts()
returns table (id uuid, score numeric, likes_24h bigint, comments_24h bigint, unique_engagers bigint)
language sql stable security invoker set search_path = public
as $$
  with eligible_posts as (
    select p.id from public.posts p
    where coalesce(p.is_published, true) = true and p.deleted_at is null
  ),
  likes_24h as (
    select l.post_id, l.user_id, l.created_at from public.likes l
    join eligible_posts ep on ep.id = l.post_id
    where l.created_at >= now() - interval '24 hours' and l.created_at <= now()
  ),
  comments_24h as (
    select c.post_id, c.id as comment_id, c.user_id, c.created_at from public.post_comments c
    join eligible_posts ep on ep.id = c.post_id
    where c.created_at >= now() - interval '24 hours' and c.created_at <= now()
  ),
  engagers as (
    select post_id, user_id, created_at from likes_24h
    union all select post_id, user_id, created_at from comments_24h
  ),
  likes_count as (select post_id, count(distinct user_id)::bigint as n from likes_24h group by post_id),
  comments_count as (select post_id, count(distinct comment_id)::bigint as n from comments_24h group by post_id),
  engager_count as (
    select post_id, count(distinct user_id)::bigint as unique_engagers,
      count(*) filter (where created_at >= now() - interval '2 hours')::bigint as last_2h_events,
      count(*) filter (where created_at < now() - interval '2 hours')::bigint as prior_22h_events
    from engagers group by post_id
  ),
  scored as (
    select ep.id, coalesce(lc.n,0)::bigint as likes_24h, coalesce(cc.n,0)::bigint as comments_24h,
      coalesce(ec.unique_engagers,0)::bigint as unique_engagers,
      (coalesce(lc.n,0) + 3*coalesce(cc.n,0)
       + least(10::numeric, coalesce(ec.unique_engagers,0)*0.5)
       + least(10::numeric, greatest(0::numeric,
          coalesce(ec.last_2h_events,0)*0.5 - (coalesce(ec.prior_22h_events,0)/11.0)*0.5
       )))::numeric as score
    from eligible_posts ep
    left join likes_count lc on lc.post_id=ep.id
    left join comments_count cc on cc.post_id=ep.id
    left join engager_count ec on ec.post_id=ep.id
  )
  select s.id,s.score,s.likes_24h,s.comments_24h,s.unique_engagers from scored s
  where s.likes_24h>0 or s.comments_24h>0
  order by s.score desc,s.unique_engagers desc,s.comments_24h desc,s.id
  limit 5;
$$;
revoke all on function public.get_home_featured_posts() from public;
grant execute on function public.get_home_featured_posts() to authenticated;
commit;