import { TYPY, KOLEJNOSC_TYPOW } from './analiza.js';
import { ikonaTypu } from './ikony.js';
import { stanBazy } from './dane/elementy.js';
import { podsumowanie } from './status.js';
import { otworzPlan } from './plan.js';
// Mój domek – menu (Widok / Instalacje / Ogrzewanie / Wyposażenie) i sekcje czytane z publicznego Arkusza Google „MójDomek”.
// „MójDomek” sam pobiera (IMPORTRANGE) potrzebne kolumny z prywatnego arkusza „Domek Wirko”:
// Wyposażenie w całości, Kupione bez kwot i bez „kto płacił”. Pompę, pętle, rozdzielnicę, zawory i studnię
// wpisuje się wprost w „MójDomek”. (Docelowo wszystko przejdzie do wspólnej bazy – audyt ETAP 0.)

const ARKUSZ_ID = '1zcDhbn7p6nb2LXemT0zHsZ6MLTl0SBVtr6OWUkGAEHo';
const KLUCZ_KOPII = 'mojDomek.arkusz.kopia.v2';
const KLUCZ_WIDOKU = 'mojDomek.mamy.v1';
// karty arkusza: nazwa jak w arkuszu, gid = numer karty z adresu (…#gid=…) – eksport po gid zachowuje puste wiersze
const KARTY = {
  wyposazenie: { nazwa: 'Wyposażenie', gid: '0' },
  kupione: { nazwa: 'Kupione', gid: '1001' },
  pompa: { nazwa: 'Pompa ciepła', gid: '1002' },
  petle: { nazwa: 'Pętle', gid: '1004', naglowek: 'nr' },
  rozdzielnica: { nazwa: 'Rozdzielnica', gid: '1005', naglowek: 'nr' },
  zawory: { nazwa: 'Zawory', gid: '1006', naglowek: 'id' },
  studnia: { nazwa: 'Studnia', gid: '1007', naglowek: 'temat' },
};
const linkArkusza = (gid) => `https://docs.google.com/spreadsheets/d/${ARKUSZ_ID}/edit#gid=${gid}`;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const norm = (s) => String(s ?? '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');
const czytaj = (k, dom) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? dom; } catch { return dom; } };
const zapisz = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* tryb prywatny */ } };

