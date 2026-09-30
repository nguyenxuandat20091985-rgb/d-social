# D Social — Lộ trình mạng xã hội công khai, văn minh, chịu tải

## Hiện trạng (2026-09-30)
- Production: https://d-social.vercel.app
- Backend: Supabase Dania (`ztyxlnllqhrqdxapcubj`)
- Có: Auth, feed cursor, chat realtime, share/OG, VIP, moderation, admin, Discover, notifications, PWA
- **P0 code:** xem `src_main_p0_patched.tsx` trong project artifacts + migration SQL đã push

## P0 ship 2026-09-30
1. Follow / Unfollow / Block trên tab Khám phá (`public.follows`, `public.blocks`)
2. Bảo vệ `is_admin` / `is_vip` khỏi self-grant (RLS profiles_update)
3. Chat: `read_at` khi mở hội thoại + hiển thị Đã gửi / Đã xem
4. Thông báo: like + bình luận + theo dõi + tin nhắn
5. Legal: core free + ghi chú xóa dữ liệu

**Anh chạy SQL trên Supabase:**
`supabase/migrations/20260930180000_p0_follow_admin_protect.sql`

**Anh copy file `src/main.tsx` từ bản patched** (artifacts `src_main_p0_patched.tsx`) nếu main trên repo chưa được restore đầy đủ.

## Phase 1 — đã ship
Bộ lọc từ ngữ, reports/blocks, AI moderate, index feed.

## Phase 2 — tiếp theo
Rate limit server, audit log admin, feed "đang theo dõi", email verify.

## Nguyên tắc
- Core social miễn phí
- RLS luôn bật
- Không phá dữ liệu Dania
- Secret key không lên client
