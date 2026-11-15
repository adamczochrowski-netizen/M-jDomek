import { TYPY, KOLEJNOSC_TYPOW } from './analiza.js';
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
const SEKCJE = ['widok', 'instalacje', 'ogrzewanie', 'mamy'];
// stare i skrócone adresy: #pompa → Ogrzewanie, #elektryka / #hydraulika / #kanalizacja → Instalacje z podzakładką
const ALIASY = { pompa: 'ogrzewanie', wyposazenie: 'mamy', elektryka: 'instalacje', hydraulika: 'instalacje', kanalizacja: 'instalacje' };
const PODZAKLADKI = ['elektryka', 'hydraulika', 'kanalizacja'];
function sekcjaZAdresu() {
  const h = location.hash.replace(/^#/, '');
  if (PODZAKLADKI.includes(h)) stanInst.zakladka = h;
  const s = ALIASY[h] || h;
  return SEKCJE.includes(s) ? s : 'widok';      // #punkt=…, #pokoj=…, #ogrzewanie=… i pusty adres = widok domu
}
function pokazSekcje() {
  const s = sekcjaZAdresu();
  for (const k of SEKCJE) $('#sekcja-' + k).hidden = s !== k;
  document.querySelectorAll('.menu a').forEach((a) => a.classList.toggle('aktywny', a.dataset.sekcja === s));
  document.body.dataset.sekcja = s;
  if (s === 'mamy') otworzMamy();
  if (s === 'ogrzewanie') otworzPompe();
  if (s === 'instalacje') otworzInstalacje();
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

// ====================================================================== sekcja „Co mamy, co dokupić”
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
      : '<div class="karta-strony"><p>Wczytywanie arkusza…</p></div>';
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
    <p class="zrodlo male">
      Lista pochodzi z arkusza „Domek Wirko” (karty Wyposażenie i Poniesione koszty) – tam dopisujcie i poprawiajcie,
      np. marki i modele. Tu pojawia się po odświeżeniu (przez publiczny arkusz „MójDomek”, bez kwot).<br>
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
  const [klasa, etyk] = n.startsWith('potw') ? ['wiar-potw', 'potwierdzona'] : n.startsWith('prawd') ? ['wiar-prawd', 'prawdopodobna'] : ['wiar-niezw', 'niezweryfikowana'];
  return `<span class="wiar ${klasa}" title="${esc(tekst || 'brak informacji o źródle')}">${etyk}</span>`;
}
function zrodloWiar(tekst) {
  const m = /\(([^)]+)\)/.exec(tekst || '');
  return m ? `<div class="male">źródło: ${esc(m[1])}</div>` : '';
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
const stanPompy = { wiersze: null, brak: false, blad: null };
async function otworzPompe() {
  rysujPompe();
  try {
    const [p] = await Promise.all([kartaDanych('pompa'), kartaDanych('petle')]);
    stanPompy.wiersze = p.brak ? null : p.wiersze;
    stanPompy.blad = p.blad;
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
function htmlPetle() {
  const w = kartyCache.petle?.wiersze || [];
  const petle = w.map(([nr, pokoj, uwagi]) => ({ nr: String(nr || '').trim(), pokoj: String(pokoj || '').trim(), uwagi: String(uwagi || '').trim() }))
    .filter((p) => p.nr);
  const wgPokoju = new Map();
  for (const p of petle) if (p.pokoj) { if (!wgPokoju.has(p.pokoj)) wgPokoju.set(p.pokoj, []); wgPokoju.get(p.pokoj).push(p.nr); }
  const opisane = petle.filter((p) => p.pokoj).length;
  return `<section class="karta-strony">
    <h3>Rozdzielacz ogrzewania podłogowego – kurki <span class="male">${petle.length ? `${opisane} z ${petle.length} opisanych` : ''}</span></h3>
    <p class="male">Każdy kurek to jedna pętla rur w podłodze. Kolejność od lewej, jak na rozdzielaczu.
      ${opisane ? 'Dotknij kurka, żeby zobaczyć rury tego pomieszczenia na modelu.' : ''}</p>
    ${petle.length ? `<div class="rozdzielacz"><div class="rozdz-belka">${petle.map((p) => p.pokoj
      ? `<a class="kurek" href="#ogrzewanie=${encodeURIComponent(p.pokoj)}" title="${esc(p.uwagi || p.pokoj)}"><b>${esc(p.nr)}</b><span>${esc(p.pokoj)}</span></a>`
      : `<div class="kurek pusty" title="pomieszczenie do uzupełnienia"><b>${esc(p.nr)}</b><span>?</span></div>`).join('')}</div></div>` : ''}
    ${wgPokoju.size ? `<div style="margin-top:10px">${[...wgPokoju].map(([pokoj, nry]) => `<div class="wiersz-fakt"><div class="tresc">
      <b>${esc(pokoj)}</b> – ${nry.length > 1 ? 'kurki' : 'kurek'} ${nry.map(esc).join(', ')}</div>
      <a class="link-model" href="#ogrzewanie=${encodeURIComponent(pokoj)}">pokaż rury</a></div>`).join('')}</div>` : ''}
    <p class="male">${opisane < petle.length || !petle.length ? 'Do uzupełnienia: który kurek grzeje które pomieszczenie (arkusz „MójDomek”, karta <b>Pętle</b>, kolumna Pomieszczenie – nazwa jak w aplikacji, np. Kuchnia, Salon, Biuro - Adam). Gdzie stoi rozdzielacz – też warto dopisać. ' : ''}
      <a href="${linkArkusza(KARTY.petle.gid)}" target="_blank" rel="noopener">Otwórz kartę Pętle</a>.</p>
    <p class="male">Rury na modelu to schemat (jak na zdjęciach z budowy), nie dokładny przebieg. ${chipWiar('niezweryfikowana')}</p>
  </section>`;
}
function rysujPompe() {
  const el = $('#pompa-tresc');
  if (!el) return;
  const w = stanPompy.wiersze || [];
  const karty = w.map(([temat, tresc, link]) => {
    const k = rozbierzKomorke(link || '');
    const t = rozbierzKomorke(tresc || '');
    const linki = [...t.linki, ...k.linki];
    return `<section class="karta-strony"><h3>${esc(temat || '—')}</h3>
      ${t.teksty.length ? `<p>${t.teksty.map((x) => /DO POTWIERDZENIA|DO UZUPEŁNIENIA/i.test(x) ? `<span class="uwaga">${esc(x)}</span>` : esc(x)).join('<br>')}</p>` : ''}
      ${linki.length ? `<div class="opcje">${linki.map(htmlLink).join('')}</div>` : ''}</section>`;
  }).join('');
  const sa = new Set(w.map((r) => norm(r[0]).trim()));
  const brakuje = TEMATY_POMPY.filter(([t]) => !sa.has(norm(t)));
  el.innerHTML = `${karty}${htmlPetle()}
    <div class="karta-strony">
      <h3>${w.length ? 'Co jeszcze warto dopisać' : 'Tu będzie obsługa pompy ciepła'}</h3>
      ${brakuje.length ? `<ul class="lista-pomyslow">${brakuje.map(([t, o]) => `<li><b>${esc(t)}</b> – ${esc(o)}</li>`).join('')}</ul>` : ''}
      <p class="male">Wpisujcie w arkuszu „MójDomek”, karta <b>Pompa ciepła</b>: kolumny <b>Temat | Treść | Link</b>,
        każdy wiersz to osobna karta tutaj. <a href="${linkArkusza(KARTY.pompa.gid)}" target="_blank" rel="noopener">Otwórz kartę w arkuszu</a>.</p>
      ${stanPompy.blad ? `<p class="uwaga">Nie udało się wczytać arkusza: ${esc(stanPompy.blad)}</p>` : ''}
    </div>`;
}

// ====================================================================== sekcja „Instalacje”: Elektryka, Hydraulika, Kanalizacja
const stanInst = { zakladka: czytaj('mojDomek.instalacje.v1', 'elektryka'), szukaj: '' };
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
  el.innerHTML = stanInst.zakladka === 'hydraulika' ? htmlHydraulika() : stanInst.zakladka === 'kanalizacja' ? htmlKanalizacja() : htmlElektryka();
  const s = $('#zawory-szukaj');
  if (s) {
    s.value = stanInst.szukaj;
    s.addEventListener('input', () => { stanInst.szukaj = s.value; $('#zawory-lista').innerHTML = htmlListaZaworow(); });
  }
}

// ---------------------------------------------------------------- Elektryka
const ROZDZIELNICA_ZAKUPY = /rozdzielnic|nadprad|roznicowo|rozlacznik|bezpiecznik|szyna|ogranicznik|uziemiajac/;
function htmlElektryka() {
  const rozdz = kartyCache.rozdzielnica?.wiersze || [];
  const st = window.mojDomek?.stan;
  const A = st?.A;
  const osp = st?.obw?.osprzet;
  const wyl = rozdz.map(([nr, opis, zasila, pokoje, punkty, uwagi, wiar]) => ({
    nr: String(nr || '').trim(), opis: String(opis || ''), zasila: String(zasila || ''), pokoje, punkty, uwagi, wiar,
  })).filter((w) => w.nr || w.opis);
  const wiersze = wyl.map((w) => {
    const ids = String(w.punkty || '').split(/[\s,;]+/).filter(Boolean);
    return `<div class="zawor" id="wyl-${esc(w.nr.replace(/\W/g, '-'))}"><div class="zawor-gora"><b>${esc([w.nr, w.opis].filter(Boolean).join(' · ') || '—')}</b>${chipWiar(w.wiar)}</div>
      ${w.zasila ? `<div>${esc(w.zasila)}</div>` : ''}
      ${w.pokoje ? `<div class="male">Pomieszczenia: ${esc(w.pokoje)}</div>` : ''}
      ${ids.length ? `<div class="pkt-lista" style="margin-top:6px">${ids.map((id) => htmlPunktId(id, A)).join('')}</div>` : ''}
      ${w.uwagi ? `<div class="male">${esc(w.uwagi)}</div>` : ''}</div>`;
  }).join('');
  return `
    <section class="karta-strony">
      <h3>Rozdzielnica (skrzynka z bezpiecznikami)</h3>
      ${wyl.length ? htmlSzafa(wyl) : ''}
      ${wiersze || `<p>Czeka na zdjęcie skrzynki z opisami wyłączników – przepiszę je do karty <b>Rozdzielnica</b>
        (Nr | Wyłącznik | Co zasila | Pomieszczenia | Punkty | Uwagi). Wtedy tu będzie widać, który bezpiecznik
        wyłącza które gniazdka.</p>`}
      <details style="margin-top:10px"${wyl.length ? '' : ' open'}><summary class="male">Z zakupów – elementy rozdzielnicy</summary>
        ${htmlZakupy(zakupyPasujace(ROZDZIELNICA_ZAKUPY), stanMamy.dane ? 'Brak pasujących zakupów.' : 'Wczytywanie listy zakupów…')}</details>
      <p class="male">Typ i prąd każdego wyłącznika odczytane ze zdjęcia szafy; przeznaczenie – tylko tam, gdzie jest naklejka.
        Co zasilają nieopisane wyłączniki, najlepiej ustalić z elektrykiem. <a href="${linkArkusza(KARTY.rozdzielnica.gid)}" target="_blank" rel="noopener">Otwórz kartę Rozdzielnica</a>.</p>
    </section>
    <section class="karta-strony">
      <h3>Gniazdka i włączniki w pomieszczeniach</h3>
      ${A ? htmlPunktyPokoi(A) : '<p class="male">Wczytywanie modelu domu…</p>'}
    </section>
    ${osp ? `<section class="karta-strony"><h3>Osprzęt</h3>
      ${['Z', 'S', 'W'].filter((t) => osp[t]).map((t) => `<div class="wiersz-fakt"><div class="tresc"><div>${esc(TYPY[t].nazwa)} (wewnątrz domu): <b>${esc(osp[t].nazwa)}</b></div>
        ${osp[t].link ? `<div class="opcje">${htmlLink({ url: osp[t].link, opis: '' })}</div>` : ''}</div>${chipWiar('potwierdzona (Adam, 15.11.2026)')}</div>`).join('')}</section>` : ''}
    <section class="karta-strony">
      <h3>Co jeszcze udokumentować</h3>
      <ul class="checklista">
        <li><b>Rozdzielnica</b> – co zasilają nieopisane wyłączniki (1.1, 1.2, 2.3, 2.5, 2.7–2.10), które pomieszczenia są na „gniazdkowych” 2.1 i 2.6, i w którym pomieszczeniu wisi szafa.</li>
        <li><b>Trasy przewodów</b> – zdjęcia ścian przed tynkiem są w folderze „Położenie kabli” na komputerze (kuchnia, salon, sypialnia, biura); naniesiemy je na model jako osobną warstwę.</li>
        <li><b>Puszki</b> rozgałęźne – gdzie są i co się w nich łączy.</li>
        <li><b>Który włącznik</b> steruje którą lampą.</li>
        <li><b>Uziemienie</b>, szyna wyrównawcza, ogranicznik przepięć (jeśli jest).</li>
      </ul>
      <p class="male">Położenia części gniazdek pochodzą z rysunku (±10–15 cm). Przed wierceniem sprawdź ścianę wykrywaczem.</p>
    </section>`;
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
function htmlSzafa(wyl) {
  const rzedy = new Map();
  for (const w of wyl) {
    const r = (w.nr.split('.')[0] || '?');
    if (!rzedy.has(r)) rzedy.set(r, []);
    rzedy.get(r).push(w);
  }
  return `<div class="szafa">${[...rzedy].map(([r, lista]) => `<div class="szafa-rzad">
    <div class="male">${esc(NAZWY_RZEDOW[r] || 'Rząd ' + r)}</div>
    <div class="szyna">${lista.map((w) => {
      const rd = rodzajWyl(w);
      const bieguny = Number((/(\d)p\b/.exec(norm(w.opis)) || [0, 1])[1]) || 1;
      return `<button type="button" class="wyl ${rd.klasa}" style="flex-grow:${bieguny}" data-wyl="wyl-${esc(w.nr.replace(/\W/g, '-'))}"
        title="${esc(w.nr + ' ' + w.opis + ' – ' + w.zasila)}"><small>${esc(w.nr)}</small><b>${esc(rd.skrot)}</b><span>${esc(rd.pod)}</span></button>`;
    }).join('')}</div></div>`).join('')}</div>`;
}
document.addEventListener('click', (e) => {          // dotknięcie wyłącznika na schemacie -> jego opis
  const b = e.target.closest('[data-wyl]');
  if (!b) return;
  const el = document.getElementById(b.dataset.wyl);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('mignij');
  setTimeout(() => el.classList.remove('mignij'), 1600);
});

function htmlPunktId(id, A) {
  const p = A?.items.find((q) => q.id === id);
  const T = p ? TYPY[p.typ] : null;
  return `<a class="pkt" href="#punkt=${encodeURIComponent(id)}">${T ? `<i style="background:${T.kolor};color:${T.tekst}">${p.typ}</i>` : '<i>?</i>'}${esc(id)}</a>`;
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
      <div class="pkt-lista">${l.map((p) => `<a class="pkt" href="#punkt=${encodeURIComponent(p.id)}" title="${esc(TYPY[p.typ].nazwa)}, ${Math.round(p.z)} cm"><i style="background:${TYPY[p.typ].kolor};color:${TYPY[p.typ].tekst}">${p.typ}</i>${esc(p.id.replace(/^.*-/, ''))} · ${Math.round(p.z)} cm</a>`).join('')}</div></div>`;
  }).join('');
}

// ---------------------------------------------------------------- Hydraulika
const STUDNIA_ZAKUPY = /studni|hydrofor|rura wod|filtr wod|zawor/;
const PEX_ZAKUPY = /pex|trojnik|kolank/;          // woda albo podłogówka – nie wiadomo, więc osobno
function htmlHydraulika() {
  const st = kartyCache.studnia?.wiersze || [];
  const fakty = st.map(([temat, tresc, wiar, link]) => {
    const l = rozbierzKomorke(link || '').linki;
    return `<div class="wiersz-fakt"><div class="tresc"><b>${esc(temat || '—')}</b><div>${esc(tresc || '')}</div>${zrodloWiar(wiar)}
      ${l.length ? `<div class="opcje">${l.map(htmlLink).join('')}</div>` : ''}</div>${chipWiar(wiar)}</div>`;
  }).join('');
  return `
    <section class="karta-strony">
      <h3>Studnia i zasilanie domu w wodę</h3>
      ${fakty || '<p class="male">Brak wpisów.</p>'}
      <h4 style="margin:12px 0 4px">Z zakupów – prawdopodobnie studnia i instalacja wodna</h4>
      ${htmlZakupy(zakupyPasujace(STUDNIA_ZAKUPY), stanMamy.dane ? 'Brak pasujących zakupów.' : 'Wczytywanie listy zakupów…')}
      ${zakupyPasujace(PEX_ZAKUPY).length ? `<details style="margin-top:8px"><summary class="male">Rury i złączki PEX z zakupów (${zakupyPasujace(PEX_ZAKUPY).length}) – woda albo ogrzewanie, do ustalenia</summary>
        ${htmlZakupy(zakupyPasujace(PEX_ZAKUPY), '')}</details>` : ''}
      <h4 style="margin:12px 0 4px">Do ustalenia</h4>
      <ul class="checklista">
        <li>Model pompy w studni – zdjęcie tabliczki znamionowej.</li>
        <li>Gdzie stoi hydrofor (w zakupach jest „Hydrofor”, 05.2025), wyłącznik ciśnieniowy i manometr.</li>
        <li>Filtry wody – rodzaj i gdzie są.</li>
        <li>Którędy rura ze studni wchodzi do domu i gdzie jest główny zawór wody.</li>
        <li>Który bezpiecznik w rozdzielnicy zasila pompę.</li>
        <li>Odległość studni od dwóch narożników domu – zaznaczę ją na mapie działki.</li>
      </ul>
      <p class="male">„Co zrobić, gdy nie ma wody” – procedurę przygotuję dopiero po poznaniu modelu pompy i układu (z instrukcji producenta), żeby nie zgadywać.
        <a href="${linkArkusza(KARTY.studnia.gid)}" target="_blank" rel="noopener">Otwórz kartę Studnia</a>.</p>
    </section>
    <section class="karta-strony">
      <h3>Zawory (kurki) wody</h3>
      <input id="zawory-szukaj" type="search" placeholder="Szukaj zaworu, np. pralka, zlew, główny…" autocomplete="off" style="width:100%;min-height:40px;padding:8px 12px;border:1px solid var(--linia);border-radius:10px;background:var(--panel);font-size:15px">
      <div id="zawory-lista">${htmlListaZaworow()}</div>
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
    return `<p>Jeszcze żaden zawór nie jest opisany. Dopisuj je w arkuszu „MójDomek”, karta <b>Zawory</b>
      (ID | Pomieszczenie | Gdzie dokładnie | Co odcina | Rodzaj | Wiarygodność | Uwagi) – najlepiej od razu ze zdjęciem.</p>
      <p class="male">Gdzie zwykle są zawory – sprawdź i dopisz te, które są u Was:</p>
      <ul class="checklista">
        <li><b>Pomieszczenie gospodarcze</b>: zawór główny (wejście wody ze studni), przy hydroforze i filtrach, przy zasobniku/bojlerze ciepłej wody (wejście zimnej, wyjście ciepłej).</li>
        <li><b>Łazienka</b>: pod umywalką (zimna i ciepła), przy stelażu WC (zwykle za przyciskiem spłukiwania), przy baterii wannowej, przy pralce.</li>
        <li><b>Kuchnia</b>: pod zlewem (zimna i ciepła), zasilanie zmywarki.</li>
      </ul>
      <p class="male"><a href="${linkArkusza(KARTY.zawory.gid)}" target="_blank" rel="noopener">Otwórz kartę Zawory</a>${kartyCache.zawory?.blad ? ` · <span class="uwaga">${esc(kartyCache.zawory.blad)}</span>` : ''}</p>`;
  }
  if (!zawory.length) return '<p class="pusto">Nic nie pasuje.</p>';
  return zawory.map((z) => `<div class="zawor"><div class="zawor-gora"><b>${esc(z.id || 'zawór')}</b>${chipWiar(z.wiar)}</div>
    <div><b>${esc(z.co || 'co odcina – do uzupełnienia')}</b></div>
    <div class="male">${esc([z.pokoj, z.gdzie, z.rodzaj].filter(Boolean).join(' · '))} ${z.pokoj ? ' · ' + linkPokoju(z.pokoj) : ''}</div>
    ${z.uwagi ? `<div class="male">${esc(z.uwagi)}</div>` : ''}${zrodloWiar(z.wiar)}</div>`).join('')
    + `<p class="male"><a href="${linkArkusza(KARTY.zawory.gid)}" target="_blank" rel="noopener">Otwórz kartę Zawory</a></p>`;
}

// ---------------------------------------------------------------- Kanalizacja
function htmlKanalizacja() {
  return `<section class="karta-strony">
    <h3>Kanalizacja</h3>
    <p>Jeszcze nieudokumentowana. Co warto zebrać (zdjęcia przed zabudową są najcenniejsze):</p>
    <ul class="checklista">
      <li>Odpływy: zlew, zmywarka, umywalka, wanna, WC, pralka – gdzie wchodzą w ścianę lub podłogę.</li>
      <li>Piony i rewizje (otwory kontrolne) – gdzie są i jak się do nich dostać.</li>
      <li>Wyjście kanalizacji z budynku i dokąd prowadzi (szambo / oczyszczalnia / sieć).</li>
      <li>Na zdjęciach z budowy widać szare rury w kuchni i łazience – przypiszemy je do ścian.</li>
    </ul>
    <p class="male">Na modelu kanalizacja będzie szarą warstwą. Nic nie rysuję bez danych.</p>
  </section>`;
}

// ====================================================================== start
window.addEventListener('hashchange', pokazSekcje);
pokazSekcje();