// ====================================================================== menu
const SEKCJE = ['start', 'awaria', 'plan', 'widok', 'instalacje', 'ogrzewanie', 'mamy', 'braki'];
const KLUCZ_SEKCJI = 'mojDomek.sekcja.v1';
const naTelefonie = () => matchMedia('(max-width: 760px)').matches;
const jakAplikacja = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// stare i skrócone adresy: #pompa → Ogrzewanie, #elektryka / #hydraulika / #kanalizacja → Instalacje z podzakładką
const ALIASY = { przeglady: 'plan', pompa: 'ogrzewanie', wyposazenie: 'mamy', elektryka: 'instalacje', hydraulika: 'instalacje', kanalizacja: 'instalacje' };
const PODZAKLADKI = ['elektryka', 'hydraulika', 'kanalizacja'];
function sekcjaZAdresu() {
  const h = location.hash.replace(/^#/, '');
  if (PODZAKLADKI.includes(h)) stanInst.zakladka = h;
  if (h.startsWith('wyl=')) { stanInst.zakladka = 'elektryka'; return 'instalacje'; }   // wyłącznik z wyszukiwarki
  // pusty adres: aplikacja z ekranu głównego – ostatnio używana sekcja; telefon – lekki ekran startowy; komputer – widok domu
  if (!h) return (jakAplikacja() && czytaj(KLUCZ_SEKCJI, null)) || (naTelefonie() ? 'start' : 'widok');
  const s = ALIASY[h] || h;
  return SEKCJE.includes(s) ? s : 'widok';      // #punkt=…, #pokoj=…, #ogrzewanie=… = widok domu
}
function pokazSekcje() {
  const s = sekcjaZAdresu();
  for (const k of SEKCJE) $('#sekcja-' + k).hidden = s !== k;
  document.querySelectorAll('.menu a').forEach((a) => a.classList.toggle('aktywny', a.dataset.sekcja === s));
  document.body.dataset.sekcja = s;
  zapisz(KLUCZ_SEKCJI, s);
  window.dispatchEvent(new CustomEvent('mojdomek:sekcja', { detail: s }));   // np. model 3D buduje się dopiero w „Widoku”
  if (s === 'start') otworzStart();
  if (s === 'mamy') otworzMamy();
  if (s === 'ogrzewanie') otworzPompe();
  if (s === 'instalacje') otworzInstalacje();
  if (s === 'braki') otworzBraki();
  if (s === 'awaria') otworzAwarie();
  if (s === 'plan') otworzPlan($('#plan-tresc'), location.hash === '#przeglady' ? 'przeglady' : null);
}

// ====================================================================== arkusz: pobieranie, CSV
function arkusz() { return { id: ARKUSZ_ID }; }
try { localStorage.removeItem('mojDomek.arkusz.v1'); localStorage.removeItem('mojDomek.arkusz.kopia.v1'); } catch { /* stare ustawienia */ }

function parseCSV(t) {
  const wiersze = []; let w = [], pole = '', cudz = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (cudz) {
      if (c === '"') { if (t[i + 1] === '"') { pole += '"'; i++; } else cudz = false; }
      else pole += c;
    } else if (c === '"') cudz = true;
    else if (c === ',') { w.push(pole); pole = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      w.push(pole); wiersze.push(w); w = []; pole = '';
    } else pole += c;
  }
  if (pole || w.length) { w.push(pole); wiersze.push(w); }
  return wiersze;
}
async function pobierzCSV(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'arkusz nie jest udostępniony przez link' : 'błąd ' + r.status);
  const t = await r.text();
  if (/^\s*<(!doctype|html)/i.test(t)) throw new Error('arkusz nie jest udostępniony przez link (Google pokazał logowanie)');
  return parseCSV(t);
}
const urlEksport = (id, gid) => `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
const urlGviz = (id, nazwa) => `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(nazwa)}`;
async function pobierzKarte(id, karta) {
  if (karta.gid) {
    try { return { wiersze: await pobierzCSV(urlEksport(id, karta.gid)), pelne: true }; } catch { /* spróbuj po nazwie */ }
  }
  return { wiersze: await pobierzCSV(urlGviz(id, karta.nazwa)), pelne: false };   // gviz gubi puste wiersze
}

// ====================================================================== linki i teksty z komórek
const SMIECI_W_ADRESIE = /^(utm_|gclid|gbraid|wbraid|gad_|_gl$|gclsrc|srsltid|ceneo_cid|fbclid)/i;
function czystyLink(u) {
  try {
    const url = new URL(u);
    [...url.searchParams.keys()].forEach((k) => { if (SMIECI_W_ADRESIE.test(k)) url.searchParams.delete(k); });
    return url.toString();
  } catch { return u; }
}
function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'link'; } }
// komórka -> { linki: [{url, opis}], teksty: [linie bez linków] }
function rozbierzKomorke(t) {
  const linki = [], teksty = [];
  let poprzedni = '';
  for (const linia of String(t).split(/\n/)) {
    const l = linia.trim();
    if (!l) continue;
    const adresy = l.match(/https?:\/\/[^\s<>"]+/g);
    if (!adresy) { teksty.push(l); poprzedni = l; continue; }
    let opis = l.slice(0, l.indexOf(adresy[0])).replace(/[\s:;,>\-–]+$/, '').trim();
    if (!opis && poprzedni && poprzedni.length < 40) opis = poprzedni;
    for (const a of adresy) linki.push({ url: czystyLink(a.replace(/[),.;]+$/, '')), opis });
    poprzedni = '';
  }
  return { linki, teksty };
}

// ====================================================================== Wyposażenie (po pomieszczeniach)
const NAZWY_POMIESZCZEN = /^(ogólne|ogolne|wiatrołap|sypialnia|łazienka|kuchnia|salon|.*biuro.*|pom.*gospodarcze|kotłownia|ogród|przedpokój|hol|strych|garaż|taras)$/i;
const STATUS = {
  mamy: { nazwa: 'mamy', klasa: 's-mamy' },
  kandydaci: { nazwa: 'wybieramy', klasa: 's-kandydaci' },
  kupic: { nazwa: 'do kupienia', klasa: 's-kupic' },
};
function parsujWyposazenie(wiersze, pelne) {
  const grupy = [];
  let g = null, poPustym = true, ostatnia = null;
  for (const surowy of wiersze) {
    const w = surowy.map((c) => String(c ?? '').trim());
    if (w.every((c) => !c)) { poPustym = true; continue; }
    const [nazwa, ...reszta] = w;
    if (!nazwa) {                                     // dalszy ciąg poprzedniej pozycji (np. druga wanna)
      if (ostatnia) dopisz(ostatnia, reszta, true);
      poPustym = false; continue;
    }
    if ((pelne && poPustym) || NAZWY_POMIESZCZEN.test(nazwa) || !g) {
      g = { nazwa, linki: [], teksty: [], pozycje: [] };
      for (const c of reszta) { const k = rozbierzKomorke(c); g.linki.push(...k.linki); g.teksty.push(...k.teksty); }
      grupy.push(g);
      poPustym = false; ostatnia = null;
      continue;
    }
    ostatnia = { nazwa, uwagi: [], linki: [], kandydaci: [], status: 'kupic', grupa: g.nazwa };
    dopisz(ostatnia, reszta, false);
    g.pozycje.push(ostatnia);
    poPustym = false;
  }
  for (const gr of grupy) for (const p of gr.pozycje) {
    if (p.status !== 'mamy') p.status = p.linki.length || p.kandydaci.length ? 'kandydaci' : 'kupic';
  }
  return grupy.filter((gr) => gr.pozycje.length || gr.linki.length);
}
// „jest”, „są”, „mamy”, „kupione” na początku komórki (w dowolnej kolumnie) = już to mamy
const MAMY = /^(jest|są|mamy|kupion[eya]?)(?=$|[\s\-–:,.(])/i;
function dopisz(p, komorki, ciag) {
  komorki.forEach((c, i) => {
    if (!c) return;
    const k = rozbierzKomorke(c);
    p.linki.push(...k.linki);
    const pierwsza = k.teksty[0] || '';
    if (MAMY.test(pierwsza)) {
      p.status = 'mamy';
      const reszta = pierwsza.replace(MAMY, '').replace(/^\s*[-–:,]?\s*/, '');
      if (reszta) p.uwagi.push(reszta);
      p.uwagi.push(...k.teksty.slice(1));
    } else if (i === 0 && !ciag) p.uwagi.push(...k.teksty);   // kolumna B: uwagi
    else p.kandydaci.push(...k.teksty);                         // dalsze kolumny: kandydaci
  });
}

// ====================================================================== Kupione (karta „Poniesione koszty”)
const MIESIACE = ['styczen', 'luty', 'marzec', 'kwiecien', 'maj', 'czerwiec', 'lipiec', 'sierpien', 'wrzesien', 'pazdziernik', 'listopad', 'grudzien'];
const MIES_KROTKO = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
// kategorie po słowach w nazwie (kolejność ma znaczenie: pierwsza pasująca wygrywa)
const KATEGORIE = [
  ['Usługi', ['praca ', 'robocizn', 'montaz ', 'usluga']],
  ['Ogród i na zewnątrz', ['ogrod', 'donica', 'agrowloknin', 'keramzyt', 'palenisk', 'pergol', 'opryskiw', 'nawoz', 'trawa', 'ognisk', 'mata kokos', 'slupk', 'segregacji']],
  ['Internet i sieć', ['starlink', 'tp-link', 'deco ', 'ethernet', 'router']],
  ['Łazienka', ['lazienk', 'wanna', 'umywalk', 'prysznic', 'syfon', 'bateria umyw', 'bateria prysz', 'lusterk']],
  ['Woda i hydraulika', ['pex', 'rura', 'trojnik', 'kolank', 'rozdzielacz', 'hydrofor', 'studni', 'zlaczka (do', 'wod ']],
  ['Elektryka i oświetlenie', ['przewod', 'kabel', 'puszk', 'gniazd', 'wlacznik', 'lacznik', 'wylacznik', 'bezpiecznik', 'rozdzielnic', 'rozlacznik',
    'schneider', 'legrand', 'wago', 'zlaczk', 'oprawa', 'oprawk', 'zarowk', 'led', 'lampa', 'kinkiet', 'ramka', 'ups ', 'zasilacz', 'szyna',
    'koncowk', 'dlawik', 'dlawnic', 'przedluzacz', 'hue', 'uziemi']],
  ['Narzędzia', ['pila', 'wkretark', 'wkretak', 'klucz', 'laser', 'poziomic', 'nozyce', 'wiert', 'bit ', 'bity', 'zszywacz', 'zaciskark',
    'mieszadl', 'mieszark', 'drabin', 'latark', 'ladowark', 'akumulator', 'szczotk', 'palnik', 'opalark', 'dalmierz', 'scier', 'dluto',
    'bruzdownik', 'noz ', 'szpachl', 'szpachel', 'skrzynka', 'walizk', 'obcinak', 'mop ', 'maska', 'rekawic', 'wozek', 'trzymak', 'klipsy', 'tarcz']],
  ['Energia', ['fotowolt', 'pompa ciepla', 'magazyn energii']],
  ['Budowa i wykończenie', ['styropian', 'klej', 'siatk', 'osb', 'karton', 'gips', 'gladz', 'profil', 'folia', 'bloczek', 'plastyfikator', 'cement',
    'zapraw', 'fuga', 'pian', 'tasma', 'akryl', 'perlfix', 'rotband', 'smig', 'flizelin', 'farb', 'lakier', 'desk', 'kolk', 'wkret', 'srub',
    'gwozdz', 'keraflex', 'mapei', 'parapet', 'blach', 'dach', 'uszczelk', 'panel', 'podlog', 'drzwi', 'plytk', 'wieszak', 'podbitk']],
  ['Dom i wyposażenie', ['nagrzewnic', 'meble', 'stol', 'krzesl', 'lozk', 'szafa', 'lodowk', 'pralk', 'zmywark', 'odkurz']],
];
function kategoria(nazwa) {
  const n = ' ' + norm(nazwa) + ' ';
  for (const [k, slowa] of KATEGORIE) if (slowa.some((s) => n.includes(norm(s)))) return k;
  return 'Inne';
}
function parsujKupione(wiersze) {
  const lista = [];
  for (const w of wiersze) {
    const [rok, mies, nazwa, gdzie, kwota] = w.map((c) => String(c ?? '').replace(/\s+/g, ' ').trim());
    if (!nazwa || /^koszt$/i.test(nazwa) || /^lista koszt/i.test(nazwa) || /^lista koszt/i.test(rok)) continue;
    const mi = MIESIACE.indexOf(norm(mies).trim());
    const r = parseInt(rok, 10);
    const zl = parseFloat(String(kwota).replace(/\s/g, '').replace(',', '.'));
    lista.push({
      nazwa, gdzie: gdzie.replace(/\s*\/\s*$/, ''), rok: isNaN(r) ? null : r, mies: mi,
      kiedy: [mi >= 0 ? MIES_KROTKO[mi] : mies, isNaN(r) ? '' : r].filter(Boolean).join(' '),
      kwota: isNaN(zl) ? null : zl, kategoria: kategoria(nazwa),
      sort: (isNaN(r) ? 0 : r) * 12 + (mi >= 0 ? mi : 0),
    });
  }
  return lista;
}

// podobne zakupy do pozycji wyposażenia (podpowiedź „chyba już kupione”)
const POKOJE_SLOWA = { lazienk: 'Łazienka', kuchn: 'Kuchnia', salon: 'Salon', sypial: 'Sypialnia' };
const rdzenie = (s) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 5));
const pasuje = (a, b) => a.startsWith(b) || b.startsWith(a);
function podobneZakupy(p, kupione) {
  const r = rdzenie(p.nazwa);
  if (!r.length) return [];
  const potrzeba = Math.min(2, r.length);
  const wynik = [];
  for (const k of kupione) {
    if (k.kategoria === 'Narzędzia' || k.kategoria === 'Usługi') continue;
    const nk = norm(k.nazwa);
    const innyPokoj = Object.entries(POKOJE_SLOWA).some(([s, pokoj]) => nk.includes(s) && pokoj !== p.grupa);
    if (innyPokoj) continue;
    const rk = rdzenie(k.nazwa);
    const traf = r.filter((x) => rk.some((y) => pasuje(x, y))).length;
    if (traf >= potrzeba) wynik.push(k);
  }
  return wynik.sort((a, b) => b.sort - a.sort);
}

// ====================================================================== sekcja „Wyposażenie i zakupy”
const stanMamy = { dane: null, ladowanie: null, blad: null, ...czytaj(KLUCZ_WIDOKU, { zakladka: 'wyposazenie', filtr: 'wszystko' }) };
function zapiszWidok() { zapisz(KLUCZ_WIDOKU, { zakladka: stanMamy.zakladka, filtr: stanMamy.filtr }); }

async function wczytajArkusz() {
  const a = arkusz();
  if (!a) return;
  const kopia = czytaj(KLUCZ_KOPII, null);
  if (kopia && kopia.id === a.id && !stanMamy.dane) { stanMamy.dane = kopia; rysujMamy(); }
  // kopia pokazuje się od razu, a świeże dane z arkusza pobieramy przy każdym wejściu w zakładkę
  if (stanMamy.ladowanie) return stanMamy.ladowanie;
  stanMamy.ladowanie = (async () => {
    try {
      const [wyp, kup] = await Promise.all([pobierzKarte(a.id, KARTY.wyposazenie), pobierzKarte(a.id, KARTY.kupione)]);
      stanMamy.dane = { id: a.id, t: Date.now(), wyposazenie: parsujWyposazenie(wyp.wiersze, wyp.pelne), kupione: parsujKupione(kup.wiersze) };
      stanMamy.blad = null;
      zapisz(KLUCZ_KOPII, stanMamy.dane);
    } catch (e) {
      stanMamy.blad = e.message;
    } finally {
      stanMamy.ladowanie = null;
      // gdy ktoś właśnie wpisuje w wyszukiwarkę – odśwież tylko listę, żeby nie zgubić pola
      const s = document.activeElement?.id === 'mamy-szukaj' && stanMamy.dane;
      if (s) $('#mamy-lista').innerHTML = stanMamy.zakladka === 'kupione' ? htmlKupione(stanMamy.dane, norm(stanMamy.szukaj || '').trim()) : htmlWyposazenie(stanMamy.dane, norm(stanMamy.szukaj || '').trim());
      else rysujMamy();
    }
  })();
  return stanMamy.ladowanie;
}

function otworzMamy() {
  rysujMamy();
  wczytajArkusz();
}

function rysujMamy() {
  const el = $('#mamy-tresc');
  if (!el) return;
  const d = stanMamy.dane;
  if (!d) {
    el.innerHTML = stanMamy.blad
      ? `<div class="karta-strony"><p class="uwaga">Nie udało się wczytać arkusza: ${esc(stanMamy.blad)}</p>
         <p class="male">Sprawdź internet i to, czy arkusz „MójDomek” jest udostępniony „każdy, kto ma link”.</p>
         <button type="button" data-akcja="odswiez">Spróbuj ponownie</button></div>`
      : szkielet(3);
    podepnijAkcje(el);
    return;
  }
  const szukaj = $('#mamy-szukaj')?.value || stanMamy.szukaj || '';
  const q = norm(szukaj).trim();
  const wypLiczby = { wszystko: 0, mamy: 0, kandydaci: 0, kupic: 0 };
  for (const g of d.wyposazenie) for (const p of g.pozycje) { wypLiczby.wszystko++; wypLiczby[p.status]++; }

  el.innerHTML = `
    <div class="mamy-gora">
      <div class="zakladki" role="tablist">
        <button type="button" role="tab" data-zakladka="wyposazenie" class="${stanMamy.zakladka === 'wyposazenie' ? 'aktywny' : ''}">Wyposażenie domu <span>${wypLiczby.wszystko}</span></button>
        <button type="button" role="tab" data-zakladka="kupione" class="${stanMamy.zakladka === 'kupione' ? 'aktywny' : ''}">Kupione <span>${d.kupione.length}</span></button>
      </div>
      <input id="mamy-szukaj" type="search" placeholder="Szukaj, np. wanna, wkrętarka, Legrand…" value="${esc(szukaj)}" autocomplete="off">
      ${stanMamy.zakladka === 'wyposazenie' ? `
      <div class="filtry">
        ${['wszystko', 'mamy', 'kandydaci', 'kupic'].map((f) => `<button type="button" data-filtr="${f}" class="${stanMamy.filtr === f ? 'aktywny' : ''} ${f !== 'wszystko' ? STATUS[f].klasa : ''}">${f === 'wszystko' ? 'wszystko' : STATUS[f].nazwa} <span>${wypLiczby[f]}</span></button>`).join('')}
      </div>` : ''}
    </div>
    <div id="mamy-lista">${stanMamy.zakladka === 'kupione' ? htmlKupione(d, q) : htmlWyposazenie(d, q)}</div>
    ${jakUzupelnic('Lista pochodzi z arkusza „Domek Wirko” (karty Wyposażenie i Poniesione koszty) – tam dopisujcie i poprawiajcie, np. marki i modele. Tu pojawia się po odświeżeniu (przez publiczny arkusz „MójDomek”, bez kwot).')}
    <p class="zrodlo male">
      Wczytano ${new Date(d.t).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
      ${stanMamy.ladowanie ? ' · odświeżanie…' : ''}${stanMamy.blad ? ` · <span class="uwaga">nie udało się odświeżyć (${esc(stanMamy.blad)})</span>` : ''}
      · <button type="button" class="link" data-akcja="odswiez">odśwież</button>
    </p>`;
  podepnijAkcje(el);
  const s = $('#mamy-szukaj');
  s.addEventListener('input', () => {
    stanMamy.szukaj = s.value;
    const qq = norm(s.value).trim();
    $('#mamy-lista').innerHTML = stanMamy.zakladka === 'kupione' ? htmlKupione(d, qq) : htmlWyposazenie(d, qq);
  });
}

function podepnijAkcje(el) {
  el.querySelectorAll('[data-zakladka]').forEach((b) => b.addEventListener('click', () => { stanMamy.zakladka = b.dataset.zakladka; zapiszWidok(); rysujMamy(); }));
  el.querySelectorAll('[data-filtr]').forEach((b) => b.addEventListener('click', () => { stanMamy.filtr = b.dataset.filtr; zapiszWidok(); rysujMamy(); }));
  el.querySelectorAll('[data-akcja="odswiez"]').forEach((b) => b.addEventListener('click', () => { wczytajArkusz(); rysujMamy(); }));
}

const htmlLink = (l) => `<a class="opcja" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.opis ? `${l.opis} · ${host(l.url)}` : host(l.url))}</a>`;
const zl = (v) => v == null ? '' : v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';

function htmlWyposazenie(d, q) {
  const czesci = [];
  let ile = 0;
  for (const g of d.wyposazenie) {
    const pozycje = g.pozycje.filter((p) => (stanMamy.filtr === 'wszystko' || p.status === stanMamy.filtr)
      && (!q || norm([g.nazwa, p.nazwa, ...p.uwagi, ...p.kandydaci, ...p.linki.map((l) => l.opis + ' ' + host(l.url))].join(' ')).includes(q)));
    if (!pozycje.length) continue;
    ile += pozycje.length;
    czesci.push(`
      <section class="grupa">
        <h3>${esc(g.nazwa)} <span class="male">${pozycje.length}</span></h3>
        ${g.teksty.length || g.linki.length ? `<div class="grupa-uwagi male">${g.teksty.map(esc).join('<br>')} ${g.linki.map(htmlLink).join(' ')}</div>` : ''}
        <ul class="pozycje">${pozycje.map((p) => htmlPozycja(p, d)).join('')}</ul>
      </section>`);
  }
  return ile ? czesci.join('') : '<p class="pusto">Nic nie pasuje.</p>';
}
function htmlPozycja(p, d) {
  const st = STATUS[p.status];
  const podobne = p.status !== 'mamy' ? podobneZakupy(p, d.kupione) : [];
  return `<li class="pozycja">
    <div class="pozycja-gora"><b>${esc(p.nazwa)}</b><span class="status ${st.klasa}">${st.nazwa}</span></div>
    ${p.uwagi.length ? `<div class="uwagi">${p.uwagi.map(esc).join('<br>')}</div>` : ''}
    ${p.kandydaci.length ? `<div class="kandydaci">${p.kandydaci.map(esc).join('<br>')}</div>` : ''}
    ${p.linki.length ? `<div class="opcje">${p.linki.map(htmlLink).join('')}</div>` : ''}
    ${podobne.length ? `<div class="podobne">W kupionych: ${podobne.slice(0, 3).map((k) => `<b>${esc(k.nazwa)}</b>${k.kiedy || k.gdzie ? ` <span class="male">(${esc([k.gdzie, k.kiedy].filter(Boolean).join(', '))})</span>` : ''}`).join('; ')}${podobne.length > 3 ? ` <span class="male">i ${podobne.length - 3} więcej</span>` : ''} – może już jest?</div>` : ''}
  </li>`;
}
function htmlKupione(d, q) {
  const lista = d.kupione.filter((k) => !q || norm(`${k.nazwa} ${k.gdzie} ${k.kategoria} ${k.kiedy}`).includes(q));
  if (!lista.length) return '<p class="pusto">Nic nie pasuje.</p>';
  const grupy = new Map();
  for (const k of lista.sort((a, b) => b.sort - a.sort)) {
    if (!grupy.has(k.kategoria)) grupy.set(k.kategoria, []);
    grupy.get(k.kategoria).push(k);
  }
  const kolej = [...KATEGORIE.map((k) => k[0]), 'Inne'].filter((k) => grupy.has(k));
  return kolej.map((kat) => {
    const l = grupy.get(kat);
    return `<details class="grupa" ${q || kolej.length === 1 ? 'open' : ''}>
      <summary><h3>${esc(kat)} <span class="male">${l.length}</span></h3></summary>
      <ul class="pozycje kupione">${l.map((k) => `<li class="pozycja">
        <div class="pozycja-gora"><span>${esc(k.nazwa)}</span><span class="kwota">${zl(k.kwota)}</span></div>
        <div class="male">${esc([k.gdzie, k.kiedy].filter(Boolean).join(' · '))}</div></li>`).join('')}</ul>
    </details>`;
  }).join('');
}

// ====================================================================== wspólne: karty z nagłówkiem, wiarygodność, pomieszczenia
// wiersze danych spod nagłówka; brak = karty nie ma (Google oddaje wtedy inną kartę)
async function wczytajKarte(karta) {
  const { wiersze } = await pobierzKarte(ARKUSZ_ID, karta);
  const nag = (wiersze[0] || []).map((c) => norm(c).trim());
  if (karta.naglowek && nag[0] !== karta.naglowek) return { wiersze: [], brak: true };
  return { wiersze: wiersze.slice(1).filter((w) => w.some((c) => String(c ?? '').trim())), brak: false };
}
// POTWIERDZONA / PRAWDOPODOBNA / NIEZWERYFIKOWANA (rozdz. 12.2); dopisek w nawiasie = źródło
function chipWiar(tekst) {
  const n = norm(tekst).trim();
  // PLANOWANE to nie stopień pewności, tylko stan (rozdz. 5) – osobny, fioletowy znaczek, żeby nie mylić z tym, co jest
  const [klasa, etyk] = n.startsWith('potw') ? ['wiar-potw', 'potwierdzona'] : n.startsWith('prawd') ? ['wiar-prawd', 'prawdopodobna']
    : n.startsWith('plan') ? ['wiar-plan', 'planowane'] : ['wiar-niezw', 'niezweryfikowana'];
  return `<span class="wiar ${klasa}" title="${esc(tekst || 'brak informacji o źródle')}">${etyk}</span>`;
}
function zrodloWiar(tekst) {
  const m = /\(([^)]+)\)/.exec(tekst || '');
  return m ? `<div class="male">źródło: ${esc(m[1])}</div>` : '';
}
// porządek w treści (plan GUI, pkt 6): najpierw informacja; instrukcje „jak wpisywać” zwinięte i tylko po zalogowaniu
// (Adam, Magda); braki – jedna plakietka w nagłówku karty i lista na jej końcu, a wszystkie razem na stronie #braki
const jakUzupelnic = (html) => `<details class="jak-uzupelnic tylko-zalogowani"><summary>ℹ Jak uzupełnić</summary><div class="male">${html}</div></details>`;
const plakietkaBrakow = (lista) => (lista.length ? `<span class="do-uzup">Do uzupełnienia: ${lista.length}</span>` : '');
function htmlBraki(lista) {
  if (!lista.length) return '';
  return `<details class="braki"><summary>Do uzupełnienia (${lista.length})</summary>
    <ul class="checklista">${lista.map((b) => `<li>${b.html}</li>`).join('')}</ul>
    <a class="link-model" href="#braki">Wszystko, co jest do uzupełnienia w domu →</a></details>`;
}
const RE_BRAK = /\b(do potwierdzenia|do uzupełnienia)\b/i;
const RE_BRAK_POCZ = /^\s*(do potwierdzenia|do uzupełnienia)\s*[:–-]?\s*/i;
// „DO POTWIERDZENIA: model…” → „do potwierdzenia: model…” (słowo z arkusza zostaje, bez krzyku wielkimi literami)
const zdanieBraku = (x) => x.replace(RE_BRAK_POCZ, (m, g) => g.toLowerCase() + ': ');
// na telefonie długie karty zwinięte do początku; „Więcej” rozwija (pamiętane do przeładowania strony)
const rozwiniete = new Set();
function zwinDlugie(el) {
  if (!el || !matchMedia('(max-width: 760px)').matches) return;
  el.querySelectorAll('.karta-strony[data-zwijana]').forEach((k) => {
    if (rozwiniete.has(k.dataset.zwijana) || k.scrollHeight < 480) return;
    k.classList.add('zwinieta');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'wiecej'; b.textContent = 'Więcej';
    b.addEventListener('click', () => { rozwiniete.add(k.dataset.zwijana); k.classList.remove('zwinieta'); b.remove(); });
    k.append(b);
  });
}
const linkPokoju = (nazwa, opis = 'pokaż na modelu') => nazwa ? `<a class="link-model" href="#pokoj=${encodeURIComponent(nazwa)}">${esc(opis)}</a>` : '';
function zakupy() { return stanMamy.dane?.kupione || []; }
function zakupyPasujace(wzor) {
  return zakupy().filter((k) => wzor.test(norm(k.nazwa))).sort((a, b) => b.sort - a.sort);
}
function htmlZakupy(lista, pusto) {
  if (!lista.length) return `<p class="male">${pusto}</p>`;
  return lista.map((k) => `<div class="wiersz-fakt"><div class="tresc"><div>${esc(k.nazwa)}</div>
    <div class="male">${esc([k.gdzie, k.kiedy].filter(Boolean).join(' · '))}</div></div>${chipWiar('prawdopodobna (z listy zakupów)')}</div>`).join('');
}
const kartyCache = {};
async function kartaDanych(klucz) {
  try { kartyCache[klucz] = { ...(await wczytajKarte(KARTY[klucz])), blad: null }; }
  catch (e) { kartyCache[klucz] = { wiersze: kartyCache[klucz]?.wiersze || [], blad: e.message }; }
  return kartyCache[klucz];
}

// ====================================================================== sekcja „Ogrzewanie” (pompa ciepła + pętle podłogówki)
// karta „Pompa ciepła”: Temat | Treść | Link;  karta „Pętle”: Nr | Pomieszczenie | Uwagi
const stanPompy = { wiersze: null, brak: false, blad: null, wczytano: false };
async function otworzPompe() {
  rysujPompe();
  try {
    const [p] = await Promise.all([kartaDanych('pompa'), kartaDanych('petle')]);
    stanPompy.wiersze = p.brak ? null : p.wiersze;
    stanPompy.blad = p.blad;
    stanPompy.wczytano = true;
  } catch (e) { stanPompy.blad = e.message; }
  rysujPompe();
}
const TEMATY_POMPY = [
  ['Urządzenie', 'model, moc, numer seryjny, gdzie stoi jednostka zewnętrzna i wewnętrzna'],
  ['Ustawienia', 'temperatury, krzywa grzewcza, ciepła woda (CWU), tryby pracy'],
  ['Codzienna obsługa', 'co zrobić, gdy jest za zimno, wyjazd, tryb urlopowy'],
  ['Przeglądy i serwis', 'daty, co sprawdzano, filtry do czyszczenia'],
  ['Komunikaty i błędy', 'kody z wyświetlacza i co oznaczają (tylko z instrukcji producenta)'],
  ['Kontakty', 'instalator, serwis, gwarancja, instrukcje (PDF)'],
];
function petleZArkusza() {
  return (kartyCache.petle?.wiersze || []).map(([nr, pokoj, uwagi]) => ({ nr: String(nr || '').trim(), pokoj: String(pokoj || '').trim(), uwagi: String(uwagi || '').trim() }))
    .filter((p) => p.nr);
}
// pomieszczenie wpisane, ale w Uwagach „do potwierdzenia” (np. „raczej sypialnia”) – pokazujemy to, nie udajemy pewności
const petlaNiepewna = (p) => !!p.pokoj && RE_BRAK.test(p.uwagi);
function brakiPetli() {
  if (!kartyCache.petle) return [];
  const petle = petleZArkusza(), bez = petle.filter((p) => !p.pokoj).map((p) => p.nr);
  if (!petle.length) return [{ html: '<b>Rozdzielacz</b> – lista pętli (kurków) i gdzie stoi rozdzielacz.' }];
  const b = bez.length ? [{ html: `<b>Rozdzielacz</b> – które pomieszczenie grzeje kurek ${esc(bez.join(', '))}; gdzie stoi rozdzielacz.` }] : [];
  for (const p of petle.filter(petlaNiepewna)) b.push({ html: `<b>Rozdzielacz, kurek ${esc(p.nr)}</b> (${esc(p.pokoj)}) – ${esc(zdanieBraku(p.uwagi))}` });
  return b;
}
function brakiPompy() {
  if (!stanPompy.wczytano) return [];
  const w = stanPompy.wiersze || [];
  const b = [];
  for (const [temat, tresc] of w) for (const linia of rozbierzKomorke(tresc || '').teksty)
    if (RE_BRAK.test(linia)) b.push({ html: `<b>${esc(temat || 'Pompa ciepła')}</b> – ${esc(zdanieBraku(linia))}` });
  const sa = new Set(w.map((r) => norm(r[0]).trim()));
  for (const [t, o] of TEMATY_POMPY) if (!sa.has(norm(t))) b.push({ html: `<b>Pompa ciepła: ${esc(t)}</b> – ${esc(o)}.` });
  return b;
}
function htmlPetle() {
  const petle = petleZArkusza();
  const wgPokoju = new Map();
  for (const p of petle) if (p.pokoj) { if (!wgPokoju.has(p.pokoj)) wgPokoju.set(p.pokoj, []); wgPokoju.get(p.pokoj).push(p); }
  const opisane = petle.filter((p) => p.pokoj).length, niepewne = petle.filter(petlaNiepewna).length;
  const braki = brakiPetli();
  return `<section class="karta-strony">
    <h3>Rozdzielacz ogrzewania podłogowego – kurki ${plakietkaBrakow(braki)}</h3>
    <p class="male">Każdy kurek to jedna pętla rur w podłodze. Kolejność od lewej, jak na rozdzielaczu.
      ${opisane ? 'Dotknij kurka, żeby zobaczyć rury tego pomieszczenia na modelu.' : ''}${petle.length ? ` Opisane: ${opisane} z ${petle.length}${niepewne ? ` (${niepewne} do potwierdzenia)` : ''}.` : ''}</p>
    ${petle.length ? `<div class="rozdzielacz"><div class="rozdz-belka">${petle.map((p) => p.pokoj
      ? `<a class="kurek" href="#ogrzewanie=${encodeURIComponent(p.pokoj)}" title="${esc(p.uwagi || p.pokoj)}"><b>${esc(p.nr)}</b><span>${esc(p.pokoj)}${petlaNiepewna(p) ? '<em class="wiar wiar-prawd" title="do potwierdzenia">do potw.</em>' : ''}</span></a>`
      : `<div class="kurek pusty" title="pomieszczenie jeszcze nieopisane"><b>${esc(p.nr)}</b><span>nieopisany</span></div>`).join('')}</div></div>` : ''}
    ${wgPokoju.size ? `<div style="margin-top:10px">${[...wgPokoju].map(([pokoj, lp]) => `<div class="wiersz-fakt"><div class="tresc">
      <b>${esc(pokoj)}</b> – ${lp.length > 1 ? 'kurki' : 'kurek'} ${lp.map((p) => esc(p.nr)).join(', ')}${lp.some(petlaNiepewna) ? ' <span class="wiar wiar-prawd">do potwierdzenia</span>' : ''}${lp.filter((p) => p.uwagi).map((p) => `<div class="male">${esc(p.nr)}: ${esc(p.uwagi)}</div>`).join('')}</div>
      <a class="link-model" href="#ogrzewanie=${encodeURIComponent(pokoj)}">pokaż rury</a></div>`).join('')}</div>` : ''}
    <p class="male">Rury na modelu to schemat (jak na zdjęciach z budowy), nie dokładny przebieg. ${chipWiar('niezweryfikowana')}</p>
    ${htmlBraki(braki)}
    ${jakUzupelnic(`Arkusz „MójDomek”, karta <b>Pętle</b>: kolumna Pomieszczenie – nazwa jak w aplikacji (np. Kuchnia, Salon, Biuro - Adam).
      <a href="${linkArkusza(KARTY.petle.gid)}" target="_blank" rel="noopener">Otwórz kartę Pętle</a>.`)}
  </section>`;
}
function rysujPompe() {
  const el = $('#pompa-tresc');
  if (!el) return;
  if (!stanPompy.wczytano && !stanPompy.blad) { el.innerHTML = szkielet(3); return; }
  const w = stanPompy.wiersze || [];
  const karty = w.map(([temat, tresc, link], i) => {
    const k = rozbierzKomorke(link || '');
    const t = rozbierzKomorke(tresc || '');
    const linki = [...t.linki, ...k.linki];
    const tekst = t.teksty.filter((x) => !RE_BRAK.test(x));
    const braki = t.teksty.filter((x) => RE_BRAK.test(x)).map((x) => ({ html: esc(zdanieBraku(x)) }));
    return `<section class="karta-strony" data-zwijana="pompa-${i}"><h3>${esc(temat || '—')} ${plakietkaBrakow(braki)}</h3>
      ${tekst.length ? `<p>${tekst.map(esc).join('<br>')}</p>` : ''}
      ${linki.length ? `<div class="opcje">${linki.map(htmlLink).join('')}</div>` : ''}
      ${braki.map((b) => `<p class="male brak-linia">${b.html.charAt(0).toUpperCase() + b.html.slice(1)}</p>`).join('')}</section>`;
  }).join('');
  const sa = new Set(w.map((r) => norm(r[0]).trim()));
  const brakuje = TEMATY_POMPY.filter(([t]) => !sa.has(norm(t))).map(([t, o]) => ({ html: `<b>${esc(t)}</b> – ${esc(o)}` }));
  el.innerHTML = `${karty}${htmlPetle()}
    <div class="karta-strony">
      <h3>${w.length ? 'Pompa ciepła – co jeszcze opisać' : 'Tu będzie obsługa pompy ciepła'} ${plakietkaBrakow(brakuje)}</h3>
      ${htmlBraki(brakuje)}
      ${stanPompy.blad ? `<p class="uwaga">Nie udało się wczytać arkusza: ${esc(stanPompy.blad)}</p>
        <button type="button" data-ponow="pompa">Spróbuj ponownie</button>` : ''}
      ${jakUzupelnic(`Arkusz „MójDomek”, karta <b>Pompa ciepła</b>: kolumny <b>Temat | Treść | Link</b> – każdy wiersz to osobna karta tutaj.
        Zdania zaczynające się od „DO POTWIERDZENIA” trafiają do listy braków. <a href="${linkArkusza(KARTY.pompa.gid)}" target="_blank" rel="noopener">Otwórz kartę w arkuszu</a>.`)}
    </div>`;
  el.querySelector('[data-ponow="pompa"]')?.addEventListener('click', () => { stanPompy.blad = null; otworzPompe(); });
  zwinDlugie(el);
}

// ====================================================================== sekcja „Instalacje”: Elektryka, Hydraulika, Kanalizacja
const stanInst = { zakladka: czytaj('mojDomek.instalacje.v1', 'elektryka'), szukaj: '', widokSzafy: czytaj('mojDomek.szafa.v1', null), skala: 1 };
async function otworzInstalacje() {
  rysujInstalacje();
  const potrzebne = stanInst.zakladka === 'elektryka' ? ['rozdzielnica'] : stanInst.zakladka === 'hydraulika' ? ['zawory', 'studnia'] : [];
  await Promise.all([...potrzebne.map(kartaDanych), stanMamy.dane ? null : wczytajArkusz()]);
  rysujInstalacje();
}
document.querySelectorAll('[data-inst]').forEach((b) => b.addEventListener('click', () => {
  stanInst.zakladka = b.dataset.inst;
  zapisz('mojDomek.instalacje.v1', stanInst.zakladka);
  otworzInstalacje();
}));
window.addEventListener('mojdomek:dane', () => { if (document.body.dataset.sekcja === 'instalacje') rysujInstalacje(); });

function rysujInstalacje() {
  document.querySelectorAll('[data-inst]').forEach((b) => b.classList.toggle('aktywny', b.dataset.inst === stanInst.zakladka));
  const el = $('#instalacje-tresc');
  if (!el) return;
  el.dataset.inst = stanInst.zakladka;
  el.innerHTML = stanInst.zakladka === 'hydraulika' ? htmlHydraulika() : stanInst.zakladka === 'kanalizacja' ? htmlKanalizacja() : htmlElektryka();
  ustawSkaleSzafy(stanInst.skala || 1);
  zwinDlugie(el);
  const mw = /wyl=([^&]+)/.exec(location.hash);
  if (mw && stanInst.zakladka === 'elektryka' && kartyCache.rozdzielnica) zaznaczWylacznik(decodeURIComponent(mw[1]));
  const s = $('#zawory-szukaj');
  if (s) {
    s.value = stanInst.szukaj;
    s.addEventListener('input', () => { stanInst.szukaj = s.value; $('#zawory-lista').innerHTML = htmlListaZaworow(); });
  }
}

// ---------------------------------------------------------------- Elektryka
const ROZDZIELNICA_ZAKUPY = /rozdzielnic|nadprad|roznicowo|rozlacznik|bezpiecznik|szyna|ogranicznik|uziemiajac/;
function wylZArkusza() {
  return (kartyCache.rozdzielnica?.wiersze || []).map(([nr, opis, zasila, pokoje, punkty, uwagi, wiar]) => ({
    nr: String(nr || '').trim(), opis: String(opis || ''), zasila: String(zasila || ''), pokoje, punkty, uwagi, wiar,
  })).filter((w) => w.nr || w.opis);
}
const nieopisany = (w) => !w.zasila.trim() || /^nieopisany/.test(norm(w.zasila));
// braki liczone z danych arkusza (nie z pamięci): nieopisane wyłączniki, gniazdkowe bez pomieszczeń
function brakiRozdzielnicy() {
  if (!kartyCache.rozdzielnica) return [];
  const wyl = wylZArkusza();
  if (!wyl.length) return [{ html: '<b>Rozdzielnica</b> – opisy wyłączników (ze zdjęcia skrzynki).' }];
  const b = [];
  const nieop = wyl.filter((w) => nieopisany(w) && !/ogranicznik|dehn|roznicow|rozlacznik|glowny/.test(norm(w.opis + ' ' + w.zasila))).map((w) => w.nr);
  if (nieop.length) b.push({ html: `<b>Rozdzielnica</b> – co zasilają nieopisane wyłączniki: ${esc(nieop.join(', '))} (najlepiej ustalić z elektrykiem).` });
  const gn = wyl.filter((w) => /gniazd/.test(norm(w.zasila)) && !String(w.pokoje || '').trim()).map((w) => w.nr);
  if (gn.length) b.push({ html: `<b>Rozdzielnica</b> – które pomieszczenia są na wyłącznikach gniazdek ${esc(gn.join(', '))}.` });
  b.push({ html: '<b>Rozdzielnica</b> – w którym pomieszczeniu wisi szafa.' });
  return b;
}
// złącze kablowo-pomiarowe na zewnątrz (zdjęcia Adama 16.11.2026) – tylko to, co widać na zdjęciach
const BRAKI_ZLACZA = [
  { html: '<b>Złącze</b> – prąd wyłącznika w złączu (napis na dźwigniach, np. C25 / B32).' },
  { html: '<b>Złącze</b> – gdzie dokładnie wisi: odległość od narożnika domu i wysokość dołu skrzynki nad ziemią.' },
  { html: '<b>Złącze</b> – kto ma klucz do skrzynki i czy jest plomba operatora (PGE).' },
];
function htmlZlacza() {
  const el = (tytul, tresc) => `<div class="wiersz-fakt"><div class="tresc"><b>${tytul}</b><div class="male">${tresc}</div></div>${chipWiar('prawdopodobna (ze zdjęcia)')}</div>`;
  return `
    <section class="karta-strony">
      <h3>Złącze z licznikiem (skrzynka na zewnątrz) ${plakietkaBrakow(BRAKI_ZLACZA)}</h3>
      <p class="male">Szara skrzynka na zewnętrznej ścianie domu, przy salonie, obok pomieszczenia gospodarczego.
        Tu prąd z sieci wchodzi do domu. Na drzwiczkach naklejka „PGE 2015” – skrzynka operatora sieci.</p>
      ${el('Zasilanie (lewa góra)', 'Zaciski kabla, który przychodzi z sieci – naklejka „ZASILANIE”, 5 zacisków pod przezroczystą osłoną.')}
      ${el('Odbiór (prawa góra)', 'Zaciski kabla, który idzie dalej do domu – naklejka „ODBIÓR”, 5 zacisków pod osłoną.')}
      ${el('Wyłącznik (lewy dół)', 'Wyłącznik 3-fazowy (3 dźwignie, Eaton) w osobnej białej obudowie. Prąd – do odczytania.')}
      ${el('Licznik prądu (prawy dół)', 'Licznik 3-fazowy GAMA 300 z wyświetlaczem.')}
      <p class="uwaga">Zaciski „Zasilanie” są pod napięciem od strony sieci – nie wyłączysz ich w domu. Osłon nie zdejmować; to część operatora (PGE).</p>
      ${htmlBraki(BRAKI_ZLACZA)}
    </section>`;
}
const BRAKI_PUNKTOW = [
  { html: '<b>Trasy przewodów</b> – ze zdjęć ścian przed tynkiem (folder „Położenie kabli”: kuchnia, salon, sypialnia, biura); będą osobną warstwą modelu.' },
  { html: '<b>Puszki</b> rozgałęźne – gdzie są i co się w nich łączy.' },
  { html: '<b>Włączniki i lampy</b> – który włącznik steruje którą lampą.' },
  { html: '<b>Uziemienie</b> i szyna wyrównawcza – gdzie są.' },
];
const telefon = () => matchMedia('(max-width: 760px)').matches;
function htmlElektryka() {
  const st = window.mojDomek?.stan;
  const A = st?.A;
  const osp = st?.obw?.osprzet;
  const wyl = wylZArkusza();
  stanInst.wyl = wyl;
  const widok = stanInst.widokSzafy || (telefon() ? 'lista' : 'rysunek');
  const braki = brakiRozdzielnicy();
  const przelacznik = `<div class="przelacznik-widoku" role="group" aria-label="Widok rozdzielnicy">
      <button type="button" data-szafa="rysunek" class="${widok === 'rysunek' ? 'aktywny' : ''}" aria-pressed="${widok === 'rysunek'}">Rysunek</button>
      <button type="button" data-szafa="lista" class="${widok === 'lista' ? 'aktywny' : ''}" aria-pressed="${widok === 'lista'}">Lista</button></div>`;
  return `${htmlZlacza()}
    <section class="karta-strony">
      <h3>Rozdzielnica (skrzynka z bezpiecznikami) ${plakietkaBrakow(braki)}</h3>
      ${!kartyCache.rozdzielnica ? szkielet(1, true) : kartyCache.rozdzielnica.blad && !wyl.length ? htmlBladArkusza(kartyCache.rozdzielnica.blad) : wyl.length ? `${przelacznik}
        ${widok === 'lista' ? htmlListaWylacznikow(wyl, A) : `<div class="szafa-zoom">
          <button type="button" data-szafa-zoom="-1" aria-label="Pomniejsz rysunek">−</button>
          <button type="button" data-szafa-zoom="1" aria-label="Powiększ rysunek">+</button>
          <span class="male">albo rozsuń dwoma palcami</span></div>
        ${htmlSzafa(wyl)}
        <div id="szafa-info" class="szafa-info"><p class="male">Dotknij wyłącznika na rysunku, żeby zobaczyć, co o nim wiadomo.</p></div>`}`
      : '<p>Opisów wyłączników jeszcze nie ma.</p>'}
      <details style="margin-top:10px"><summary class="male">Z zakupów – elementy rozdzielnicy</summary>
        ${htmlZakupy(zakupyPasujace(ROZDZIELNICA_ZAKUPY), stanMamy.dane ? 'Brak pasujących zakupów.' : 'Wczytywanie listy zakupów…')}</details>
      <p class="male">Typ i prąd każdego wyłącznika – ze zdjęcia szafy; przeznaczenie – tylko tam, gdzie jest naklejka.</p>
      ${htmlBraki(braki)}
      ${jakUzupelnic(`Arkusz „MójDomek”, karta <b>Rozdzielnica</b>: Nr | Wyłącznik | Co zasila | Pomieszczenia | Punkty | Uwagi | Wiarygodność.
        W kolumnie Punkty – identyfikatory gniazdek z kart punktów (np. kuchnia-Z06), wtedy przycisk „pokaż na modelu” podświetli je w 3D.
        <a href="${linkArkusza(KARTY.rozdzielnica.gid)}" target="_blank" rel="noopener">Otwórz kartę Rozdzielnica</a>.`)}
    </section>
    <section class="karta-strony" data-zwijana="punkty-pokoi">
      <h3>Gniazdka i włączniki w pomieszczeniach ${plakietkaBrakow(BRAKI_PUNKTOW)}</h3>
      ${A ? htmlPunktyPokoi(A) : szkielet(1, true)}
      <p class="male">Położenia części gniazdek pochodzą z rysunku (±10–15 cm). Przed wierceniem sprawdź ścianę wykrywaczem.</p>
      ${htmlBraki(BRAKI_PUNKTOW)}
    </section>
    ${osp ? `<section class="karta-strony"><h3>Osprzęt</h3>
      ${['Z', 'S', 'W'].filter((t) => osp[t]).map((t) => `<div class="wiersz-fakt"><div class="tresc"><div>${esc(TYPY[t].nazwa)} (wewnątrz domu): <b>${esc(osp[t].nazwa)}</b></div>
        ${osp[t].link ? `<div class="opcje">${htmlLink({ url: osp[t].link, opis: '' })}</div>` : ''}</div>${chipWiar('potwierdzona (Adam, 15.11.2026)')}</div>`).join('')}</section>` : ''}`;
}
// rozdzielnica jako lista dużych wierszy: „2.4 · B10 · Ganek”; nieopisane – jedna szara plakietka
function htmlListaWylacznikow(wyl, A) {
  return `<div class="wyl-lista">${wyl.map((w) => {
    const r = rodzajWyl(w);
    const opis = nieopisany(w) ? '' : w.zasila.replace(/\s*\(.*$/, '');
    const id = 'wl-' + w.nr.replace(/\W/g, '-');
    return `<button type="button" class="wyl-wiersz" data-wyl-lista="${esc(w.nr)}" aria-expanded="false" aria-controls="${id}">
        <b>${esc(w.nr)}</b><span class="wyl-typ">${esc(r.skrot && r.skrot !== '?' ? r.skrot : (w.opis || '').split(/\s+/)[0])}</span>
        <span class="wyl-opis">${opis ? esc(opis) : '<span class="wiar wiar-niezw">nieopisany</span>'}</span></button>
      <div class="wyl-szczegoly zawor" id="${id}" hidden>${htmlWylInfo(w, A)}</div>`;
  }).join('')}</div>`;
}
// schemat szafy: rzędy jak na szynach (Nr „rząd.pozycja”), szerokość = liczba biegunów, kolor = rodzaj
const NAZWY_RZEDOW = { 1: 'Rząd górny', 2: 'Rząd środkowy', 3: 'Rząd dolny' };
function rodzajWyl(w) {
  const t = norm(w.opis + ' ' + w.zasila);
  if (/ogranicznik|dehn/.test(t)) return { klasa: 'w-spd', skrot: 'SPD', pod: (/\bl\d\b/.exec(t) || [''])[0].toUpperCase() };
  if (/roznicow|\bi?id\b/.test(t)) return { klasa: 'w-rcd', skrot: '30 mA', pod: 'różnicówka' };
  if (/rozlacznik|glowny/.test(t)) return { klasa: 'w-glowny', skrot: (/(\d+)\s*a\b/.exec(t) || ['', ''])[1] + 'A', pod: 'GŁÓWNY' };
  const prad = /\b([bcd])\s?(\d{1,2})a?\b/.exec(t);
  const pod = /^nieopisany/.test(norm(w.zasila)) ? '?' : w.zasila.replace(/\s*\(.*$/, '').slice(0, 14);
  return { klasa: 'w-mcb', skrot: prad ? (prad[1] + prad[2]).toUpperCase() : '?', pod };
}
function htmlWylInfo(w, A) {
  const ids = String(w.punkty || '').split(/[\s,;]+/).filter(Boolean);
  return `<div class="zawor-gora"><b>${esc([w.nr, w.opis].filter(Boolean).join(' · ') || '—')}</b>${chipWiar(w.wiar)}</div>
    ${w.zasila ? `<div>${esc(w.zasila)}</div>` : ''}
    ${w.pokoje ? `<div class="male">Pomieszczenia: ${esc(w.pokoje)}</div>` : ''}
    ${ids.length ? `<div class="pkt-lista" style="margin-top:6px">${ids.map((id) => htmlPunktId(id, A)).join('')}</div>
      <a class="link-model" href="#punkty=${ids.map(encodeURIComponent).join(',')}">pokaż te punkty na modelu</a>` : ''}
    ${w.uwagi ? `<div class="male">${esc(w.uwagi)}</div>` : ''}
    ${rodzajWyl(w).klasa === 'w-mcb' ? `<a class="link-model" href="#obwod=${encodeURIComponent(w.nr)}">sprawdź w domu, co zasila →</a>` : ''}`;
}

// ---------------------------------------------------------------- rysunek szafy (SVG) z danych arkusza
// Szafa 3×12 modułów (z zakupów: „3x12 36M”); w każdym rzędzie wolne miejsce to zaślepki po lewej – jak u Was.
const MOD = 30, MODULY = 12, MARG = 36, RZAD = 178, GORA = 22;
const naklejka = (w) => {
  const t = norm(w.zasila + ' ' + w.opis);
  if (/ogranicznik|dehn/.test(t)) return null;            // ograniczniki mają opis L1–L3 na obudowie
  if (/roznicow/.test(t)) return 'tarcza';
  if (/glowny/.test(t)) return 'zasilanie';
  if (/ganek/.test(t)) return 'ganek';
  if (/silnik|pomp/.test(t)) return 'silnik';
  if (/oswietl/.test(t)) return 'zarowka';
  if (/gniazd/.test(t)) return 'gniazdko';
  return null;                                             // bez naklejki – jak w rzeczywistości (lista pokazuje „nieopisany”)
};
function svgNaklejka(rodzaj, cx, cy) {
  switch (rodzaj) {
    case 'gniazdko': return `<rect x="${cx - 12}" y="${cy - 12}" width="24" height="24" rx="4" fill="#d9cdc2" stroke="#4d3f33" stroke-width="1.5"/>
      <circle cx="${cx}" cy="${cy}" r="8" fill="#fff" stroke="#4d3f33" stroke-width="1.2"/><circle cx="${cx - 3}" cy="${cy}" r="1.5" fill="#222"/><circle cx="${cx + 3}" cy="${cy}" r="1.5" fill="#222"/>`;
    case 'zarowka': return `<circle cx="${cx}" cy="${cy - 3}" r="8.5" fill="#f2c200" stroke="#7a5c00" stroke-width="1.2"/><rect x="${cx - 4}" y="${cy + 5}" width="8" height="6" rx="1" fill="#666"/>`;
    case 'silnik': return `<rect x="${cx - 12}" y="${cy - 8}" width="19" height="16" rx="2" fill="#2f6fd6" stroke="#173f80"/><rect x="${cx + 7}" y="${cy - 3}" width="6" height="6" fill="#2f6fd6" stroke="#173f80"/>
      <line x1="${cx - 8}" y1="${cy - 4}" x2="${cx + 3}" y2="${cy - 4}" stroke="#cfe0ff"/><line x1="${cx - 8}" y1="${cy}" x2="${cx + 3}" y2="${cy}" stroke="#cfe0ff"/><line x1="${cx - 8}" y1="${cy + 4}" x2="${cx + 3}" y2="${cy + 4}" stroke="#cfe0ff"/>`;
    case 'tarcza': return `<path d="M${cx - 11} ${cy - 12} H${cx + 11} V${cy} Q${cx + 11} ${cy + 9} ${cx} ${cy + 14} Q${cx - 11} ${cy + 9} ${cx - 11} ${cy} Z" fill="#1d2b3a"/>
      <path d="M${cx + 2} ${cy - 9} L${cx - 5} ${cy + 2} H${cx} L${cx - 2} ${cy + 10} L${cx + 6} ${cy - 2} H${cx + 1} Z" fill="#3da5ff"/>`;
    case 'zasilanie': return `<circle cx="${cx}" cy="${cy}" r="12" fill="#d9241c"/><path d="M${cx - 4.5} ${cy - 4} A6.2 6.2 0 1 0 ${cx + 4.5} ${cy - 4}" fill="none" stroke="#fff" stroke-width="2"/>
      <line x1="${cx}" y1="${cy - 8}" x2="${cx}" y2="${cy}" stroke="#fff" stroke-width="2"/>`;
    case 'ganek': return [...'GANEK'].map((l, i) => `<text x="${cx}" y="${cy - 13 + i * 8}" text-anchor="middle" font-size="8.5" font-weight="700" fill="#e0533d">${l}</text>`).join('');
    case 'pytajnik': return `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="12" fill="#b5b0a6">?</text>`;
    default: return '';
  }
}
function svgModul(w, x, y) {
  const rd = rodzajWyl(w);
  const bieg = w.bieguny, szer = bieg * MOD;
  const nr = `<text x="${x + 5}" y="${y + 18}" font-size="7" fill="#8a867e">${esc(w.nr)}</text>`;
  let s = '';
  if (rd.klasa === 'w-spd') {
    s = `<rect x="${x + 1}" y="${y}" width="${szer - 2}" height="92" rx="3" fill="#d8392b" stroke="#a52a1f"/>
      <rect x="${x + 4}" y="${y + 5}" width="${szer - 8}" height="17" rx="2" fill="#fff"/>
      <text x="${x + szer / 2}" y="${y + 17.5}" text-anchor="middle" font-size="10" font-weight="700" fill="#222">${esc(rd.pod || 'SPD')}</text>
      <rect x="${x + 4}" y="${y + 27}" width="${szer - 8}" height="44" rx="2" fill="#fff"/>
      <text x="${x + szer / 2}" y="${y + 40}" text-anchor="middle" font-size="5.5" font-weight="700" fill="#d8392b">DEHN</text>
      <text x="${x + szer / 2}" y="${y + 52}" text-anchor="middle" font-size="5" fill="#333">DG MOD</text>
      <text x="${x + szer / 2}" y="${y + 60}" text-anchor="middle" font-size="5" fill="#333">275</text>
      <rect x="${x + 7}" y="${y + 76}" width="${szer - 14}" height="9" rx="1.5" fill="#3a9a4a"/>`;
  } else {
    const glowny = rd.klasa === 'w-glowny', rcd = rd.klasa === 'w-rcd';
    s = `<rect x="${x + 1}" y="${y}" width="${szer - 2}" height="92" rx="3" fill="${rcd ? '#f4f8f2' : '#fbfbf9'}" stroke="#bdb9b1"/>
      <rect x="${x + 3}" y="${y + 4}" width="${szer - 6}" height="18" rx="1.5" fill="#fff" stroke="#e2e0db"/>
      <rect x="${x + (bieg > 1 ? szer * 0.45 : 14)}" y="${y + 7}" width="${bieg > 1 ? szer * 0.5 : szer - 18}" height="2.5" fill="#2fa34a"/>
      ${nr}
      <rect x="${x + 3}" y="${y + 26}" width="${(rcd ? 1 : bieg) * MOD - 6}" height="7" rx="3.5" fill="${glowny ? '#8f8f8f' : '#1c1c1c'}"/>
      ${Array.from({ length: rcd ? 1 : bieg }, (_, i) => `<rect x="${x + i * MOD + 5}" y="${y + 36}" width="${MOD - 10}" height="30" rx="4" fill="#efeeea" stroke="#d4d1ca"/>
        <rect x="${x + i * MOD + 8}" y="${y + 39}" width="${MOD - 16}" height="12" rx="2" fill="#fff" stroke="#b9b5ad"/>`).join('')}
      ${rcd ? `<rect x="${x + MOD + 6}" y="${y + 30}" width="12" height="8" rx="1.5" fill="#fff" stroke="#999"/><text x="${x + MOD + 12}" y="${y + 36.5}" text-anchor="middle" font-size="6" fill="#555">T</text>
        <text x="${x + MOD + 4}" y="${y + 58}" font-size="7" fill="#3a6e35">różnicowy</text>` : ''}
      ${glowny ? `<text x="${x + szer - 6}" y="${y + 76}" text-anchor="end" font-size="6" fill="#555">SW · I.ON / O.OFF</text>` : ''}
      <text x="${x + 5}" y="${y + 86}" font-size="11" font-weight="700" fill="#222">${esc(rcd ? ((/(\d+)\s*a\b/.exec(norm(w.opis)) || ['', '?'])[1] + 'A') : rd.skrot)}</text>
      ${rcd ? `<text x="${x + 32}" y="${y + 86}" font-size="7" fill="#444">${esc(((/(\d+)\s*ma\b/.exec(norm(w.opis)) || ['', '?'])[1]) + ' mA')}</text>` : ''}`;
  }
  const nk = naklejka(w);
  return `<g class="wyl-svg" data-wyl="${esc(w.nr)}" role="button" tabindex="0" aria-label="${esc(w.nr + ': ' + w.opis + ' – ' + w.zasila)}">
    <title>${esc(w.nr + ' ' + w.opis + ' – ' + w.zasila)}</title>${s}
    ${nk ? svgNaklejka(nk, x + szer / 2, y + 112) : ''}
    <rect class="ramka" x="${x - 1}" y="${y - 3}" width="${szer + 2}" height="134" rx="5" fill="transparent"/></g>`;
}
function htmlSzafa(wyl) {
  const rzedy = new Map();
  for (const w of wyl) {
    const [r, p] = w.nr.split('.').map(Number);
    w.bieguny = Number((/(\d)p\b/.exec(norm(w.opis)) || [0, 1])[1]) || 1;
    w.poz = p || 0;
    if (!rzedy.has(r)) rzedy.set(r, []);
    rzedy.get(r).push(w);
  }
  const numery = [...rzedy.keys()].sort((a, b) => a - b);
  const maxMod = Math.max(MODULY, ...numery.map((r) => rzedy.get(r).reduce((s, w) => s + w.bieguny, 0)));
  const W = maxMod * MOD + 2 * MARG, H = GORA + numery.length * RZAD + 14;
  const panele = numery.map((r, i) => {
    const y0 = GORA + i * RZAD, yM = y0 + 26;
    const lista = rzedy.get(r).sort((a, b) => a.poz - b.poz);
    const zajete = lista.reduce((s, w) => s + w.bieguny, 0);
    let x = MARG + (maxMod - zajete) * MOD;              // zaślepki po lewej
    const zaslepki = maxMod - zajete > 0 ? `<rect x="${MARG}" y="${yM}" width="${(maxMod - zajete) * MOD - 2}" height="92" rx="3" fill="#f4f3ef" stroke="#d8d5ce"/>
      ${Array.from({ length: (maxMod - zajete) * 2 - 1 }, (_, k) => `<line x1="${MARG + (k + 1) * MOD / 2}" y1="${yM + 6}" x2="${MARG + (k + 1) * MOD / 2}" y2="${yM + 86}" stroke="#e2dfd8"/>`).join('')}` : '';
    const moduly = lista.map((w) => { const g = svgModul(w, x, yM); x += w.bieguny * MOD; return g; }).join('');
    const sruby = [[16, y0 + 18], [W - 16, y0 + 18], [16, y0 + RZAD - 22], [W - 16, y0 + RZAD - 22]]
      .map(([sx, sy]) => `<circle cx="${sx}" cy="${sy}" r="4.5" fill="#d7d9dc" stroke="#9aa0a6"/><line x1="${sx - 3}" y1="${sy}" x2="${sx + 3}" y2="${sy}" stroke="#7d848b"/>`).join('');
    return `<rect x="8" y="${y0}" width="${W - 16}" height="${RZAD - 6}" rx="4" fill="#f1f0ec" stroke="#d6d3cc"/>
      <rect x="${MARG - 6}" y="${yM - 6}" width="${maxMod * MOD + 12}" height="104" rx="3" fill="#dcd9d2"/>
      ${sruby}${zaslepki}${moduly}`;
  }).join('');
  return `<div class="szafa-rys"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Rysunek szafy z bezpiecznikami"
    font-family="system-ui, Segoe UI, Arial, sans-serif">
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="10" fill="#fafaf8" stroke="#c4c1ba" stroke-width="2"/>
    ${panele}</svg></div>`;
}
function pokazWyl(nr) {
  const w = (stanInst.wyl || []).find((q) => q.nr === nr);
  const info = document.getElementById('szafa-info');
  if (!w || !info) return;
  document.querySelectorAll('.wyl-svg.wybrany').forEach((g) => g.classList.remove('wybrany'));
  const g = document.querySelector(`.wyl-svg[data-wyl="${CSS.escape(nr)}"]`);
  g?.classList.add('wybrany');
  g?.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const lista = stanInst.wyl, i = lista.indexOf(w);
  info.innerHTML = `<div class="szafa-nawig">
      <button type="button" data-wyl-krok="${esc(lista[i - 1]?.nr || '')}" ${i > 0 ? '' : 'disabled'} aria-label="Poprzedni wyłącznik">◀</button>
      <span class="male">${i + 1} z ${lista.length}</span>
      <button type="button" data-wyl-krok="${esc(lista[i + 1]?.nr || '')}" ${i < lista.length - 1 ? '' : 'disabled'} aria-label="Następny wyłącznik">▶</button>
    </div><div class="zawor">${htmlWylInfo(w, window.mojDomek?.stan?.A)}</div>`;
}
document.addEventListener('click', (e) => {          // rozdzielnica: rysunek/lista, powiększanie, wiersze listy
  const sz = e.target.closest?.('[data-szafa]');
  if (sz) { stanInst.widokSzafy = sz.dataset.szafa; zapisz('mojDomek.szafa.v1', stanInst.widokSzafy); rysujInstalacje(); return; }
  const zm = e.target.closest?.('[data-szafa-zoom]');
  if (zm) { ustawSkaleSzafy((stanInst.skala || 1) * (zm.dataset.szafaZoom > 0 ? 1.4 : 1 / 1.4)); return; }
  const wl = e.target.closest?.('[data-wyl-lista]');
  if (wl) {
    const d = document.getElementById(wl.getAttribute('aria-controls'));
    const otw = wl.getAttribute('aria-expanded') !== 'true';
    wl.setAttribute('aria-expanded', String(otw));
    if (d) d.hidden = !otw;
  }
});
function zaznaczWylacznik(nr) {
  const w = document.querySelector(`.wyl-wiersz[data-wyl-lista="${CSS.escape(nr)}"]`);
  if (w) {
    if (w.getAttribute('aria-expanded') !== 'true') w.click();
    w.scrollIntoView({ block: 'center' });
    return;
  }
  if (document.querySelector(`.wyl-svg[data-wyl="${CSS.escape(nr)}"]`)) { pokazWyl(nr); document.getElementById('szafa-info')?.scrollIntoView({ block: 'center' }); }
}
function ustawSkaleSzafy(s) {
  stanInst.skala = Math.max(1, Math.min(3.5, s));
  const r = document.querySelector('.szafa-rys');
  if (r) r.style.setProperty('--skala', stanInst.skala);
}
// rozsuwanie dwoma palcami na rysunku szafy (zamiast przewijania w bok)
{
  const palce = new Map();
  let start = null;
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest?.('.szafa-rys') || e.pointerType !== 'touch') return;
    palce.set(e.pointerId, e);
    if (palce.size === 2) { const [a, b] = [...palce.values()]; start = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), s: stanInst.skala || 1 }; }
  });
  document.addEventListener('pointermove', (e) => {
    if (!palce.has(e.pointerId)) return;
    palce.set(e.pointerId, e);
    if (palce.size === 2 && start) { const [a, b] = [...palce.values()]; ustawSkaleSzafy(start.s * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / start.d); }
  });
  const koniec = (e) => { palce.delete(e.pointerId); if (palce.size < 2) start = null; };
  document.addEventListener('pointerup', koniec);
  document.addEventListener('pointercancel', koniec);
}
document.addEventListener('click', (e) => {          // dotknięcie wyłącznika na rysunku -> jego opis pod rysunkiem
  const g = e.target.closest?.('.wyl-svg');
  if (g) { pokazWyl(g.dataset.wyl); return; }
  const k = e.target.closest?.('[data-wyl-krok]');
  if (k && k.dataset.wylKrok) pokazWyl(k.dataset.wylKrok);
});
document.addEventListener('keydown', (e) => {
  const g = e.target.closest?.('.wyl-svg');
  if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pokazWyl(g.dataset.wyl); }
});

function htmlPunktId(id, A) {
  const p = A?.items.find((q) => q.id === id);
  const T = p ? TYPY[p.typ] : null;
  return `<a class="pkt" href="#punkt=${encodeURIComponent(id)}">${T ? `<img class="ik" src="${ikonaTypu(p.typ, p.wiar)}" alt="${esc(T.nazwa)}">` : '<i>?</i>'}${esc(id)}</a>`;
}
function htmlPunktyPokoi(A) {
  const grupy = new Map();
  for (const p of A.items) {
    const k = p.naZewnatrz ? 'Na zewnątrz' : (p.pokoj?.nazwa || '—');
    if (!grupy.has(k)) grupy.set(k, []);
    grupy.get(k).push(p);
  }
  const kolej = [...A.rooms.map((r) => r.nazwa).filter((n) => grupy.has(n)), ...[...grupy.keys()].filter((n) => !A.rooms.some((r) => r.nazwa === n))];
  return kolej.map((nazwa) => {
    const l = grupy.get(nazwa).sort((a, b) => KOLEJNOSC_TYPOW.indexOf(a.typ) - KOLEJNOSC_TYPOW.indexOf(b.typ) || a.id.localeCompare(b.id));
    const ile = KOLEJNOSC_TYPOW.map((t) => [t, l.filter((p) => p.typ === t).reduce((s, p) => s + p.n, 0)]).filter(([, n]) => n)
      .map(([t, n]) => `${n}× ${TYPY[t].nazwa.toLowerCase()}`).join(', ');
    return `<div class="pokoj-punkty"><h4><span>${esc(nazwa)} <span class="male">${esc(ile)}</span></span>${nazwa !== 'Na zewnątrz' ? linkPokoju(nazwa) : ''}</h4>
      <div class="pkt-lista">${l.map((p) => `<a class="pkt" href="#punkt=${encodeURIComponent(p.id)}" title="${esc(TYPY[p.typ].nazwa)}, ${Math.round(p.z)} cm"><img class="ik" src="${ikonaTypu(p.typ, p.wiar)}" alt="">${esc(p.id.replace(/^.*-/, ''))} · ${Math.round(p.z)} cm</a>`).join('')}</div></div>`;
  }).join('');
}

// ---------------------------------------------------------------- Hydraulika
const STUDNIA_ZAKUPY = /studni|hydrofor|rura wod|filtr wod|zawor/;
const PEX_ZAKUPY = /pex|trojnik|kolank/;          // woda albo podłogówka – nie wiadomo, więc osobno
const BRAKI_STUDNI = [
  { html: '<b>Pompa w studni</b> – model (zdjęcie tabliczki znamionowej).' },
  { html: '<b>Hydrofor</b> – stoi w komorze studni; zdjęcie tabliczki (pojemność, ciśnienie) i zmierzyć średnicę i wysokość zbiornika.' },
  { html: '<b>Filtry wody</b> – rodzaj i gdzie są.' },
  { html: '<b>Rura ze studni</b> – którędy wchodzi do domu i gdzie jest główny zawór wody.' },
  { html: '<b>Zasilanie pompy</b> – który bezpiecznik w rozdzielnicy (2.11 ma naklejkę „silnik” – do potwierdzenia).' },
  { html: '<b>Położenie studni</b> – 430 cm od frontu wiatrołapu jest; zmierzyć jeszcze przesunięcie w bok od narożnika wiatrołapu i głębokość komory.' },
  { html: '<b>Właz i rura na studni</b> – w którym narożniku jest właz (dziś przyjęty dalej od domu, od zachodu).' },
];
function brakiZaworow() {
  return kartyCache.zawory && !(kartyCache.zawory.wiersze || []).length
    ? [{ html: '<b>Zawory</b> – kurki w pomieszczeniu gospodarczym, łazience i kuchni: gdzie są i co odcinają (najlepiej ze zdjęciem).' }] : [];
}
function htmlHydraulika() {
  const st = kartyCache.studnia?.wiersze || [];
  const fakty = st.map(([temat, tresc, wiar, link]) => {
    const l = rozbierzKomorke(link || '').linki;
    return `<div class="wiersz-fakt"><div class="tresc"><b>${esc(temat || '—')}</b><div>${esc(tresc || '')}</div>${zrodloWiar(wiar)}
      ${l.length ? `<div class="opcje">${l.map(htmlLink).join('')}</div>` : ''}</div>${chipWiar(wiar)}</div>`;
  }).join('');
  const bz = brakiZaworow();
  return `
    <section class="karta-strony" data-zwijana="studnia">
      <h3>Studnia i zasilanie domu w wodę ${plakietkaBrakow(BRAKI_STUDNI)}</h3>
      ${!kartyCache.studnia ? szkielet(2, true) : kartyCache.studnia.blad && !fakty ? htmlBladArkusza(kartyCache.studnia.blad) : fakty || '<p class="male">Brak wpisów.</p>'}
      <h4 style="margin:12px 0 4px">Z zakupów – prawdopodobnie studnia i instalacja wodna</h4>
      ${htmlZakupy(zakupyPasujace(STUDNIA_ZAKUPY), stanMamy.dane ? 'Brak pasujących zakupów.' : 'Wczytywanie listy zakupów…')}
      ${zakupyPasujace(PEX_ZAKUPY).length ? `<details style="margin-top:8px"><summary class="male">Rury i złączki PEX z zakupów (${zakupyPasujace(PEX_ZAKUPY).length}) – woda albo ogrzewanie, do ustalenia</summary>
        ${htmlZakupy(zakupyPasujace(PEX_ZAKUPY), '')}</details>` : ''}
      <p class="male">„Co zrobić, gdy nie ma wody” – dopiero po poznaniu modelu pompy i układu (z instrukcji producenta), żeby nie zgadywać.</p>
      ${htmlBraki(BRAKI_STUDNI)}
      ${jakUzupelnic(`Arkusz „MójDomek”, karta <b>Studnia</b>: Temat | Treść | Wiarygodność | Link.
        <a href="${linkArkusza(KARTY.studnia.gid)}" target="_blank" rel="noopener">Otwórz kartę Studnia</a>.`)}
    </section>
    <section class="karta-strony">
      <h3>Zawory (kurki) wody ${plakietkaBrakow(bz)}</h3>
      <input id="zawory-szukaj" type="search" placeholder="Szukaj zaworu, np. pralka, zlew, główny…" autocomplete="off" class="pole-szukaj" aria-label="Szukaj zaworu">
      <div id="zawory-lista">${htmlListaZaworow()}</div>
      ${htmlBraki(bz)}
    </section>
    <section class="karta-strony">
      <h3>Rury zimnej i ciepłej wody</h3>
      <p class="male">Na modelu pojawią się jako warstwy (zimna – niebieska, ciepła – czerwona) po opisaniu zaworów i przypisaniu zdjęć ścian
        (np. „Kuchnia” i „Hydraulika – łazienka” z budowy). Do tego czasu nie rysuję tras, żeby nie wprowadzać w błąd.</p>
    </section>`;
}
function htmlListaZaworow() {
  const w = kartyCache.zawory?.wiersze || [];
  const q = norm(stanInst.szukaj).trim();
  const zawory = w.map(([id, pokoj, gdzie, co, rodzaj, wiar, uwagi]) => ({ id, pokoj, gdzie, co, rodzaj, wiar, uwagi }))
    .filter((z) => !q || norm(Object.values(z).join(' ')).includes(q));
  if (!w.length) {
    if (!kartyCache.zawory) return szkielet(1, true);
    return `<p>Jeszcze żaden zawór nie jest opisany.</p>
      ${kartyCache.zawory?.blad ? htmlBladArkusza(kartyCache.zawory.blad) : ''}
      ${jakUzupelnic(`Arkusz „MójDomek”, karta <b>Zawory</b>: ID | Pomieszczenie | Gdzie dokładnie | Co odcina | Rodzaj | Wiarygodność | Uwagi – najlepiej od razu ze zdjęciem.
        Gdzie zwykle bywają zawory (sprawdź, które są u Was): pomieszczenie gospodarcze – zawór główny (wejście wody ze studni), przy hydroforze i filtrach,
        przy zasobniku ciepłej wody; łazienka – pod umywalką, przy stelażu WC, przy baterii wannowej, przy pralce; kuchnia – pod zlewem, zasilanie zmywarki.
        <a href="${linkArkusza(KARTY.zawory.gid)}" target="_blank" rel="noopener">Otwórz kartę Zawory</a>.`)}`;
  }
  if (!zawory.length) return '<p class="pusto">Nic nie pasuje.</p>';
  return zawory.map((z) => `<div class="zawor"><div class="zawor-gora"><b>${esc(z.id || 'zawór')}</b>${chipWiar(z.wiar)}</div>
    <div><b>${esc(z.co || 'co odcina – do uzupełnienia')}</b></div>
    <div class="male">${esc([z.pokoj, z.gdzie, z.rodzaj].filter(Boolean).join(' · '))} ${z.pokoj ? ' · ' + linkPokoju(z.pokoj) : ''}</div>
    ${z.uwagi ? `<div class="male">${esc(z.uwagi)}</div>` : ''}${zrodloWiar(z.wiar)}</div>`).join('')
    + jakUzupelnic(`<a href="${linkArkusza(KARTY.zawory.gid)}" target="_blank" rel="noopener">Otwórz kartę Zawory</a> w arkuszu „MójDomek”.`);
}

// ---------------------------------------------------------------- Kanalizacja
const BRAKI_KANALIZACJI = [
  { html: '<b>Odpływy</b> – zlew, zmywarka, umywalka, wanna, WC, pralka: gdzie wchodzą w ścianę lub podłogę.' },
  { html: '<b>Piony i rewizje</b> (otwory kontrolne) – gdzie są i jak się do nich dostać.' },
  { html: '<b>Oczyszczalnia (szambo)</b> – prawdopodobnie Idmar 2000 l (Adam: „chyba ta”): potwierdzić model z faktury lub tabliczki; dokładne miejsce przy narożniku od strony Kuchni.' },
  { html: '<b>Rury od oczyszczalni</b> – 2 nitki po ok. 18 m, 1 m od siebie (Adam); głębokość wykopu (metr albo głębiej – sprawdzić w notatkach), średnica rur; skąd do oczyszczalni wchodzi rura z domu.' },
];
function htmlKanalizacja() {
  return `<section class="karta-strony">
    <h3>Kanalizacja ${plakietkaBrakow(BRAKI_KANALIZACJI)}</h3>
    <p>Jeszcze nieudokumentowana. Najcenniejsze są zdjęcia sprzed zabudowy – na zdjęciach z budowy widać szare rury w kuchni i łazience.</p>
    <p class="male">Na modelu kanalizacja będzie szarą warstwą. Nic nie rysuję bez danych.</p>
    ${htmlBraki(BRAKI_KANALIZACJI)}
  </section>`;
}

// ====================================================================== strona „Do uzupełnienia” – wszystkie braki domu w jednym miejscu
const DZIALY_BRAKOW = [
  ['Elektryka', '#elektryka', () => [...BRAKI_ZLACZA, ...brakiRozdzielnicy(), ...BRAKI_PUNKTOW]],
  ['Ogrzewanie', '#ogrzewanie', () => [...brakiPetli(), ...brakiPompy()]],
  ['Hydraulika', '#hydraulika', () => [...BRAKI_STUDNI, ...brakiZaworow()]],
  ['Kanalizacja', '#kanalizacja', () => BRAKI_KANALIZACJI],
];
async function wczytajDoBrakow() {
  const p = [];
  for (const k of ['rozdzielnica', 'petle', 'zawory', 'studnia']) if (!kartyCache[k]) p.push(kartaDanych(k));
  if (!stanPompy.wczytano) p.push(otworzPompeCicho());
  await Promise.all(p);
}
async function otworzPompeCicho() {
  const r = await kartaDanych('pompa');
  stanPompy.wiersze = r.brak ? null : r.wiersze; stanPompy.blad = r.blad; stanPompy.wczytano = true;
}
// liczba braków (ekran startowy) – po wczytaniu kart arkusza
export async function liczbaBrakow() {
  await wczytajDoBrakow();
  return DZIALY_BRAKOW.reduce((s, [, , f]) => s + f().length, 0);
}
async function otworzBraki() {
  const el = $('#braki-tresc');
  if (!el) return;
  if (!kartyCache.rozdzielnica) el.innerHTML = szkielet(3);
  await wczytajDoBrakow();
  el.innerHTML = `<p class="male">Lista z danych aplikacji i arkusza „MójDomek”. Przyda się do planowania pomiarów i zdjęć.</p>`
    + DZIALY_BRAKOW.map(([nazwa, hash, f]) => {
      const l = f();
      return `<section class="karta-strony"><h3>${esc(nazwa)} ${plakietkaBrakow(l)}</h3>
        ${l.length ? `<ul class="checklista">${l.map((b) => `<li>${b.html}</li>`).join('')}</ul>` : '<p class="male">Nic nie brakuje.</p>'}
        <a class="link-model" href="${hash}">Przejdź do działu ${esc(nazwa)} →</a></section>`;
    }).join('');
}

// błąd wczytania karty arkusza: co się stało i przycisk ponownej próby (plan GUI, pkt 12)
const htmlBladArkusza = (blad) => `<p class="uwaga">Nie udało się wczytać arkusza „MójDomek” (${esc(blad)}). Sprawdź internet.</p>
  <button type="button" data-ponow-sekcje>Spróbuj ponownie</button>`;
document.addEventListener('click', (e) => { if (e.target.closest?.('[data-ponow-sekcje]')) pokazSekcje(); });

// szare „szkielety” kart zamiast napisu „Wczytywanie…” (plan GUI, pkt 12)
function szkielet(n = 2, wTresci = false) {
  const k = Array.from({ length: n }, () => '<div class="szkielet-linia"></div><div class="szkielet-linia krotka"></div>').join('')
    + '<div class="szkielet-dlugo">Wczytywanie trwa dłużej niż zwykle – sprawdź internet. <button type="button" data-ponow-sekcje>Spróbuj ponownie</button></div>';
  return wTresci ? `<div class="szkielet" aria-label="Wczytywanie">${k}</div>`
    : Array.from({ length: n }, () => `<div class="karta-strony szkielet" aria-label="Wczytywanie"><div class="szkielet-linia tytul"></div>${k}</div>`).join('');
}

// ====================================================================== ekran startowy (plan GUI, pkt 9)
// Kafelki prowadzą tylko do istniejących kart (bez własnych procedur awaryjnych – te dopiero z instrukcji producentów).
async function otworzStart() {
  const p = podsumowanie();
  const stanEl = $('#start-stan');
  if (stanEl) stanEl.textContent = p.tekst;
  rysujZmiany();
  const n = $('#start-braki');
  if (n && !n.textContent) {
    try { const ile = await liczbaBrakow(); n.textContent = `(${ile})`; } catch { /* bez liczby */ }
  }
}
// ostatnio zmienione elementy wspólnej bazy (tylko po zalogowaniu; odczyt, bez zapisu)
function rysujZmiany() {
  const el = $('#start-zmiany-lista');
  const b = stanBazy();
  if (!el || !b.elementy) return;
  const lista = [...b.elementy.values()].filter((e) => e.zmieniono?.toDate)
    .sort((x, y) => y.zmieniono.toMillis() - x.zmieniono.toMillis()).slice(0, 5);
  el.innerHTML = lista.length ? `<ul>${lista.map((e) => `<li>${e.kategoria === 'zadanie' ? `<a href="#plan">plan: ${esc(e.tytul || e.id)}</a>`
    : `<a href="#punkt=${encodeURIComponent(e.id)}">${esc(e.id)}</a>`}
    – ${esc(e.zmienilNazwa || '')}, ${e.zmieniono.toDate().toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${e.usuniety ? ' (usunięty)' : ''}</li>`).join('')}</ul>`
    : 'Brak zmian w bazie.';
}
window.addEventListener('mojdomek:baza', () => { if (document.body.dataset.sekcja === 'start') rysujZmiany(); });
window.addEventListener('mojdomek:status', () => { if (document.body.dataset.sekcja === 'start') { const s = $('#start-stan'); if (s) s.textContent = podsumowanie().tekst; } });

// ====================================================================== sekcja „Awaria” – gdzie co jest i co wyłącza
// Tylko fakty z arkusza „MójDomek”, ze zdjęć i z modelu – bez instrukcji naprawy (te dopiero z instrukcji producentów).
// Czego nie wiemy, jest oznaczone „do uzupełnienia”. Miejsca na zewnątrz: przycisk „pokaż na modelu” (#miejsce=…).
async function otworzAwarie() {
  rysujAwarie();
  const brak = ['rozdzielnica', 'zawory', 'studnia', 'pompa'].filter((k) => !kartyCache[k]);
  if (brak.length) {
    await Promise.all(brak.map((k) => kartaDanych(k)));
    if (kartyCache.pompa && !stanPompy.wczytano) { stanPompy.wiersze = kartyCache.pompa.brak ? null : kartyCache.pompa.wiersze; stanPompy.wczytano = true; }
  }
  rysujAwarie();
}
window.addEventListener('mojdomek:dane', () => { if (document.body.dataset.sekcja === 'awaria') rysujAwarie(); });
const urzadzeniaModelu = () => window.mojDomek?.stan?.Mplik?.urzadzenia || window.mojDomek?.stan?.M?.urzadzenia || [];
const naModelu = (prefiks) => urzadzeniaModelu().some((f) => norm(f.nazwa || '').startsWith(norm(prefiks)));
const linkMiejsca = (prefiks) => (naModelu(prefiks)
  ? `<a class="link-model" href="#miejsce=${encodeURIComponent(prefiks)}">pokaż na modelu</a>` : '');
const doUzup = (t) => `<span class="do-uzup">do uzupełnienia</span> ${esc(t)}`;
const wierszAw = (tytul, tresc, prawa = '') => `<div class="wiersz-fakt"><div class="tresc"><b>${tytul}</b><div>${tresc}</div></div>${prawa}</div>`;
function rysujAwarie() {
  const el = $('#awaria-tresc');
  if (!el) return;
  const wczytane = !!kartyCache.rozdzielnica;
  const wyl = wylZArkusza();
  const rodzaj = (w) => rodzajWyl(w).klasa;
  const wylLink = (w) => `<a href="#wyl=${encodeURIComponent(w.nr)}">${esc(w.nr)}</a>`;
  const tekstWyl = (w) => norm([w.opis, w.zasila, w.uwagi].join(' '));
  const glowne = wyl.filter((w) => rodzaj(w) === 'w-glowny');
  const rcd = wyl.filter((w) => rodzaj(w) === 'w-rcd');
  const zwykle = wyl.filter((w) => rodzaj(w) === 'w-mcb');
  const opisane = zwykle.filter((w) => !nieopisany(w)), nieop = zwykle.filter(nieopisany);
  const pompaWody = zwykle.filter((w) => /silnik|studni|hydrofor|pompa wod|pompka/.test(tekstWyl(w)));
  const pompaCiepla = zwykle.filter((w) => /pompa ciepla|immergas|\bpc\b/.test(tekstWyl(w)));
  const zawory = (kartyCache.zawory?.wiersze || []).map(([id, pokoj, gdzie, co, rodz, wiar, uwagi]) => ({ id, pokoj, gdzie, co, rodz, wiar, uwagi }))
    .filter((z) => z.id || z.co || z.gdzie);
  const zawGlowne = zawory.filter((z) => /glown/.test(norm([z.id, z.co, z.gdzie, z.rodz, z.uwagi].join(' '))));
  const kontakty = (stanPompy.wiersze || []).filter(([t]) => /kontakt|serwis|instalator/.test(norm(t)));
  const czeka = (html) => (wczytane ? html : '<span class="male">Wczytywanie z arkusza…</span>');
  const wylLista = (lista, pusto) => (lista.length ? lista.map((w) => `${wylLink(w)} <span class="male">${esc(rodzajWyl(w).skrot)}</span> – ${esc(w.zasila || w.opis)}${w.uwagi ? ` <span class="male">(${esc(w.uwagi)})</span>` : ''}`).join('<br>') : pusto);

  el.innerHTML = `
    <section class="karta-strony awaria-tel">
      <p class="male">Gdzie co jest i co wyłącza. Instrukcji naprawy tu nie ma – tylko to, co sprawdzone w domu (arkusz, zdjęcia, model).</p>
      <div class="awaria-telefony">
        <a class="tel" href="tel:112"><b>112</b><span>numer alarmowy</span></a>
        <a class="tel" href="tel:991"><b>991</b><span>pogotowie energetyczne</span></a>
      </div>
      ${kontakty.length ? `<div class="male">Z karty „Pompa ciepła”: ${kontakty.map(([t, tr]) => `<b>${esc(t)}</b>: ${esc(tr)}`).join(' · ')}</div>` : ''}
    </section>

    <section class="karta-strony" id="aw-prad">
      <h3>⚡ Prąd</h3>
      ${wierszAw('Złącze z licznikiem – na zewnątrz', `Szara skrzynka na ścianie salonu od strony tarasu, obok pomieszczenia gospodarczego.
        W środku wyłącznik 3-fazowy (przed licznikiem – prawdopodobnie odcina cały dom). ${chipWiar('prawdopodobna (ze zdjęcia)')}
        <br>${doUzup('prąd tego wyłącznika i dokładne miejsce skrzynki')}`, linkMiejsca('Złącze'))}
      ${wierszAw('Rozdzielnica (szafa z bezpiecznikami) – w domu', czeka(`${doUzup('w którym pomieszczeniu wisi szafa')}
        ${glowne.length ? `<br>Wyłącznik główny w szafie: ${wylLista(glowne, '')}` : ''}
        ${rcd.length ? `<br>Różnicówka: ${wylLista(rcd, '')}` : ''}`), '<a class="link-model" href="#elektryka">rozdzielnica</a>')}
      ${wierszAw(`Bezpieczniki – co zasilają${wczytane ? ` (${opisane.length} opisanych)` : ''}`, czeka(wylLista(opisane, 'Brak opisanych wyłączników.')
        + (nieop.length ? `<br>${doUzup(`co zasilają: ${nieop.map((w) => w.nr).join(', ')}`)}` : '')))}
    </section>

    <section class="karta-strony" id="aw-woda">
      <h3>💧 Woda</h3>
      ${wierszAw('Studnia (hydrofor i pompka w środku)', `Przed wiatrołapem, ok. 4,3 m od frontu, pod przykryciem (kraty, folia).
        Obudowa z bloczków, w środku niebieski zbiornik hydroforu i pompka. ${chipWiar('prawdopodobna')}`, linkMiejsca('Studnia'))}
      ${wierszAw('Zasilanie pompy wody', czeka(pompaWody.length ? wylLista(pompaWody, '') + ` ${chipWiar('prawdopodobna (do potwierdzenia)')}` : doUzup('który bezpiecznik zasila pompę w studni')))}
      ${wierszAw('Zawór główny wody', czeka(zawGlowne.length
        ? zawGlowne.map((z) => `<b>${esc(z.id)}</b> – ${esc([z.pokoj, z.gdzie].filter(Boolean).join(', '))}${z.co ? ` · zamyka: ${esc(z.co)}` : ''} ${chipWiar(z.wiar)}`).join('<br>')
        : doUzup('gdzie jest zawór główny (wejście wody ze studni)')),
        `<a class="link-model" href="#hydraulika">zawory${zawory.length ? ` (${zawory.length})` : ''}</a>`)}
    </section>

    <section class="karta-strony" id="aw-cieplo">
      <h3>🔥 Ogrzewanie</h3>
      ${wierszAw('Pompa ciepła – jednostka zewnętrzna', `Immergas, na betonowej płycie przy ścianie od strony pomieszczenia gospodarczego. ${chipWiar('prawdopodobna')}`, linkMiejsca('Pompa ciepła'))}
      ${wierszAw('Zasilanie pompy ciepła', czeka(pompaCiepla.length ? wylLista(pompaCiepla, '') : doUzup('który bezpiecznik zasila pompę ciepła')))}
      ${wierszAw('Rozdzielacz ogrzewania podłogowego', `9 kurków – każdy to pętla rur jednego pomieszczenia. ${doUzup('gdzie stoi rozdzielacz')}`, '<a class="link-model" href="#ogrzewanie">kurki</a>')}
    </section>

    <section class="karta-strony" id="aw-scieki">
      <h3>🚽 Ścieki</h3>
      ${wierszAw('Oczyszczalnia ścieków', `Przy narożniku domu od strony kuchni: dwa włazy w ramce z kostki (duży od strony domu, mały od strony rur).
        Prawdopodobnie Idmar 2000 l. ${chipWiar('prawdopodobna')}`, linkMiejsca('Szambo'))}
    </section>`;
}

// ====================================================================== wyszukiwarka (plan GUI, pkt 10)
// Szuka w pomieszczeniach, punktach (po ID i opisie), wyłącznikach, kurkach, zaworach, wyposażeniu i zakupach.
const KLUCZ_SZUKANYCH = 'mojDomek.szukane.v1';
// jeden zestaw ikon w całej aplikacji – te same rysunki co w menu (plan GUI, pkt 15)
const IKONY_SVG = {
  dom: '<path d="M3 11 12 4l9 7v9h-6v-6H9v6H3z"/>',
  prad: '<path d="M13 2 5 14h6l-1 8 8-12h-6z"/>',
  ogien: '<path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 3 3 5 1-2 0-6 0-9z"/>',
  kropla: '<path d="M12 3c3 4.5 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 3-6.5 6-11z"/>',
  lista: '<path d="M4 6h16M4 12h16M4 18h10" fill="none" stroke-width="2.4" stroke-linecap="round"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
};
const svgIkona = (k) => `<svg class="ik-zast" viewBox="0 0 24 24" aria-hidden="true">${IKONY_SVG[k] || IKONY_SVG.dom}</svg>`;
const szukajPanel = $('#szukaj'), szukajPole = $('#szukaj-pole'), szukajWyniki = $('#szukaj-wyniki');
let indeks = [], wynikiTeraz = [], wczytujeIndeks = false;
const enc = encodeURIComponent;
function zbudujIndeks() {
  const A = window.mojDomek?.stan?.A;
  const w = [];
  if (A) {
    for (const r of A.rooms) w.push({ rodzaj: 'Pomieszczenie', ik: 'dom', tytul: r.nazwa, opis: `sufit ${String(r.sufit).replace('.', ',')} cm`, hash: '#pokoj=' + enc(r.nazwa), szukaj: r.nazwa + ' pokój pomieszczenie' });
    for (const p of A.items) {
      const T = TYPY[p.typ] || { nazwa: p.typ };
      const pok = p.naZewnatrz ? 'na zewnątrz' : (p.pokoj?.nazwa || '');
      w.push({ rodzaj: T.nazwa, ikona: ikonaTypu(p.typ, p.wiar), tytul: p.id, opis: [T.nazwa, pok, p.opisDanych].filter(Boolean).join(' · '),
        hash: '#punkt=' + enc(p.id), szukaj: [p.id, T.nazwa, pok, p.opisDanych, p.opisAuto].join(' ') });
    }
  }
  for (const x of wylZArkusza()) {
    const ids = String(x.punkty || '').split(/[\s,;]+/).filter(Boolean);
    w.push({ rodzaj: 'Wyłącznik', ik: 'prad', tytul: `${x.nr} · ${rodzajWyl(x).skrot}`, opis: nieopisany(x) ? 'nieopisany' : x.zasila,
      hash: '#wyl=' + enc(x.nr), naModelu: ids.length ? '#punkty=' + ids.map(enc).join(',') : null,
      szukaj: [x.nr, x.opis, x.zasila, x.pokoje, 'wyłącznik bezpiecznik rozdzielnica'].join(' ') });
  }
  for (const p of petleZArkusza()) w.push({ rodzaj: 'Kurek ogrzewania', ik: 'ogien', tytul: `Kurek ${p.nr}`, opis: p.pokoj ? p.pokoj + (petlaNiepewna(p) ? ' (do potwierdzenia)' : '') : 'nieopisany',
    hash: '#ogrzewanie', naModelu: p.pokoj ? '#ogrzewanie=' + enc(p.pokoj) : null, szukaj: ['kurek pętla ogrzewanie rozdzielacz', p.nr, p.pokoj, p.uwagi].join(' ') });
  for (const z of kartyCache.zawory?.wiersze || []) w.push({ rodzaj: 'Zawór', ik: 'kropla', tytul: String(z[0] || 'zawór'), opis: [z[3], z[1]].filter(Boolean).join(' · '),
    hash: '#hydraulika', naModelu: z[1] ? '#pokoj=' + enc(z[1]) : null, szukaj: ['zawór kurek woda', ...z].join(' ') });
  const d = stanMamy.dane;
  if (d) {
    for (const g of d.wyposazenie) for (const p of g.pozycje) w.push({ rodzaj: 'Wyposażenie', ik: 'lista', tytul: p.nazwa, opis: [g.nazwa, STATUS[p.status]?.nazwa].filter(Boolean).join(' · '),
      mamy: { zakladka: 'wyposazenie', q: p.nazwa }, szukaj: [p.nazwa, g.nazwa, ...p.uwagi, ...p.kandydaci].join(' ') });
    for (const k of d.kupione) w.push({ rodzaj: 'Kupione', ik: 'ok', tytul: k.nazwa, opis: [k.gdzie, k.kiedy].filter(Boolean).join(' · '),
      mamy: { zakladka: 'kupione', q: k.nazwa }, szukaj: [k.nazwa, k.gdzie, 'kupione'].join(' ') });
  }
  for (const x of w) { x.n = norm(x.szukaj); x.nt = norm(x.tytul); }
  return w;
}
function szukajTeraz() {
  const q = norm(szukajPole.value).trim();
  const t = q.split(/\s+/).filter(Boolean);
  if (!t.length) {
    const ost = czytaj(KLUCZ_SZUKANYCH, []);
    szukajWyniki.innerHTML = (ost.length ? `<div class="szukaj-info">Ostatnio szukane:</div><div class="szukaj-ostatnie">${ost.map((o) => `<button type="button" data-ostatnie="${esc(o)}">${esc(o)}</button>`).join('')}</div>` : '')
      + '<div class="szukaj-info">Wpisz np. „kuchnia”, „kuchnia-Z06”, „2.4”, „ganek”, „kurek 3”, „wanna”.</div>';
    wynikiTeraz = [];
    return;
  }
  wynikiTeraz = indeks.filter((x) => t.every((s) => x.n.includes(s)))
    .map((x) => ({ x, r: x.nt === q ? 0 : x.nt.startsWith(q) ? 1 : x.nt.includes(q) ? 2 : 3 }))
    .sort((a, b) => a.r - b.r).slice(0, 40).map((a) => a.x);
  szukajWyniki.innerHTML = wynikiTeraz.length
    ? `<ul>${wynikiTeraz.map((x, i) => `<li>
        <a class="wynik${i === 0 ? ' pierwszy' : ''}" href="${x.hash || '#mamy'}" data-wynik="${i}">
          ${x.ikona ? `<img src="${x.ikona}" alt="">` : svgIkona(x.ik)}
          <b>${esc(x.tytul)}</b><span class="male">${esc(x.rodzaj)}${x.opis && x.opis !== x.rodzaj ? ' · ' + esc(x.opis.replace(x.rodzaj + ' · ', '')) : ''}</span></a>
        ${x.naModelu ? `<a class="link-model wynik-model" href="${x.naModelu}" data-wynik="${i}">na modelu</a>` : ''}</li>`).join('')}</ul>`
    : `<div class="szukaj-info">Nic nie znaleziono${wczytujeIndeks ? ' (jeszcze wczytuję dane z arkusza…)' : ''}.</div>`;
}
async function otworzSzukaj() {
  szukajPanel.hidden = false;
  document.body.classList.add('szukanie');
  indeks = zbudujIndeks();
  szukajTeraz();
  szukajPole.focus();
  wczytujeIndeks = true;
  try { await Promise.all([wczytajDoBrakow(), stanMamy.dane ? null : wczytajArkusz()]); } catch { /* część danych */ }
  wczytujeIndeks = false;
  indeks = zbudujIndeks();
  if (!szukajPanel.hidden) szukajTeraz();
}
function zamknijSzukaj() { szukajPanel.hidden = true; document.body.classList.remove('szukanie'); }
function zapamietajSzukane() {
  const q = szukajPole.value.trim();
  if (!q) return;
  zapisz(KLUCZ_SZUKANYCH, [q, ...czytaj(KLUCZ_SZUKANYCH, []).filter((o) => o !== q)].slice(0, 6));
}
function otworzWynik(x, naModelu) {
  zapamietajSzukane();
  zamknijSzukaj();
  if (x.mamy && !naModelu) {
    stanMamy.zakladka = x.mamy.zakladka; stanMamy.filtr = 'wszystko'; stanMamy.szukaj = x.mamy.q;
    const s = $('#mamy-szukaj'); if (s) s.value = x.mamy.q;
    if (location.hash === '#mamy') rysujMamy(); else location.hash = '#mamy';
  }
}
$('#btn-szukaj')?.addEventListener('click', (e) => { e.stopPropagation(); szukajPanel.hidden ? otworzSzukaj() : zamknijSzukaj(); });
document.addEventListener('click', (e) => {
  if (e.target.closest?.('[data-otworz-szukaj]')) { e.stopPropagation(); otworzSzukaj(); return; }
  if (!szukajPanel.hidden && !szukajPanel.contains(e.target) && !e.target.closest('#btn-szukaj')) zamknijSzukaj();
});
szukajPanel?.querySelector('.zamknij').addEventListener('click', zamknijSzukaj);
szukajPole?.addEventListener('input', szukajTeraz);
szukajWyniki?.addEventListener('click', (e) => {
  const o = e.target.closest('[data-ostatnie]');
  if (o) { szukajPole.value = o.dataset.ostatnie; szukajTeraz(); szukajPole.focus(); return; }
  const a = e.target.closest('[data-wynik]');
  if (!a) return;
  const x = wynikiTeraz[Number(a.dataset.wynik)];
  if (x) otworzWynik(x, a.classList.contains('wynik-model'));     // link (hash) robi resztę: karta punktu, pokój, wyłącznik…
});
szukajPole?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && wynikiTeraz[0]) {
    e.preventDefault();
    const x = wynikiTeraz[0];
    otworzWynik(x, false);
    if (x.hash) location.hash = x.hash;
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !szukajPanel.hidden) { zamknijSzukaj(); return; }
  const pisze = /input|textarea|select/i.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
  if (!pisze && (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'))) { e.preventDefault(); otworzSzukaj(); }
});

// ====================================================================== start
window.addEventListener('hashchange', pokazSekcje);
pokazSekcje();
