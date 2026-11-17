// Mój domek – „Plan prac”: co po kolei zrobić i co już jest zrobione (prośba Adama, 17.11.2026).
// Zadania są we wspólnej bazie (domy/moj-dom/elementy, kategoria „zadanie”) – edytuje je każdy członek domu,
// każda zmiana ma wersję i wpis w historii (te same reguły co punkty). Bez logowania plan nie jest widoczny.
// Działy i ujednolicenie Adam ustali później – na razie prosta lista: status, dział, notatka, kolejność.
import * as dane from './dane/elementy.js';
import { ustawZapis } from './status.js';

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
  ['do zrobienia', 'Pomiary', 'Studnia: położenie w bok i pojemność hydroforu z tabliczki', ''],
  ['do zrobienia', 'Pomiary', 'Oczyszczalnia: położenie, szerokość i trasa rur', 'dziś szacunek'],
  ['do zrobienia', 'Pomiary', 'Złącze: odległość od okna, wysokość i wymiary skrzynki', ''],
  ['do zrobienia', 'Pomiary', 'Pompa ciepła: płyta pod pompą i wysokość nad ziemią', ''],
  ['do zrobienia', 'Pomiary', 'Działka: siatka, brama i stodoły', 'rysunek na zrzucie z góry'],
  ['do zrobienia', 'Pomiary', 'Podłogi: grubość paneli i płytek', ''],
  ['do zrobienia', 'Instalacje', 'Bezpieczniki: sprawdzić w domu, co zasilają', 'w aplikacji „sprawdź w domu, co zasila”, potem lista do arkusza (kolumna Punkty)'],
  ['do zrobienia', 'Aplikacja', 'Trasy kabli ze zdjęć jako przybliżona warstwa', ''],
  ['do zrobienia', 'Aplikacja', 'Trasy rur ogrzewania podłogowego i miejsce rozdzielacza', ''],
  ['do zrobienia', 'Aplikacja', 'Hydraulika: woda i kanalizacja w domu', ''],
  ['do zrobienia', 'Aplikacja', 'Zdjęcia w aplikacji', 'decyzja o planie Blaze w Firebase'],
  ['do zrobienia', 'Dokumentacja', 'Dział Dokumentacja: instrukcje, gwarancje', ''],
  ['do zrobienia', 'Aplikacja', 'Test aplikacji na prawdziwym telefonie i dostęp Magdy', 'Magda: ponownie opublikować reguły bazy'],
];

const stan = { edytowane: null, nowe: false, pokazZrobione: false, komunikat: '' };
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

export function otworzPlan(element) {
  el = element;
  rysuj();
}
window.addEventListener('mojdomek:baza', () => { if (el && document.body.dataset.sekcja === 'plan') rysuj(); });

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
  const wsz = zadania();
  const wToku = wsz.filter((z) => z.status === 'w toku');
  const doZr = wsz.filter((z) => z.status !== 'w toku' && z.status !== 'zrobione');
  const zrob = wsz.filter((z) => z.status === 'zrobione').sort((a, c) => String(c.zrobiono || '').localeCompare(String(a.zrobiono || '')));
  const lista = (l, tytul, klasa) => (l.length ? `<h3 class="zad-naglowek ${klasa}">${tytul} <span class="male">(${l.length})</span></h3>
    <ol class="zad-lista">${l.map((z, i) => wierszZadania(z, i, l)).join('')}</ol>` : '');
  el.innerHTML = `
    <section class="karta-strony plan">
      ${stan.komunikat ? `<p class="uwaga">${esc(stan.komunikat)}</p>` : ''}
      ${wsz.length ? `<div class="plan-postep" role="img" aria-label="Zrobione ${zrob.length} z ${wsz.length}">
          <div class="plan-pasek"><span style="width:${Math.round(100 * zrob.length / wsz.length)}%"></span></div>
          <span class="male">Zrobione ${zrob.length} z ${wsz.length}</span></div>` : ''}
      ${stan.nowe ? formularz(null) : '<button type="button" class="plan-dodaj" data-plan="nowe">+ Dodaj zadanie</button>'}
      ${lista(wToku, 'W toku', 'n-wtoku')}
      ${lista(doZr, 'Do zrobienia – po kolei', 'n-dozr')}
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
      default:
    }
  };
  el.onsubmit = (e) => {
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
