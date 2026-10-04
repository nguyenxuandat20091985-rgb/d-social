-- Friend system for D-Social
-- Non-destructive and idempotent.

begin;

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_requests_no_self check (requester_id <> addressee_id),
  constraint friend_requests_unique_pair unique (requester_id, addressee_id)
);

create index if not exists idx_friend_requests_addressee_status
  on public.friend_requests (addressee_id, status, created_at desc);
create index if not exists idx_friend_requests_requester_status
  on public.friend_requests (requester_id, status, created_at desc);

alter table public.friend_requests enable row level security;

drop policy if exists friend_requests_select_participant on public.friend_requests;
create policy friend_requests_select_participant on public.friend_requests
  for select to authenticated
  using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);

drop policy if exists friend_requests_insert_requester on public.friend_requests;
create policy friend_requests_insert_requester on public.friend_requests
  for insert to authenticated
  with check ((select auth.uid()) = requester_id and requester_id <> addressee_id);

drop policy if exists friend_requests_update_addressee on public.friend_requests;

drop policy if exists friend_requests_delete_participant on public.friend_requests;
create policy friend_requests_delete_participant on public.friend_requests
  for delete to authenticated
  using ((select auth.uid()) = requester_id or (select auth.uid()) = addressee_id);

-- Existing notifications intentionally use type=system for friend events,
-- so this migration does not change the existing notifications type constraint.
create or replace function public.friend_request_send(p_addressee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_addressee_id is null or v_uid = p_addressee_id then return null; end if;
  if exists (select 1 from public.friend_requests where requester_id=p_addressee_id and addressee_id=v_uid and status='pending') then return null; end if;
  if exists (select 1 from public.friend_requests where requester_id=v_uid and addressee_id=p_addressee_id and status='accepted') then return null; end if;
  if exists (select 1 from public.friend_requests where requester_id=p_addressee_id and addressee_id=v_uid and status='accepted') then return null; end if;
  insert into public.friend_requests (requester_id, addressee_id, status)
  values (v_uid, p_addressee_id, 'pending')
  on conflict (requester_id, addressee_id)
  do update set status='pending', responded_at=null, created_at=now()
  returning id into v_id;
  perform public.create_notification(p_addressee_id,v_uid,'system','friend_request',v_id,'Lời mời kết bạn mới','đã gửi lời mời kết bạn cho bạn',jsonb_build_object('friend_request_id',v_id,'action','friend_request'));
  return v_id;
end;
$$;

create or replace function public.friend_request_respond(p_request_id uuid,p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_requester uuid;
  v_addressee uuid;
begin
  if v_uid is null or p_status not in ('accepted','rejected') then return false; end if;
  select requester_id,addressee_id into v_requester,v_addressee
  from public.friend_requests where id=p_request_id and status='pending' for update;
  if v_addressee is null or v_addressee<>v_uid then return false; end if;
  update public.friend_requests set status=p_status,responded_at=now() where id=p_request_id;
  if p_status='accepted' then
    perform public.create_notification(v_requester,v_uid,'system','friend_request',p_request_id,'Kết bạn thành công','đã chấp nhận lời mời kết bạn của bạn',jsonb_build_object('friend_request_id',p_request_id,'action','friend_accepted'));
  end if;
  return true;
end;
$$;

revoke all on function public.friend_request_send(uuid) from public;
grant execute on function public.friend_request_send(uuid) to authenticated;
revoke all on function public.friend_request_respond(uuid,text) from public;
grant execute on function public.friend_request_respond(uuid,text) to authenticated;

commit;