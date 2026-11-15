// Mój domek – menu (Widok / Co mamy / Pompa ciepła) i sekcje czytane z publicznego Arkusza Google „MójDomek”.
// „MójDomek” sam pobiera (IMPORTRANGE) potrzebne kolumny z prywatnego arkusza „Domek Wirko”:
// Wyposażenie w całości, Kupione bez kwot i bez „kto płacił”. Pompę ciepła wpisuje się wprost w „MójDomek”.

const ARKUSZ_ID = '1zcDhbn7p6nb2LXemT0zHsZ6MLTl0SBVtr6OWUkGAEHo';
const KLUCZ_KOPII = 'mojDomek.arkusz.kopia.v2';
const KLUCZ_WIDOKU = 'mojDomek.mamy.v1';
// karty arkusza: nazwa jak w arkuszu, gid = numer karty z adresu (…#gid=…) – eksport po gid zachowuje puste wiersze
const KARTY = {
  wyposazenie: { nazwa: 'Wyposażenie', gid: '0' },
  kupione: { nazwa: 'Kupione', gid: '1001' },
  pompa: { nazwa: 'Pompa ciepła', gid: '1002' },
};
const linkArkusza = (gid) => `https://docs.google.com/spreadsheets/d/${ARKUSZ_ID}/edit#gid=${gid}`;

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const norm = (s) => String(s ?? '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');
const czytaj = (k, dom) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? dom; } catch { return dom; } };
const zapisz = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* tryb prywatny */ } };

// ====================================================================== menu
const SEKCJE = ['widok', 'mamy', 'pompa'];
function sekcjaZAdresu() {
  const h = location.hash.replace(/^#/, '');
  return SEKCJE.includes(h) ? h : 'widok';      // #punkt=… i pusty adres = widok domu
}
function pokazSekcje() {
  const s = sekcjaZAdresu();
  $('#sekcja-widok').hidden = s !== 'widok';
  $('#sekcja-mamy').hidden = s !== 'mamy';
  $('#sekcja-pompa').hidden = s !== 'pompa';
  document.querySelectorAll('.menu a').forEach((a) => a.classList.toggle('aktywny', a.dataset.sekcja === s));
  document.body.dataset.sekcja = s;
  if (s === 'mamy') otworzMamy();
  if (s === 'pompa') otworzPompe();
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
function dopisz(p, komorki, ciag) {
  komorki.forEach((c, i) => {
    if (!c) return;
    const k = rozbierzKomorke(c);
    p.linki.push(...k.linki);
    if (i === 0 && !ciag) {                           // kolumna B: stan i uwagi
      const pierwsza = k.teksty[0] || '';
      if (/^(jest|są|sa|mamy|kupion)/i.test(pierwsza)) {
        p.status = 'mamy';
        const reszta = pierwsza.replace(/^(jest|są|sa|mamy|kupione|kupiony|kupiona)\s*[-–:,]?\s*/i, '');
        if (reszta) p.uwagi.push(reszta);
        p.uwagi.push(...k.teksty.slice(1));
      } else p.uwagi.push(...k.teksty);
    } else p.kandydaci.push(...k.teksty);
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

async function wczytajArkusz({ wymus = false } = {}) {
  const a = arkusz();
  if (!a) return;
  const kopia = czytaj(KLUCZ_KOPII, null);
  if (kopia && kopia.id === a.id && !stanMamy.dane) { stanMamy.dane = kopia; rysujMamy(); }
  if (stanMamy.ladowanie) return stanMamy.ladowanie;
  if (!wymus && kopia && kopia.id === a.id && Date.now() - kopia.t < 60e3) return;
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
  el.querySelectorAll('[data-akcja="odswiez"]').forEach((b) => b.addEventListener('click', () => { wczytajArkusz({ wymus: true }); rysujMamy(); }));
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

// ====================================================================== sekcja „Pompa ciepła”
// karta „Pompa ciepła” w arkuszu: kolumny Temat | Treść | Link (pierwszy wiersz = nagłówki)
const stanPompy = { wiersze: null, brak: false, blad: null };
async function otworzPompe() {
  rysujPompe();
  const a = arkusz();
  if (!a) return;
  try {
    const { wiersze } = await pobierzKarte(a.id, KARTY.pompa);
    const naglowek = (wiersze[0] || []).map((c) => norm(c).trim());
    if (naglowek[0] !== 'temat') { stanPompy.brak = true; stanPompy.wiersze = null; }   // brak karty – Google oddał inną
    else { stanPompy.brak = false; stanPompy.wiersze = wiersze.slice(1).filter((w) => w.some((c) => String(c).trim())); }
    stanPompy.blad = null;
  } catch (e) { stanPompy.blad = e.message; }
  rysujPompe();
}
const TEMATY_POMPY = [
  ['Urządzenie', 'model, moc, numer seryjny, gdzie stoi jednostka zewnętrzna i wewnętrzna'],
  ['Ustawienia', 'temperatury, krzywa grzewcza, ciepła woda (CWU), tryby pracy'],
  ['Codzienna obsługa', 'co zrobić, gdy jest za zimno, wyjazd, tryb urlopowy'],
  ['Przeglądy i serwis', 'daty, co sprawdzano, filtry do czyszczenia'],
  ['Komunikaty i błędy', 'kody z wyświetlacza i co oznaczają'],
  ['Kontakty', 'instalator, serwis, gwarancja, instrukcje (PDF)'],
];
function rysujPompe() {
  const el = $('#pompa-tresc');
  if (!el) return;
  const w = stanPompy.wiersze || [];
  const karty = w.map(([temat, tresc, link]) => {
    const k = rozbierzKomorke(link || '');
    const t = rozbierzKomorke(tresc || '');
    const linki = [...t.linki, ...k.linki];
    return `<section class="karta-strony"><h3>${esc(temat || '—')}</h3>
      ${t.teksty.length ? `<p>${t.teksty.map((x) => /DO POTWIERDZENIA/i.test(x) ? `<span class="uwaga">${esc(x)}</span>` : esc(x)).join('<br>')}</p>` : ''}
      ${linki.length ? `<div class="opcje">${linki.map(htmlLink).join('')}</div>` : ''}</section>`;
  }).join('');
  const sa = new Set(w.map((r) => norm(r[0]).trim()));
  const brakuje = TEMATY_POMPY.filter(([t]) => !sa.has(norm(t)));
  el.innerHTML = `${karty}
    <div class="karta-strony">
      <h3>${w.length ? 'Co jeszcze warto dopisać' : 'Tu będzie obsługa pompy ciepła'}</h3>
      ${w.length ? '' : '<p>Najważniejsze rzeczy o pompie – pod ręką, także w telefonie przy urządzeniu.</p>'}
      ${brakuje.length ? `<ul class="lista-pomyslow">${brakuje.map(([t, o]) => `<li><b>${esc(t)}</b> – ${esc(o)}</li>`).join('')}</ul>` : ''}
      <p class="male">Wpisujcie w arkuszu „MójDomek”, karta <b>Pompa ciepła</b>: kolumny <b>Temat | Treść | Link</b>,
        każdy wiersz to osobna karta tutaj. <a href="${linkArkusza(KARTY.pompa.gid)}" target="_blank" rel="noopener">Otwórz kartę w arkuszu</a>.</p>
      ${stanPompy.blad ? `<p class="uwaga">Nie udało się wczytać arkusza: ${esc(stanPompy.blad)}</p>` : ''}
    </div>`;
}

// ====================================================================== start
window.addEventListener('hashchange', pokazSekcje);
pokazSekcje();
