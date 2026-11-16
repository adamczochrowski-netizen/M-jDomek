// Mój domek – warstwa danych: elementy domu we wspólnej bazie (Firestore: domy/moj-dom/elementy).
// Etap 2: punkty elektryczne. Rysunek (dane_modelu.json z ODSWIEZ.bat) jest źródłem, z którego punkty
// przenosi się do bazy; po zalogowaniu aplikacja pokazuje punkty z bazy (z kopii na urządzeniu, także bez sieci).
// Firebase ładuje się dopiero po zalogowaniu (import dynamiczny) – bez niego wszystko działa na pliku jak dotąd.
// Funkcje porównujące nie zależą od przeglądarki (testy w Node: aplikacja/testy/).

const TYP_ELEMENTU = { Z: 'gniazdo', S: 'gniazdo_sprzet', I: 'gniazdo_indukcja', W: 'lacznik', D: 'dzwonek', G: 'gong', L: 'lampa' };
const POLA_RYSUNKU = ['type', 'x', 'yd', 'z', 'face', 'n', 'pion', 'size', 'opis', 'zrodlo'];
const NAZWY_POL = { type: 'rodzaj', x: 'położenie', yd: 'położenie', face: 'ściana', z: 'wysokość', n: 'ramka', pion: 'ramka',
  size: 'rozmiar', opis: 'opis', zrodlo: 'źródło położenia' };

const mm = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v);
// porównywalny zapis obiektu (Firestore zwraca pola w innej kolejności)
const klucz = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));

// punkt z rysunku w postaci do porównań i zapisu: tylko znane pola, liczby z dokładnością do 1 mm
export function rysunekPunktu(it) {
  const r = {
    type: it.type, x: mm(it.x), yd: mm(it.yd), z: mm(it.z), face: (it.face || []).map(mm),
    n: it.n || 1, pion: !!it.pion, size: mm(it.size ?? 8), opis: it.opis || '',
  };
  if (it.zrodlo) r.zrodlo = String(it.zrodlo);
  return r;
}
const bezZrodla = (r) => { const { zrodlo, ...reszta } = r; return reszta; };

// źródło położenia z generatora (pole „zrodlo”, gdy generuj.py zacznie je zapisywać):
// pomiar → POTWIERDZONA; rysunek, szacunek albo brak informacji → PRAWDOPODOBNA (nigdy na wyrost)
export function wiarygodnoscPolozenia(r) {
  if (r.zrodlo === 'pomiar') return { polozenie: 'POTWIERDZONA', zrodlo: 'pomiar (wymiary.ini)' };
  if (r.zrodlo === 'szacunek' || r.zrodlo === 'pomiar+szacunek') return { polozenie: 'PRAWDOPODOBNA', zrodlo: 'częściowo szacunek ze zdjęcia (wymiary.ini)' };
  if (r.zrodlo === 'rysunek') return { polozenie: 'PRAWDOPODOBNA', zrodlo: 'rysunek PPTX (±10–15 cm)' };
  return { polozenie: 'PRAWDOPODOBNA', zrodlo: 'rysunek PPTX albo wymiary.ini (rodzaj źródła tego punktu jeszcze nieznany)' };
}

// element bazy z punktu rysunku (bez pól zapisu: wersja, kto, kiedy)
export function elementZPunktu(it, data) {
  const r = rysunekPunktu(it);
  const w = wiarygodnoscPolozenia(r);
  return {
    id: it.id, kategoria: 'elektryka', kod: r.type, typ: TYP_ELEMENTU[r.type] || 'inny', opis: r.opis,
    polozenie: { x: r.x, yd: r.yd, z: r.z, face: r.face },
    parametry: { n: r.n, pion: r.pion, size: r.size },
    stan: 'obecny', usuniety: false,
    wiarygodnosc: { polozenie: w.polozenie, polaczenia: 'NIEZWERYFIKOWANA', parametry: 'PRAWDOPODOBNA', zrodlo: w.zrodlo, data },
    rysunek: r,                     // stan rysunku przy ostatnim przeniesieniu – do wykrywania zmian z obu stron
  };
}

// punkt do widoku 3D/2D z elementu bazy (ten sam kształt co w dane_modelu.json + informacje z bazy)
export function punktZElementu(e) {
  const p = e.polozenie || {}, q = e.parametry || {};
  return {
    type: e.kod, x: p.x, yd: p.yd, z: p.z, face: p.face, n: q.n || 1, pion: !!q.pion, size: q.size || 8,
    id: e.id, opis: e.opis || '',
    baza: {
      wiarygodnosc: e.wiarygodnosc || null, wersja: e.wersja || 0, zmienilNazwa: e.zmienilNazwa || '',
      zmieniono: e.zmieniono?.toDate ? e.zmieniono.toDate() : null,
    },
  };
}

