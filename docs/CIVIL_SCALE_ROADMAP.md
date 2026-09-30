# D Social — Lộ trình mạng xã hội công khai, văn minh, chịu tải

## Hiện trạng (2026-09-30) — P0 HOÀN TẤT
- Production: https://d-social.vercel.app
- Backend: Supabase Dania (`ztyxlnllqhrqdxapcubj`)
- `src/main.tsx` 742 lines — full app + P0 features

### Đã ship P0
| Tính năng | Chi tiết |
|-----------|----------|
| Follow / Unfollow | Discover → Theo dõi một chiều (`public.follows`) |
| Chặn | Discover → Chặn (`public.blocks`) |
| Chat read receipts | `read_at` + hiển thị Đã gửi / Đã xem |
| Thông báo | Like, bình luận, theo dõi, tin nhắn |
| Bảo vệ admin | RLS chặn self-grant `is_admin` / `is_vip` |
| Legal | Core free + quyền xóa dữ liệu |

**Anh chạy SQL (nếu chưa):** `supabase/migrations/20260930180000_p0_follow_admin_protect.sql`

## Phase 1 — Nền tảng văn minh (đã ship)
Bộ lọc từ ngữ, reports/blocks, AI moderate, index feed, PWA, Redesign v2.

## Phase 2 — tiếp theo
- Rate limit server (Upstash / Edge)
- Feed “đang theo dõi”
- Audit log admin
- Email verify trước đăng bài công khai

## Phase 3 — Chịu tải
CDN media, cache feed, Supabase Pro khi scale.

## Phase 4–5
AI Admin AgentFlow, Stories 24h (tuỳ chọn), Groups.

## Nguyên tắc không đổi
- Core social **miễn phí**
- RLS luôn bật
- Không phá dữ liệu Dania
- Secret key không lên client
