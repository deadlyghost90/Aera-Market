/**
 * Aera Market — Auth page JavaScript
 * Handles email/password forms AND third-party OAuth (Google, Apple, GitHub).
 *
 * OAuth Architecture Note:
 * Since Firebase Admin SDK doesn't expose a direct "create user from provider"
 * endpoint, we use the following flow:
 * 1. Client opens popup → fetches /api/auth/google|apple|github (server generates provider-specific auth URL)
 * 2. User authenticates with provider in popup
 * 3. Provider redirects to popup window with ID token / access code
 * 4. Popup posts ID token to /api/auth/federated (verifies with Firebase Admin)
 * 5. Session cookie set, popup closes, main window redirects
 *
 * The /api/auth/{provider} endpoints generate signed URLs using the Firebase
 * Web SDK OAuth flow, then post the resulting ID token back to us.
 */

import { api } from '../core/api.js';
import { mountShell } from '../core/shell.js';

await mountShell();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const message = document.getElementById('form-message');
const next = new URLSearchParams(window.location.search).get('next');
const destination = next && next.startsWith('/') ? next : '/index.html';

let currentStrength = 0; // 0-4

function show(text, type) {
  if (!message) return;
  message.textContent = text || '';
  message.className = 'auth-message' + (type === 'ok' ? ' ok' : type === 'err' ? ' err' : '');
}

