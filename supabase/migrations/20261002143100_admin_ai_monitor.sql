-- Admin Monitor: persistent AI moderation audit log
create table if not exists public.ai_moderation_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  source text not null default 'unknown',
  input_text text,
  score integer,
  action text not null,
  engine text,
  reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_moderation_log_created
  on public.ai_moderation_log (created_at desc);

create index if not exists idx_ai_moderation_log_action_created
  on public.ai_moderation_log (action, created_at desc);

alter table public.ai_moderation_log enable row level security;

drop policy if exists ai_moderation_insert_own on public.ai_moderation_log;
create policy ai_moderation_insert_own
  on public.ai_moderation_log for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists ai_moderation_select_admin on public.ai_moderation_log;
create policy ai_moderation_select_admin
  on public.ai_moderation_log for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_admin = true
    )
  );
