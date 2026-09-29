# D Social Network

Mạng xã hội D — React + Vite + Tailwind + Supabase + payOS (VIP tùy chọn).

## Core (miễn phí)

- Auth: Google, email/password, phone OTP
- Profile, Feed, text/photo/video posts, Like, Comment
- 1-to-1 realtime chat
- **Infinite scroll** (cursor `created_at + id`)
- **Public post** `/p/:postId` (không cần login)
- **Share**: Facebook, Zalo, Copy link, Web Share API
- **Dynamic OG** cho crawler qua `/api/og/post` + rewrite `/p/:id`
- Terms / Privacy, anti-spam rate-limit, profanity filter
- **Admin** `/admin` (cần `profiles.is_admin` + RLS)

## VIP (tùy chọn)

payOS create-payment + webhook. Không bắt buộc cho core.

## Setup

1. Chạy SQL trong `supabase/migrations/` (cả 2 file).
2. Bucket Storage public `social-media`.
3. Auth providers + redirect URL.
4. Env: `VITE_SUPABASE_*`, server `SUPABASE_SERVICE_ROLE_KEY`, `PAYOS_*`, `APP_URL`.
5. `npm install && npm run build`

Gán admin: `update profiles set is_admin = true where id = '<uuid>';`

**Không commit secrets.**
