-- Cấp quyền admin cho 1 user (chạy trên Supabase SQL Editor)
-- Cách 1: theo user id (copy từ trang /admin khi bị chặn)
-- update public.profiles set is_admin = true where id = 'PASTE-USER-UUID-HERE';

-- Cách 2: theo email đăng nhập Google/email
update public.profiles p
set is_admin = true
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('PASTE-EMAIL-HERE');

-- Kiểm tra
select p.id, u.email, p.username, p.full_name, p.is_admin
from public.profiles p
join auth.users u on u.id = p.id
order by p.is_admin desc, p.created_at desc
limit 20;
