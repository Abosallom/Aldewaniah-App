/* Aldewaniah media Worker — private gallery storage on Cloudflare R2.
 *
 * Auth model: the caller sends their Firebase ID token (Authorization: Bearer ...).
 * We read the phone from the token, then fetch the member's Firestore doc WITH that
 * token. Firestore validates the token's signature and its own rules (a user may
 * only read their own member doc), so a forged or non-member token gets rejected.
 * Only an "approved" member is allowed to upload / list / delete.
 *
 * Files are served through short-lived HMAC-signed URLs (so <img>/<video> can load
 * them without sending headers, while the bucket itself stays private).
 *
 * Bindings expected (set in the dashboard):
 *   - BUCKET           : R2 bucket binding  -> aldewaniah-media
 *   - FIREBASE_PROJECT : plain var          -> aldewaniah-45158
 *   - SIGN_SECRET      : secret             -> (random string)
 */

const PREFIX = "gallery/";
const URL_TTL = 6 * 60 * 60; // signed file URLs valid 6 hours
const MAX_BYTES = 100 * 1024 * 1024; // 100 MB per file

// Only these origins may call the Worker from a browser.
// (Add more here if you ever serve the app from another domain.)
const ALLOWED_ORIGINS = [
  "https://app.aldewaniah.com",
  "https://abosallom.github.io",
];

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,X-File-Name,X-File-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request, env) {
    const ch = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { headers: ch });

    const url = new URL(request.url);
    const path = url.pathname;
    let res;
    try {
      if (path === "/file" && request.method === "GET") res = await serveFile(request, env, url);
      else if (path === "/list" && request.method === "GET") res = await listFiles(request, env, url);
      else if (path === "/upload" && request.method === "POST") res = await uploadFile(request, env, url);
      else if (path === "/sign" && request.method === "POST") res = await signKeys(request, env, url);
      else if (path === "/delete" && request.method === "POST") res = await deleteFile(request, env);
      else if (path === "/" || path === "/health") res = json({ ok: true });
      else res = json({ error: "not found" }, 404);
    } catch (e) {
      res = json({ error: String(e && e.message || e) }, 500);
    }
    // apply the per-origin CORS headers to every response
    const out = new Response(res.body, res);
    for (const k in ch) out.headers.set(k, ch[k]);
    return out;
  },
};

/* ---------- helpers ---------- */

