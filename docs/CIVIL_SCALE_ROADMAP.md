# D Social — Lộ trình mạng xã hội công khai, văn minh, chịu tải

## Hiện trạng (2026-09-29)
- Production: https://d-social.vercel.app
- Backend: Supabase Dania (`ztyxlnllqhrqdxapcubj`)
- Có: Auth, feed cursor, chat realtime, share/OG, VIP, moderation cơ bản, admin flag

## Tầm nhìn
Facebook-like **nhẹ, văn minh, Việt-first**: công khai chia sẻ, kiểm duyệt rõ ràng, bảo mật RLS, chịu tải tăng dần, AI admin hỗ trợ, chợ dự án GitHub gắn hệ sinh thái D.

## Phase 1 — Nền tảng văn minh (ship)
1. Bộ lọc từ ngữ + chống spam client
2. Bảng `reports` / `blocks` + RLS
3. Tab **Chợ dự án** (catalog GitHub đang chạy)
4. API `POST /api/ai/moderate` (rules + optional Groq)
5. Index feed/likes/comments cho scale bước đầu

**Chạy SQL:** `supabase/migrations/20260929160000_civil_social_scale.sql`

## Phase 2 — Bảo mật & văn minh sâu
- Rate limit server (Upstash Redis)
- Ẩn bài theo AI score + hàng đợi admin
- Chặn user (blocks) lọc feed/chat
- Audit log admin
- Email verified trước khi đăng công khai

## Phase 3 — Chịu tải
| Lớp | Hành động |
|-----|-----------|
| DB | Index composite, partition posts khi >5M row |
| Cache | CDN Vercel; cache feed trang 1 |
| Realtime | Chỉ subscribe chat active |
| Media | Image optimization, CDN Storage |
| Plan | Supabase Pro khi >500 concurrent |

## Phase 4 — AI Admin
Nguồn: AgentFlow, tro-ly-san-deal (Groq), AutoBot-Pro
1. Post/report → `/api/ai/moderate`
2. score thấp → ẩn + queue reports
3. AI tóm tắt hàng đợi; anh duyệt case "review"

Env: `GROQ_API_KEY` trên Vercel

## Phase 5 — Sản phẩm xã hội
Follow feed, notification, groups, marketplace lead form

## Nguyên tắc
Core free · Không phá Dania · RLS on · Secret không lên client
