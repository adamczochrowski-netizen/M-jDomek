// Mój domek – konto: przycisk logowania w nagłówku i stan dostępu do wspólnego domu.
// Biblioteka Firebase ładuje się osobno: gdy Google nie odpowiada, reszta aplikacji działa jak dotąd.
import * as dane from './dane/elementy.js';
import { podsumowanie, htmlSzczegoly } from './status.js';

const el = document.getElementById('konto');
const stan = { fb: null, user: null, dostep: null, blad: '', otwarte: false, lista: false };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const BLEDY_LOGOWANIA = {
  'auth/configuration-not-found': 'Logowanie nie jest jeszcze włączone w Firebase (Authentication → Google).',
  'auth/operation-not-allowed': 'Logowanie przez Google nie jest włączone w Firebase.',
  'auth/unauthorized-domain': 'Ta strona nie jest dodana w Firebase (Authentication → Ustawienia → Autoryzowane domeny).',
  'auth/popup-blocked': 'Przeglądarka zablokowała okno logowania – zezwól na wyskakujące okna i spróbuj ponownie.',
  'auth/network-request-failed': 'Brak połączenia z internetem.',
};

function etykieta() {
  const e = etykietaKonta();
  // kropka pokazuje też stan danych (na telefonie nie ma osobnej plakietki): bez internetu / błąd = żółta / czerwona
  const s = podsumowanie().klasa;
  if (s === 'blad' && e.klasa !== 'k-wyl') e.klasa = 'k-blad';
  else if (s === 'uwaga' && e.klasa === 'k-ok') e.klasa = 'k-uwaga';
  return e;
}
function etykietaKonta() {
  if (!stan.fb && stan.blad) return { klasa: 'k-blad', tekst: 'Konto niedostępne' };
  if (!stan.user) return { klasa: 'k-wyl', tekst: 'Zaloguj' };
  const imie = (stan.user.displayName || stan.user.email || '').split(' ')[0];
  switch (stan.dostep?.stan) {
    case 'czlonek': return { klasa: 'k-ok', tekst: imie };
    case 'offline': return { klasa: 'k-uwaga', tekst: imie };
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
  const info = d === 'czlonek' ? '<p>✓ Masz dostęp do wspólnego domu.</p>' + htmlBazy()
    : d === 'offline' ? '<p class="uwaga">Brak połączenia z serwerem – pokazuję kopię danych z tego urządzenia.</p>' + htmlBazy()
    : d === 'brak-dostepu' ? '<p class="uwaga">To konto nie ma dostępu do wspólnego domu. Dostęp mają tylko konta dopisane w regułach bazy (Adam i Magda).</p>'
    : d === 'baza-niegotowa' ? '<p class="uwaga">Baza Firestore nie jest jeszcze utworzona w projekcie Firebase (Firestore Database → Utwórz bazę danych).</p>'
    : d === 'blad' ? `<p class="uwaga">Nie udało się sprawdzić dostępu: ${esc(stan.dostep.blad)}</p>`
    : '<p class="male">Sprawdzanie dostępu…</p>';
  return `${kto}${info}<button type="button" class="k-przycisk drugi" data-konto="wyloguj">Wyloguj</button>`;
}

const odm = (n, [jeden, kilka, wiele]) => (n === 1 ? jeden : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? kilka : wiele);
const godz = (d) => (d ? d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '');

// wspólne dane domu: ile punktów w bazie i czy rysunek (ODSWIEZ.bat) ma coś do przeniesienia
function htmlBazy() {
  const b = dane.stanBazy(), r = b.roznice;
  let h = '<div class="k-baza"><h4>Wspólne dane domu</h4>';
  const ileWBazie = b.elementy ? [...b.elementy.values()].filter((e) => !e.usuniety).length : 0;
  if (b.blad) h += `<p class="uwaga">Baza: ${esc(b.blad)}</p>`;
  else if (!b.elementy) h += '<p class="male">Wczytywanie danych z bazy…</p>';
  else if (ileWBazie) h += `<p>Punkty elektryczne z bazy: <b>${ileWBazie}</b><br><span class="male">${b.zKopii
    ? 'kopia na tym urządzeniu (bez potwierdzenia serwera)' : 'zsynchronizowano ' + godz(b.czas)}</span></p>`;
  else h += '<p>W bazie nie ma jeszcze punktów – widok pokazuje punkty z rysunku (plik).</p>';
  if (r && (r.doZapisu || r.konflikty.length)) {
    const pierwszy = !b.elementy.size;
    const czesci = [[r.nowe, ['nowy', 'nowe', 'nowych']], [r.zmienione, ['zmieniony', 'zmienione', 'zmienionych']],
      [r.przywrocone, ['wrócił na rysunek', 'wróciły na rysunek', 'wróciło na rysunek']],
      [r.usuniete, ['zniknął z rysunku', 'zniknęły z rysunku', 'zniknęło z rysunku']], [r.konflikty, ['z konfliktem', 'z konfliktem', 'z konfliktem']]]
      .filter(([l]) => l.length).map(([l, f]) => `${l.length} ${odm(l.length, f)}`).join(' · ');
    h += pierwszy ? `<p>Na rysunku jest <b>${r.nowe.length}</b> ${odm(r.nowe.length, ['punkt', 'punkty', 'punktów'])} do przeniesienia.</p>`
      : `<p>Rysunek (ODSWIEZ.bat) różni się od bazy: ${czesci}.</p>`;
    if (stan.lista) {
      const wiersze = [...r.nowe.map((x) => [x.id, 'nowy']), ...r.zmienione.map((x) => [x.id, 'zmiana: ' + x.pola.join(', ')]),
        ...r.przywrocone.map((x) => [x.id, 'wraca']), ...r.usuniete.map((x) => [x.id, 'oznaczyć jako usunięty']),
        ...r.konflikty.map((x) => [x.id, 'konflikt: ' + x.pola.join(', ')])];
      h += `<ul>${wiersze.map(([id, t]) => `<li><code>${esc(id)}</code> – ${esc(t)}</li>`).join('')}</ul>`;
    }
    h += `<button type="button" class="k-link" data-konto="lista">${stan.lista ? 'ukryj listę' : 'pokaż listę'}</button>`;
    if (r.doZapisu) {
      h += `<button type="button" class="k-przycisk" data-konto="przenies"${b.wysylanie ? ' disabled' : ''}>${b.wysylanie ? 'Wysyłanie…'
        : pierwszy ? `Przenieś ${r.nowe.length} ${odm(r.nowe.length, ['punkt', 'punkty', 'punktów'])} do bazy` : `Przenieś zmiany do bazy (${r.doZapisu})`}</button>`;
      h += '<p class="male">Położenia z pomiaru trafiają jako „potwierdzone”, a z rysunku lub szacunku jako „prawdopodobne”. Nic nie jest kasowane, a każda zmiana zostaje w historii bazy.</p>';
    }
    if (r.konflikty.length) h += '<p class="uwaga">Punkty z konfliktem (zmienione i na rysunku, i w aplikacji) nie są przenoszone – trzeba je rozstrzygnąć ręcznie.</p>';
  } else if (r && ileWBazie) h += '<p class="male">✓ Zgodne z rysunkiem (ODSWIEZ.bat).</p>';
  if (b.komunikat) h += `<p class="${b.komunikat.startsWith('Zapisano') ? 'ok' : 'uwaga'}">${esc(b.komunikat)}</p>`;
  return h + '</div>';
}

// wybór motywu (na telefonie – tutaj; na komputerze ten sam wybór jest w nagłówku, a ta sekcja jest ukryta w CSS)
function htmlMotyw() {
  const w = window.mojDomekMotyw?.wybor() || 'ciemny';
  const opcja = (k, t) => `<button type="button" class="${w === k ? 'aktywny' : ''}" aria-pressed="${w === k}" data-konto="motyw-${k}">${t}</button>`;
  return `<div class="k-motyw"><h4>Wygląd</h4><div class="opcje-motywu" role="group" aria-label="Motyw">
    ${opcja('ciemny', 'Ciemny')}${opcja('jasny', 'Jasny')}${opcja('system', 'Jak w telefonie')}</div></div>`;
}

function rysuj() {
  if (!el) return;
  const e = etykieta();
  const doZapisu = dane.stanBazy().roznice?.doZapisu || 0;
  el.innerHTML = `<button type="button" class="konto-przycisk ${e.klasa}" data-konto="panel" aria-expanded="${stan.otwarte}"
      ${doZapisu ? `title="Rysunek ma ${doZapisu} ${odm(doZapisu, ['zmianę', 'zmiany', 'zmian'])} do przeniesienia do bazy"` : ''}>
      <span class="kropka" aria-hidden="true"></span>${esc(e.tekst)}${doZapisu ? `<span class="liczba-zmian">${doZapisu}</span>` : ''}</button>
    ${stan.otwarte ? `<div class="konto-panel" role="dialog" aria-label="Konto">${opisStanu()}
      <div class="k-baza"><h4>Stan danych</h4>${htmlSzczegoly()}
        <button type="button" class="k-przycisk drugi" data-konto="odswiez">Odśwież dane</button></div>${htmlMotyw()}</div>` : ''}`;
}

async function akcja(a) {
  if (a === 'odswiez') { window.dispatchEvent(new Event('mojdomek:odswiez')); return; }
  if (a.startsWith('motyw-')) { window.mojDomekMotyw?.ustaw(a.slice(6)); rysuj(); return; }
  if (a === 'panel') { stan.otwarte = !stan.otwarte; if (!stan.user && !stan.otwarte) stan.blad = ''; rysuj(); return; }
  if (a === 'zaloguj') {
    stan.blad = '';
    try { await stan.fb.zaloguj(); stan.otwarte = false; }
    catch (e) { if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') stan.blad = BLEDY_LOGOWANIA[e.code] || `Logowanie nie powiodło się (${e.code || e.message}).`; }
    rysuj();
    return;
  }
  if (a === 'wyloguj') { await stan.fb.wyloguj(); stan.otwarte = false; rysuj(); return; }
  if (a === 'lista') { stan.lista = !stan.lista; rysuj(); return; }
  if (a === 'przenies') await dane.przeniesZRysunku();
}

el?.addEventListener('click', (e) => {
  e.stopPropagation();                               // przerysowanie podmienia przycisk – nie traktuj tego jako kliku „poza”
  const b = e.target.closest('[data-konto]');
  if (b) akcja(b.dataset.konto);
});
document.addEventListener('click', (e) => {          // klik poza panelem zamyka go
  if (stan.otwarte && el && !el.contains(e.target)) { stan.otwarte = false; rysuj(); }
});

window.addEventListener('mojdomek:baza', rysuj);
window.addEventListener('mojdomek:status', rysuj);
window.addEventListener('mojdomek:otworz-konto', () => { stan.otwarte = true; rysuj(); });
window.addEventListener('mojdomek:motyw', () => { if (stan.otwarte) rysuj(); });

(async function start() {
  rysuj();
  try { stan.fb = await import('./firebase.js'); }
  catch (e) { stan.blad = e.message; rysuj(); return; }
  stan.fb.onAuthStateChanged(stan.fb.auth, async (u) => {
    stan.user = u;
    stan.dostep = null;
    rysuj();
    if (u) { stan.dostep = await stan.fb.sprawdzDostep(); rysuj(); }
    // instrukcje „jak uzupełnić” (arkusz, kolumny) widzą tylko domownicy
    document.body.classList.toggle('zalogowany', !!u && ['czlonek', 'offline'].includes(stan.dostep?.stan));
    dane.ustawKonto(u, stan.dostep);
    window.dispatchEvent(new CustomEvent('mojdomek:konto', { detail: { user: u, dostep: stan.dostep } }));
  });
})();
