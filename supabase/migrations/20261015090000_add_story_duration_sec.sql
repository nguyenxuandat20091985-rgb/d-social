-- Store the duration of exported video stories for clients that need timeline metadata.
alter table public.stories
  add column if not exists duration_sec integer;

alter table public.stories
  drop constraint if exists stories_duration_sec_nonnegative;
alter table public.stories
  add constraint stories_duration_sec_nonnegative
  check (duration_sec is null or duration_sec >= 0);