const roznicePol = (a, b) => [...new Set(Object.keys({ ...a, ...b })
  .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => NAZWY_POL[k] || k))];

// co trzeba zrobić w bazie, żeby zgadzała się z rysunkiem
// zmiana z rysunku nie nadpisuje elementu poprawionego w aplikacji (to „konflikt” do rozstrzygnięcia ręcznie)
export function porownaj(punktyPliku, elementy) {
  const w = { nowe: [], zmienione: [], przywrocone: [], usuniete: [], konflikty: [], zgodne: 0 };
  const wPliku = new Set();
  for (const it of punktyPliku) {
    if (!it.id || wPliku.has(it.id)) continue;
    wPliku.add(it.id);
    const e = elementy.get(it.id);
    const r = rysunekPunktu(it);
    if (!e) { w.nowe.push({ id: it.id, it }); continue; }
    if (!e.rysunek) { w.konflikty.push({ id: it.id, it, e, pola: ['element dodany w aplikacji ma ten sam identyfikator'] }); continue; }
    const rysunekZmieniony = klucz(r) !== klucz(e.rysunek);
    const poprawionyWAplikacji = klucz(bezZrodla(rysunekPunktu(punktZElementu(e)))) !== klucz(bezZrodla(e.rysunek));
    if (e.usuniety) { w.przywrocone.push({ id: it.id, it, e, pola: ['wrócił na rysunek'] }); continue; }
    if (!rysunekZmieniony) { w.zgodne += 1; continue; }
    (poprawionyWAplikacji ? w.konflikty : w.zmienione).push({ id: it.id, it, e, pola: roznicePol(e.rysunek, r) });
  }
  // znikł z rysunku (np. [Punkty usunięte]) → w bazie tylko oznaczenie „usunięty”, nic nie jest kasowane
  for (const [id, e] of elementy) if (!e.usuniety && e.rysunek && !wPliku.has(id)) w.usuniete.push({ id, e });
  w.doZapisu = w.nowe.length + w.zmienione.length + w.przywrocone.length + w.usuniete.length;
  return w;
}

// ---------------------------------------------------------------- stan bazy w aplikacji
const stan = {
  konto: null,            // { user, dostep }
  aktywna: false,         // zalogowany członek domu – czytamy bazę
  elementy: null,         // Map id → dane elementu (null = jeszcze nie wczytane)
  zKopii: false,          // ostatni odczyt z kopii na urządzeniu (bez potwierdzenia serwera)
  czas: null, blad: '',
  plik: null,             // punkty z rysunku (dane_modelu.json)
  porownywac: true,       // false na GitHub Pages: tam jest kopia rysunku, która może być starsza niż baza
  roznice: null,
  wysylanie: false, komunikat: '',
};
let odsluch = null, fb = null, zaplanowane = false;

function powiadom() {
  if (zaplanowane) return;
  zaplanowane = true;
  queueMicrotask(() => {
    zaplanowane = false;
    stan.roznice = stan.aktywna && stan.elementy && stan.plik && stan.porownywac ? porownaj(stan.plik, stan.elementy) : null;
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('mojdomek:baza'));
  });
}
export const stanBazy = () => stan;

// punkty do pokazania z bazy (null = baza nieaktywna albo pusta – wtedy widok bierze punkty z rysunku)
export function punktyZBazy() {
  if (!stan.aktywna || !stan.elementy) return null;
  const lista = [...stan.elementy.values()].filter((e) => !e.usuniety && e.kategoria === 'elektryka' && e.polozenie);
  return lista.length ? lista.sort((a, b) => (a.id < b.id ? -1 : 1)).map(punktZElementu) : null;
}

// porownywac = false: nie proponuj przenoszenia (kopia rysunku na GitHubie mogłaby cofnąć nowsze dane w bazie)
export function ustawPlik(items, porownywac = true) { stan.plik = items || []; stan.porownywac = porownywac; powiadom(); }