function json(obj, status = 200) {
  // CORS headers are applied centrally in fetch().
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function b64url(bytes) {
  let s = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToStr(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return atob(s);
}

function decodeTokenPhone(idToken) {
  try {
    const payload = JSON.parse(b64urlToStr(idToken.split(".")[1]));
    return payload.phone_number || null;
  } catch (e) {
    return null;
  }
}

function getToken(request) {
  const h = request.headers.get("Authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

// Returns { phone, name, admin } for an approved member, else null.
async function getMember(request, env) {
  const idToken = getToken(request);
  if (!idToken) return null;
  const phone = decodeTokenPhone(idToken);
  if (!phone) return null;
  const docUrl =
    "https://firestore.googleapis.com/v1/projects/" +
    env.FIREBASE_PROJECT +
    "/databases/(default)/documents/members/" +
    encodeURIComponent(phone);
  const r = await fetch(docUrl, { headers: { Authorization: "Bearer " + idToken } });
  if (!r.ok) return null;
  const doc = await r.json();
  const f = (doc && doc.fields) || {};
  const status = f.status && f.status.stringValue;
  const approvedLegacy = f.approved && f.approved.booleanValue === true;
  if (status !== "approved" && !approvedLegacy) return null;
  return {
    phone,
    name: (f.name && f.name.stringValue) || "",
    admin: !!(f.admin && f.admin.booleanValue === true),
  };
}

async function sign(env, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SIGN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64url(sig);
}

async function signedUrl(env, origin, key) {
  const exp = Math.floor(Date.now() / 1000) + URL_TTL;
  const sig = await sign(env, key + "\n" + exp);
  return (
    origin +
    "/file?key=" +
    encodeURIComponent(key) +
    "&exp=" +
    exp +
    "&sig=" +
    encodeURIComponent(sig)
  );
}

/* ---------- routes ---------- */

async function serveFile(request, env, url) {
  const key = url.searchParams.get("key");
  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  if (!key || !exp || !sig) return json({ error: "bad request" }, 400);
  if (Number(exp) < Math.floor(Date.now() / 1000)) return json({ error: "expired" }, 403);
  const expected = await sign(env, key + "\n" + exp);
  if (expected !== sig) return json({ error: "bad signature" }, 403);

  const obj = await env.BUCKET.get(key);
  if (!obj) return json({ error: "not found" }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Cache-Control", "private, max-age=21600");
  // Hardening: never let the browser sniff a different type, and only allow
  // image/video/audio to render inline. Anything else is forced to download
  // (so a stored file can't run as HTML/JS on this Worker origin).
  headers.set("X-Content-Type-Options", "nosniff");
  const ct = (headers.get("Content-Type") || "").toLowerCase();
  if (!/^(image|video|audio)\//.test(ct)) headers.set("Content-Disposition", "attachment");
  // CORS applied centrally in fetch()
  return new Response(obj.body, { headers });
}

async function listFiles(request, env, url) {
  const member = await getMember(request, env);
  if (!member) return json({ error: "unauthorized" }, 401);
  const origin = url.origin;
  const out = [];
  let cursor;
  do {
    const page = await env.BUCKET.list({ prefix: PREFIX, cursor, include: ["customMetadata"] });
    for (const o of page.objects) {
      const m = o.customMetadata || {};
      out.push({
        key: o.key,
        url: await signedUrl(env, origin, o.key),
        type: m.type || "",
        name: m.name || "",
        by: m.by || "",
        byPhone: m.byPhone || "",
        uploaded: o.uploaded,
        size: o.size,
      });
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  // newest first
  out.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));
  return json({ items: out });
}

// Which folders uploads may target.
const DIRS = { gallery: "gallery/", chat: "chat/" };

async function uploadFile(request, env, url) {
  const member = await getMember(request, env);
  if (!member) return json({ error: "unauthorized" }, 401);

  const prefix = DIRS[(url && url.searchParams.get("dir")) || "gallery"] || PREFIX;
  const type = request.headers.get("X-File-Type") || "application/octet-stream";
  // Only photos and videos may be uploaded (gallery + chat). Reject anything else.
  if (!/^(image|video)\//i.test(type)) return json({ error: "unsupported type" }, 415);
  const rawName = decodeURIComponent(request.headers.get("X-File-Name") || "file");
  const safe = rawName.replace(/[^\w.\-]+/g, "_").slice(-80) || "file";
  const key = prefix + Date.now() + "_" + Math.random().toString(36).slice(2, 8) + "_" + safe;

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return json({ error: "empty" }, 400);
  if (body.byteLength > MAX_BYTES) return json({ error: "too large" }, 413);

  await env.BUCKET.put(key, body, {
    httpMetadata: { contentType: type },
    customMetadata: {
      type,
      name: rawName.slice(0, 120),
      by: member.name,
      byPhone: member.phone,
    },
  });
  return json({ key });
}

// Sign short-lived URLs for a batch of stored keys (used by chat to show photos).
async function signKeys(request, env, url) {
  const member = await getMember(request, env);
  if (!member) return json({ error: "unauthorized" }, 401);
  const body = await request.json().catch(() => ({}));
  const keys = Array.isArray(body.keys) ? body.keys.slice(0, 200) : [];
  const urls = {};
  for (const k of keys) {
    if (typeof k === "string" && (k.startsWith("gallery/") || k.startsWith("chat/"))) {
      urls[k] = await signedUrl(env, url.origin, k);
    }
  }
  return json({ urls });
}

async function deleteFile(request, env) {
  const member = await getMember(request, env);
  if (!member) return json({ error: "unauthorized" }, 401);
  const { key } = await request.json().catch(() => ({}));
  if (!key || !(key.startsWith("gallery/") || key.startsWith("chat/"))) return json({ error: "bad request" }, 400);

  const obj = await env.BUCKET.head(key);
  if (!obj) return json({ error: "not found" }, 404);
  // Only admins may delete media.
  if (!member.admin) return json({ error: "forbidden" }, 403);

  await env.BUCKET.delete(key);
  return json({ ok: true });
}
