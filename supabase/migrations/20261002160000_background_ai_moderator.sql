-- Background AI moderation worker: independent of /admin UI
alter table public.posts
  add column if not exists ai_moderated_at timestamptz,
  add column if not exists ai_action text,
  add column if not exists ai_score integer;

alter table public.comments
  add column if not exists ai_moderated_at timestamptz,
  add column if not exists ai_action text,
  add column if not exists ai_score integer;

create index if not exists idx_posts_ai_pending
  on public.posts (created_at desc)
  where ai_moderated_at is null and is_published = true;

create index if not exists idx_comments_ai_pending
  on public.comments (created_at desc)
  where ai_moderated_at is null and deleted_at is null;

create or replace function public.run_background_ai_moderation()
returns jsonb
language plpgsql
as $$
declare
  p record; c record; txt text; score int; action text; reasons jsonb;
  posts_done int := 0; comments_done int := 0;
begin
  for p in select id, coalesce(content,'') content, coalesce(author_id,user_id) user_id
    from public.posts where ai_moderated_at is null and is_published = true and deleted_at is null
    order by created_at asc limit 25 loop
    txt := lower(p.content); score := 100; reasons := '[]'::jsonb;
    if txt like '%fuck%' or txt like '%shit%' or txt like '%địt%' or txt like '%đụ%' or txt like '%lồn%' or txt like '%cặc%' or txt like '%lừa đảo%' or txt like '%porn%' or txt like '%xxx%' then
      score := score - 60; reasons := reasons || jsonb_build_array('blocked_term');
    end if;
    if p.content ~* '(.)\\1{8,}' or p.content ~* '(https?://\\S+\\s*){5,}' then
      score := score - 40; reasons := reasons || jsonb_build_array('spam_pattern');
    end if;
    if char_length(p.content) > 3000 then score := score - 15; reasons := reasons || jsonb_build_array('length'); end if;
    score := greatest(0,score); action := case when score < 40 then 'hide' when score < 70 then 'review' else 'allow' end;
    update public.posts set ai_moderated_at=now(), ai_action=action, ai_score=score, is_published=case when action='hide' then false else is_published end where id=p.id;
    insert into public.ai_moderation_log(user_id,source,input_text,score,action,engine,reasons)
      values(p.user_id,'background_post',left(p.content,4000),score,action,'db-rules-v1',reasons);
    posts_done := posts_done + 1;
  end loop;

  for c in select id, coalesce(content,'') content, coalesce(author_id,user_id) user_id
    from public.comments where ai_moderated_at is null and deleted_at is null
    order by created_at asc limit 25 loop
    txt := lower(c.content); score := 100; reasons := '[]'::jsonb;
    if txt like '%fuck%' or txt like '%shit%' or txt like '%địt%' or txt like '%đụ%' or txt like '%lồn%' or txt like '%cặc%' or txt like '%lừa đảo%' or txt like '%porn%' or txt like '%xxx%' then
      score := score - 60; reasons := reasons || jsonb_build_array('blocked_term');
    end if;
    if c.content ~* '(.)\\1{8,}' or c.content ~* '(https?://\\S+\\s*){5,}' then
      score := score - 40; reasons := reasons || jsonb_build_array('spam_pattern');
    end if;
    score := greatest(0,score); action := case when score < 40 then 'hide' when score < 70 then 'review' else 'allow' end;
    update public.comments set ai_moderated_at=now(), ai_action=action, ai_score=score, deleted_at=case when action='hide' then now() else deleted_at end where id=c.id;
    insert into public.ai_moderation_log(user_id,source,input_text,score,action,engine,reasons)
      values(c.user_id,'background_comment',left(c.content,4000),score,action,'db-rules-v1',reasons);
    comments_done := comments_done + 1;
  end loop;

  return jsonb_build_object('ok',true,'posts',posts_done,'comments',comments_done,'ran_at',now());
end;
$$;

select cron.unschedule('d-social-ai-moderator');
select cron.schedule('d-social-ai-moderator','*/1 * * * *','select public.run_background_ai_moderation();');
