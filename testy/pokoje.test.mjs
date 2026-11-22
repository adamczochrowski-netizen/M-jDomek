// Testy wymiarów pomieszczeń: node --test testy/pokoje.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analizuj, wymiaryPokoju, cmDokladnie } from '../js/analiza.js';

const A = analizuj(JSON.parse(readFileSync(new URL('../dane_modelu.json', import.meta.url), 'utf8')));

test('każde pomieszczenie ma wymiary i da się znaleźć dla adresu #pokoj=', () => {
  for (const r of A.rooms) {
    assert.ok(wymiaryPokoju(r), r.nazwa);
    assert.ok(A.ceilings.some((c) => c.nazwa === r.nazwa), r.nazwa);
  }
});

test('powierzchnia z danych, nie z mnożenia; dokładność 1 mm', () => {
  const w = wymiaryPokoju({ wymiary: { szerokosc: 655.5, glebokosc: 341.5, powierzchnia_m2: 22.8, uwaga: 'x' } });
  assert.equal(w.wymiary, '655,5 × 341,5 cm');
  assert.equal(w.powierzchnia, '22,80 m²');
  assert.equal(cmDokladnie(174.8), '174,8');
  assert.equal(wymiaryPokoju({}), null);
});

test('✓ tylko gdy całość zmierzona', () => {
  const z = (uwaga) => wymiaryPokoju({ wymiary: { szerokosc: 1, glebokosc: 1, uwaga } }).zmierzone;
  assert.equal(z('zmierzone 16.11.2026'), true);
  for (const u of ['', 'wcześniejszy pomiar, nie sprawdzany 16.11.2026', 'szerokość zmierzona 16.11.2026; głębokość wyliczona',
    'zmierzone 16.11.2026; głębokość wyliczona']) assert.equal(z(u), false, u);
});
