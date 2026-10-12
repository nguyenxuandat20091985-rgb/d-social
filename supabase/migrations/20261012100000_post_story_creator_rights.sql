begin;

alter table public.posts
  add column if not exists creator_settings jsonb not null default '{}'::jsonb,
  add column if not exists audio_url text,
  add column if not exists audio_title text,
  add column if not exists is_muted boolean not null default false,
  add column if not exists copyright_audio_status text not null default 'unknown',
  add column if not exists watermark_flag boolean not null default false,
  add column if not exists reach_multiplier numeric(4,3) not null default 1.000;

alter table public.stories
  add column if not exists creator_settings jsonb not null default '{}'::jsonb,
  add column if not exists audio_url text,
  add column if not exists audio_title text,
  add column if not exists is_muted boolean not null default false,
  add column if not exists copyright_audio_status text not null default 'unknown';

alter table public.posts
  drop constraint if exists posts_copyright_audio_status_check;
alter table public.posts
  add constraint posts_copyright_audio_status_check
  check (copyright_audio_status in ('unknown','clear','muted_copyright','replaced'));

alter table public.stories
  drop constraint if exists stories_copyright_audio_status_check;
alter table public.stories
  add constraint stories_copyright_audio_status_check
  check (copyright_audio_status in ('unknown','clear','muted_copyright','replaced'));

-- Two or more distinct copyright/brand reports lower distribution until a moderator reviews.
create or replace function public.dsocial_apply_report_reach_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
declare
  report_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if new.target_type = 'post'
    and (
      lower(new.reason) like '%bản quyền hình ảnh%'
      or lower(new.reason) like '%giả mạo thương hiệu%'
      or lower(new.reason) like '%watermark%'
      or lower(new.reason) like '%logo thương hiệu%'
    )
  then
    select count(distinct reporter_id)::integer
      into report_count
      from public.reports
      where target_type = 'post'
        and target_id = new.target_id
        and (
          lower(reason) like '%bản quyền hình ảnh%'
          or lower(reason) like '%giả mạo thương hiệu%'
          or lower(reason) like '%watermark%'
          or lower(reason) like '%logo thương hiệu%'
        );

    if report_count >= 2 then
      update public.posts
        set reach_multiplier = least(reach_multiplier, 0.250)
        where id = new.target_id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.dsocial_apply_report_reach_policy() from public;
revoke all on function public.dsocial_apply_report_reach_policy() from anon;
revoke all on function public.dsocial_apply_report_reach_policy() from authenticated;

drop trigger if exists dsocial_report_reach_policy on public.reports;
create trigger dsocial_report_reach_policy
after insert on public.reports
for each row execute function public.dsocial_apply_report_reach_policy();

commit;
