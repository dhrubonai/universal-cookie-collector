var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/worker.js
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Session-ID"
    };
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    try {
      if (path.startsWith("/api/admin/")) {
        return await handleAdminAPI(request, env, corsHeaders);
      } else if (path.startsWith("/api/")) {
        return await handleUserAPI(request, env, corsHeaders);
      } else {
        return await serveStatic(request, env, path);
      }
    } catch (error) {
      console.error("Worker error:", error);
      return new Response(JSON.stringify({
        error: "Internal server error",
        message: error.message
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};
async function handleUserAPI(request, env, headers) {
  const url = new URL(request.url);
  const path = url.pathname;
  const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
  const sessionId = request.headers.get("X-Session-ID") || generateSessionId();
  switch (path) {
    case "/api/session":
      return await createAdSession(env, clientIP, sessionId, headers);
    case "/api/ad-viewed":
      return await recordAdView(request, env, sessionId, headers);
    case "/api/check-access":
      return await checkAdAccess(env, sessionId, headers);
    case "/api/get-cookie":
      return await getCookieForUser(request, env, clientIP, sessionId, headers);
    case "/api/stats":
      return await getPublicStats(env, headers);
    case "/api/fingerprint":
      return await saveFingerprint(request, env, clientIP, headers);
    default:
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...headers, "Content-Type": "application/json" }
      });
  }
}
__name(handleUserAPI, "handleUserAPI");
async function handleAdminAPI(request, env, headers) {
  const url = new URL(request.url);
  const path = url.pathname;
  const authHeader = request.headers.get("Authorization") || "";
  const isAdmin = await verifyAdmin(authHeader, env);
  if (!isAdmin && path !== "/api/admin/login") {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }
  switch (path) {
    case "/api/admin/login":
      return await adminLogin(request, env, headers);
    case "/api/admin/upload":
      return await uploadCookies(request, env, headers);
    case "/api/admin/cookies":
      return await getCookies(request, env, headers);
    case "/api/admin/delete-used":
      return await deleteUsedCookies(env, headers);
    case "/api/admin/delete-all":
      return await deleteAllCookies(env, headers);
    case "/api/admin/delete-cookie":
      return await deleteCookie(request, env, headers);
    case "/api/admin/analytics":
      return await getAnalytics(env, headers);
    default:
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...headers, "Content-Type": "application/json" }
      });
  }
}
__name(handleAdminAPI, "handleAdminAPI");
async function createAdSession(env, ip, sessionId, headers) {
  const existing = await env.DB.prepare(
    "SELECT * FROM ad_sessions WHERE session_id = ?"
  ).bind(sessionId).first();
  if (existing) {
    return new Response(JSON.stringify({
      success: true,
      session_id: sessionId,
      ad_views_count: existing.ad_views_count,
      max_ad_views: existing.max_ad_views,
      unlocked: existing.cookie_unlocked
    }), {
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }
  await env.DB.prepare(
    `INSERT INTO ad_sessions (session_id, ip_address, max_ad_views) 
         VALUES (?, ?, ?)`
  ).bind(sessionId, ip, parseInt(env.AD_VIEWS_REQUIRED || 3)).run();
  return new Response(JSON.stringify({
    success: true,
    session_id: sessionId,
    ad_views_count: 0,
    max_ad_views: parseInt(env.AD_VIEWS_REQUIRED || 3),
    unlocked: false
  }), {
    headers: { ...headers, "Content-Type": "application/json" }
  });
}
__name(createAdSession, "createAdSession");
async function recordAdView(request, env, sessionId, headers) {
  const session = await env.DB.prepare(
    "SELECT * FROM ad_sessions WHERE session_id = ?"
  ).bind(sessionId).first();
  if (!session) {
    return new Response(JSON.stringify({ error: "Session not found" }), {
      status: 404,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }
  if (session.ad_views_count >= session.max_ad_views) {
    return new Response(JSON.stringify({
      error: "Already completed all required views",
      unlocked: true
    }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }
  await env.DB.prepare(
    "UPDATE ad_sessions SET ad_views_count = ad_views_count + 1 WHERE session_id = ?"
  ).bind(sessionId).run();
  const newCount = session.ad_views_count + 1;
  const isComplete = newCount >= session.max_ad_views;
  if (isComplete) {
    await env.DB.prepare(
      "UPDATE ad_sessions SET completed_at = CURRENT_TIMESTAMP, cookie_unlocked = TRUE WHERE session_id = ?"
    ).bind(sessionId).run();
  }
  return new Response(JSON.stringify({
    success: true,
    ad_views_count: newCount,
    remaining: Math.max(0, session.max_ad_views - newCount),
    unlocked: isComplete
  }), {
    headers: { ...headers, "Content-Type": "application/json" }
  });
}
__name(recordAdView, "recordAdView");
async function checkAdAccess(env, sessionId, headers) {
  const session = await env.DB.prepare(
    "SELECT * FROM ad_sessions WHERE session_id = ? AND cookie_unlocked = TRUE"
  ).bind(sessionId).first();
  return new Response(JSON.stringify({
    has_access: !!session,
    session_exists: true
  }), {
    headers: { ...headers, "Content-Type": "application/json" }
  });
}
__name(checkAdAccess, "checkAdAccess");
async function getCookieForUser(request, env, ip, sessionId, headers) {
  const session = await env.DB.prepare(
    "SELECT * FROM ad_sessions WHERE session_id = ? AND cookie_unlocked = TRUE"
  ).bind(sessionId).first();
  if (!session) {
    return new Response(JSON.stringify({
      error: "Please complete ad views first",
      requires_ads: true
    }), {
      status: 403,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }
  let deviceType = "pc";
  try {
    const body = await request.json();
    deviceType = body.device_type || "pc";
  } catch (e) {
  }
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const todayUsage = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM usage_log ul 
         JOIN users u ON ul.user_id = u.id 
         WHERE u.ip_address = ? AND DATE(ul.used_at) = ?`
  ).bind(ip, today).first();
  const maxDaily = parseInt(env.MAX_DAILY_COOKIES || 8);
  if (todayUsage && todayUsage.count >= maxDaily) {
    return new Response(JSON.stringify({
      error: "Daily limit reached. Please try tomorrow.",
      limit_reached: true,
      used_today: todayUsage.count,
      max_daily: maxDaily
    }), {
      status: 429,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }
  const cookie = await env.DB.prepare(
    `SELECT * FROM cookies 
         WHERE usage_count < 2
         ORDER BY usage_count ASC, uploaded_at ASC
         LIMIT 1`
  ).first();
  if (!cookie) {
    return new Response(JSON.stringify({
      error: "No cookies available at the moment. Please try again later.",
      no_cookies: true
    }), {
      status: 503,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }
  const cookieUrl = generateDeviceUrl(cookie.nftoken, deviceType);
  let user = await env.DB.prepare(
    "SELECT id FROM users WHERE ip_address = ? ORDER BY last_seen DESC LIMIT 1"
  ).bind(ip).first();
  if (!user) {
    const result = await env.DB.prepare(
      "INSERT INTO users (ip_address) VALUES (?)"
    ).bind(ip).run();
    user = { id: result.meta.last_row_id };
  }
  await env.DB.prepare(
    `INSERT INTO usage_log (user_id, cookie_id, device_type, ip_address) 
         VALUES (?, ?, ?, ?)`
  ).bind(user.id, cookie.id, deviceType, ip).run();
  await env.DB.prepare(
    "UPDATE cookies SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(cookie.id).run();
  return new Response(JSON.stringify({
    success: true,
    cookie_url: cookieUrl,
    device_type: deviceType,
    message: "Your cookie is ready! Click the button to open Netflix."
  }), {
    headers: { ...headers, "Content-Type": "application/json" }
  });
}
__name(getCookieForUser, "getCookieForUser");
function generateDeviceUrl(nftoken, deviceType) {
  const baseUrlMap = {
    mobile: "https://www.netflix.com/unsupported?nftoken=",
    pc: "https://www.netflix.com/YourAccount?nftoken=",
    tv: "https://www.netflix.com/tv9?nftoken="
  };
  const base = baseUrlMap[deviceType] || baseUrlMap.pc;
  return base + nftoken;
}
__name(generateDeviceUrl, "generateDeviceUrl");
async function verifyAdmin(authHeader, env) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }
  const token = authHeader.replace("Bearer ", "");
  return token === env.ADMIN_PASSWORD_HASH || token === "admin_temp_token";
}
__name(verifyAdmin, "verifyAdmin");
async function adminLogin(request, env, headers) {
  try {
    const { password } = await request.json();
    if (password === env.ADMIN_PASSWORD_HASH || password === "netflix_admin_2024") {
      const ip = request.headers.get("CF-Connecting-IP") || "unknown";
      try {
        await env.DB.prepare(
          "INSERT INTO admin_log (action, details, ip_address) VALUES (?, ?, ?)"
        ).bind("login", "Successful admin login", ip).run();
      } catch (logError) {
        console.error("Failed to log admin login:", logError);
      }
      return new Response(JSON.stringify({
        success: true,
        token: env.ADMIN_PASSWORD_HASH || "admin_temp_token",
        message: "Login successful"
      }), {
        headers: { ...headers, "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({
      success: false,
      error: "Invalid password. Try: netflix_admin_2024"
    }), {
      status: 401,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("Login error:", e);
    return new Response(JSON.stringify({ error: "Invalid request format" }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }
}
__name(adminLogin, "adminLogin");
async function uploadCookies(request, env, headers) {
  const contentType = request.headers.get("Content-Type") || "";
  let cookies = [];
  let rawText = "";
  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" }
      });
    }
    rawText = await file.text();
    try {
      const parsed = JSON.parse(rawText);
      if (Array.isArray(parsed)) {
        cookies = parsed;
      } else if (parsed.cookies && Array.isArray(parsed.cookies)) {
        cookies = parsed.cookies;
      } else if (parsed.data && Array.isArray(parsed.data)) {
        cookies = parsed.data;
      } else if (typeof parsed === "object") {
        cookies = [parsed];
      } else {
        cookies = [String(parsed)];
      }
    } catch (e) {
      return new Response(JSON.stringify({
        error: "Invalid JSON file",
        details: e.message,
        hint: 'Make sure your JSON is valid. Use format: ["url1", "url2", ...] or [{"url": "url1"}, ...]'
      }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" }
      });
    }
  } else {
    try {
      const body = await request.json();
      if (Array.isArray(body.cookies)) {
        cookies = body.cookies;
      } else if (Array.isArray(body.data)) {
        cookies = body.data;
      } else if (Array.isArray(body)) {
        cookies = body;
      } else {
        cookies = [body];
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" }
      });
    }
  }
  const nftokens = [];
  const extractionLog = [];
  for (let i = 0; i < cookies.length; i++) {
    const cookie = cookies[i];
    const cookieStr = typeof cookie === "string" ? cookie : JSON.stringify(cookie);
    const nftoken = extractNftoken(cookie);
    if (nftoken) {
      nftokens.push(nftoken);
    } else {
      extractionLog.push(`Item ${i + 1}: Could not extract - ${cookieStr.substring(0, 50)}...`);
    }
  }
  if (nftokens.length === 0) {
    return new Response(JSON.stringify({
      error: "No valid Netflix cookies found in upload",
      hint: "Expected URLs like https://www.netflix.com/browse?nftoken=XXX or base64 tokens",
      details: extractionLog.slice(0, 5),
      // Show first 5 extraction failures
      raw_preview: rawText.substring(0, 200)
      // Show start of raw file
    }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }
  let inserted = 0;
  let duplicates = 0;
  let errors = 0;
  for (const nftoken of nftokens) {
    try {
      const existing = await env.DB.prepare(
        "SELECT id FROM cookies WHERE nftoken = ?"
      ).bind(nftoken).first();
      if (!existing) {
        await env.DB.prepare(
          `INSERT INTO cookies (nftoken, usage_count, source_file) 
                     VALUES (?, 0, 'upload')`
        ).bind(nftoken).run();
        inserted++;
      } else {
        duplicates++;
      }
    } catch (e) {
      console.error("Error inserting cookie:", e);
      errors++;
    }
  }
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  try {
    await env.DB.prepare(
      "INSERT INTO admin_log (action, details, ip_address) VALUES (?, ?, ?)"
    ).bind("upload", `Uploaded ${inserted} cookies (${duplicates} duplicates skipped)`, ip).run();
  } catch (logError) {
    console.error("Failed to log upload:", logError);
  }
  return new Response(JSON.stringify({
    success: true,
    total_received: nftokens.length,
    new_cookies_inserted: inserted,
    duplicates_skipped: duplicates,
    errors,
    message: `Successfully added ${inserted} new cookies${duplicates > 0 ? ` (${duplicates} duplicates skipped)` : ""}${errors > 0 ? ` (${errors} failed)` : ""}`
  }), {
    headers: { ...headers, "Content-Type": "application/json" }
  });
}
__name(uploadCookies, "uploadCookies");
function extractNftoken(cookieString) {
  let cleaned = "";
  if (typeof cookieString === "object") {
    cleaned = cookieString.url || cookieString.data || cookieString.nftoken || cookieString.cookie || JSON.stringify(cookieString);
  } else {
    cleaned = String(cookieString);
  }
  cleaned = cleaned.trim().replace(/^["']|["']$/g, "");
  const urlMatch = cleaned.match(/nftoken=([A-Za-z0-9+/=_-]{20,})/);
  if (urlMatch && urlMatch[1] && urlMatch[1].length >= 20) {
    return urlMatch[1].trim();
  }
  const standaloneMatch = cleaned.match(/^([A-Za-z0-9+/=_-]{30,})$/);
  if (standaloneMatch && standaloneMatch[1]) {
    return standaloneMatch[1].trim();
  }
  if (cleaned.length >= 20 && /^[A-Za-z0-9+/=_-]+$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}
__name(extractNftoken, "extractNftoken");
async function getCookies(request, env, headers) {
  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") || "all";
  const page = parseInt(url.searchParams.get("page")) || 1;
  const limit = parseInt(url.searchParams.get("limit")) || 100;
  const offset = (page - 1) * limit;
  let baseQuery = "SELECT * FROM cookies";
  const params = [];
  if (filter === "unused") {
    baseQuery += " WHERE usage_count < 2";
  } else if (filter === "used") {
    baseQuery += " WHERE usage_count >= 2";
  }
  baseQuery += " ORDER BY uploaded_at DESC";
  const allCookies = await env.DB.prepare(baseQuery).bind(...params).all();
  const processedCookies = (allCookies.results || []).map((cookie, index) => ({
    ...cookie,
    display_id: index + 1 + offset,
    is_used: cookie.usage_count >= 2,
    remaining_uses: Math.max(0, 2 - cookie.usage_count),
    status_text: cookie.usage_count >= 2 ? "Used" : cookie.usage_count === 1 ? "Used Once" : "Unused"
  }));
  const paginatedCookies = processedCookies.slice(offset, offset + limit);
  const totalCount = processedCookies.length;
  const unusedCount = (allCookies.results || []).filter((c) => c.usage_count < 2).length;
  const usedCount = (allCookies.results || []).filter((c) => c.usage_count >= 2).length;
  return new Response(JSON.stringify({
    cookies: paginatedCookies,
    summary: {
      total: allCookies.results?.length || 0,
      unused: unusedCount,
      used: usedCount
    },
    pagination: {
      page,
      limit,
      total: totalCount,
      pages: Math.ceil(totalCount / limit)
    }
  }), {
    headers: { ...headers, "Content-Type": "application/json" }
  });
}
__name(getCookies, "getCookies");
async function deleteUsedCookies(env, headers) {
  const usedCookies = await env.DB.prepare(
    "SELECT id FROM cookies WHERE usage_count >= 2"
  ).all();
  if (usedCookies.results && usedCookies.results.length > 0) {
    const ids = usedCookies.results.map((c) => c.id);
    for (const id of ids) {
      await env.DB.prepare("DELETE FROM usage_log WHERE cookie_id = ?").bind(id).run();
    }
  }
  const result = await env.DB.prepare(
    "DELETE FROM cookies WHERE usage_count >= 2"
  ).run();
  try {
    await env.DB.prepare(
      "INSERT INTO admin_log (action, details) VALUES (?, ?)"
    ).bind("delete_used", `Deleted ${result.meta.changes} used cookies`).run();
  } catch (logError) {
    console.error("Failed to log:", logError);
  }
  return new Response(JSON.stringify({
    success: true,
    deleted_count: result.meta.changes || 0,
    message: `Successfully deleted ${result.meta.changes || 0} used cookies`
  }), {
    headers: { ...headers, "Content-Type": "application/json" }
  });
}
__name(deleteUsedCookies, "deleteUsedCookies");
async function deleteAllCookies(env, headers) {
  await env.DB.prepare("DELETE FROM usage_log").run();
  const result = await env.DB.prepare(
    "DELETE FROM cookies"
  ).run();
  try {
    await env.DB.prepare(
      "INSERT INTO admin_log (action, details) VALUES (?, ?)"
    ).bind("delete_all", `Deleted ALL ${result.meta.changes} cookies`).run();
  } catch (logError) {
    console.error("Failed to log:", logError);
  }
  return new Response(JSON.stringify({
    success: true,
    deleted_count: result.meta.changes || 0,
    message: `Successfully deleted ALL ${result.meta.changes || 0} cookies`
  }), {
    headers: { ...headers, "Content-Type": "application/json" }
  });
}
__name(deleteAllCookies, "deleteAllCookies");
async function deleteCookie(request, env, headers) {
  try {
    const { cookie_id } = await request.json();
    await env.DB.prepare(
      "DELETE FROM usage_log WHERE cookie_id = ?"
    ).bind(cookie_id).run();
    await env.DB.prepare(
      "DELETE FROM cookies WHERE id = ?"
    ).bind(cookie_id).run();
    return new Response(JSON.stringify({
      success: true,
      message: "Cookie deleted"
    }), {
      headers: { ...headers, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }
}
__name(deleteCookie, "deleteCookie");
async function getAnalytics(env, headers) {
  const totalCookies = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM cookies"
  ).first();
  const unusedCookies = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM cookies WHERE usage_count < 2"
  ).first();
  const usedCookies = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM cookies WHERE usage_count >= 2"
  ).first();
  const totalUsage = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM usage_log"
  ).first();
  const uniqueUsers = await env.DB.prepare(
    "SELECT COUNT(DISTINCT user_id) as count FROM usage_log"
  ).first();
  const todayUsage = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM usage_log WHERE DATE(used_at) = DATE('now')"
  ).first();
  const weeklyUsage = await env.DB.prepare(
    `SELECT DATE(used_at) as date, COUNT(*) as count 
         FROM usage_log 
         WHERE used_at > DATE('now', '-7 days')
         GROUP BY DATE(used_at)
         ORDER BY date DESC`
  ).all();
  const topUsers = await env.DB.prepare(
    `SELECT u.ip_address, COUNT(ul.id) as usage_count, MAX(ul.used_at) as last_used
         FROM users u
         JOIN usage_log ul ON u.id = ul.user_id
         GROUP BY u.id
         ORDER BY usage_count DESC
         LIMIT 10`
  ).all();
  const deviceDist = await env.DB.prepare(
    `SELECT device_type, COUNT(*) as count 
         FROM usage_log 
         GROUP BY device_type`
  ).all();
  return new Response(JSON.stringify({
    cookies: {
      total: totalCookies.count,
      unused: unusedCookies.count,
      used: usedCookies.count
    },
    usage: {
      total_distributions: totalUsage.count,
      unique_users: uniqueUsers.count,
      today: todayUsage.count
    },
    weekly_usage: weeklyUsage.results || [],
    top_users: topUsers.results || [],
    device_distribution: deviceDist.results || []
  }), {
    headers: { ...headers, "Content-Type": "application/json" }
  });
}
__name(getAnalytics, "getAnalytics");
async function getPublicStats(env, headers) {
  const unusedCookies = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM cookies WHERE usage_count < 2"
  ).first();
  return new Response(JSON.stringify({
    available_cookies: unusedCookies.count,
    status: "online"
  }), {
    headers: { ...headers, "Content-Type": "application/json" }
  });
}
__name(getPublicStats, "getPublicStats");
async function saveFingerprint(request, env, ip, headers) {
  try {
    const { fingerprint } = await request.json();
    if (!fingerprint) {
      return new Response(JSON.stringify({ error: "No fingerprint provided" }), {
        status: 400,
        headers: { ...headers, "Content-Type": "application/json" }
      });
    }
    await env.DB.prepare(`
            INSERT INTO users (fingerprint, ip_address, last_seen) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(fingerprint, ip_address) 
            DO UPDATE SET last_seen = CURRENT_TIMESTAMP
        `).bind(fingerprint, ip).run();
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...headers, "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }
}
__name(saveFingerprint, "saveFingerprint");
function generateSessionId() {
  return "sess_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}
__name(generateSessionId, "generateSessionId");
var INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Netflix Cookies - Free Premium Access</title>
    <meta name="description" content="Get free Netflix cookies for Mobile, PC, and TV. Premium access without subscription.">
    
    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@500;600;700&display=swap" rel="stylesheet">
    
    <!-- Adsterra Social Bar -->
    <script src="https://pl30118644.effectivecpmnetwork.com/55/c2/e3/55c2e330b493a33c42e1143593156c80.js"><\/script>
    
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --bg-primary: #ffffff; --text-primary: #0a0a0a; --text-secondary: #525252;
            --accent: #e50914; --accent-hover: #b20710; --border-light: #e5e5e5;
            --shadow-sm: 0 1px 2px rgba(0,0,0,0.04); --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
            --font-primary: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            --font-display: 'Playfair Display', Georgia, serif;
        }
        body { font-family: var(--font-primary); background-color: var(--bg-primary); color: var(--text-primary); line-height: 1.6; min-height: 100vh; display: flex; flex-direction: column; }
        .header { text-align: center; padding: 60px 20px 40px; border-bottom: 1px solid var(--border-light); }
        .logo { font-family: var(--font-display); font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 700; letter-spacing: -0.02em; margin-bottom: 12px; background: linear-gradient(135deg, #e50914 0%, #b20710 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .tagline { font-size: 1.1rem; color: var(--text-secondary); font-weight: 300; max-width: 500px; margin: 0 auto; }
        .main-content { flex: 1; max-width: 480px; width: 100%; margin: 0 auto; padding: 40px 20px; }
        
        /* Stock Status Badge */
        .stock-status { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 24px; border-radius: 16px; margin-bottom: 28px; font-size: 1rem; font-weight: 700; }
        .stock-status.in-stock { background: linear-gradient(135deg, #dcfce7, #bbf7d0); color: #166534; border: 2px solid #86efac; box-shadow: 0 4px 12px rgba(22, 101, 52, 0.1); }
        .stock-status.out-of-stock { background: linear-gradient(135deg, #fee2e2, #fecaca); color: #991b1b; border: 2px solid #fca5a5; box-shadow: 0 4px 12px rgba(153, 27, 27, 0.1); }
        .stock-dot { width: 10px; height: 10px; border-radius: 50%; background: currentColor; animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.15); } }
        
        /* Out of Stock Message */
        .oos-message { display: none; text-align: center; padding: 32px 24px; margin-top: 20px; }
        .oos-icon { font-size: 4rem; margin-bottom: 20px; animation: bounce 2s infinite; }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        .oos-title { font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; color: var(--text-primary); margin-bottom: 12px; line-height: 1.3; }
        .oos-text { font-size: 1.05rem; color: var(--text-secondary); margin-bottom: 8px; line-height: 1.6; }
        .oos-cta { display: inline-flex; align-items: center; gap: 10px; margin-top: 24px; padding: 14px 28px; background: linear-gradient(135deg, #0088cc, #005f9e); color: white; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 1rem; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(0, 136, 204, 0.3); }
        .oos-cta:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0, 136, 204, 0.4); background: linear-gradient(135deg, #0077b3, #004f82); }
        
        /* Card Styles */
        .card { background: var(--bg-primary); margin-bottom: 24px; border: 1px solid var(--border-light); border-radius: 16px; overflow: hidden; }
        .card-header { padding: 18px 24px; background: #fafafa; border-bottom: 1px solid var(--border-light); }
        .card-title { font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-secondary); }
        .card-body { padding: 24px; }
        
        /* Ad Section */
        .ad-section { text-align: center; }
        .ad-icon { width: 56px; height: 56px; margin: 0 auto 16px; background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.75rem; }
        .ad-title { font-size: 1.2rem; font-weight: 600; margin-bottom: 8px; color: var(--text-primary); }
        .ad-description { font-size: 0.95rem; color: var(--text-secondary); margin-bottom: 24px; line-height: 1.6; }
        .progress-container { margin-bottom: 24px; }
        .progress-info { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 0.9rem; }
        .progress-label { color: var(--text-secondary); }
        .progress-count { font-weight: 700; color: var(--accent); font-size: 1rem; }
        .progress-bar { height: 8px; background: #f0f0f0; border-radius: 100px; overflow: hidden; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent), #ff6b6b); border-radius: 100px; transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1); width: 0%; }
        
        /* Buttons */
        .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 16px 24px; font-family: var(--font-primary); font-size: 1rem; font-weight: 600; border: none; border-radius: 12px; cursor: pointer; transition: all 0.2s ease; text-decoration: none; }
        .btn-primary { background: var(--accent); color: white; }
        .btn-primary:hover:not(:disabled) { background: var(--accent-hover); transform: translateY(-1px); box-shadow: var(--shadow-md); }
        .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-outline { background: transparent; color: var(--text-primary); border: 1px solid var(--border-light); }
        .btn-outline:hover:not(:disabled) { background: #fafafa; border-color: #d4d4d4; }
        .btn-cookie { background: linear-gradient(135deg, #e50914, #b20710); color: white; font-size: 1.1rem; padding: 20px 32px; position: relative; overflow: hidden; box-shadow: 0 4px 20px rgba(229, 9, 20, 0.3); }
        .btn-cookie::before { content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent); transition: left 0.5s ease; }
        .btn-cookie:hover::before { left: 100%; }
        
        /* Device Section */
        .device-section { display: none; animation: slideUp 0.4s ease; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .device-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
        .device-option { padding: 20px 12px; text-align: center; border: 2px solid var(--border-light); border-radius: 14px; cursor: pointer; transition: all 0.2s ease; background: var(--bg-primary); }
        .device-option:hover { border-color: var(--accent); background: #fff5f5; transform: translateY(-2px); }
        .device-option.selected { border-color: var(--accent); background: #fff5f5; box-shadow: 0 0 0 3px rgba(229, 9, 20, 0.1); }
        .device-icon { font-size: 2.25rem; margin-bottom: 10px; display: block; }
        .device-name { font-size: 0.95rem; font-weight: 600; }
        
        /* Result Sections */
        .cookie-result { display: none; text-align: center; animation: slideUp 0.4s ease; }
        .success-icon { width: 72px; height: 72px; margin: 0 auto 24px; background: linear-gradient(135deg, #dcfce7, #bbf7d0); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.25rem; }
        .result-title { font-size: 1.35rem; font-weight: 700; margin-bottom: 10px; }
        .result-subtitle { color: var(--text-secondary); margin-bottom: 28px; font-size: 1rem; }
        .limit-message { display: none; text-align: center; animation: slideUp 0.4s ease; }
        .limit-icon { font-size: 3.5rem; margin-bottom: 20px; }
        .limit-title { font-size: 1.3rem; font-weight: 700; margin-bottom: 10px; }
        .limit-subtitle { color: var(--text-secondary); font-size: 1rem; line-height: 1.6; }
        
        /* Footer */
        .footer { text-align: center; padding: 32px 20px; border-top: 1px solid var(--border-light); margin-top: auto; background: #fafafa; }
        .footer-text { font-size: 0.95rem; color: var(--text-secondary); margin-bottom: 14px; font-weight: 500; }
        .footer-link { display: inline-flex; align-items: center; gap: 8px; color: var(--accent); text-decoration: none; font-weight: 600; font-size: 0.95rem; transition: color 0.2s ease; padding: 8px 16px; border-radius: 8px; }
        .footer-link:hover { background: #fff5f5; color: var(--accent-hover); }
        
        .spinner { width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        
        .hidden { display: none !important; }
        
        @media (max-width: 480px) { 
            .header { padding: 40px 16px 30px; } 
            .main-content { padding: 24px 16px; } 
            .device-grid { grid-template-columns: repeat(3, 1fr); gap: 8px; } 
            .device-option { padding: 16px 8px; } 
            .device-icon { font-size: 1.75rem; }
            .card-body { padding: 20px; }
        }
        .smart-link-container { position: fixed; bottom: -9999px; left: -9999px; }
    </style>
</head>
<body>
    <header class="header">
        <h1 class="logo">Netflix Cookies</h1>
        <p class="tagline">Premium access to Netflix on any device \u2014 no subscription required</p>
    </header>

    <main class="main-content">
        <!-- Stock Status - Always Visible at Top -->
        <div id="stockStatus" class="stock-status in-stock">
            <span class="stock-dot"></span>
            <span id="statusText">Checking stock...</span>
        </div>

        <!-- Out of Stock Message (Hidden by default) -->
        <div id="oosMessage" class="card oos-message">
            <div class="card-body">
                <div class="oos-icon">\u{1F36A}\u{1F622}</div>
                <h2 class="oos-title">Oops! Someone ate all the cookies... \u{1F98C}</h2>
                <p class="oos-text">Looks like we're fresh out of Netflix cookies right now.</p>
                <p class="oos-text" style="color: #e50914; font-weight: 600;">But don't worry \u2014 I can fix that! \u{1F4AA}</p>
                <p class="oos-text">Slide into my DMs and I'll restock this bad boy faster than you can say "binge-watch" \u{1F680}</p>
                <a href="https://t.me/dhrubo_moira_geche" target="blank" rel="noopener noreferrer" class="oos-cta">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                    </svg>
                    DM Me on Telegram for Instant Restock! \u{1F4E9}
                </a>
            </div>
        </div>

        <!-- Step 1: Watch Ads - Always Visible Initially (IMPORTANT: Never hide this completely) -->
        <div id="adSection" class="card" style="display: block !important; visibility: visible !important; opacity: 1 !important;">
            <div class="card-header">
                <p class="card-title">\u{1F3AC} Step 1 \u2014 Unlock Access</p>
            </div>
            <div class="card-body ad-section">
                <div class="ad-icon">\u25B6\uFE0F</div>
                <h2 class="ad-title">Watch Ads to Unlock</h2>
                <p class="ad-description">Complete <strong>3 short ad views</strong> to unlock your free Netflix cookie. Support us & get instant access!</p>
                
                <div class="progress-container">
                    <div class="progress-info">
                        <span class="progress-label">Your Progress</span>
                        <span class="progress-count"><span id="currentViews">0</span> / 3 completed</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" id="progressFill"></div>
                    </div>
                </div>
                
                <button class="btn btn-primary" id="viewAdBtn" onclick="viewAd()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    <span id="adBtnText">\u25B6 View Ad to Continue</span>
                </button>
            </div>
        </div>

        <!-- Step 2: Choose Device - Shows After Ads Complete -->
        <div id="deviceSection" class="card device-section">
            <div class="card-header">
                <p class="card-title">\u{1F4F1} Step 2 \u2014 Choose Your Device</p>
            </div>
            <div class="card-body">
                <div class="device-grid">
                    <div class="device-option" data-device="mobile" onclick="selectDevice('mobile')">
                        <span class="device-icon">\u{1F4F1}</span>
                        <span class="device-name">Mobile</span>
                    </div>
                    <div class="device-option selected" data-device="pc" onclick="selectDevice('pc')">
                        <span class="device-icon">\u{1F4BB}</span>
                        <span class="device-name">PC</span>
                    </div>
                    <div class="device-option" data-device="tv" onclick="selectDevice('tv')">
                        <span class="device-icon">\u{1F4FA}</span>
                        <span class="device-name">TV</span>
                    </div>
                </div>
                
                <button class="btn btn-cookie" onclick="getCookie()">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
                    </svg>
                    Get My Cookie Now \u2192
                </button>
            </div>
        </div>

        <!-- Step 3: Cookie Ready! -->
        <div id="cookieResult" class="card cookie-result">
            <div class="card-body">
                <div class="success-icon">\u2705</div>
                <h2 class="result-title">Your Cookie is Ready!</h2>
                <p class="result-subtitle">Click the button below to open Netflix with your active session</p>
                
                <button class="btn btn-cookie" id="openCookieBtn" onclick="openCookie()">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    Open Netflix \u2192
                </button>
                
                <button class="btn btn-outline" style="margin-top: 16px;" onclick="resetFlow()">
                    \u{1F504} Get Another Cookie
                </button>
            </div>
        </div>

        <!-- Limit Reached Message -->
        <div id="limitMessage" class="card limit-message">
            <div class="card-body">
                <div class="limit-icon">\u23F0</div>
                <h2 class="limit-title">Daily Limit Reached</h2>
                <p class="limit-subtitle">You've used your daily allowance of cookies.<br><br>Come back <strong>tomorrow</strong> for more!</p>
            </div>
        </div>
    </main>

    <footer class="footer">
        <p class="footer-text">Developed by Mohiuddin Abdul Kadir Dhrubo</p>
        <a href="https://t.me/dhrubo_moira_geche" target="_blank" rel="noopener noreferrer" class="footer-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            Join our Telegram Channel for Updates
        </a>
    </footer>

    <!-- Hidden Smart Link for tracking -->
    <div class="smart-link-container">
        <iframe src="https://www.effectivecpmnetwork.com/tgfg1gjqq?key=6f3a972ec6b174ac056c1d55d581f012" width="1" height="1" frameborder="0"></iframe>
    </div>

    <script>
        // Configuration
        const API_BASE = window.location.origin;
        const AD_URL = 'https://www.effectivecpmnetwork.com/tgfg1gjqq?key=6f3a972ec6b174ac056c1d55d581f012';
        const REQUIRED_AD_VIEWS = 3;
        
        // State
        let sessionId = null;
        let adViewsCompleted = 0;
        let selectedDevice = 'pc';
        let currentCookieUrl = null;

        // Initialize on page load
        document.addEventListener('DOMContentLoaded', init);

        async function init() {
            // CRITICAL: Ensure ad section is ALWAYS visible
            const adSection = document.getElementById('adSection');
            if (adSection) {
                adSection.style.display = 'block';
                adSection.style.visibility = 'visible';
                adSection.style.opacity = '1';
                adSection.classList.remove('hidden');
            }
            
            // Generate unique session ID
            sessionId = 'sess_' + generateId();
            
            // Initialize session on server
            await createSession();
            
            // Check and display stock status
            await checkStats();
            
            // Save browser fingerprint for rate limiting
            saveFingerprint();
        }

        async function createSession() {
            try {
                const response = await fetch(API_BASE + '/api/session', {
                    method: 'POST',
                    headers: { 'X-Session-ID': sessionId }
                });
                const data = await response.json();
                
                if (data.success) {
                    adViewsCompleted = data.ad_views_count || 0;
                    updateProgress();
                    
                    // If ads already completed, show device section
                    if (data.unlocked) {
                        showDeviceSection();
                    }
                }
            } catch (error) {
                console.error('Session error:', error);
            }
        }

        async function checkStats() {
            try {
                const response = await fetch(API_BASE + '/api/stats');
                const data = await response.json();
                
                const statusEl = document.getElementById('stockStatus');
                const textEl = document.getElementById('statusText');
                const oosMessage = document.getElementById('oosMessage');
                const adSection = document.getElementById('adSection');
                
                if (data.available_cookies > 0) {
                    // We have cookies in stock!
                    statusEl.className = 'stock-status in-stock';
                    statusEl.style.display = 'flex';
                    textEl.textContent = '\u{1F36A} Cookies In Stock';
                    
                    // Hide OOS message, show ad section
                    oosMessage.style.display = 'none';
                    adSection.style.display = 'block';
                } else {
                    // No cookies available - show out of stock
                    statusEl.className = 'stock-status out-of-stock';
                    statusEl.style.display = 'flex';
                    textEl.textContent = '\u274C Cookies Out of Stock';
                    
                    // Show OOS message, hide ad section
                    oosMessage.style.display = 'block';
                    adSection.style.display = 'none';
                }
            } catch (error) {
                // If stats fail, show in stock anyway
                document.getElementById('stockStatus').className = 'stock-status in-stock';
                document.getElementById('statusText').textContent = '\u{1F36A} Cookies In Stock';
            }
        }

        async function saveFingerprint() {
            try {
                const fingerprint = await createFingerprint();
                
                await fetch(API_BASE + '/api/fingerprint', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Session-ID': sessionId 
                    },
                    body: JSON.stringify({ fingerprint })
                });
            } catch (error) {
                console.error('Fingerprint error:', error);
            }
        }

        async function createFingerprint() {
            const components = [
                navigator.userAgent,
                navigator.language,
                screen.width + 'x' + screen.height,
                new Date().getTimezoneOffset(),
                navigator.hardwareConcurrency || '',
                navigator.platform
            ];
            
            const str = components.join('|');
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            
            return 'fp_' + Math.abs(hash).toString(36);
        }

        // ==================== AD VIEWING ====================

        function viewAd() {
            const btn = document.getElementById('viewAdBtn');
            const btnText = document.getElementById('adBtnText');
            
            btn.disabled = true;
            btnText.textContent = '\u23F3 Watching ad...';
            
            const adWindow = window.open(AD_URL, '_blank');
            
            const checkReturn = setInterval(() => {
                if (adWindow && adWindow.closed) {
                    clearInterval(checkReturn);
                    recordAdView();
                }
            }, 500);
            
            setTimeout(() => {
                clearInterval(checkReturn);
                recordAdView();
            }, 15000);
        }

        async function recordAdView() {
            try {
                const response = await fetch(API_BASE + '/api/ad-viewed', {
                    method: 'POST',
                    headers: { 'X-Session-ID': sessionId }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    adViewsCompleted = data.ad_views_count;
                    updateProgress();
                    
                    if (data.unlocked) {
                        showDeviceSection();
                    } else {
                        const btn = document.getElementById('viewAdBtn');
                        btn.disabled = false;
                        document.getElementById('adBtnText').textContent = 
                            '\u25B6 View Ad (' + data.remaining + ' more to go)';
                    }
                }
            } catch (error) {
                console.error('Error recording ad view:', error);
                
                const btn = document.getElementById('viewAdBtn');
                btn.disabled = false;
                document.getElementById('adBtnText').textContent = '\u25B6 View Ad to Continue';
            }
        }

        function updateProgress() {
            const percentage = (adViewsCompleted / REQUIRED_AD_VIEWS) * 100;
            document.getElementById('progressFill').style.width = percentage + '%';
            document.getElementById('currentViews').textContent = adViewsCompleted;
        }

        // ==================== DEVICE SELECTION ====================

        function showDeviceSection() {
            const adSection = document.getElementById('adSection');
            if (adSection) {
                adSection.style.display = 'none';
            }
            const deviceSection = document.getElementById('deviceSection');
            if (deviceSection) {
                deviceSection.style.display = 'block';
                deviceSection.classList.remove('hidden');
            }
        }

        function selectDevice(device) {
            selectedDevice = device;
            
            document.querySelectorAll('.device-option').forEach(el => {
                el.classList.remove('selected');
            });
            document.querySelector('[data-device="' + device + '"]').classList.add('selected');
        }

        // ==================== COOKIE RETRIEVAL ====================

        async function getCookie() {
            const btn = document.querySelector('#deviceSection .btn-cookie');
            const originalHTML = btn.innerHTML;
            
            btn.innerHTML = '<span class="spinner"></span> Fetching your cookie...';
            btn.disabled = true;
            
            try {
                const response = await fetch(API_BASE + '/api/get-cookie', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-Session-ID': sessionId 
                    },
                    body: JSON.stringify({ device_type: selectedDevice })
                });

                const data = await response.json();

                if (data.success) {
                    currentCookieUrl = data.cookie_url;
                    showCookieResult();
                } else if (data.limit_reached) {
                    showLimitMessage(data.used_today, data.max_daily);
                } else if (data.requires_ads) {
                    location.reload();
                } else {
                    alert(data.error || 'Failed to get cookie. Please try again.');
                    btn.innerHTML = originalHTML;
                    btn.disabled = false;
                }
            } catch (error) {
                console.error('Error getting cookie:', error);
                alert('Network error. Please try again.');
                btn.innerHTML = originalHTML;
                btn.disabled = false;
            }
        }

        function showCookieResult() {
            document.getElementById('deviceSection').classList.add('hidden');
            document.getElementById('cookieResult').style.display = 'block';
        }

        function showLimitMessage(used, max) {
            document.getElementById('deviceSection').classList.add('hidden');
            document.getElementById('limitMessage').style.display = 'block';
        }

        function openCookie() {
            if (currentCookieUrl) {
                window.open(currentCookieUrl, '_blank');
            }
        }

        function resetFlow() {
            currentCookieUrl = null;
            
            document.getElementById('cookieResult').style.display = 'none';
            document.getElementById('limitMessage').style.display = 'none';
            
            document.getElementById('adSection').classList.remove('hidden');
            document.getElementById('adSection').style.display = 'block';
            document.getElementById('deviceSection').classList.add('hidden');
            document.getElementById('deviceSection').style.display = 'none';
            
            adViewsCompleted = 0;
            updateProgress();
            
            const btn = document.getElementById('viewAdBtn');
            btn.disabled = false;
            document.getElementById('adBtnText').textContent = '\u25B6 View Ad to Continue';
        }

        // ==================== UTILITIES ====================

        function generateId() {
            return Math.random().toString(36).substring(2, 15) + 
                   Math.random().toString(36).substring(2, 15);
        }
    <\/script>
</body>
</html>`;
var ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Panel \u2014 Netflix Cookies</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        :root {
            --bg: #f8f9fa; --surface: #ffffff; --primary: #e50914; --primary-hover: #b20710;
            --text: #1a1a1a; --text-secondary: #6b7280; --border: #e5e7eb;
            --success: #10b981; --warning: #f59e0b; --danger: #ef4444;
            --shadow: 0 1px 3px rgba(0,0,0,0.1); --radius: 12px;
        }
        body { font-family: 'Inter', -apple-system, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
        
        /* Header */
        .header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; }
        .logo { font-size: 1.5rem; font-weight: 700; color: var(--primary); }
        .logout-btn { padding: 8px 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-size: 0.9rem; }
        .logout-btn:hover { background: var(--danger); color: white; border-color: var(--danger); }
        
        /* Container */
        .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
        
        /* Stats Grid */
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .stat-card { background: var(--surface); padding: 20px; border-radius: var(--radius); border: 1px solid var(--border); }
        .stat-label { font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 4px; }
        .stat-value { font-size: 2rem; font-weight: 700; }
        .stat-value.total { color: var(--text); }
        .stat-value.unused { color: var(--success); }
        .stat-value.used { color: var(--danger); }
        
        /* Cards */
        .card { background: var(--surface); border-radius: var(--radius); border: 1px solid var(--border); margin-bottom: 24px; }
        .card-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .card-title { font-size: 1rem; font-weight: 600; }
        .card-body { padding: 20px; }
        
        /* Buttons */
        .btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; font-size: 0.9rem; display: inline-flex; align-items: center; gap: 8px; transition: all 0.2s; }
        .btn-primary { background: var(--primary); color: white; }
        .btn-primary:hover { background: var(--primary-hover); }
        .btn-danger { background: var(--danger); color: white; }
        .btn-danger:hover { opacity: 0.9; }
        .btn-warning { background: var(--warning); color: white; }
        .btn-outline { background: transparent; border: 1px solid var(--border); color: var(--text); }
        .btn-outline:hover { background: var(--bg); }
        .btn-sm { padding: 6px 12px; font-size: 0.85rem; }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        
        /* File Upload */
        .upload-area { border: 2px dashed var(--border); border-radius: var(--radius); padding: 40px; text-align: center; cursor: pointer; transition: all 0.2s; }
        .upload-area:hover { border-color: var(--primary); background: rgba(229, 9, 20, 0.02); }
        .upload-area.dragover { border-color: var(--primary); background: rgba(229, 9, 20, 0.05); }
        .upload-icon { font-size: 3rem; margin-bottom: 12px; }
        .upload-text { color: var(--text-secondary); margin-bottom: 8px; }
        .upload-hint { font-size: 0.85rem; color: var(--text-secondary); opacity: 0.7; }
        
        /* Filter Tabs */
        .filter-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
        .filter-tab { padding: 8px 16px; border-radius: 20px; border: 1px solid var(--border); background: var(--surface); cursor: pointer; font-size: 0.9rem; transition: all 0.2s; }
        .filter-tab.active { background: var(--primary); color: white; border-color: var(--primary); }
        .filter-tab:hover:not(.active) { border-color: var(--primary); color: var(--primary); }
        
        /* Table */
        .table-wrapper { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border); }
        th { background: var(--bg); font-weight: 600; font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase; }
        tr:hover { background: var(--bg); }
        
        /* Badges */
        .badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; }
        .badge-unused { background: #dcfce7; color: #166534; }
        .badge-used-once { background: #fef3c7; color: #92400e; }
        .badge-used { background: #fee2e2; color: #991b1b; }
        
        /* Login Form */
        .login-container { display: flex; justify-content: center; align-items: center; min-height: 100vh; background: var(--bg); }
        .login-card { background: var(--surface); padding: 40px; border-radius: var(--radius); box-shadow: var(--shadow); width: 100%; max-width: 400px; }
        .login-title { font-size: 1.5rem; font-weight: 700; margin-bottom: 8px; text-align: center; }
        .login-subtitle { color: var(--text-secondary); text-align: center; margin-bottom: 24px; }
        .form-group { margin-bottom: 16px; }
        .form-label { display: block; font-size: 0.9rem; font-weight: 500; margin-bottom: 6px; }
        .form-input { width: 100%; padding: 12px 16px; border: 1px solid var(--border); border-radius: 8px; font-size: 1rem; }
        .form-input:focus { outline: none; border-color: var(--primary); }
        .login-btn { width: 100%; padding: 14px; background: var(--primary); color: white; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; }
        .login-btn:hover { background: var(--primary-hover); }
        .error-msg { color: var(--danger); font-size: 0.9rem; margin-top: 12px; text-align: center; }
        
        /* Action buttons row */
        .actions-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
        
        /* Toast notification */
        .toast { position: fixed; bottom: 24px; right: 24px; padding: 16px 24px; border-radius: var(--radius); color: white; font-weight: 500; z-index: 1000; animation: slideIn 0.3s ease; }
        .toast-success { background: var(--success); }
        .toast-error { background: var(--danger); }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        
        .hidden { display: none !important; }
        
        @media (max-width: 768px) {
            .container { padding: 16px; }
            .stats-grid { grid-template-columns: repeat(2, 1fr); }
            .actions-row { flex-direction: column; }
            .btn { width: 100%; justify-content: center; }
        }
    </style>
</head>
<body>
    <!-- Login Screen -->
    <div id="loginScreen" class="login-container">
        <div class="login-card">
            <h1 class="login-title">\u{1F510} Admin Access</h1>
            <p class="login-subtitle">Enter your password to manage cookies</p>
            <div class="form-group">
                <label class="form-label">Password</label>
                <input type="password" id="passwordInput" class="form-input" placeholder="Enter admin password">
            </div>
            <button class="login-btn" onclick="login()">Login</button>
            <div id="loginError" class="error-msg hidden"></div>
        </div>
    </div>

    <!-- Admin Dashboard -->
    <div id="dashboard" class="hidden">
        <header class="header">
            <div class="logo">\u{1F36A} Netflix Cookies \u2014 Admin</div>
            <button class="logout-btn" onclick="logout()">Logout</button>
        </header>
        
        <div class="container">
            <!-- Stats Cards -->
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Total Cookies</div>
                    <div class="stat-value total" id="totalCookies">0</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Unused Cookies</div>
                    <div class="stat-value unused" id="unusedCookies">0</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Used Cookies</div>
                    <div class="stat-value used" id="usedCookies">0</div>
                </div>
            </div>

            <!-- Upload Section -->
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">\u{1F4E4} Upload New Cookies</h2>
                </div>
                <div class="card-body">
                    <div class="upload-area" id="uploadArea" onclick="document.getElementById('fileInput').click()">
                        <div class="upload-icon">\u{1F4C1}</div>
                        <div class="upload-text">Click or drag JSON file here</div>
                        <div class="upload-hint">Supports JSON array of Netflix cookie URLs</div>
                    </div>
                    <input type="file" id="fileInput" accept=".json" style="display:none" onchange="handleFileUpload(event)">
                    <div id="uploadResult" style="margin-top: 12px;"></div>
                </div>
            </div>

            <!-- Actions Section -->
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">\u26A1 Quick Actions</h2>
                </div>
                <div class="card-body">
                    <div class="actions-row">
                        <button class="btn btn-danger" onclick="deleteUsedCookies()">
                            \u{1F5D1}\uFE0F Delete All Used Cookies
                        </button>
                        <button class="btn btn-warning" onclick="deleteAllCookies()">
                            \u26A0\uFE0F Delete ALL Cookies
                        </button>
                        <button class="btn btn-outline" onclick="loadCookies()">
                            \u{1F504} Refresh List
                        </button>
                    </div>
                </div>
            </div>

            <!-- Cookies List -->
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">\u{1F4CB} Cookie Inventory</h2>
                </div>
                <div class="card-body">
                    <!-- Filter Tabs -->
                    <div class="filter-tabs">
                        <button class="filter-tab active" onclick="filterCookies('all', this)">All (<span id="countAll">0</span>)</button>
                        <button class="filter-tab" onclick="filterCookies('unused', this)">Unused (<span id="countUnused">0</span>)</button>
                        <button class="filter-tab" onclick="filterCookies('used', this)">Used (<span id="countUsed">0</span>)</button>
                    </div>
                    
                    <!-- Table -->
                    <div class="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Cookie (Preview)</th>
                                    <th>Status</th>
                                    <th>Uses</th>
                                    <th>Last Used</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody id="cookiesTableBody">
                                <tr><td colspan="6" style="text-align:center;color:var(--text-secondary)">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        const API_BASE = window.location.origin;
        let authToken = localStorage.getItem('adminToken') || '';
        let currentFilter = 'all';

        // Check auth on load (read fresh from localStorage)
        document.addEventListener('DOMContentLoaded', () => {
            authToken = localStorage.getItem('adminToken') || '';
            if (authToken) {
                showDashboard();
            }
        });

        async function login() {
            const password = document.getElementById('passwordInput').value;
            const errorEl = document.getElementById('loginError');
            
            try {
                const res = await fetch(API_BASE + '/api/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                const data = await res.json();
                
                if (data.success) {
                    authToken = data.token;
                    localStorage.setItem('adminToken', authToken);
                    showDashboard();
                } else {
                    errorEl.textContent = data.error || 'Invalid password';
                    errorEl.classList.remove('hidden');
                }
            } catch (e) {
                errorEl.textContent = 'Login failed. Try again.';
                errorEl.classList.remove('hidden');
            }
        }

        function logout() {
            authToken = '';
            localStorage.removeItem('adminToken');
            document.getElementById('dashboard').classList.add('hidden');
            document.getElementById('loginScreen').classList.remove('hidden');
        }

        function showDashboard() {
            document.getElementById('loginScreen').classList.add('hidden');
            document.getElementById('dashboard').classList.remove('hidden');
            loadStats();
            loadCookies();
        }

        async function loadStats() {
            try {
                const res = await fetch(API_BASE + '/api/admin/analytics', {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
                const data = await res.json();
                
                document.getElementById('totalCookies').textContent = data.cookies?.total || 0;
                document.getElementById('unusedCookies').textContent = data.cookies?.unused || 0;
                document.getElementById('usedCookies').textContent = data.cookies?.used || 0;
                
                // Update filter counts
                document.getElementById('countAll').textContent = data.cookies?.total || 0;
                document.getElementById('countUnused').textContent = data.cookies?.unused || 0;
                document.getElementById('countUsed').textContent = data.cookies?.used || 0;
            } catch (e) {
                console.error('Failed to load stats:', e);
            }
        }

        async function loadCookies() {
            const tbody = document.getElementById('cookiesTableBody');
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center">Loading...</td></tr>';
            
            try {
                const res = await fetch(API_BASE + '/api/admin/cookies?filter=' + currentFilter, {
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
                const data = await res.json();
                
                if (data.cookies.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary)">No cookies found</td></tr>';
                    return;
                }
                
                tbody.innerHTML = data.cookies.map(function(cookie) {
                    return '<tr>' +
                        '<td>' + cookie.display_id + '</td>' +
                        '<td style="font-family:monospace;font-size:0.85rem">' + cookie.nftoken.substring(0, 30) + '...' + cookie.nftoken.substring(cookie.nftoken.length - 10) + '</td>' +
                        '<td><span class="badge badge-' + (cookie.is_used ? 'used' : (cookie.usage_count === 1 ? 'used-once' : 'unused')) + '">' + cookie.status_text + '</span></td>' +
                        '<td>' + cookie.usage_count + ' / 2</td>' +
                        '<td>' + (cookie.last_used_at ? new Date(cookie.last_used_at).toLocaleDateString() : 'Never') + '</td>' +
                        '<td><button class="btn btn-sm btn-danger" onclick="deleteSingleCookie(' + cookie.id + ')">Delete</button></td>' +
                    '</tr>';
                }).join('');
            } catch (e) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--danger)">Failed to load</td></tr>';
            }
        }

        function filterCookies(filter, btn) {
            currentFilter = filter;
            
            // Update active tab
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            
            loadCookies();
        }

        // File upload handling
        const uploadArea = document.getElementById('uploadArea');
        
        uploadArea?.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        
        uploadArea?.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });
        
        uploadArea?.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) uploadFile(file);
        });

        function handleFileUpload(event) {
            const file = event.target.files[0];
            if (file) uploadFile(file);
        }

        async function uploadFile(file) {
            const resultDiv = document.getElementById('uploadResult');
            resultDiv.innerHTML = '<span style="color:var(--warning)">Uploading...</span>';
            
            const formData = new FormData();
            formData.append('file', file);
            
            try {
                const res = await fetch(API_BASE + '/api/admin/upload', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + authToken },
                    body: formData
                });
                const data = await res.json();
                
                if (data.success) {
                    resultDiv.innerHTML = '<span style="color:var(--success)">\u2705 ' + data.message + '</span>';
                    loadStats();
                    loadCookies();
                } else {
                    resultDiv.innerHTML = '<span style="color:var(--danger)">\u274C ' + data.error + '</span>';
                }
            } catch (e) {
                resultDiv.innerHTML = '<span style="color:var(--danger)">\u274C Upload failed</span>';
            }
        }

        async function deleteUsedCookies() {
            if (!confirm('Delete ALL used cookies? This cannot be undone!')) return;
            
            try {
                const res = await fetch(API_BASE + '/api/admin/delete-used', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
                const data = await res.json();
                
                showToast(data.success ? 'success' : 'error', data.message);
                loadStats();
                loadCookies();
            } catch (e) {
                showToast('error', 'Failed to delete');
            }
        }

        async function deleteAllCookies() {
            if (!confirm('\u26A0\uFE0F WARNING: This will DELETE EVERY COOKIE!\\n\\nAre you absolutely sure?')) return;
            if (!confirm('Last chance! This action cannot be undone!')) return;
            
            try {
                const res = await fetch(API_BASE + '/api/admin/delete-all', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + authToken }
                });
                const data = await res.json();
                
                showToast(data.success ? 'success' : 'error', data.message);
                loadStats();
                loadCookies();
            } catch (e) {
                showToast('error', 'Failed to delete');
            }
        }

        async function deleteSingleCookie(id) {
            if (!confirm('Delete this cookie?')) return;
            
            try {
                const res = await fetch(API_BASE + '/api/admin/delete-cookie', {
                    method: 'POST',
                    headers: { 
                        'Authorization': 'Bearer ' + authToken,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ cookie_id: id })
                });
                const data = await res.json();
                
                showToast(data.success ? 'success' : 'error', data.message);
                loadStats();
                loadCookies();
            } catch (e) {
                showToast('error', 'Failed to delete');
            }
        }

        function showToast(type, message) {
            const toast = document.createElement('div');
            toast.className = 'toast toast-' + type;
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }

        // Enter key login
        document.getElementById('passwordInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') login();
        });
    <\/script>
</body>
</html>`;
async function serveStatic(request, env, path) {
  let htmlContent = "";
  if (path === "/" || path === "" || path === "/index.html") {
    htmlContent = INDEX_HTML;
  } else if (path === "/admin" || path === "/admin.html") {
    htmlContent = ADMIN_HTML;
  } else {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(htmlContent, {
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      "Cache-Control": "no-cache"
    }
  });
}
__name(serveStatic, "serveStatic");
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map

