/* Aldewaniah AI assistant Worker — Cloudflare Workers AI.
 *
 * A members-only support assistant for the Aldewaniah app. The browser sends
 * the member's Firebase ID token; we verify they're an approved member (by
 * fetching their Firestore member doc WITH that token, exactly like the media
 * Worker), then run a chat model and return the reply.
 *
 * Bindings expected (set in the dashboard):
 *   - AI               : Workers AI binding
 *   - FIREBASE_PROJECT : plain var -> aldewaniah-45158
 */

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"; // swap here to change the model
const MAX_TURNS = 12; // keep the last N messages of history

const ALLOWED_ORIGINS = [
  "https://app.aldewaniah.com",
  "https://abosallom.github.io",
  "capacitor://localhost", // iOS native shell (Capacitor)
  "https://localhost",     // Android native shell (Capacitor)
  "http://localhost",
];

const SYSTEM_PROMPT =
  "أنت «مساعد الديوانية»، مساعد ذكي ودود لتطبيق مجموعة «الديوانية». " +
  "تساعد الأعضاء في استخدام التطبيق وأقسامه: الرئيسية، البطولات، الدردشة، الأعضاء (الملفات الشخصية)، " +
  "الأقسام التي تضم مكتبة الصور وحاسبة بلوت وحاسبة تركس والبازر والأوقات والقبلة وعجلة الحظ، ولوحة الإدارة للمشرفين. " +
  "كما تجيب على الأسئلة العامة بشكل مفيد. " +
  "أجب دائمًا بنفس لغة المستخدم (العربية أو الإنجليزية)، باختصار ووضوح وبأسلوب مهذب. " +
  "إذا اقترح المستخدم تحسينًا للتطبيق، فشجّعه على إرساله للمشرف عبر زر «اقتراح للمشرف». " +
  "You are 'Al Dewaniah Assistant', a friendly assistant for the Dewaniah group app; help with the app and general questions, reply in the user's language, concise and polite.";

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request, env) {
    const ch = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { headers: ch });

    const url = new URL(request.url);
    let res;
    try {
      if ((url.pathname === "/" || url.pathname === "/health") && request.method === "GET") {
        res = json({ ok: true });
      } else if (url.pathname === "/chat" && request.method === "POST") {
        res = await chat(request, env);
      } else {
        res = json({ error: "not found" }, 404);
      }
    } catch (e) {
      res = json({ error: String((e && e.message) || e) }, 500);
    }
    const out = new Response(res.body, res);
    for (const k in ch) out.headers.set(k, ch[k]);
    return out;
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}

/* ---- auth (same model as the media Worker) ---- */
function b64urlToStr(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return atob(s);
}
function tokenPhone(idToken) {
  try { return JSON.parse(b64urlToStr(idToken.split(".")[1])).phone_number || null; } catch (e) { return null; }
}
async function isMember(request, env) {
  const h = request.headers.get("Authorization") || "";
  const idToken = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!idToken) return false;
  const phone = tokenPhone(idToken);
  if (!phone) return false;
  const docUrl =
    "https://firestore.googleapis.com/v1/projects/" + env.FIREBASE_PROJECT +
    "/databases/(default)/documents/members/" + encodeURIComponent(phone);
  const r = await fetch(docUrl, { headers: { Authorization: "Bearer " + idToken } });
  if (!r.ok) return false;
  const f = ((await r.json()) || {}).fields || {};
  const status = f.status && f.status.stringValue;
  const approvedLegacy = f.approved && f.approved.booleanValue === true;
  return status === "approved" || approvedLegacy;
}

/* ---- chat ---- */
async function chat(request, env) {
  if (!(await isMember(request, env))) return json({ error: "unauthorized" }, 401);
  const body = await request.json().catch(() => ({}));
  let history = Array.isArray(body.messages) ? body.messages : [];
  // keep only role/content, recent turns, trim length
  history = history
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
  if (!history.length) return json({ error: "no message" }, 400);

  const messages = [{ role: "system", content: SYSTEM_PROMPT }].concat(history);
  const out = await env.AI.run(MODEL, { messages, max_tokens: 512 });
  // Workers AI returns either { response } (older) or OpenAI-style { choices:[{message:{content}}] }.
  let reply = "";
  if (out) {
    if (typeof out.response === "string" && out.response) reply = out.response;
    else if (out.choices && out.choices[0] && out.choices[0].message) reply = out.choices[0].message.content || "";
    else if (out.result && out.result.response) reply = out.result.response;
  }
  return json({ reply: (String(reply).trim() || "…") });
}
