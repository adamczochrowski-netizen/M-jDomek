// Testy warstwy danych (bez przeglądarki i bez bazy): node --test testy/
// Używa prawdziwych punktów z dane_modelu.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { elementZPunktu, punktZElementu, porownaj, rysunekPunktu } from '../js/dane/elementy.js';

const plik = ['../../skrypty/dane_modelu.json', '../dane_modelu.json'].map((p) => new URL(p, import.meta.url)).find((u) => existsSync(u));
const PUNKTY = JSON.parse(readFileSync(plik, 'utf8')).items;
const kopia = (o) => JSON.parse(JSON.stringify(o));
// baza po pierwszym przeniesieniu (tak jak zapisuje przeniesZRysunku, z polami zapisu)
const bazaZ = (punkty) => new Map(punkty.map((it) => [it.id, { ...elementZPunktu(it, '2026-11-15'), wersja: 1, zmienil: 'u1' }]));

test('dane testowe: punkty z identyfikatorami, bez powtórzeń', () => {
  assert.ok(PUNKTY.length >= 60);
  assert.equal(new Set(PUNKTY.map((p) => p.id)).size, PUNKTY.length);
});

test('pusta baza: wszystkie punkty są nowe', () => {
  const r = porownaj(PUNKTY, new Map());
  assert.equal(r.nowe.length, PUNKTY.length);
  assert.equal(r.doZapisu, PUNKTY.length);
});

test('po przeniesieniu: baza zgodna z rysunkiem, punkty wracają do widoku bez zmian (do 1 mm)', () => {
  const baza = bazaZ(PUNKTY);
  const r = porownaj(PUNKTY, baza);
  assert.equal(r.doZapisu, 0);
  assert.equal(r.zgodne, PUNKTY.length);
  for (const it of PUNKTY) {
    const p = punktZElementu(baza.get(it.id));
    for (const k of ['x', 'yd', 'z']) assert.ok(Math.abs(p[k] - it[k]) <= 0.0501, `${it.id}.${k}`);
    assert.deepEqual(p.face.map((v) => (typeof v === 'number' ? Math.round(v) : v)), it.face.map((v) => (typeof v === 'number' ? Math.round(v) : v)));
    assert.equal(p.type, it.type); assert.equal(p.n, it.n || 1); assert.equal(p.pion, !!it.pion); assert.equal(p.id, it.id);
  }
});

test('bez informacji o źródle położenie jest PRAWDOPODOBNA, nigdy POTWIERDZONA', () => {
  for (const it of PUNKTY) {
    const { zrodlo, ...bez } = it;
    const e = elementZPunktu(bez, '2026-11-15');
    assert.equal(e.wiarygodnosc.polozenie, 'PRAWDOPODOBNA');
    assert.equal(e.wiarygodnosc.polaczenia, 'NIEZWERYFIKOWANA');
  }
  assert.equal(elementZPunktu({ ...PUNKTY[0], zrodlo: 'pomiar' }).wiarygodnosc.polozenie, 'POTWIERDZONA');
  for (const z of ['szacunek', 'pomiar+szacunek', 'rysunek', 'cokolwiek'])
    assert.equal(elementZPunktu({ ...PUNKTY[0], zrodlo: z }).wiarygodnosc.polozenie, 'PRAWDOPODOBNA', z);
});

test('POTWIERDZONA tylko dla punktów z pomiaru (pole „zrodlo” z generuj.py)', () => {
  for (const it of PUNKTY) {
    const e = elementZPunktu(it, '2026-11-15');
    assert.equal(e.wiarygodnosc.polozenie === 'POTWIERDZONA', it.zrodlo === 'pomiar', it.id);
  }
});

test('baza sprzed pola „zrodlo”: nowe pole to zmiana „źródło położenia” (bez innych pól)', () => {
  const stare = PUNKTY.map(({ zrodlo, ...bez }) => bez);
  const r = porownaj(PUNKTY, bazaZ(stare));
  const zZrodlem = PUNKTY.filter((p) => p.zrodlo).length;
  assert.equal(r.zmienione.length, zZrodlem);
  for (const x of r.zmienione) assert.deepEqual(x.pola, ['źródło położenia']);
});

test('kolejność pól z bazy nie ma znaczenia (Firestore sortuje klucze)', () => {
  const baza = bazaZ(PUNKTY);
  for (const e of baza.values()) e.rysunek = Object.fromEntries(Object.entries(e.rysunek).reverse());
  assert.equal(porownaj(PUNKTY, baza).doZapisu, 0);
});

test('zmiana na rysunku → „zmienione” z nazwą pola', () => {
  const baza = bazaZ(PUNKTY);
  const nowe = kopia(PUNKTY);
  nowe[0].z += 20;
  nowe[1].opis = 'nowy opis';
  const r = porownaj(nowe, baza);
  assert.deepEqual(r.zmienione.map((x) => x.id), [nowe[0].id, nowe[1].id]);
  assert.deepEqual(r.zmienione[0].pola, ['wysokość']);
  assert.deepEqual(r.zmienione[1].pola, ['opis']);
  assert.equal(r.doZapisu, 2);
});

test('różnica poniżej 1 mm (zaokrąglenia generatora) nie jest zmianą', () => {
  const baza = bazaZ(PUNKTY);
  const nowe = kopia(PUNKTY);
  nowe[0].x += 0.01;
  assert.equal(porownaj(nowe, baza).doZapisu, 0);
});

test('punkt zniknął z rysunku → do oznaczenia jako usunięty; wrócił → przywrócony', () => {
  const baza = bazaZ(PUNKTY);
  const bez = PUNKTY.slice(1);
  const r = porownaj(bez, baza);
  assert.deepEqual(r.usuniete.map((x) => x.id), [PUNKTY[0].id]);
  baza.get(PUNKTY[0].id).usuniety = true;
  assert.equal(porownaj(bez, baza).doZapisu, 0);
  const r2 = porownaj(PUNKTY, baza);
  assert.deepEqual(r2.przywrocone.map((x) => x.id), [PUNKTY[0].id]);
});

test('element poprawiony w aplikacji: zmiana rysunku nie nadpisuje go (konflikt)', () => {
  const baza = bazaZ(PUNKTY);
  const e = baza.get(PUNKTY[2].id);
  e.polozenie = { ...e.polozenie, z: e.polozenie.z + 7 };      // np. edytor
  assert.equal(porownaj(PUNKTY, baza).doZapisu, 0, 'sama poprawka w aplikacji nie jest różnicą do przeniesienia');
  const nowe = kopia(PUNKTY);
  nowe[2].x += 15;
  const r = porownaj(nowe, baza);
  assert.equal(r.doZapisu, 0);
  assert.deepEqual(r.konflikty.map((x) => x.id), [PUNKTY[2].id]);
});

test('elementy spoza rysunku (np. dodane w aplikacji bez pola „rysunek”) nie są oznaczane jako usunięte', () => {
  const baza = bazaZ(PUNKTY);
  baza.set('ZAW-gosp-01', { id: 'ZAW-gosp-01', kategoria: 'hydraulika', wersja: 1 });
  assert.equal(porownaj(PUNKTY, baza).usuniete.length, 0);
});

test('rysunekPunktu: wartości domyślne', () => {
  const r = rysunekPunktu({ type: 'Z', x: 1, yd: 2, z: 3, face: ['v', 1, 1] });
  assert.equal(r.n, 1); assert.equal(r.pion, false); assert.equal(r.opis, ''); assert.equal(r.size, 8);
  assert.equal('zrodlo' in r, false);
});
