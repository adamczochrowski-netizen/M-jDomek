// Mój domek – połączenie z Firebase: logowanie Google i wspólna baza Firestore.
// Konfiguracja aplikacji internetowej nie jest tajna (jest w każdej stronie z Firebase);
// dostęp do danych chronią reguły bazy (tylko Adam i Magda) – plik reguł leży poza repozytorium.
// Wersja biblioteki przypięta na stałe (12.19.0, wrzesień 2026).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBQFLMDuPKnWb5V3jltBZ7gqfT2yJxbCbc',
  authDomain: 'mylittleproject-e91e3.firebaseapp.com',
  projectId: 'mylittleproject-e91e3',
  storageBucket: 'mylittleproject-e91e3.firebasestorage.app',
  messagingSenderId: '34375024144',
  appId: '1:34375024144:web:86bc47ea94648d6cf95495',
};

export const DOM_ID = 'moj-dom';                 // wspólny dom Adama i Magdy: domy/moj-dom/…
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { onAuthStateChanged };

export function zaloguj() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, p);
}
export const wyloguj = () => signOut(auth);

// czy zalogowana osoba ma dostęp do wspólnego domu (reguły bazy) – bez zapisywania czegokolwiek
export async function sprawdzDostep() {
  const czas = new Promise((_, nie) => setTimeout(() => nie(Object.assign(new Error('timeout'), { code: 'timeout' })), 10000));
  try {
    await Promise.race([getDoc(doc(db, 'domy', DOM_ID)), czas]);
    return { stan: 'czlonek' };
  } catch (e) {
    const m = String(e.message || '');
    if (/has not been used|is disabled|does not exist|NOT_FOUND/i.test(m)) return { stan: 'baza-niegotowa', blad: m };
    if (e.code === 'permission-denied') return { stan: 'brak-dostepu' };
    return { stan: 'blad', blad: e.code || m };
  }
}
