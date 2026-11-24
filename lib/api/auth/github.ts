import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  route,
  sendJson,
  serializeCookie
} from '../../server/utils/http';
import { env } from '../../server/config/env';
import { auth } from '../../server/firebase/admin';
import { getUser } from '../../server/database/users.repo';
import { createUserRecord } from '../../server/database/users.repo';
import {
  createSessionCookie,
  sessionCookieName,
  sessionTtlSeconds
} from '../../server/firebase/session';

const FW = {
  apiKey: 'AIzaSyAAhQj4TS0TZ9RUelGJrq1YoTC-NBN9h_A',
  authDomain: 'aera-s-store.firebaseapp.com',
  projectId: 'aera-s-store',
  databaseURL: 'https://aera-s-store-default-rtdb.europe-west1.firebasedatabase.app',
  messagingSenderId: '788287691024',
  appId: '1:788287691024:web:d0c73e3dcdce620ecfbc23'
};

/** Builds the OAuth popup page for GitHub sign-in. */
function makePage(nextDest: string): string {
  const esc = nextDest.replace(/</g, '\\u003c').replace(/'/g, '\\u0027');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in with GitHub — Aera Market</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#191919;font-family:system-ui,sans-serif;color:#fff}
.card{text-align:center;padding:2rem;border-radius:16px;background:rgba(35,35,35,.9);border:1px solid rgba(135,230,75,.15)}
.spinner{width:40px;height:40px;border:3px solid #232323;border-top-color:#87e64b;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 1rem}
@keyframes spin{to{transform:rotate(360deg)}}
p{color:#aaa;font-size:.875rem}
.err{color:#ff6b6b;font-size:.875rem;margin-top:.5rem}
</style>
</head>
<body>
<div class="card">
  <div class="spinner"></div>
  <p>Connecting to GitHub…</p>
  <p class="err" id="err"></p>
</div>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
<script>
(function(){
  firebase.initializeApp({${JSON.stringify(FW).replace(/<\/script>/gi, '<\\/script>')}});
  var auth = firebase.auth();
  var gp = new firebase.GithubAuthProvider();
  gp.addScope('read:user');
  gp.addScope('user:email');

  function err(msg){ document.getElementById('err').textContent = msg; }

  auth.signInWithPopup(gp).then(function(result){
    return result.user.getIdToken();
  }).then(function(idToken){
    if(window.opener){
      window.opener.postMessage({type:'oauth_done',provider:'github',idToken:idToken},'*');
      window.close();
    }else{
      location.href='/login.html?id_token='+encodeURIComponent(idToken)+'&provider=github&next='+encodeURIComponent('${esc}');
    }
  }).catch(function(e){
    console.error(e);
    err('Authentication failed: '+e.message);
    setTimeout(function(){if(window.opener){window.close();}else{location.href='/login.html?error=github_auth_failed';}},3000);
  });
})();
</script>
</body>
</html>`;
}

const handler = route(async (req: VercelRequest, res: VercelResponse, _ctx) => {
  const config = env();
  const nextParam = Array.isArray(req.query.next)
    ? req.query.next[0]
    : typeof req.query.next === 'string'
      ? decodeURIComponent(req.query.next)
      : '/index.html';
  const nextDest = (nextParam && nextParam.startsWith('/')) ? nextParam : '/index.html';

  if (req.method === 'POST') {
    const body = req.body as { idToken?: string };
    if (!body?.idToken || typeof body.idToken !== 'string') {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing idToken' } });
      return;
    }
    try {
      const decoded = await auth().verifyIdToken(body.idToken);
      const uid = decoded.uid;
      const email = (decoded.email ?? '').toLowerCase();
      const displayName = (decoded.name ?? (email.split('@')[0] ?? '')).trim();
      const existing = await getUser(uid);
      if (!existing) {
        await createUserRecord({ uid, email, displayName, role: 'BUYER' });
      }
      const cookie = await createSessionCookie(body.idToken);
      res.setHeader('Set-Cookie', serializeCookie(sessionCookieName(), cookie, {
        maxAgeSeconds: sessionTtlSeconds(),
        secure: config.APP_ORIGIN.startsWith('https://')
      }));
      sendJson(res, 200, { redirect: nextDest });
    } catch {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
    }
    return;
  }

  if (req.method === 'GET') {
    const html = makePage(nextDest);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
    return;
  }

  res.status(405).json({ error: { code: 'BAD_REQUEST', message: 'Method not allowed' } });
});

export default handler;
