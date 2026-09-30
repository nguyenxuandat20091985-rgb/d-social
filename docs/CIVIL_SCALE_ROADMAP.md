# D Social — Lộ trình

## Hiện trạng 2026-09-30
- Live: https://d-social.vercel.app
- P0 xong: follow/block, read receipts, notifications, protect is_admin
- **P1 code sẵn:** feed Tất cả / Đang theo dõi, lọc block feed+chat, admin audit log

## Deploy P1 (anh dán main như lần P0)
1. File: `DEPLOY_main_p1.tsx` trong project artifacts → dán vào `src/main.tsx` trên GitHub
2. SQL (Supabase):
   - `20260930180000_p0_follow_admin_protect.sql` (nếu chưa)
   - `20260930210000_p1_following_audit.sql`
3. `src/lib/performance.ts` đã push (hỗ trợ authorIds)

## P1 features
| Tính năng | Chi tiết |
|-----------|----------|
| Feed tabs | **Tất cả** / **Đang theo dõi** |
| Lọc block | Ẩn bài + ẩn user chat của người đã chặn |
| Admin audit | Ghi log khi ẩn bài (`admin_audit_log`) |

## Phase 2 còn lại
- Rate limit server (Upstash)
- Email verify trước đăng bài công khai

## Nguyên tắc
Core free · RLS · Không phá Dania · Secret không lên client
