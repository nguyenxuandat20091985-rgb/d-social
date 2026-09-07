# D Social Network

Mạng xã hội D tối ưu mobile/web, dùng React + Vite + Tailwind CSS, Supabase Auth/PostgreSQL/Realtime/Storage và payOS cho thanh toán server-side.

## Đã triển khai trong repo

- Mobile-first React SPA.
- Supabase client dùng publishable key ở browser; không đưa service role key lên frontend.
- Google OAuth, email/password và phone OTP.
- Feed realtime từ `posts` với pagination query.
- Schema PostgreSQL gồm profiles, posts, comments, likes, messages, follows và wallet_transactions.
- Indexes cho feed, comments, chat, follows và giao dịch.
- RLS chặt chẽ theo ownership; messages chỉ sender/recipient được đọc.
- Trigger tự tạo profile khi user đăng ký.
- Storage policy cho bucket `social-media`, đường dẫn `<user-id>/<uuid>.<ext>`.
- Endpoint `/api/payos/create-payment` tạo link thanh toán sau khi xác thực Supabase session.
- Endpoint `/api/payos/webhook` xác minh webhook payOS, cập nhật giao dịch idempotent và kích hoạt VIP 30 ngày.
- GitHub Actions build check với Node 20.

## Bước 1 — Supabase SQL

Chạy file `supabase/migrations/20260907000100_d_social_schema.sql` trong Supabase SQL Editor. Sau đó tạo Storage bucket public tên `social-media` nếu muốn dùng media trực tiếp từ feed.

Bật Google và Phone provider trong Supabase Auth. Đặt redirect URL của ứng dụng vào Auth URL Configuration.

## Biến môi trường

Copy `.env.example`. Frontend cần `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY`.

Server/Vercel cần `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `APP_URL`.

**Không bao giờ commit service role key, payOS API key hoặc checksum key.**

## PayOS

payOS tạo payment link từ backend và gửi webhook về `/api/payos/webhook`. Không xử lý checksum key ở browser. Cần cấu hình webhook URL trong kênh payOS sau khi Vercel đã deploy.

## Roadmap production

Upload media UI + thumbnail/video limits; likes/comments/chat UI hoàn chỉnh; anti-spam/rate-limit; profanity dictionary; report/block/moderation; notification center; wallet/VIP UI; terms/privacy pages; observability và E2E tests.
