// Mój domek – konto: przycisk logowania w nagłówku i stan dostępu do wspólnego domu.
// Biblioteka Firebase ładuje się osobno: gdy Google nie odpowiada, reszta aplikacji działa jak dotąd.
const el = document.getElementById('konto');
const stan = { fb: null, user: null, dostep: null, blad: '', otwarte: false };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const BLEDY_LOGOWANIA = {
  'auth/configuration-not-found': 'Logowanie nie jest jeszcze włączone w Firebase (Authentication → Google).',
  'auth/operation-not-allowed': 'Logowanie przez Google nie jest włączone w Firebase.',
  'auth/unauthorized-domain': 'Ta strona nie jest dodana w Firebase (Authentication → Ustawienia → Autoryzowane domeny).',
  'auth/popup-blocked': 'Przeglądarka zablokowała okno logowania – zezwól na wyskakujące okna i spróbuj ponownie.',
  'auth/network-request-failed': 'Brak połączenia z internetem.',
};

function etykieta() {
  if (!stan.fb && stan.blad) return { klasa: 'k-blad', tekst: 'Konto niedostępne' };
  if (!stan.user) return { klasa: 'k-wyl', tekst: 'Zaloguj' };
  const imie = (stan.user.displayName || stan.user.email || '').split(' ')[0];
  switch (stan.dostep?.stan) {
    case 'czlonek': return { klasa: 'k-ok', tekst: imie };
    case 'brak-dostepu': return { klasa: 'k-uwaga', tekst: 'Brak dostępu' };
    case 'baza-niegotowa': return { klasa: 'k-uwaga', tekst: 'Baza niegotowa' };
    case 'blad': return { klasa: 'k-blad', tekst: 'Błąd połączenia' };
    default: return { klasa: 'k-wyl', tekst: 'Sprawdzanie…' };
  }
}

function opisStanu() {
  const u = stan.user;
  if (!stan.fb && stan.blad) return `<p>Nie udało się połączyć z usługą logowania (${esc(stan.blad)}). Aplikacja działa dalej w trybie podglądu.</p>`;
  if (!u) return `<p>Zaloguj się kontem Google, żeby korzystać ze wspólnych danych domu (edycja, zdjęcia, historia – wdrażane etapami).
    Bez logowania aplikacja działa jak dotąd, w trybie podglądu.</p>
    ${stan.blad ? `<p class="uwaga">${esc(stan.blad)}</p>` : ''}
    <button type="button" class="k-przycisk" data-konto="zaloguj">Zaloguj przez Google</button>`;
  const kto = `<p><b>${esc(u.displayName || '')}</b><br><span class="male">${esc(u.email || '')}</span></p>`;
  const d = stan.dostep?.stan;
  const info = d === 'czlonek' ? '<p>✓ Masz dostęp do wspólnego domu. Wspólny zapis i synchronizacja będą włączane etapami.</p>'
    : d === 'brak-dostepu' ? '<p class="uwaga">To konto nie ma dostępu do wspólnego domu. Dostęp mają tylko konta dopisane w regułach bazy (Adam i Magda).</p>'
    : d === 'baza-niegotowa' ? '<p class="uwaga">Baza Firestore nie jest jeszcze utworzona w projekcie Firebase (Firestore Database → Utwórz bazę danych).</p>'
    : d === 'blad' ? `<p class="uwaga">Nie udało się sprawdzić dostępu: ${esc(stan.dostep.blad)}</p>`
    : '<p class="male">Sprawdzanie dostępu…</p>';
  return `${kto}${info}<button type="button" class="k-przycisk drugi" data-konto="wyloguj">Wyloguj</button>`;
}

function rysuj() {
  if (!el) return;
  const e = etykieta();
  el.innerHTML = `<button type="button" class="konto-przycisk ${e.klasa}" data-konto="panel" aria-expanded="${stan.otwarte}">
      <span class="kropka" aria-hidden="true"></span>${esc(e.tekst)}</button>
    ${stan.otwarte ? `<div class="konto-panel" role="dialog" aria-label="Konto">${opisStanu()}</div>` : ''}`;
}

async function akcja(a) {
  if (a === 'panel') { stan.otwarte = !stan.otwarte; if (!stan.user && !stan.otwarte) stan.blad = ''; rysuj(); return; }
  if (a === 'zaloguj') {
    stan.blad = '';
    try { await stan.fb.zaloguj(); stan.otwarte = false; }
    catch (e) { if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') stan.blad = BLEDY_LOGOWANIA[e.code] || `Logowanie nie powiodło się (${e.code || e.message}).`; }
    rysuj();
    return;
  }
  if (a === 'wyloguj') { await stan.fb.wyloguj(); stan.otwarte = false; rysuj(); }
}

el?.addEventListener('click', (e) => {
  e.stopPropagation();                               // przerysowanie podmienia przycisk – nie traktuj tego jako kliku „poza”
  const b = e.target.closest('[data-konto]');
  if (b) akcja(b.dataset.konto);
});
document.addEventListener('click', (e) => {          // klik poza panelem zamyka go
  if (stan.otwarte && el && !el.contains(e.target)) { stan.otwarte = false; rysuj(); }
});

(async function start() {
  rysuj();
  try { stan.fb = await import('./firebase.js'); }
  catch (e) { stan.blad = e.message; rysuj(); return; }
  stan.fb.onAuthStateChanged(stan.fb.auth, async (u) => {
    stan.user = u;
    stan.dostep = null;
    rysuj();
    if (u) { stan.dostep = await stan.fb.sprawdzDostep(); rysuj(); }
    window.dispatchEvent(new CustomEvent('mojdomek:konto', { detail: { user: u, dostep: stan.dostep } }));
  });
})();
