import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const BUCKET = "social-media";
const MAX_ORIGINAL_BYTES = 32 * 1024 * 1024;
const MAX_PROCESSED_BYTES = 32 * 1024 * 1024;

type RequestBody = { path?: string; media_type?: "image" | "video"; rights_confirmed?: boolean };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mediaServiceUrl = Deno.env.get("MEDIA_SERVICE_URL")?.replace(/\/+$/, "");
  const mediaServiceToken = Deno.env.get("MEDIA_SERVICE_API_TOKEN");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !mediaServiceUrl || !mediaServiceToken) {
    return json({ error: "Media processing is not configured; use the existing upload flow" }, 503);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Expected JSON request body" }, 400);
  }
  if (!body || typeof body !== "object") return json({ error: "Invalid request body" }, 400);
  const path = body.path ?? "";
  const mediaType = body.media_type;
  if (typeof path !== "string") return json({ error: "Storage path must be a string" }, 400);
  if (!body.rights_confirmed || (mediaType !== "image" && mediaType !== "video")) {
    return json({ error: "A valid media_type and rights_confirmed=true are required" }, 400);
  }
  // Only process files under the authenticated user's first-level folder.
  if (!path.startsWith(`${userData.user.id}/`) || path.includes("..") || path.startsWith("/") || path.includes("\\")) {
    return json({ error: "Storage path is not owned by the authenticated user" }, 403);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const originalUrl = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  const fallback = (reason: string) => json({
    status: "fallback",
    media_url: originalUrl,
    original_path: path,
    reason,
  });
  let pendingProcessedPath: string | null = null;

  try {
    const { data: original, error: downloadError } = await admin.storage.from(BUCKET).download(path);
    if (downloadError || !original) return json({ error: "Original media could not be retrieved" }, 404);
    if (original.size <= 0 || original.size > MAX_ORIGINAL_BYTES) return fallback("original_size_out_of_range");
    const contentType = original.type || (mediaType === "image" ? "image/jpeg" : "video/mp4");
    if (!contentType.startsWith(`${mediaType}/`)) return fallback("media_type_mismatch");

    const filename = path.split("/").pop() || (mediaType === "image" ? "upload.jpg" : "upload.mp4");
    const input = new FormData();
    input.set("file", new File([original], filename, { type: contentType }));
    input.set("rights_confirmed", "true");

    const processResponse = await fetch(`${mediaServiceUrl}/api/v1/media/process-binary`, {
      method: "POST",
      headers: {
        "X-Media-Service-Token": mediaServiceToken,
        "X-Idempotency-Key": `${userData.user.id}:${path}`,
      },
      body: input,
      signal: AbortSignal.timeout(105_000),
    });
    if (!processResponse.ok) return fallback(`processor_http_${processResponse.status}`);

    const outputFilename = processResponse.headers.get("X-Output-Filename") ?? "";
    const outputMediaType = processResponse.headers.get("X-Output-Media-Type");
    const outputHash = processResponse.headers.get("X-Output-SHA256") ?? "";
    const declaredSize = Number(processResponse.headers.get("X-Output-Size-Bytes"));
    if (
      !/^[a-f0-9]{24}\.(?:jpg|jpeg|png|webp|mp4|mov|m4v|webm)$/.test(outputFilename) ||
      outputMediaType !== mediaType ||
      !/^[a-f0-9]{64}$/.test(outputHash) ||
      !Number.isSafeInteger(declaredSize) ||
      declaredSize <= 0 ||
      declaredSize > MAX_PROCESSED_BYTES
    ) {
      return fallback("processor_headers_invalid");
    }

    const processedBytes = await processResponse.arrayBuffer();
    if (processedBytes.byteLength !== declaredSize || await sha256Hex(processedBytes) !== outputHash) {
      return fallback("processed_output_integrity_failed");
    }

    const ext = outputFilename.split(".").pop()?.toLowerCase() || (mediaType === "image" ? "jpg" : "mp4");
    const processedPath = `${userData.user.id}/processed/${outputHash}.${ext}`;
    const processedBlob = new Blob([processedBytes], {
      type: processResponse.headers.get("Content-Type") || (mediaType === "image" ? "image/jpeg" : "video/mp4"),
    });
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(processedPath, processedBlob, {
      contentType: processedBlob.type || (mediaType === "image" ? "image/jpeg" : "video/mp4"),
      upsert: false,
    });
    const uploadedByThisRequest = !uploadError;
    if (uploadedByThisRequest) pendingProcessedPath = processedPath;

    // Reuse an existing content-addressed object only after verifying its bytes.
    const { data: stored, error: verifyError } = await admin.storage.from(BUCKET).download(processedPath);
    if (
      verifyError ||
      !stored ||
      stored.size !== declaredSize ||
      await sha256Hex(await stored.arrayBuffer()) !== outputHash
    ) {
      if (uploadedByThisRequest) {
        await admin.storage.from(BUCKET).remove([processedPath]);
        pendingProcessedPath = null;
      }
      return fallback(uploadError ? "processed_upload_failed" : "stored_output_verification_failed");
    }

    pendingProcessedPath = null;
    return json({
      status: "processed",
      original_path: path,
      processed_path: processedPath,
      sha256: outputHash,
      size_bytes: declaredSize,
    });
  } catch (error) {
    if (pendingProcessedPath) {
      try { await admin.storage.from(BUCKET).remove([pendingProcessedPath]); } catch { /* best-effort cleanup */ }
    }
    const reason = error instanceof DOMException && error.name === "TimeoutError"
      ? "processing_timeout"
      : "processing_unavailable";
    return fallback(reason);
  }
});
