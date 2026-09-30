# D Social — Lộ trình

## Hiện trạng 2026-09-30 (P0 + P1 live)
- Live: https://d-social.vercel.app
- `src/main.tsx` **819 dòng sạch** — follow/block, read receipts, feed Tất cả/Đang theo dõi, lọc block, admin audit
- Profile: đếm **Người theo dõi / Đang theo dõi**
- API: `/api/rate-limit` (edge, theo IP)

## SQL cần chạy trên Supabase (nếu chưa)
1. `20260930180000_p0_follow_admin_protect.sql`
2. `20260930210000_p1_following_audit.sql`

## Đã ship
| Phase | Nội dung |
|-------|----------|
| P0 | Follow, block, Đã xem, notifications, protect is_admin |
| P1 | Feed following, lọc block, admin_audit_log |
| P2a | Profile follower counts, `/api/rate-limit` |

## Tiếp theo (P2b+)
- Gắn client gọi `/api/rate-limit` trước đăng bài/chat (tùy chọn)
- Upstash Redis khi traffic lớn
- Email verify trước đăng bài công khai

## Nguyên tắc
Core free · RLS · Không phá Dania · Secret không lên client
