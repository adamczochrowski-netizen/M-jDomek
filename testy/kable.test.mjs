// Testy wyprowadzeń kabli: node --test testy/kable.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analizuj, KOLEJNOSC_TYPOW } from '../js/analiza.js';

const M = JSON.parse(readFileSync(new URL('../dane_modelu.json', import.meta.url), 'utf8'));
const A = analizuj(M);

test('kable są osobną listą – nie punktami', () => {
  assert.equal(A.kable.length, M.wyprowadzenia.length);
  assert.equal(A.items.length, M.items.length);
  assert.ok(!A.items.some((p) => p.typ === 'K'));
  assert.ok(!KOLEJNOSC_TYPOW.includes('K'));
  assert.equal(new Set([...A.items, ...A.kable].map((p) => p.id)).size, A.items.length + A.kable.length);
});

test('kabel dostaje pomieszczenie i pewność ze źródła', () => {
  const k = (id) => A.kable.find((p) => p.id === id);
  assert.equal(k('kabel-biuro-adam-kinkiet').pokoj.nazwa, 'Biuro - Adam');
  assert.equal(k('kabel-biuro-adam-kinkiet').z, 197);
  assert.equal(k('kabel-lazienka-led-nad-wc').pokoj.nazwa, 'Łazienka');
  for (const [i, p] of A.kable.entries()) assert.equal(p.wiar, M.wyprowadzenia[i].zrodlo === 'pomiar' ? 'P' : 'R');
});

test('brak klucza „wyprowadzenia” nie psuje modelu', () => {
  assert.deepEqual(analizuj({ ...M, wyprowadzenia: undefined }).kable, []);
});
