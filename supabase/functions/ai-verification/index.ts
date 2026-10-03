import { withSupabase } from "npm:@supabase/server@1"

const MIN_FOLLOWERS = 1000

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

async function evaluate(admin: any, userId: string) {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,username,full_name,avatar_url,bio,verification_status,is_verified,community_violation_count")
    .eq("id", userId)
    .single()

  if (profileError || !profile) {
    return { ok: false, status: 404, error: "Không tìm thấy hồ sơ." }
  }

  const { count: followerCount, error: followersError } = await admin
    .from("follows")
    .select("follower_id", { count: "exact", head: true })
    .eq("following_id", userId)

  if (followersError) {
    return { ok: false, status: 500, error: "Không kiểm tra được người theo dõi." }
  }

  const realFollowers = Number(followerCount || 0)
  const hasAvatar = Boolean(String(profile.avatar_url || "").trim())
  const hasBio = Boolean(String(profile.bio || "").trim())
  const violations = Number(profile.community_violation_count || 0)

  const reasons: string[] = []
  if (realFollowers < MIN_FOLLOWERS) reasons.push(`Cần ít nhất ${MIN_FOLLOWERS.toLocaleString("vi-VN")} người theo dõi thực; hiện có ${realFollowers.toLocaleString("vi-VN")}.`)
  if (!hasAvatar) reasons.push("Hồ sơ chưa có ảnh đại diện.")
  if (!hasBio) reasons.push("Hồ sơ chưa có phần giới thiệu.")
  if (violations > 0) reasons.push(`Hồ sơ có ${violations} lần vi phạm nguyên tắc cộng đồng.`)

  const approved = reasons.length === 0
  const now = new Date().toISOString()

  const { error: updateError } = await admin.from("profiles").update({
    follower_count: realFollowers,
    verification_status: approved ? "approved" : "rejected",
    is_verified: approved,
    verification_reviewed_at: now,
    verified_at: approved ? now : null,
    verification_rejection_reason: approved ? null : reasons.join(" "),
  }).eq("id", userId)

  if (updateError) return { ok: false, status: 500, error: updateError.message }

  await admin.from("ai_moderation_log").insert({
    user_id: userId,
    source: "verification",
    input_text: `verification check: followers=${realFollowers}, avatar=${hasAvatar}, bio=${hasBio}, violations=${violations}`,
    score: approved ? 100 : 0,
    action: approved ? "allow" : "review",
    engine: "verification-rules-v1",
    reasons,
  })

  return {
    ok: true,
    approved,
    user_id: userId,
    follower_count: realFollowers,
    verification_status: approved ? "approved" : "rejected",
    is_verified: approved,
    reasons,
  }
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

    try {
      const body = await req.json().catch(() => ({}))
      const action = body?.action || "request"
      const callerId = ctx.userClaims?.sub
      if (!callerId) return json({ error: "Unauthorized" }, 401)

      if (action === "request") {
        const { data: current, error } = await ctx.supabaseAdmin
          .from("profiles")
          .select("verification_status,is_verified")
          .eq("id", callerId)
          .single()

        if (error || !current) return json({ error: "Không tìm thấy hồ sơ." }, 404)
        if (current.is_verified || current.verification_status === "approved") {
          return json({ ok: true, approved: true, verification_status: "approved", is_verified: true, message: "Tài khoản đã được xác minh." })
        }
        if (current.verification_status === "pending") {
          return json({ ok: true, pending: true, verification_status: "pending", message: "Yêu cầu đang được kiểm tra." })
        }

        const { error: pendingError } = await ctx.supabaseAdmin
          .from("profiles")
          .update({
            verification_status: "pending",
            verification_requested_at: new Date().toISOString(),
            verification_reviewed_at: null,
            verification_rejection_reason: null,
          })
          .eq("id", callerId)

        if (pendingError) return json({ error: pendingError.message }, 500)
        return json(await evaluate(ctx.supabaseAdmin, callerId))
      }

      if (action === "check") {
        const targetUserId = String(body?.user_id || "")
        if (!targetUserId) return json({ error: "user_id required" }, 400)

        const { data: adminProfile, error: adminError } = await ctx.supabaseAdmin
          .from("profiles").select("is_admin").eq("id", callerId).single()

        if (adminError || !adminProfile?.is_admin) return json({ error: "Admin only" }, 403)
        return json(await evaluate(ctx.supabaseAdmin, targetUserId))
      }

      return json({ error: "Unsupported action" }, 400)
    } catch (error) {
      console.error("verification error", error)
      return json({ error: "Internal verification error" }, 500)
    }
  }),
}
