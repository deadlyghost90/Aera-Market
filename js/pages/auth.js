import { api } from '../core/api.js';
import { mountShell } from '../core/shell.js';

await mountShell();

const message = document.getElementById('form-message');
const next = new URLSearchParams(window.location.search).get('next');
const destination = next && next.startsWith('/') ? next : '/index.html';

function show(text) {
  message.textContent = text;
}

async function handleLogin(form) {
  const data = new FormData(form);
  show('Signing in…');
  try {
    await api('/api/auth/session', {
      method: 'POST',
      body: { email: data.get('email'), password: data.get('password') }
    });
    window.location.assign(destination);
  } catch (error) {
    show(error.message || 'Sign in failed.');
  }
}

async function handleRegister(form) {
  const data = new FormData(form);
  show('Creating your account…');
  try {
    await api('/api/auth/register', {
      method: 'POST',
      body: {
        displayName: data.get('displayName'),
        email: data.get('email'),
        password: data.get('password')
      }
    });
    window.location.assign(destination);
  } catch (error) {
    show(error.message || 'Registration failed.');
  }
}

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
