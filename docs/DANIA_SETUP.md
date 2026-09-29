# Kết nối D Social với Supabase project Dania

## 1. Chạy SQL (bắt buộc)

Supabase Dashboard → project **Dania** → **SQL Editor** → New query.

Chỉ cần chạy **một file**:

`supabase/migrations/20260929000200_dania_compat.sql`

File này:
- Không DROP / không xóa dữ liệu cũ
- Thêm cột thiếu (`author_id`, `is_published`, `is_admin`…)
- Đồng bộ `user_id` ↔ `author_id` trên bảng posts
- Tạo comments/likes/wallet nếu chưa có
- Bật RLS + Realtime an toàn

Nếu báo lỗi policy trùng tên → bỏ qua hoặc chạy lại (đã dùng `drop policy if exists`).

## 2. Storage

Storage → New bucket → tên **`social-media`** → bật **Public**.

## 3. Auth

Authentication → Providers:
- Email: bật
- Google: bật (nếu dùng)

URL Configuration:
- Site URL = domain Vercel D Social (sau khi deploy)
- Redirect URLs = cùng domain + `http://localhost:5173`

## 4. Env Vercel

Tạo project Vercel trỏ repo `nguyenxuandat20091985-rgb/d-social`, rồi set:

```
VITE_SUPABASE_URL=https://<Dania-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
SUPABASE_URL=https://<Dania-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
APP_URL=https://<vercel-domain>
```

(payOS keys chỉ cần nếu dùng VIP)

## 5. Admin (tuỳ chọn)

Sau khi đăng ký user đầu:

```sql
update profiles set is_admin = true where id = '<uuid>';
```

## 6. Kiểm tra

- Mở app → đăng ký/đăng nhập
- Đăng bài text
- Like / comment
- Chat
- Mở `/p/<post-id>` khi logout
