/**
 * Lightweight Firebase Web SDK bootstrapper.
 *
 * Only initialized when one of these pages loads — avoids injecting SDK into
 * every page. The keys below come from .env.example / your deployment settings.
 *
 * IMPORTANT: The FIREBASE_API_KEY is safe to expose publicly. It does NOT grant
 * access to your database by itself; Firebase Security Rules control that.
 */

const firebaseConfig = {
  apiKey: 'AIzaSyAAhQj4TS0TZ9RUelGJrq1YoTC-NBN9h_A',
  authDomain: 'aera-s-store.firebaseapp.com',
  projectId: 'aera-s-store',
  databaseURL: 'https://aera-s-store-default-rtdb.europe-west1.firebasedatabase.app',
  messagingSenderId: '788287691024',
  appId: '1:788287691024:web:d0c73e3dcdce620ecfbc23'
};

export function getFirebase() {
  if (!window.firebase) throw new Error('Firebase SDK not loaded');
  const { initializeApp } = window.firebase;
  return initializeApp(firebaseConfig);
}

export function getAuth() {
  const { getAuth } = window.firebase;
  return getAuth(getFirebase());
}

export function getGoogleAuthProvider() {
  const { GoogleAuthProvider } = window.firebase;
  const p = new GoogleAuthProvider();
  p.addScope('profile');
  p.addScope('email');
  return p;
}

export function getGithubAuthProvider() {
  const { GithubAuthProvider } = window.firebase;
  const p = new GithubAuthProvider();
  p.addScope('read:user');
  p.addScope('user:email');
  return p;
}

export function getAppleAuthProvider() {
  const { OAuthProvider } = window.firebase;
  const p = new OAuthProvider('apple.com');
  p.addScope('name');
  p.addScope('email');
  return p;
}