/** Opens a popup for OAuth, returns a Promise that resolves when the popup posts back */
function openOAuthPopup(provider) {
  return new Promise((resolve, reject) => {
    const width = 600, height = 700;
    const left = (window.screen.width - width) / 2;
    const top = (window.screen.height - height) / 2;

    // Generate a unique state for CSRF protection
    const state = crypto.randomUUID();
    sessionStorage.setItem(`oauth_state_${provider}`, state);

    const popupUrl = `/api/auth/${provider}?state=${encodeURIComponent(state)}&next=${encodeURIComponent(destination)}`;
    const win = window.open(popupUrl, `oauth-${provider}`,
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,resizable=yes,scrollbars=yes`
    );

    if (!win) {
      reject(new Error('Popup blocked. Please allow popups and try again.'));
      return;
    }

    // Listen for messages from popup
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data || {};

      // Only accept our own oauth_done messages
      if (data.type !== 'oauth_done') return;
      if (data.provider !== provider) return;

      window.removeEventListener('message', onMessage);

      if (data.error) {
        reject(new Error(data.error));
      } else if (data.idToken) {
        resolve(data.idToken);
      } else {
        reject(new Error('No authentication token received'));
      }
    };

    window.addEventListener('message', onMessage);

    // Close listener — if popup closes without message, reject
    const closeCheck = setInterval(() => {
      if (win.closed) {
        clearInterval(closeCheck);
        window.removeEventListener('message', onMessage);
        reject(new Error('Authentication was cancelled'));
      }
    }, 500);
  });
}

async function completeFederated(idToken, provider) {
  const result = await api('/api/auth/federated', {
    method: 'POST',
    body: { idToken, provider }
  });
  window.location.assign(destination);
}

// ---------------------------------------------------------------------------
// Form handlers
// ---------------------------------------------------------------------------
function setLoading(btn, loading) {
  if (!btn) return;
  btn.classList.toggle('loading', !!loading);
  btn.disabled = !!loading;
}

async function handleLogin(form) {
  const data = new FormData(form);
  const email = data.get('email')?.trim() || '';
  const password = data.get('password') || '';
  const btn = document.getElementById('login-btn');

  show('', '');
  setLoading(btn, true);

  try {
    await api('/api/auth/session', {
      method: 'POST',
      body: { email, password }
    });
    window.location.assign(destination);
  } catch (error) {
    show(error.message || 'Sign in failed.', 'err');
  } finally {
    setLoading(btn, false);
  }
}

async function handleRegister(form) {
  const data = new FormData(form);
  const displayName = data.get('displayName')?.trim() || '';
  const email = data.get('email')?.trim() || '';
  const password = data.get('password') || '';
  const btn = document.getElementById('register-btn');

  show('', '');

  if (password.length < 10) {
    show('Password must be at least 10 characters.', 'err');
    return;
  }

  setLoading(btn, true);

  try {
    await api('/api/auth/register', {
      method: 'POST',
      body: { displayName, email, password }
    });
    window.location.assign(destination);
  } catch (error) {
    show(error.message || 'Registration failed.', 'err');
  } finally {
    setLoading(btn, false);
  }
}

// ---------------------------------------------------------------------------
// Password visibility toggles
// ---------------------------------------------------------------------------
function initPasswordToggle(inputId, buttonId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(buttonId);
  if (!input || !btn) return;

  btn.addEventListener('click', () => {
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');

    const openSvg = btn.querySelector('.eye-open');
    const closedSvg = btn.querySelector('.eye-closed');
    if (openSvg) openSvg.classList.toggle('hidden', isPassword);
    if (closedSvg) closedSvg.classList.toggle('hidden', !isPassword);
  });
}

initPasswordToggle('password', 'toggle-password');
initPasswordToggle('reg-password', 'toggle-reg-password');

// ---------------------------------------------------------------------------
// Password strength meter
// ---------------------------------------------------------------------------
function assessStrength(pw) {
  let score = 0;
  if (pw.length >= 10) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

function renderStrength(score) {
  const meter = document.getElementById('strength-meter');
  const label = document.getElementById('strength-label');
  if (!meter) return;
  if (!label) return;

  const levels = ['', 'weak', 'fair', 'good', 'strong'];
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const cls = levels[score] || 'weak';

  meter.className = 'strength-meter strength-' + cls;
  label.className = 'strength-label ' + cls;
  label.textContent = labels[score] || '';
}

const regPwd = document.getElementById('reg-password');
if (regPwd) {
  regPwd.addEventListener('input', () => {
    const s = assessStrength(regPwd.value);
    currentStrength = s;
    renderStrength(s);
  });
}

// ---------------------------------------------------------------------------
// Social auth buttons — POST handler with popup-based OAuth
// ---------------------------------------------------------------------------
async function handleSocialAuth(provider, event) {
  event.preventDefault();

  show('Connecting to ' + provider.charAt(0).toUpperCase() + provider.slice(1) + '…', '');

  try {
    const idToken = await openOAuthPopup(provider);
    await completeFederated(idToken, provider);
  } catch (error) {
    show(error.message || 'Authentication failed.', 'err');
  }
}

document.getElementById('btn-google')?.addEventListener('click', (e) => handleSocialAuth('google', e));
document.getElementById('btn-apple')?.addEventListener('click', (e) => handleSocialAuth('apple', e));
document.getElementById('btn-github')?.addEventListener('click', (e) => handleSocialAuth('github', e));

// ---------------------------------------------------------------------------
// Form wiring
// ---------------------------------------------------------------------------
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleLogin(loginForm);
  });
}

const registerForm = document.getElementById('register-form');
if (registerForm) {
  registerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void handleRegister(registerForm);
  });
}

// ---------------------------------------------------------------------------
// Handle redirect back from OAuth popup
// ---------------------------------------------------------------------------
async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const idToken = params.get('id_token');
  const provider = params.get('provider');

  if (!idToken) return;

  // Clear URL of tokens so refresh doesn't resend them
  const cleanUrl = window.location.pathname;
  history.replaceState(null, '', cleanUrl);

  show('Completing sign in…', '');

  try {
    await completeFederated(idToken, provider || 'google');
  } catch (error) {
    show(error.message || 'Authentication failed.', 'err');
    setTimeout(() => {
      window.location.assign(cleanUrl);
    }, 2500);
  }
}

handleOAuthCallback();