export async function ustawKonto(user, dostep) {
  stan.konto = { user, dostep };
  const czlonek = !!user && (dostep?.stan === 'czlonek' || dostep?.stan === 'offline');
  if (czlonek === stan.aktywna) { powiadom(); return; }
  stan.aktywna = czlonek;
  odsluch?.(); odsluch = null;
  stan.elementy = null; stan.blad = ''; stan.komunikat = '';
  powiadom();
  if (!czlonek) return;
  try {
    fb = fb || await import('../firebase.js');
    const kolekcja = fb.collection(fb.db, 'domy', fb.DOM_ID, 'elementy');
    odsluch = fb.onSnapshot(kolekcja, { includeMetadataChanges: true }, (snap) => {
      const m = new Map();
      snap.forEach((d) => m.set(d.id, { ...d.data(), id: d.id }));
      stan.elementy = m;
      stan.zKopii = snap.metadata.fromCache;
      if (!snap.metadata.fromCache) stan.czas = new Date();
      stan.blad = '';
      powiadom();
    }, (e) => { stan.blad = e.code === 'permission-denied' ? 'brak dostępu do bazy' : (e.code || e.message); powiadom(); });
  } catch (e) { stan.blad = e.message; powiadom(); }
}

// zapis różnic rysunek → baza: każdy element z numerem wersji o 1 większym i wpisem w historii
// (reguły bazy odrzucą całą paczkę, jeśli ktoś w międzyczasie zmienił któryś element)
export async function przeniesZRysunku() {
  const r = stan.roznice;
  const u = fb?.auth.currentUser;
  if (!r || !r.doZapisu || stan.wysylanie) return;
  if (!u) { stan.komunikat = 'Zaloguj się ponownie.'; powiadom(); return; }
  if (typeof navigator !== 'undefined' && !navigator.onLine) { stan.komunikat = 'Brak internetu – przeniesienie wymaga połączenia.'; powiadom(); return; }
  const kto = u.uid, ktoNazwa = (u.displayName || u.email || '').split(' ')[0];
  const dzis = new Date().toISOString().slice(0, 10);
  const partia = 'rysunek-' + Date.now();
  const teraz = fb.serverTimestamp();
  const podpis = { zmienil: kto, zmienilNazwa: ktoNazwa, zmieniono: teraz };
  const ops = [];
  const stary = (e) => ({ polozenie: e.polozenie, parametry: e.parametry, opis: e.opis ?? '', usuniety: !!e.usuniety, wersja: e.wersja });
  for (const { id, it } of r.nowe) {
    const nowy = elementZPunktu(it, dzis);
    ops.push({ id, dane: { ...nowy, ...podpis, utworzono: teraz, wersja: 1 }, nowy: true,
      hist: { operacja: 'import z rysunku', przed: null, po: { polozenie: nowy.polozenie, parametry: nowy.parametry, opis: nowy.opis } } });
  }
  for (const { id, it, e } of [...r.zmienione, ...r.przywrocone]) {
    const nowy = elementZPunktu(it, dzis);
    const zmiana = { kod: nowy.kod, typ: nowy.typ, opis: nowy.opis, polozenie: nowy.polozenie, parametry: nowy.parametry,
      wiarygodnosc: nowy.wiarygodnosc, rysunek: nowy.rysunek, usuniety: false, ...podpis, wersja: (e.wersja || 0) + 1 };
    ops.push({ id, dane: zmiana, hist: { operacja: e.usuniety ? 'przywrócony z rysunku' : 'zmiana z rysunku', przed: stary(e),
      po: { polozenie: nowy.polozenie, parametry: nowy.parametry, opis: nowy.opis, usuniety: false } } });
  }
  for (const { id, e } of r.usuniete) {
    ops.push({ id, dane: { usuniety: true, ...podpis, wersja: (e.wersja || 0) + 1 },
      hist: { operacja: 'usunięty (brak na rysunku)', przed: stary(e), po: { usuniety: true } } });
  }
  stan.wysylanie = true; stan.komunikat = ''; powiadom();
  let zapisane = 0;
  try {
    const dom = fb.doc(fb.db, 'domy', fb.DOM_ID);
    for (let i = 0; i < ops.length; i += 200) {          // paczka: do 401 zapisów (limit Firestore: 500)
      const b = fb.writeBatch(fb.db);
      if (i === 0) b.set(dom, { nazwa: 'Mój dom', zmieniono: teraz }, { merge: true });
      for (const op of ops.slice(i, i + 200)) {
        const ref = fb.doc(fb.db, 'domy', fb.DOM_ID, 'elementy', op.id);
        if (op.nowy) b.set(ref, op.dane); else b.update(ref, op.dane);
        b.set(fb.doc(fb.collection(fb.db, 'domy', fb.DOM_ID, 'historia')), {
          kto, ktoNazwa, kiedy: teraz, element: op.id, partia, ...op.hist,
          opis: `${ktoNazwa}: ${op.hist.operacja} – ${op.id}`,
        });
      }
      await b.commit();                                    // kończy się dopiero po potwierdzeniu przez serwer
      zapisane += Math.min(200, ops.length - i);
    }
    stan.komunikat = `Zapisano ✓ – serwer potwierdził ${zapisane} ${zapisane === 1 ? 'zmianę' : 'zmian'}.`;
  } catch (e) {
    stan.komunikat = (zapisane ? `Zapisano ${zapisane} z ${ops.length}. ` : '')
      + (e.code === 'permission-denied' ? 'Baza odrzuciła zapis (ktoś mógł w tym czasie zmienić dane – spróbuj jeszcze raz).' : 'Błąd zapisu: ' + (e.code || e.message));
  } finally {
    stan.wysylanie = false; powiadom();
  }
}

