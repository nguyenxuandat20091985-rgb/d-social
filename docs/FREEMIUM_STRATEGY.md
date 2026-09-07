# D Social — Free-first Freemium Strategy

## Product promise

D Social is free to use for the complete core social experience. Users are never required to pay to create an account, browse/post, upload supported photos/videos, like, comment, or exchange realtime messages.

## Free tier — permanently core

- Account registration and sign-in.
- Profile and profile editing.
- Feed browsing and pagination.
- Text posts.
- Supported image/video attachments within abuse/storage limits.
- Likes and comments.
- 1:1 realtime chat.
- Community safety, reporting and moderation controls.

Technical quotas may exist for abuse prevention, storage protection and infrastructure fairness. A quota is not a paywall: users should not be forced to purchase VIP to use core features.

## Optional D VIP

VIP is an optional enhancement layer. It must never disable or gate the core social experience.

Possible future benefits:
- Profile badge and cosmetic themes.
- Larger media limits.
- Enhanced profile customization.
- Priority discovery where appropriate and transparent.
- Additional non-essential convenience features.

Benefits must be clearly disclosed before purchase. No dark patterns, forced checkout, or interruption of core social flows.

## Payment architecture

payOS remains disabled from the default onboarding/feed/chat path. The backend payment endpoint is only reached from an explicit VIP purchase action. Payment credentials remain server-side. Webhooks remain authoritative for payment state.

## Growth priorities

1. Activation: reach first post/comment/message quickly.
2. Retention: reliable realtime feed/chat and fast mobile rendering.
3. Safety: server-enforced limits, moderation, report/block controls.
4. Performance: indexed queries, bounded pages, lazy media, compressed assets.
5. Monetization: only after users receive value; measure VIP conversion without degrading free UX.

## Non-negotiable rules

- No payment required for core social features.
- No payOS redirect during registration, posting, commenting or chat.
- No client-side trust for payment status.
- No secret service-role or payment credentials in browser code.
- Rate limits protect the service and apply independently of VIP status.
