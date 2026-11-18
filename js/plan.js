// Mój domek – „Plan prac”: co po kolei zrobić i co już jest zrobione (prośba Adama, 17.11.2026).
// Zadania są we wspólnej bazie (domy/moj-dom/elementy, kategoria „zadanie”) – edytuje je każdy członek domu,
// każda zmiana ma wersję i wpis w historii (te same reguły co punkty). Bez logowania plan nie jest widoczny.
// Działy i ujednolicenie Adam ustali później – na razie prosta lista: status, dział, notatka, kolejność.
import * as dane from './dane/elementy.js';
import { ustawZapis } from './status.js';
import { JEDNOSTKI, ZRODLA, MIESIACE, START_PRZEGLADOW, nastepnyTermin, stanTerminu, opisCzestosci, linkGoogle, plikIcs } from './przeglady.js';

const STATUSY = ['do zrobienia', 'w toku', 'zrobione'];
const DZIALY = ['Pomiary', 'Instalacje', 'Aplikacja', 'Dokumentacja', 'Dom', 'Inne'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// lista startowa (stan na 17.11.2026, z sesji „Projekt DOMEK”) – zapisuje się dopiero po kliknięciu „Wczytaj”
const START = [
  ['zrobione', 'Pomiary', 'Pomiary pokoi, okien, drzwi i sufitów', ''],
  ['zrobione', 'Instalacje', 'Gniazdka i włączniki na modelu: 61 punktów, 36 z pomiaru, ramki 2× i 3×', ''],
  ['zrobione', 'Instalacje', 'Kurki rozdzielacza opisane (karta „Pętle”)', ''],
  ['zrobione', 'Instalacje', 'Pompa ciepła z płytą na modelu', ''],
  ['zrobione', 'Instalacje', 'Studnia z hydroforem na modelu', ''],
  ['zrobione', 'Instalacje', 'Oczyszczalnia z rurami na modelu', ''],
  ['zrobione', 'Instalacje', 'Złącze z licznikiem na modelu', ''],
  ['zrobione', 'Dokumentacja', 'Ocieplenie zapisane (strych, podłoga)', 'na razie szacunek („chyba”)'],
  ['do zrobienia', 'Pomiary', 'Biuro - Adam: gniazdka na ścianie od kuchni', 'po odgruzowaniu ściany'],
  ['do zrobienia', 'Pomiary', 'Kuchnia: dwie puszki na ścianie od biura (pomarańczowa i czerwona)', ''],
  ['do zrobienia', 'Pomiary', 'Salon: dwa dolne gniazdka na ścianie z drzwiami do wiatrołapu', ''],
  ['do zrobienia', 'Pomiary', 'Pompa ciepła: płyta pod pompą i wysokość nad ziemią', ''],
  ['do zrobienia', 'Pomiary', 'Działka: siatka, brama i stodoły', 'rysunek na zrzucie z góry'],
  ['do zrobienia', 'Pomiary', 'Podłogi: grubość paneli i płytek', ''],
  ['do zrobienia', 'Aplikacja', 'Trasy rur ogrzewania podłogowego na modelu (ze zdjęć z budowy)', ''],
  ['do zrobienia', 'Aplikacja', 'Zdjęcia w aplikacji', 'decyzja o planie Blaze w Firebase'],
  ['do zrobienia', 'Dokumentacja', 'Dział Dokumentacja: instrukcje, gwarancje', ''],
  ['do zrobienia', 'Aplikacja', 'Test aplikacji na prawdziwym telefonie i dostęp Magdy', 'Magda: ponownie opublikować reguły bazy'],
];

const stan = { edytowane: null, nowe: false, pokazZrobione: false, komunikat: '', zakladka: 'zadania', braki: null, pokazBraki: false };
// braki w opisie domu (liczone z arkusza i danych w sekcje.js) – pokazywane w planie jako jedna lista z zadaniami
let zrodloBrakow = null;
export function ustawZrodloBrakow(f) { zrodloBrakow = f; }
const tekstZHtml = (h) => String(h).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
// klucz braku: dział + początek tekstu bez liczb i znaków (lista nieopisanych wyłączników się skraca – klucz zostaje)
const kluczBraku = (b) => (b.dzial + '|' + tekstZHtml(b.html).toLowerCase().replace(/[\d.,:;()„”"–-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50));
async function wczytajBraki() {
  if (!zrodloBrakow) return;
  try { stan.braki = (await zrodloBrakow()).map((b) => ({ ...b, klucz: kluczBraku(b) })); } catch { stan.braki = []; }
  if (el && ['plan', 'start'].includes(document.body.dataset.sekcja)) rysuj();
  if (elDzis && document.body.dataset.sekcja === 'start') rysujDzis(elDzis);
}
let el = null, oczekujace = 0;

const zadania = () => [...(dane.stanBazy().elementy?.values() || [])]
  .filter((e) => e.kategoria === 'zadanie' && !e.usuniety)
  .sort((a, b) => (a.kolejnosc ?? 0) - (b.kolejnosc ?? 0) || String(a.id).localeCompare(String(b.id)));
const dzis = () => new Date().toISOString().slice(0, 10);
const ileZadan = (n) => `${n} ${n === 1 ? 'zadanie' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'zadania' : 'zadań'}`;

function sledz(wynik, opis) {
  oczekujace += 1; ustawZapis({ oczekujace, blad: '' });
  wynik.wyslano.then(() => { oczekujace -= 1; ustawZapis({ oczekujace }); })
    .catch((err) => {
      oczekujace -= 1;
      const o = err.code === 'permission-denied' ? 'baza odrzuciła zapis (ktoś mógł w tym czasie zmienić to zadanie)' : (err.code || err.message);
      ustawZapis({ oczekujace, blad: `${opis}: ${o}` });
      stan.komunikat = `Nie zapisano: ${o}`; rysuj();
    });
}
// zmiana zadania: pola + wersja +1 + historia (wspólny zapis z dane/elementy.js)
function zmien(id, pola, opis) {
  try {
    const w = dane.zapiszZmiane(id, (e) => {
      const przed = Object.fromEntries(Object.keys(pola).map((k) => [k, e[k] ?? null]));
      return { dane: { ...pola, wersja: (e.wersja || 0) + 1 }, hist: { operacja: opis, przed, po: pola } };
    });
    sledz(w, opis);
  } catch (err) { stan.komunikat = err.message; rysuj(); }
}
function nowy(pola) {
  const id = dane.wolnyId('zadanie-', dane.zajeteId(), 3);
  const ost = zadania().at(-1);
  try {
    const w = dane.utworzElement(() => ({
      dane: { id, kategoria: 'zadanie', status: 'do zrobienia', dzial: '', notatka: '', usuniety: false, ...pola,
        kolejnosc: (ost?.kolejnosc ?? 0) + 10, wersja: 1 },
      hist: { operacja: 'nowe zadanie', przed: null, po: pola },
    }));
    sledz(w, 'nowe zadanie');
  } catch (err) { stan.komunikat = err.message; rysuj(); }
}

export function otworzPlan(element, zakladka, pokazBraki) {
  el = element;
  if (zakladka) stan.zakladka = zakladka;
  if (pokazBraki) stan.pokazBraki = true;
  rysuj();
  wczytajBraki();
  if (pokazBraki) setTimeout(() => el.querySelector('.zad-braki')?.scrollIntoView({ block: 'start' }), 300);
}
window.addEventListener('mojdomek:baza', () => {
  if (el && document.body.dataset.sekcja === 'plan') rysuj();
  if (elDzis && document.body.dataset.sekcja === 'start') rysujDzis(elDzis);
});

function wierszZadania(z, i, lista) {
  const ed = stan.edytowane === z.id;
  const st = STATUSY.includes(z.status) ? z.status : 'do zrobienia';
  if (ed) return `<li class="zad edytowane" data-id="${esc(z.id)}">${formularz(z)}</li>`;
  return `<li class="zad st-${st.replace(' ', '-')}" data-id="${esc(z.id)}">
    <button type="button" class="zad-status" data-plan="status" title="Zmień status: do zrobienia → w toku → zrobione"
      aria-label="Status: ${esc(st)}. Dotknij, żeby zmienić.">${st === 'zrobione' ? '✓' : st === 'w toku' ? '◐' : ''}</button>
    <div class="zad-tresc">
      <div class="zad-tytul">${esc(z.tytul)}</div>
      <div class="zad-meta">${z.dzial ? `<span class="zad-dzial">${esc(z.dzial)}</span>` : ''}
        ${st === 'w toku' ? '<span class="zad-wtoku">w toku</span>' : ''}
        ${st === 'zrobione' && z.zrobiono ? `<span class="male">zrobione ${esc(new Date(z.zrobiono).toLocaleDateString('pl-PL'))}</span>` : ''}
        ${z.notatka ? `<span class="male">${esc(z.notatka)}</span>` : ''}</div>
    </div>
    <div class="zad-akcje">
      ${st !== 'zrobione' ? `<button type="button" data-plan="gora" ${i === 0 ? 'disabled' : ''} aria-label="Wyżej">↑</button>
      <button type="button" data-plan="dol" ${i === lista.length - 1 ? 'disabled' : ''} aria-label="Niżej">↓</button>` : ''}
      <button type="button" data-plan="edytuj" aria-label="Edytuj">✎</button>
    </div>
  </li>`;
}
function formularz(z) {
  const dz = z?.dzial || '';
  return `<form class="zad-form" data-plan-form="${z ? esc(z.id) : 'nowe'}">
    <label><span>Co zrobić</span><input name="tytul" required maxlength="200" value="${esc(z?.tytul || '')}" placeholder="np. zmierzyć gniazdka w salonie"></label>
    <div class="zad-form-rzad">
      <label><span>Dział</span><select name="dzial"><option value="">—</option>${[...new Set([...DZIALY, dz].filter(Boolean))]
        .map((d) => `<option ${d === dz ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></label>
      ${z ? `<label><span>Status</span><select name="status">${STATUSY.map((s) => `<option ${s === z.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>` : ''}
    </div>
    <label><span>Notatka</span><input name="notatka" maxlength="500" value="${esc(z?.notatka || '')}" placeholder="opcjonalnie"></label>
    <div class="zad-form-przyciski">
      <button type="submit" class="glowny">${z ? 'Zapisz' : 'Dodaj'}</button>
      <button type="button" data-plan="anuluj">Anuluj</button>
      ${z ? '<button type="button" data-plan="usun" class="zad-usun">Usuń</button>' : ''}
    </div>
  </form>`;
}

function rysuj() {
  if (!el) return;
  const b = dane.stanBazy();
  if (!b.aktywna) {
    el.innerHTML = `<section class="karta-strony"><p>Plan prac jest we wspólnej bazie domu – widać go po zalogowaniu
      (przycisk konta w prawym górnym rogu).</p></section>`;
    return;
  }
  if (!b.elementy) { el.innerHTML = '<section class="karta-strony"><p class="male">Wczytywanie planu…</p></section>'; return; }
  const pilne = przeglady().filter((p) => ['przeterminowane', 'ten-miesiac'].includes(stanTerminu(nastepnyTermin(p, dzis()), dzis()))).length;
  const zakladki = `<div class="zakladki" role="tablist" aria-label="Plan">
      <button type="button" role="tab" data-plan="tab" data-tab="zadania" aria-selected="${stan.zakladka === 'zadania'}" class="${stan.zakladka === 'zadania' ? 'aktywny' : ''}">Zadania</button>
      <button type="button" role="tab" data-plan="tab" data-tab="przeglady" aria-selected="${stan.zakladka === 'przeglady'}" class="${stan.zakladka === 'przeglady' ? 'aktywny' : ''}">Przeglądy${pilne ? ` <span class="do-uzup">${pilne}</span>` : ''}</button>
      <button type="button" role="tab" data-plan="tab" data-tab="lazienka" aria-selected="${stan.zakladka === 'lazienka'}" class="${stan.zakladka === 'lazienka' ? 'aktywny' : ''}">Łazienka</button>
    </div>`;
  if (stan.zakladka === 'przeglady') { el.innerHTML = zakladki + htmlPrzegladow(); podepnij(); return; }
  if (stan.zakladka === 'lazienka') { el.innerHTML = zakladki + htmlLazienki(); podepnij(); return; }
  const wsz = zadania();
  const wToku = wsz.filter((z) => z.status === 'w toku');
  const doZr = wsz.filter((z) => z.status !== 'w toku' && z.status !== 'zrobione');
  const zrob = wsz.filter((z) => z.status === 'zrobione').sort((a, c) => String(c.zrobiono || '').localeCompare(String(a.zrobiono || '')));
  const lista = (l, tytul, klasa) => (l.length ? `<h3 class="zad-naglowek ${klasa}">${tytul} <span class="male">(${l.length})</span></h3>
    <ol class="zad-lista">${l.map((z, i) => wierszZadania(z, i, l)).join('')}</ol>` : '');
  el.innerHTML = zakladki + `
    <section class="karta-strony plan">
      ${stan.komunikat ? `<p class="uwaga">${esc(stan.komunikat)}</p>` : ''}
      ${wsz.length ? `<div class="plan-postep" role="img" aria-label="Zrobione ${zrob.length} z ${wsz.length}">
          <div class="plan-pasek"><span style="width:${Math.round(100 * zrob.length / wsz.length)}%"></span></div>
          <span class="male">Zrobione ${zrob.length} z ${wsz.length}</span></div>` : ''}
      ${stan.nowe ? formularz(null) : '<button type="button" class="plan-dodaj" data-plan="nowe">+ Dodaj zadanie</button>'}
      ${lista(wToku, 'W toku', 'n-wtoku')}
      ${lista(doZr, 'Do zrobienia – po kolei', 'n-dozr')}
      ${htmlBrakow(wsz)}
      ${zrob.length ? `<details class="zad-zrobione" ${stan.pokazZrobione ? 'open' : ''}><summary>Zrobione (${zrob.length})</summary>
        <ol class="zad-lista">${zrob.map((z, i) => wierszZadania(z, i, zrob)).join('')}</ol></details>` : ''}
      ${!wsz.length ? `<p>Plan jest pusty. Możesz dodać zadania po jednym albo wczytać listę startową (${ileZadan(START.length)}:
        co zrobione, co do zmierzenia i co do zrobienia w aplikacji – stan na 17.11.2026).</p>
        <button type="button" class="glowny" data-plan="start">Wczytaj listę startową (${START.length})</button>` : ''}
      <p class="male">Kolejność „do zrobienia” ustawiasz strzałkami ↑↓. Kółko po lewej zmienia status: do zrobienia → w toku → zrobione.
        Każda zmiana zapisuje się we wspólnej bazie (z imieniem i datą) – widzicie ją oboje.</p>
    </section>`;
  podepnij();
}

function podepnij() {
  el.onclick = (e) => {
    const b = e.target.closest('[data-plan]');
    if (!b) return;
    const li = b.closest('[data-id]'), id = li?.dataset.id;
    const z = id && dane.stanBazy().elementy?.get(id);
    stan.komunikat = '';
    switch (b.dataset.plan) {
      case 'nowe': stan.nowe = true; stan.edytowane = null; rysuj(); el.querySelector('.zad-form input')?.focus(); break;
      case 'anuluj': stan.nowe = false; stan.edytowane = null; rysuj(); break;
      case 'edytuj': stan.edytowane = id; stan.nowe = false; rysuj(); break;
      case 'status': {
        const nast = STATUSY[(STATUSY.indexOf(z.status) + 1) % STATUSY.length] || 'w toku';
        zmien(id, { status: nast, zrobiono: nast === 'zrobione' ? dzis() : null }, `zadanie: ${nast}`);
        break;
      }
      case 'gora': case 'dol': {
        // zamiana miejscami z sąsiadem w tej samej grupie (dwa zapisy, każdy z wersją)
        const grupa = [...li.parentElement.children].map((x) => x.dataset.id);
        const j = grupa.indexOf(id) + (b.dataset.plan === 'gora' ? -1 : 1);
        const sasiad = dane.stanBazy().elementy.get(grupa[j]);
        if (!sasiad) break;
        const k1 = z.kolejnosc ?? 0, k2 = sasiad.kolejnosc ?? 0;
        zmien(id, { kolejnosc: k1 === k2 ? k2 + (j > grupa.indexOf(id) ? 1 : -1) : k2 }, 'zadanie: kolejność');
        zmien(sasiad.id, { kolejnosc: k1 }, 'zadanie: kolejność');
        break;
      }
      case 'usun':
        if (confirm(`Usunąć zadanie „${z.tytul}”? Zostanie w historii bazy.`)) { stan.edytowane = null; zmien(id, { usuniety: true }, 'zadanie usunięte'); }
        break;
      case 'start':
        wczytajStart(); break;
      case 'brak-do-planu': {
        const br = stan.braki?.find((x) => x.klucz === b.dataset.klucz);
        if (br) nowy({ tytul: tekstZHtml(br.html), dzial: br.dzial, notatka: 'z listy „Do uzupełnienia”', brak: br.klucz, link: br.hash });
        break;
      }
      case 'l-krok': {
        const nastK = z.status === 'zrobione' ? 'do zrobienia' : 'zrobione';
        zmien(id, { status: nastK, zrobiono: nastK === 'zrobione' ? dzis() : null }, `łazienka: krok ${nastK}`);
        break;
      }
      case 'l-nowe': stan.nowe = b.dataset.rodzaj; stan.edytowane = null; rysuj(); el.querySelector('.zad-form input')?.focus(); break;
      case 'l-start': wczytajLazienke(); break;
      case 'l-usun':
        if (confirm(`Usunąć „${z.nazwa}”? Zostanie w historii bazy.`)) { stan.edytowane = null; zmien(id, { usuniety: true }, 'łazienka: usunięte'); }
        break;
      case 'tab': stan.zakladka = b.dataset.tab; stan.edytowane = null; stan.nowe = false; rysuj(); break;
      case 'p-dzis':
        zmien(id, { ostatnio: dzis() }, `przegląd zrobiony ${dzis()}`); break;
      case 'p-ics': pobierzIcs(z); break;
      case 'p-usun':
        if (confirm(`Usunąć „${z.nazwa}”? Zostanie w historii bazy.`)) { stan.edytowane = null; zmien(id, { usuniety: true }, 'przegląd usunięty'); }
        break;
      case 'p-start': wczytajPrzeglady(); break;
      default:
    }
  };
  el.onchange = (e) => {
    const s = e.target.closest('[data-l-status]');
    if (!s) return;
    zmien(s.closest('[data-id]').dataset.id, { status: s.value }, `łazienka: ${s.value}`);
  };
  el.onsubmit = (e) => {
    const fl = e.target.closest('[data-projekt-form]');
    if (fl) { e.preventDefault(); zapiszPozycje(fl); return; }
    const fp = e.target.closest('[data-przeglad-form]');
    if (fp) { e.preventDefault(); zapiszPrzeglad(fp); return; }
    const f = e.target.closest('[data-plan-form]');
    if (!f) return;
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const tytul = String(d.tytul || '').trim();
    if (!tytul) return;
    const pola = { tytul, dzial: d.dzial || '', notatka: String(d.notatka || '').trim() };
    if (f.dataset.planForm === 'nowe') { stan.nowe = false; nowy(pola); return; }
    const id = f.dataset.planForm, z = dane.stanBazy().elementy.get(id);
    if (d.status && d.status !== z.status) { pola.status = d.status; pola.zrobiono = d.status === 'zrobione' ? (z.zrobiono || dzis()) : null; }
    stan.edytowane = null;
    zmien(id, pola, 'zadanie: edycja');
  };
  const z = el.querySelector('.zad-zrobione');
  if (z) z.ontoggle = () => { stan.pokazZrobione = z.open; };
  const bz = el.querySelector('.zad-braki');
  if (bz) bz.ontoggle = () => { stan.pokazBraki = bz.open; };
}

// lista startowa: jeden zapis paczką (każde zadanie z wersją 1 i wpisem w historii)
function wczytajStart() {
  if (zadania().length) return;
  try {
    const w = dane.utworzWiele(START.map(([status, dzial, tytul, notatka], i) => ({
      dane: { id: 'zadanie-' + String(i + 1).padStart(3, '0'), kategoria: 'zadanie', tytul, dzial, notatka, status,
        zrobiono: status === 'zrobione' ? '2026-11-16' : null,
        kolejnosc: (i + 1) * 10, usuniety: false, wersja: 1 },
      hist: { operacja: 'lista startowa planu prac', przed: null, po: { tytul, status } },
    })));
    sledz(w, 'lista startowa planu');
  } catch (err) { stan.komunikat = err.message; rysuj(); }
}

// ====================================================================== Przeglądy (js/przeglady.js – terminy i kalendarz)
const przeglady = () => [...(dane.stanBazy().elementy?.values() || [])]
  .filter((e) => e.kategoria === 'przeglad' && !e.usuniety);
const dataPl = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pl-PL') : '—');
const ETYK_TERMINU = { przeterminowane: 'po terminie', 'ten-miesiac': 'w tym miesiącu', pozniej: '', brak: 'brak daty' };

function htmlPrzegladow() {
  const d = dzis();
  const lista = przeglady().map((p) => ({ p, nast: nastepnyTermin(p, d) }))
    .map((x) => ({ ...x, st: stanTerminu(x.nast, d) }))
    .sort((a, c) => (a.nast || '9999').localeCompare(c.nast || '9999') || String(a.p.nazwa).localeCompare(String(c.p.nazwa)));
  const ile = (st) => lista.filter((x) => x.st === st).length;
  const [po, ten, brak] = [ile('przeterminowane'), ile('ten-miesiac'), ile('brak')];
  const wiersz = ({ p, nast, st }) => {
    if (stan.edytowane === p.id) return `<li class="zad edytowane" data-id="${esc(p.id)}">${formPrzegladu(p)}</li>`;
    const start = nast && nast >= d ? nast : d;
    return `<li class="prz t-${st}" data-id="${esc(p.id)}">
      <div class="prz-gora">
        <div><div class="zad-tytul">${esc(p.nazwa)}</div>
          <div class="zad-meta">${p.urzadzenie ? (p.link ? `<a href="${esc(p.link)}">${esc(p.urzadzenie)}</a>` : `<span>${esc(p.urzadzenie)}</span>`) : ''}</div></div>
        ${ETYK_TERMINU[st] ? `<span class="prz-stan">${ETYK_TERMINU[st]}</span>` : ''}
      </div>
      <div class="prz-terminy">${esc(opisCzestosci(p))} · ostatnio: <b>${dataPl(p.ostatnio)}</b> · następny: <b>${nast ? dataPl(nast) : 'po wpisaniu „ostatnio”'}</b></div>
      <div class="zad-meta"><span class="wiar ${/instrukcj|gwarancj/.test(p.zrodlo || '') ? 'wiar-potw' : 'wiar-prawd'}">${esc(p.zrodlo || ZRODLA[0])}</span>
        ${p.notatka ? `<span class="male">${esc(p.notatka)}</span>` : ''}</div>
      <div class="prz-akcje">
        <button type="button" class="glowny" data-plan="p-dzis">Zrobione dziś</button>
        <a class="przycisk" href="${esc(linkGoogle(p, start))}" target="_blank" rel="noopener">Kalendarz Google</a>
        <button type="button" data-plan="p-ics" title="Plik do Kalendarza na iPhonie i innych kalendarzy">Do kalendarza (.ics)</button>
        <button type="button" data-plan="edytuj" aria-label="Edytuj">✎</button>
      </div>
    </li>`;
  };
  return `<section class="karta-strony plan">
    ${stan.komunikat ? `<p class="uwaga">${esc(stan.komunikat)}</p>` : ''}
    ${lista.length ? `<div class="prz-podsumowanie">
        <span class="prz-licz t-przeterminowane">Po terminie: <b>${po}</b></span>
        <span class="prz-licz t-ten-miesiac">W tym miesiącu: <b>${ten}</b></span>
        ${brak ? `<span class="prz-licz t-brak">Bez daty „ostatnio”: <b>${brak}</b></span>` : ''}
      </div>` : ''}
    ${stan.nowe ? formPrzegladu(null) : '<button type="button" class="plan-dodaj" data-plan="nowe">+ Dodaj przegląd / czynność</button>'}
    ${lista.length ? `<ol class="zad-lista">${lista.map(wiersz).join('')}</ol>` : `<p>Nie ma jeszcze przeglądów. Możesz dodać je po jednym albo wczytać
      listę startową (${START_PRZEGLADOW.length}: oczyszczalnia, woda i hydrofor, pompa ciepła, ogrzewanie podłogowe, elektryka, czujniki).
      Częstotliwości są orientacyjne – oznaczone „szacunek – do sprawdzenia w instrukcji”.</p>
      <button type="button" class="glowny" data-plan="p-start">Wczytaj przeglądy startowe (${START_PRZEGLADOW.length})</button>`}
    <p class="male">„Zrobione dziś” zapisuje datę i liczy następny termin. „Kalendarz Google” albo „Do kalendarza (.ics)” dodaje powtarzające się
      wydarzenie z przypomnieniem – telefon przypomni sam. Po zmianie częstotliwości dodaj wydarzenie jeszcze raz (stare usuń w kalendarzu).</p>
  </section>`;
}

function formPrzegladu(p) {
  const jedn = p?.jedn || 'mies';
  return `<form class="zad-form" data-przeglad-form="${p ? esc(p.id) : 'nowe'}">
    <label><span>Co zrobić</span><input name="nazwa" required maxlength="200" value="${esc(p?.nazwa || '')}" placeholder="np. wymiana filtra wody"></label>
    <label><span>Urządzenie</span><input name="urzadzenie" maxlength="200" value="${esc(p?.urzadzenie || '')}" placeholder="np. hydrofor w studni"></label>
    <div class="zad-form-rzad">
      <label><span>Co ile</span><input name="co" type="number" min="1" max="999" inputmode="numeric" value="${esc(p?.co ?? 12)}"></label>
      <label><span>Jednostka</span><select name="jedn">${Object.entries(JEDNOSTKI).map(([k, f]) => `<option value="${k}" ${k === jedn ? 'selected' : ''}>${f[2]}</option>`).join('')}</select></label>
    </div>
    <div class="zad-form-rzad">
      <label><span>Albo co roku w miesiącu</span><select name="miesiac"><option value="">—</option>${MIESIACE.map((m, i) => `<option value="${i + 1}" ${Number(p?.miesiac) === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label><span>Ostatnio zrobione</span><input name="ostatnio" type="date" value="${esc(p?.ostatnio || '')}"></label>
    </div>
    <label><span>Skąd częstotliwość</span><select name="zrodlo">${ZRODLA.map((z) => `<option ${z === (p?.zrodlo || ZRODLA[0]) ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>
    <label><span>Notatka</span><input name="notatka" maxlength="500" value="${esc(p?.notatka || '')}" placeholder="opcjonalnie"></label>
    <div class="zad-form-przyciski">
      <button type="submit" class="glowny">${p ? 'Zapisz' : 'Dodaj'}</button>
      <button type="button" data-plan="anuluj">Anuluj</button>
      ${p ? '<button type="button" data-plan="p-usun" class="zad-usun">Usuń</button>' : ''}
    </div>
  </form>`;
}

function zapiszPrzeglad(f) {
  const d = Object.fromEntries(new FormData(f));
  const nazwa = String(d.nazwa || '').trim();
  if (!nazwa) return;
  const pola = { nazwa, urzadzenie: String(d.urzadzenie || '').trim(), co: Math.max(1, Number(d.co) || 1), jedn: d.jedn || 'mies',
    miesiac: d.miesiac ? Number(d.miesiac) : null, ostatnio: d.ostatnio || null, zrodlo: d.zrodlo || ZRODLA[0], notatka: String(d.notatka || '').trim() };
  stan.nowe = false; stan.edytowane = null;
  if (f.dataset.przegladForm !== 'nowe') { zmien(f.dataset.przegladForm, pola, 'przegląd: edycja'); return; }
  const id = dane.wolnyId('przeglad-', dane.zajeteId(), 3);
  try {
    sledz(dane.utworzElement(() => ({ dane: { id, kategoria: 'przeglad', link: '', usuniety: false, ...pola, wersja: 1 },
      hist: { operacja: 'nowy przegląd', przed: null, po: pola } })), 'nowy przegląd');
  } catch (err) { stan.komunikat = err.message; rysuj(); }
}

function wczytajPrzeglady() {
  if (przeglady().length) return;
  try {
    sledz(dane.utworzWiele(START_PRZEGLADOW.map(([nazwa, urzadzenie, link, co, jedn, miesiac, notatka], i) => ({
      dane: { id: 'przeglad-' + String(i + 1).padStart(3, '0'), kategoria: 'przeglad', nazwa, urzadzenie, link, co, jedn,
        miesiac: miesiac || null, ostatnio: null, zrodlo: ZRODLA[0], notatka, usuniety: false, wersja: 1 },
      hist: { operacja: 'przeglądy startowe', przed: null, po: { nazwa, co, jedn } },
    }))), 'przeglądy startowe');
  } catch (err) { stan.komunikat = err.message; rysuj(); }
}

function pobierzIcs(p) {
  const d = dzis(), nast = nastepnyTermin(p, d);
  const blob = new Blob([plikIcs(p, nast && nast >= d ? nast : d)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${String(p.nazwa).replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 50)}.ics`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ====================================================================== „Do uzupełnienia” w planie
// Braki są liczone na bieżąco z danych (znikają same, gdy dane zostaną uzupełnione). „→ do planu” robi z braku
// zwykłe zadanie (z polem brak = klucz), które można ustawić w kolejności i odhaczyć; wtedy brak znika z tej grupy.
function htmlBrakow(wsz) {
  if (!stan.braki) return '<p class="male">Wczytywanie listy „Do uzupełnienia”…</p>';
  const wPlanie = new Set();
  const wszystkieZad = [...(dane.stanBazy().elementy?.values() || [])].filter((e) => e.kategoria === 'zadanie' && e.brak);
  for (const z of wszystkieZad) wPlanie.add(z.brak);              // także zrobione i usunięte – nie wracają
  const lista = stan.braki.filter((b) => !wPlanie.has(b.klucz));
  if (!lista.length) return '';
  const wg = new Map();
  for (const b of lista) { if (!wg.has(b.dzial)) wg.set(b.dzial, []); wg.get(b.dzial).push(b); }
  return `<details class="zad-braki" ${stan.pokazBraki ? 'open' : ''}><summary>Do uzupełnienia w opisie domu (${lista.length})</summary>
    <p class="male">Liczone na bieżąco z arkusza i danych – znikają same, gdy coś uzupełnisz. „→ do planu” robi z nich zadanie do odhaczenia.</p>
    ${[...wg].map(([dzial, l]) => `<h4 class="zad-braki-dzial">${esc(dzial)} <span class="male">(${l.length})</span></h4>
      <ul class="zad-lista">${l.map((b) => `<li class="zad brak"><span class="zad-brak-ikona" aria-hidden="true">?</span>
        <div class="zad-tresc"><div>${b.html}</div><a class="male" href="${esc(b.hash)}">${esc(dzial)} →</a></div>
        <div class="zad-akcje"><button type="button" data-plan="brak-do-planu" data-klucz="${esc(b.klucz)}" title="Zrób z tego zadanie w planie">→ do planu</button></div>
      </li>`).join('')}</ul>`).join('')}
  </details>`;
}

// ====================================================================== „Dziś” – ekran startowy
// Najbliższe 3 zadania, pilne przeglądy i duży przycisk Awarii; pod spodem (w index.html) kafelki działów.
let elDzis = null;
export function rysujDzis(element) {
  elDzis = element;
  if (!elDzis) return;
  const b = dane.stanBazy();
  const awaria = '<a class="dzis-awaria" href="#awaria"><b>Awaria</b><span>gdzie co wyłączyć – prąd, woda, ogrzewanie, telefony</span></a>';
  if (!b.aktywna) {
    elDzis.innerHTML = awaria + '<p class="male dzis-info">Plan prac i przeglądy są we wspólnej bazie – zaloguj się (przycisk konta u góry), żeby je tu widzieć.</p>';
    return;
  }
  if (!b.elementy) { elDzis.innerHTML = awaria + '<p class="male dzis-info">Wczytywanie planu…</p>'; return; }
  const d = dzis();
  const wsz = zadania();
  const nast = [...wsz.filter((z) => z.status === 'w toku'), ...wsz.filter((z) => z.status !== 'w toku' && z.status !== 'zrobione')].slice(0, 3);
  const pilne = przeglady().map((p) => ({ p, n: nastepnyTermin(p, d) })).map((x) => ({ ...x, st: stanTerminu(x.n, d) }))
    .filter((x) => x.st === 'przeterminowane' || x.st === 'ten-miesiac').sort((a, c) => a.n.localeCompare(c.n));
  const zrob = wsz.filter((z) => z.status === 'zrobione').length;
  elDzis.innerHTML = `${awaria}
    <section class="karta-strony dzis-karta">
      <h3>Najbliższe zadania ${wsz.length ? `<span class="male">· zrobione ${zrob} z ${wsz.length}</span>` : ''}</h3>
      ${nast.length ? `<ol class="zad-lista">${nast.map((z) => `<li class="zad st-${(z.status || 'do zrobienia').replace(' ', '-')}" data-id="${esc(z.id)}">
          <button type="button" class="zad-status" data-dzis="status" aria-label="Status: ${esc(z.status || 'do zrobienia')}. Dotknij, żeby zmienić.">${z.status === 'w toku' ? '◐' : ''}</button>
          <div class="zad-tresc"><div class="zad-tytul">${esc(z.tytul)}</div>
            <div class="zad-meta">${z.dzial ? `<span class="zad-dzial">${esc(z.dzial)}</span>` : ''}${z.status === 'w toku' ? '<span class="zad-wtoku">w toku</span>' : ''}</div></div>
        </li>`).join('')}</ol>`
        : wsz.length ? '<p>Wszystko zrobione ✓</p>' : '<p class="male">Plan jest pusty – w „Planie” możesz wczytać listę startową.</p>'}
      <a class="link-model" href="#plan">Cały plan →</a>
    </section>
    ${pilne.length ? `<section class="karta-strony dzis-karta">
      <h3>Przeglądy do zrobienia</h3>
      <ul class="zad-lista">${pilne.map(({ p, n, st }) => `<li class="prz t-${st}" data-id="${esc(p.id)}">
          <div class="prz-gora"><div class="zad-tytul">${esc(p.nazwa)}</div><span class="prz-stan">${st === 'przeterminowane' ? 'po terminie' : 'w tym miesiącu'}</span></div>
          <div class="prz-terminy">termin: <b>${dataPl(n)}</b>${p.urzadzenie ? ` · ${esc(p.urzadzenie)}` : ''}</div>
          <div class="prz-akcje"><button type="button" class="glowny" data-dzis="p-dzis">Zrobione dziś</button></div>
        </li>`).join('')}</ul>
      <a class="link-model" href="#przeglady">Wszystkie przeglądy →</a>
    </section>` : ''}`;
  elDzis.onclick = (e) => {
    const btn = e.target.closest('[data-dzis]');
    if (!btn) return;
    const id = btn.closest('[data-id]')?.dataset.id, z = id && dane.stanBazy().elementy?.get(id);
    if (!z) return;
    if (btn.dataset.dzis === 'status') {
      const nastS = STATUSY[(STATUSY.indexOf(z.status) + 1) % STATUSY.length] || 'w toku';
      zmien(id, { status: nastS, zrobiono: nastS === 'zrobione' ? dzis() : null }, `zadanie: ${nastS}`);
    }
    if (btn.dataset.dzis === 'p-dzis') zmien(id, { ostatnio: dzis() }, `przegląd zrobiony ${dzis()}`);
  };
  if (!stan.braki) wczytajBraki();
}

// ====================================================================== Łazienka (remont) – projekt w Planie (prośba Adama, 18.11.2026)
// Harmonogram w etapach (kolejność ważna) i rzeczy: mamy / do kupienia / do ustalenia. Dane we wspólnej bazie
// (elementy, kategoria „projekt”, projekt „lazienka”) – odhacza Adam (wujek nie ma konta). Pełny spis: dokumentacja (poza repo).
const PROJEKT = 'lazienka';
const ETAPY = ['Etap 0 – decyzje, zanim cokolwiek się zakryje', 'Etap 1 – instalacje w ścianach i suficie', 'Etap 2 – zabudowy',
  'Etap 3 – podłoże pod płytki', 'Etap 4 – płytki', 'Etap 5 – wykończenie'];
const STAN_RZECZY = ['mamy', 'do kupienia', 'do ustalenia'];
const KROKI_START = [
  [0, 'Rozrysować na ścianach: wanna, meble, lustro, umywalka, 3 LED-y, wentylator', 'kredą / markerem – widać, gdzie kable, kołki i płytki'],
  [0, 'Podział płytek: gdzie 120×60, strefa wanny, do jakiej wysokości', ''],
  [0, 'Zdjęcia z miarką rur i kabli przed zakryciem', 'do projektu / aplikacji'],
  [1, 'Bruzdy i kable do 3 LED-ów + dostępne puszki na zasilacze', 'przed hydroizolacją i płytkami'],
  [1, 'Wentylacja: otwór w suficie, rura Ø125 izolowana przez strych na dach, kabel 3-żyłowy', ''],
  [1, 'Sprawdzić kable: lustro 230 V, gniazdka umywalka / pralka, grzejnik', ''],
  [1, 'Próba szczelności wody i drożność odpływów (wanna, umywalka, pralka, WC)', ''],
  [1, 'Zatrzeć bruzdy, poprawić tynk', ''],
  [2, 'Obudowa stelaża WC płytą g-k zieloną (otwór na przycisk)', 'przycisk kupić wcześniej – od niego zależy otwór'],
  [2, 'Wanna: ustawienie, odpływ i przelew, obudowa z rewizją do syfonu', ''],
  [3, 'Wyrównanie podłogi, jeśli trzeba', 'wylewka samopoziomująca'],
  [3, 'Gruntowanie ścian i podłogi', ''],
  [3, 'Folia w płynie 2× + taśmy w narożnikach i mankiety', 'cała podłoga + pas na ścianach, pole wanny, okolice umywalki'],
  [4, 'Płytki na podłogę 120×60', 'klej na podłoże i płytkę, system poziomujący'],
  [4, 'Płytki ścienne 120×60, potem strefa wanny', 'od listwy, nie od podłogi'],
  [4, 'Fugi i silikon sanitarny', ''],
  [5, 'Malowanie powyżej płytek', 'jeśli płytki nie idą do sufitu'],
  [5, 'Biały montaż: WC + przycisk, umywalka, baterie, wanna', ''],
  [5, 'Meble, lustro, LED-y, wentylator, osprzęt, grzejnik', ''],
  [5, 'Pralka – woda i odpływ', ''],
  [5, 'Zdjęcia gotowej łazienki → do aplikacji', 'gdzie co jest'],
];
const RZECZY_START = [
  ['mamy', 'Płytki 120×60 jasnobeżowe', 'ilość: ?'], ['mamy', 'Umywalka nablatowa (morele)', ''], ['mamy', 'Baterie', 'szczegóły: ?'],
  ['mamy', 'Zestaw prysznicowy do wanny', ''], ['mamy', 'Zasilacze LED MW Power AF6024Y 24 V / 60 W IP67', 'ilość: ?; taśmy muszą być 24 V'],
  ['mamy', 'Stelaż WC Cersanit', 'zamontowany'], ['mamy', 'Miska WC podwieszana', ''], ['mamy', 'Przycisk spłukujący (stary)', 'będzie nowy'],
  ['mamy', 'Meble łazienkowe', 'wymiary później'], ['mamy', 'Folia w płynie', 'ilość: ?'],
  ['mamy', 'Klej Mapei Keraflex Extra S1 Zero 25 kg', 'ilość: ? – potrzeba ok. 5 worków'],
  ['mamy', 'Lustro Sensea „Modern” LED ok. 120×80, 230 V', ''], ['mamy', 'Wentylator Bosch Fan 1500 W Ø125', 'włącza się ze światłem'],
  ['do kupienia', 'Rura wentylacyjna Ø125 izolowana + wyjście dachowe', ''],
  ['do kupienia', 'Przycisk spłukujący do stelaża Cersanit', 'przed obudową stelaża!'],
  ['do kupienia', 'Płyta g-k zielona + wkręty', ''], ['do kupienia', 'Taśmy LED 24 V (3 miejsca)', ''],
  ['do kupienia', 'Taśma narożnikowa i mankiety do folii', ''], ['do kupienia', 'Grunt', ''],
  ['do kupienia', 'System poziomujący do płytek', ''], ['do kupienia', 'Fuga, silikon sanitarny', ''], ['do kupienia', 'Klej – jeśli brakuje', ''],
  ['do ustalenia', 'Wanna: czy jest, wymiar, typ, ściana', ''], ['do ustalenia', 'Płytki strefy wanny', ''],
  ['do ustalenia', 'Wysokość płytek ściennych', ''], ['do ustalenia', 'Ilość płytek', ''], ['do ustalenia', 'Szafka pod umywalkę', ''],
  ['do ustalenia', 'Syfony i odpływ wanny', ''], ['do ustalenia', 'Deska WC', ''], ['do ustalenia', 'Grzejnik', ''],
  ['do ustalenia', 'Sterowanie LED', 'osobny włącznik / ze światłem / czujnik'], ['do ustalenia', 'Wylewka', ''],
  ['do ustalenia', 'Podział pracy wujek / Adam', ''],
];
const pozycje = () => [...(dane.stanBazy().elementy?.values() || [])]
  .filter((e) => e.kategoria === 'projekt' && e.projekt === PROJEKT && !e.usuniety)
  .sort((a, c) => (a.kolejnosc ?? 0) - (c.kolejnosc ?? 0));

function htmlLazienki() {
  const wsz = pozycje();
  const kroki = wsz.filter((p) => p.rodzaj === 'krok'), rzeczy = wsz.filter((p) => p.rodzaj === 'rzecz');
  const zrob = kroki.filter((k) => k.status === 'zrobione').length;
  const nastepny = kroki.find((k) => k.status !== 'zrobione');
  if (!wsz.length) return `<section class="karta-strony plan">
      <p>Remont łazienki: harmonogram (21 kroków w 6 etapach) i rzeczy – co mamy, co kupić, co ustalić.
        Lista startowa jest ze spisu prowadzonego przez sesję „Projekt DOMEK” (stan 18.11.2026).</p>
      <button type="button" class="glowny" data-plan="l-start">Wczytaj listę łazienki (${KROKI_START.length} kroków, ${RZECZY_START.length} rzeczy)</button>
    </section>`;
  const wiersz = (p, i) => {
    if (stan.edytowane === p.id) return `<li class="zad edytowane" data-id="${esc(p.id)}">${formPozycji(p.rodzaj, p)}</li>`;
    if (p.rodzaj === 'krok') return `<li class="zad st-${p.status === 'zrobione' ? 'zrobione' : 'do-zrobienia'}${p === nastepny ? ' l-nastepny' : ''}" data-id="${esc(p.id)}">
        <button type="button" class="zad-status" data-plan="l-krok" aria-label="${p.status === 'zrobione' ? 'Zrobione – odznacz' : 'Oznacz jako zrobione'}">${p.status === 'zrobione' ? '✓' : esc(p.nr ?? '')}</button>
        <div class="zad-tresc"><div class="zad-tytul">${esc(p.nazwa)}</div>
          <div class="zad-meta">${p === nastepny ? '<span class="zad-wtoku">następny krok</span>' : ''}${p.notatka ? `<span class="male">${esc(p.notatka)}</span>` : ''}</div></div>
        <div class="zad-akcje"><button type="button" data-plan="edytuj" aria-label="Edytuj">✎</button></div></li>`;
    return `<li class="zad l-rzecz" data-id="${esc(p.id)}">
        <div class="zad-tresc"><div class="zad-tytul">${esc(p.nazwa)}</div>${p.notatka ? `<div class="zad-meta"><span class="male">${esc(p.notatka)}</span></div>` : ''}</div>
        <div class="zad-akcje"><select data-l-status aria-label="Stan">${STAN_RZECZY.map((s) => `<option ${s === p.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <button type="button" data-plan="edytuj" aria-label="Edytuj">✎</button></div></li>`;
  };
  const grupaRzeczy = (st, tytul) => {
    const l = rzeczy.filter((r) => r.status === st);
    return `<details class="l-grupa" open><summary>${tytul} <span class="male">(${l.length})</span></summary>
      <ul class="zad-lista">${l.map(wiersz).join('')}</ul>
      ${stan.nowe === 'rzecz:' + st ? formPozycji('rzecz', null, st) : `<button type="button" class="plan-dodaj l-dodaj" data-plan="l-nowe" data-rodzaj="rzecz:${st}">+ Dodaj</button>`}</details>`;
  };
  return `<section class="karta-strony plan lazienka">
    ${stan.komunikat ? `<p class="uwaga">${esc(stan.komunikat)}</p>` : ''}
    <p class="male">Start 18.11.2026 · robi głównie wujek, Adam prowadzi plan i odhacza · łazienka ok. 278 × 188 cm, sufit 244 cm.</p>
    <h3 class="zad-naglowek">Harmonogram <span class="male">(zrobione ${zrob} z ${kroki.length})</span></h3>
    <div class="plan-postep"><div class="plan-pasek"><span style="width:${kroki.length ? Math.round(100 * zrob / kroki.length) : 0}%"></span></div></div>
    ${ETAPY.map((nazwa, e) => {
      const l = kroki.filter((k) => (k.etap ?? 0) === e);
      if (!l.length) return '';
      const gotowe = l.every((k) => k.status === 'zrobione');
      return `<details class="l-etap" ${gotowe ? '' : 'open'}><summary>${esc(nazwa)} ${gotowe ? '✓' : `<span class="male">(${l.filter((k) => k.status === 'zrobione').length}/${l.length})</span>`}</summary>
        <ol class="zad-lista">${l.map(wiersz).join('')}</ol></details>`;
    }).join('')}
    ${stan.nowe === 'krok' ? formPozycji('krok', null) : '<button type="button" class="plan-dodaj l-dodaj" data-plan="l-nowe" data-rodzaj="krok">+ Dodaj krok</button>'}
    <h3 class="zad-naglowek">Rzeczy</h3>
    ${grupaRzeczy('mamy', 'Posiadane rzeczy')}
    ${grupaRzeczy('do kupienia', 'Do kupienia')}
    ${grupaRzeczy('do ustalenia', 'Do ustalenia')}
    <p class="male">Kółko przy kroku odhacza go (drugie dotknięcie odznacza). Przy rzeczy wybierz stan: mamy / do kupienia / do ustalenia.</p>
  </section>`;
}

function formPozycji(rodzaj, p, stanRzeczy) {
  const krok = rodzaj === 'krok';
  return `<form class="zad-form" data-projekt-form="${p ? esc(p.id) : 'nowe:' + rodzaj + ':' + (stanRzeczy || '')}">
    <label><span>${krok ? 'Krok' : 'Rzecz'}</span><input name="nazwa" required maxlength="200" value="${esc(p?.nazwa || '')}"></label>
    ${krok ? `<label><span>Etap</span><select name="etap">${ETAPY.map((n, i) => `<option value="${i}" ${i === (p?.etap ?? 0) ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}
    <label><span>Notatka</span><input name="notatka" maxlength="500" value="${esc(p?.notatka || '')}" placeholder="${krok ? 'opcjonalnie' : 'np. ilość, gdzie kupić'}"></label>
    <div class="zad-form-przyciski">
      <button type="submit" class="glowny">${p ? 'Zapisz' : 'Dodaj'}</button>
      <button type="button" data-plan="anuluj">Anuluj</button>
      ${p ? '<button type="button" data-plan="l-usun" class="zad-usun">Usuń</button>' : ''}
    </div>
  </form>`;
}

function zapiszPozycje(f) {
  const d = Object.fromEntries(new FormData(f));
  const nazwa = String(d.nazwa || '').trim();
  if (!nazwa) return;
  const pola = { nazwa, notatka: String(d.notatka || '').trim(), ...(d.etap !== undefined ? { etap: Number(d.etap) } : {}) };
  stan.nowe = false; stan.edytowane = null;
  const cel = f.dataset.projektForm;
  if (!cel.startsWith('nowe:')) { zmien(cel, pola, 'łazienka: edycja'); return; }
  const [, rodzaj, st] = cel.split(':');
  const ost = pozycje().filter((p) => p.rodzaj === rodzaj).at(-1);
  const id = dane.wolnyId('lazienka-', dane.zajeteId(), 3);
  try {
    sledz(dane.utworzElement(() => ({
      dane: { id, kategoria: 'projekt', projekt: PROJEKT, rodzaj, status: rodzaj === 'krok' ? 'do zrobienia' : (st || 'do ustalenia'),
        nr: rodzaj === 'krok' ? pozycje().filter((p) => p.rodzaj === 'krok').length + 1 : null,
        kolejnosc: (ost?.kolejnosc ?? 0) + 10, usuniety: false, ...pola, wersja: 1 },
      hist: { operacja: 'łazienka: nowa pozycja', przed: null, po: pola },
    })), 'łazienka: nowa pozycja');
  } catch (err) { stan.komunikat = err.message; rysuj(); }
}

function wczytajLazienke() {
  if (pozycje().length) return;
  const lista = [
    ...KROKI_START.map(([etap, nazwa, notatka], i) => ({ rodzaj: 'krok', etap, nazwa, notatka, status: 'do zrobienia', nr: i + 1, kolejnosc: (i + 1) * 10 })),
    ...RZECZY_START.map(([status, nazwa, notatka], i) => ({ rodzaj: 'rzecz', status, nazwa, notatka, kolejnosc: 1000 + (i + 1) * 10 })),
  ];
  try {
    sledz(dane.utworzWiele(lista.map((p, i) => ({
      dane: { id: 'lazienka-' + String(i + 1).padStart(3, '0'), kategoria: 'projekt', projekt: PROJEKT, usuniety: false, ...p, wersja: 1 },
      hist: { operacja: 'łazienka: lista startowa', przed: null, po: { nazwa: p.nazwa, status: p.status } },
    }))), 'łazienka: lista startowa');
  } catch (err) { stan.komunikat = err.message; rysuj(); }
}
