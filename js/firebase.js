// Mój domek – połączenie z Firebase: logowanie Google i wspólna baza Firestore.
// Konfiguracja aplikacji internetowej nie jest tajna (jest w każdej stronie z Firebase);
// dostęp do danych chronią reguły bazy (tylko Adam i Magda) – plik reguł leży poza repozytorium.
// Wersja biblioteki przypięta na stałe (12.19.0, wrzesień 2026).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, terminate, clearIndexedDbPersistence,
  doc, getDoc, collection, onSnapshot, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

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
// kopia danych na tym urządzeniu (IndexedDB): odczyt bez internetu, wspólna dla wszystkich kart przeglądarki
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ignoreUndefinedProperties: true,
});
export { onAuthStateChanged, doc, collection, onSnapshot, writeBatch, serverTimestamp };

export function zaloguj() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, p);
}
// wylogowanie usuwa też kopię danych domu z tego urządzenia (np. cudzy komputer)
export async function wyloguj() {
  await signOut(auth);
  try { await terminate(db); await clearIndexedDbPersistence(db); } catch (e) { console.warn('kopia lokalna', e); }
  location.reload();
}

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
    // bez sieci: pracujemy na kopii z tego urządzenia (reguły sprawdzi serwer przy następnym połączeniu)
    if (e.code === 'unavailable' || e.code === 'timeout' || !navigator.onLine) return { stan: 'offline' };
    return { stan: 'blad', blad: e.code || m };
  }
}