// ---------------------------------------------------------------- zmiany z aplikacji (edytor)
// zmiana położenia elementu: nowe x/yd/z na tej samej ścianie (face bez zmian), wersja +1, wpis do historii.
// zmierzone = true → POTWIERDZONA (pomiar miarką), inaczej PRAWDOPODOBNA (przesunięte „na oko”)
export function zmianaPolozenia(e, { x, yd, z }, { zmierzone = false, ktoNazwa = '', dzis = '' } = {}) {
  const przed = { polozenie: e.polozenie, wiarygodnosc: e.wiarygodnosc || null };
  const polozenie = { ...e.polozenie, x: mm(x), yd: mm(yd), z: mm(z) };
  const wiarygodnosc = {
    ...(e.wiarygodnosc || {}),
    polozenie: zmierzone ? 'POTWIERDZONA' : 'PRAWDOPODOBNA',
    zrodlo: zmierzone ? `pomiar miarką (${ktoNazwa || 'w aplikacji'})` : `przesunięte w aplikacji bez pomiaru (${ktoNazwa || '?'})`,
    data: dzis,
  };
  return { dane: { polozenie, wiarygodnosc, wersja: (e.wersja || 0) + 1 },
    hist: { operacja: zmierzone ? 'przesunięcie w aplikacji (zmierzone)' : 'przesunięcie w aplikacji', przed, po: { polozenie, wiarygodnosc } } };
}
// cofnięcie: przywraca położenie i wiarygodność sprzed zmiany (też jako nowa wersja – historia zostaje)
export function zmianaCofniecia(e, przed) {
  return { dane: { polozenie: przed.polozenie, wiarygodnosc: przed.wiarygodnosc, wersja: (e.wersja || 0) + 1 },
    hist: { operacja: 'cofnięcie zmiany w aplikacji', przed: { polozenie: e.polozenie, wiarygodnosc: e.wiarygodnosc || null }, po: przed } };
}

// zapis jednej zmiany elementu. Zmiana od razu trafia do kopii na urządzeniu (widok się odświeża),
// a obietnica `wyslano` kończy się po potwierdzeniu przez serwer – bez internetu czeka i wysyła się sama.
export function zapiszZmiane(id, budujZmiane) {
  const e = stan.elementy?.get(id);
  const u = fb?.auth.currentUser;
  if (!stan.aktywna || !e) throw new Error('Ten punkt nie jest jeszcze we wspólnej bazie.');
  if (!u) throw new Error('Zaloguj się ponownie.');
  const kto = u.uid, ktoNazwa = (u.displayName || u.email || '').split(' ')[0];
  const { dane, hist } = budujZmiane(e, { ktoNazwa, dzis: new Date().toISOString().slice(0, 10) });
  const teraz = fb.serverTimestamp();
  const b = fb.writeBatch(fb.db);
  b.update(fb.doc(fb.db, 'domy', fb.DOM_ID, 'elementy', id), { ...dane, zmienil: kto, zmienilNazwa: ktoNazwa, zmieniono: teraz });
  b.set(fb.doc(fb.collection(fb.db, 'domy', fb.DOM_ID, 'historia')), {
    kto, ktoNazwa, kiedy: teraz, element: id, ...hist, opis: `${ktoNazwa}: ${hist.operacja} – ${id}`,
  });
  return { przed: hist.przed, wyslano: b.commit() };
}
