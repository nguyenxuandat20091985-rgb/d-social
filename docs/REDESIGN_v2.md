# D Social Redesign v2 (2026-09-30)

## Delivered
- Youthful UI (cyan / violet / fuchsia) — original design, not Meta/Facebook clone
- Shell: desktop sidebar + mobile bottom nav
- Tabs: Bảng tin, Khám phá, Tin nhắn, Ví, Tôi
- PWA: manifest + service worker + install banner
- AI admin at `/admin` via `/api/ai/moderate` (rules + optional GROQ_API_KEY)
- **my-ai-bot repo untouched** (CORE_PROTECTION respected)
- Legal copy: law + copyright compliance language
- Cursor pagination + realtime feed retained for load

## Scale notes
- Prefer Supabase Pro + connection pooling under heavy load
- CDN for media (Storage public URLs)
- Optional: set GROQ_API_KEY on Vercel for LLM second-pass moderation
- Rate limits client-side already in `lib/ratelimit.ts`

## App install
Chrome/Edge mobile or desktop → browser menu → Install app / Cài đặt ứng dụng
