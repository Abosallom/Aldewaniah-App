/* ============================================================
   Aldewaniah push worker — sends FCM push notifications.
   Deploy as Cloudflare Worker "aldewaniah-push".

   WHY a worker: the app has no server. When a member sends a
   chat/DM message, THEIR client calls this worker; the worker
   verifies they are an approved member, looks up the saved FCM
   tokens, and asks Google FCM to deliver the push.

   Bindings (Worker → Settings → Variables and Secrets):
   - FIREBASE_PROJECT  (text)   = aldewaniah-45158
   - SERVICE_ACCOUNT   (SECRET) = full JSON of a Firebase service
     account key (Project settings → Service accounts → Generate
     new private key). Needed to mint OAuth tokens for FCM v1 and
     to read the fcmTokens collection (rules deny member reads).

   Endpoints:
   - GET  /health            → ok
   - POST /notify  (auth)    → {kind:'chat'|'dm'|'announce',
                                body, title?, toUid?, link?, tag?}
     chat/announce → everyone except the sender; dm → toUid only.
   ============================================================ */

const ALLOWED_ORIGINS = [
  'https://app.aldewaniah.com',
  'https://abosallom.github.io',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost'
];

const APP_LINK = 'https://app.aldewaniah.com';

function corsHeaders(origin) {
  const ok = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': ok,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400'
  };
}
const json = (obj, status, cors) =>
  new Response(JSON.stringify(obj), { status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });

/* ---------- caller verification (same model as the media worker):
   decode the Firebase ID token, then read members/{phone} from
   Firestore WITH THAT TOKEN — Firestore validates the signature
   and the rules, so a forged token or non-member is rejected. */
function decodeJwtPayload(tok) {
  try {
    const p = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(p));
  } catch (e) { return null; }
}
async function verifyMember(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const idToken = auth.slice(7);
  const payload = decodeJwtPayload(idToken);
  if (!payload || !payload.phone_number || !payload.user_id) return null;
  const phone = payload.phone_number;
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT}` +
    `/databases/(default)/documents/members/${encodeURIComponent(phone)}`;
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + idToken } });
  if (!res.ok) return null;
  const doc = await res.json();
  const f = doc.fields || {};
  const approved = (f.status && f.status.stringValue === 'approved') ||
                   (f.approved && f.approved.booleanValue === true);
  if (!approved) return null;
  return { phone, uid: payload.user_id,
           name: (f.name && f.name.stringValue) || '' };
}

/* ---------- Google OAuth (service account → access token) ---------- */
let cachedToken = null, cachedExp = 0;
function b64url(bytes) {
  let s = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
async function googleAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedExp - 120) return cachedToken;
  const sa = JSON.parse(env.SERVICE_ACCOUNT);
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = b64url(new TextEncoder().encode(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  })));
  const key = await crypto.subtle.importKey('pkcs8', pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key,
    new TextEncoder().encode(header + '.' + claims));
  const jwt = header + '.' + claims + '.' + b64url(sig);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt
  });
  if (!res.ok) throw new Error('oauth failed ' + res.status);
  const j = await res.json();
  cachedToken = j.access_token;
  cachedExp = now + (j.expires_in || 3600);
  return cachedToken;
}

/* ---------- fcmTokens lookup (via service account) ---------- */
const fsBase = (env) =>
  `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT}/databases/(default)/documents`;

function tokensFromDoc(doc) {
  const f = doc.fields || {};
  const arr = (f.tokens && f.tokens.arrayValue && f.tokens.arrayValue.values) || [];
  return arr.map((v) => v.stringValue).filter(Boolean);
}
async function tokensForUid(env, gTok, uid) {
  const res = await fetch(`${fsBase(env)}/fcmTokens/${encodeURIComponent(uid)}`,
    { headers: { Authorization: 'Bearer ' + gTok } });
  if (!res.ok) return [];
  return tokensFromDoc(await res.json()).map((t) => ({ uid, token: t }));
}
async function tokensForAll(env, gTok, exceptUid) {
  const out = [];
  let pageToken = '';
  do {
    const url = `${fsBase(env)}/fcmTokens?pageSize=300` +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + gTok } });
    if (!res.ok) break;
    const j = await res.json();
    (j.documents || []).forEach((d) => {
      const uid = d.name.split('/').pop();
      if (uid === exceptUid) return;
      tokensFromDoc(d).forEach((t) => out.push({ uid, token: t }));
    });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}
async function deleteStaleToken(env, gTok, uid, badToken) {
  // remove a dead token from the member's doc (best effort)
  try {
    const res = await fetch(`${fsBase(env)}/fcmTokens/${encodeURIComponent(uid)}`,
      { headers: { Authorization: 'Bearer ' + gTok } });
    if (!res.ok) return;
    const doc = await res.json();
    const left = tokensFromDoc(doc).filter((t) => t !== badToken);
    await fetch(`${fsBase(env)}/fcmTokens/${encodeURIComponent(uid)}?updateMask.fieldPaths=tokens`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + gTok, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { tokens: { arrayValue: {
        values: left.map((t) => ({ stringValue: t })) } } } })
    });
  } catch (e) {}
}

/* ---------- FCM v1 send ---------- */
async function sendPush(env, gTok, target, title, body, link, tag) {
  const msg = {
    message: {
      token: target.token,
      notification: { title, body },
      webpush: {
        headers: { TTL: '3600' },
        notification: { tag: tag || 'aldewaniah', icon: APP_LINK + '/assets/icon-192.png',
                        badge: APP_LINK + '/assets/favicon-32.png', dir: 'rtl', lang: 'ar' },
        fcm_options: { link: link || APP_LINK }
      }
    }
  };
  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT}/messages:send`,
    { method: 'POST',
      headers: { Authorization: 'Bearer ' + gTok, 'Content-Type': 'application/json' },
      body: JSON.stringify(msg) });
  if (res.status === 404 || res.status === 410) {
    await deleteStaleToken(env, gTok, target.uid, target.token);
  }
  return res.ok;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (url.pathname === '/health') return json({ ok: true }, 200, cors);

    if (url.pathname === '/notify' && request.method === 'POST') {
      const member = await verifyMember(request, env);
      if (!member) return json({ error: 'unauthorized' }, 401, cors);
      let p; try { p = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400, cors); }
      const kind = p.kind || 'chat';
      const body = String(p.body || '').slice(0, 140);
      if (!body) return json({ error: 'empty' }, 400, cors);
      const title = String(p.title || 'الديوانية').slice(0, 60);
      const link = APP_LINK + (kind === 'dm' ? '/#chat/priv' : '/#chat');
      const tag = p.tag || (kind === 'dm' ? 'dm-msg' : 'chat-msg');

      let gTok;
      try { gTok = await googleAccessToken(env); }
      catch (e) { return json({ error: 'push not configured' }, 503, cors); }

      let targets = [];
      if (kind === 'dm') {
        if (!p.toUid) return json({ error: 'toUid required' }, 400, cors);
        targets = await tokensForUid(env, gTok, String(p.toUid));
      } else {
        targets = await tokensForAll(env, gTok, member.uid);
      }
      let sent = 0;
      // send in parallel, capped
      const results = await Promise.all(targets.slice(0, 200).map((t) =>
        sendPush(env, gTok, t, title, body, link, tag).catch(() => false)));
      results.forEach((ok) => { if (ok) sent++; });
      return json({ ok: true, sent, targets: targets.length }, 200, cors);
    }

    return json({ error: 'not found' }, 404, cors);
  }
};
