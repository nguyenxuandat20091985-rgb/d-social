# D Social — Production Operations Runbook

This runbook distinguishes controls enforced by the application/database from operational controls that must be verified in the provider dashboard. It is not evidence that a backup or restore drill has already run.

## 1. Media uploads and retention

- The social-media bucket is restricted to supported image/video MIME types and a 32 MiB server-side object limit.
- The app additionally limits each image to 8 MiB and each video to 30 MiB; a video must be uploaded as a single-media post.
- Storage writes are scoped to the signed-in user's own object folder. Avatar paths use avatars/<user-id>/...
- When publishing a post or a 24-hour story fails after an upload, the client attempts to remove only the objects uploaded during that failed attempt.
- Stories should be queried with expires_at > now(). Hiding expired stories in the UI is not the same as deleting the storage object; do not assume expired media is physically removed.

### Media verification checklist

1. Test one supported JPEG/PNG/WebP/HEIC image under 8 MiB and one supported MP4/WebM/QuickTime video under 30 MiB.
2. Confirm a file above the app limit is rejected before upload.
3. Confirm unsupported MIME types are rejected by Storage, not only by the UI.
4. Confirm a failed database insert cleans up newly uploaded objects; inspect Storage usage after the test.
5. Do these checks with a test account and test content, never by deleting a real user's files.

## 2. Database backup and restore

A production backup is not considered configured until its schedule, retention, and a restore drill are confirmed in Supabase.

1. In Supabase Dashboard, open the D Social project and inspect the database backup/PITR options available on the current plan.
2. Record the actual backup schedule, retention window, and recovery-point limitations. Do not assume daily backups or point-in-time recovery are enabled.
3. For an additional export, use an authorized operator workstation and the official Supabase/Postgres tooling. Store exports encrypted outside the application repository and outside the public Storage bucket.
4. Never place database passwords, service-role keys, or exports containing user data in GitHub, client bundles, or issue comments.
5. Restore a backup into a separate non-production project, run schema/migration checks, and verify representative records and Storage references.
6. Record the drill date, restore duration, and any missing objects before calling disaster recovery ready.

**Current verification state:** backup schedule/retention and a restore drill have not been confirmed by the repository or available project tools.

## 3. Community safety

- User-facing text is checked by a deterministic client-side first pass. It is a UX aid, not a security boundary; browser-side checks and in-memory browser rate limits can be bypassed.
- The moderation API enforces a 4,000-character limit and a best-effort per-instance rate limit. The in-memory API limiter is not a distributed limit across serverless instances.
- Report/block workflows and admin moderation must continue to be tested with separate test accounts.
- Re-run Supabase Security and Performance Advisors after RLS changes. Investigate each warning in context; do not bulk-drop policies, indexes, or security-definer grants.
- Leaked-password protection is a Supabase Auth dashboard setting. Verify the current plan and enable it through the dashboard only after checking the impact on sign-in flows.

## 4. Music and copyright

- The current repository has no first-party licensed music catalog or music licensing integration. Do not ship a music picker or bundled commercial tracks without documented rights.
- Users must upload only media they own or are authorized to share. A platform policy alone does not grant music rights to the platform.
- Before introducing licensed music, record the license scope (territory, term, social/video synchronization, monetization, user-generated content, and takedown process) and test that unlicensed sources cannot be selected.
- A complete copyright complaint/takedown workflow still needs a published contact channel, case tracking, repeat-infringer handling, and documented response targets. Do not claim that process is automated until implemented and tested.

## 5. Ads and monetization

- The current monetization path is optional D VIP through PayOS; core social features must remain free.
- Do not add an ad SDK, tracking pixel, or behavioral ad targeting until privacy notice, consent/opt-out requirements, vendor data flows, placement rules, and measurement retention have been reviewed.
- VIP purchase amounts are server-validated at 99,000 VND / 30 days and 199,000 VND / 90 days. Webhook processing must match the signed provider amount to the stored order before settling it or granting VIP.
- Mismatched payment events must not grant entitlement; reconcile them manually using provider records and the stored order.
- Verify that PayOS production credentials are server-side only and that a successful test payment is reconciled exactly once in a controlled test environment.

## 6. Release gates

Before declaring the roadmap complete, record evidence for:
- Build/test workflow on the exact production commit.
- Vercel deployment state and commit SHA.
- Auth, feed, discover, chat/calls, notifications, profile, admin, media upload/playback, report/block, and payment smoke tests.
- Supabase Security and Performance Advisor review.
- Backup/restore drill and the current plan's retention/recovery limits.
- Copyright/takedown ownership and any future ad consent/privacy controls.
