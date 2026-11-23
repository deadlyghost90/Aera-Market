import { api } from '../core/api.js';
import { mountShell, toast } from '../core/shell.js';

const session = await mountShell('/become-a-seller.html');

const authNote = document.getElementById('auth-note');
const pendingNote = document.getElementById('pending-note');
const approvedNote = document.getElementById('approved-note');
const form = document.getElementById('apply-form');
const hint = document.getElementById('apply-hint');
const message = document.getElementById('form-message');

if (!session) {
  authNote.hidden = false;
  hint.textContent = 'You need an account before applying.';
} else {
  const seller = await api('/api/sellers/apply').catch(() => null);

  if (!seller) {
    form.hidden = false;
  } else if (seller.status === 'APPROVED') {
    approvedNote.hidden = false;
    hint.textContent = 'Your author account is active.';
  } else {
    pendingNote.hidden = false;
    hint.textContent = `Current status: ${seller.status.toLowerCase()}`;
  }
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  message.textContent = 'Submitting…';

  try {
    await api('/api/sellers/apply', {
      method: 'POST',
      body: {
        displayName: data.get('displayName'),
        bio: data.get('bio'),
        country: data.get('country')
      }
    });
    form.hidden = true;
    pendingNote.hidden = false;
    hint.textContent = 'Application received.';
    toast('Application submitted for review');
  } catch (error) {
    message.textContent = error.message || 'Could not submit the application.';
    toast(error.message || 'Could not submit', 'err');
  }
});
