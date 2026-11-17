// Testy terminów przeglądów i plików kalendarza: node --test testy/
import test from 'node:test';
import assert from 'node:assert/strict';
import { dodajOkres, nastepnyTermin, stanTerminu, opisCzestosci, linkGoogle, plikIcs } from '../js/przeglady.js';

test('dodajOkres: miesiące z końcem miesiąca, lata, dni', () => {
  assert.equal(dodajOkres('2026-01-31', 1, 'mies'), '2026-02-28');
  assert.equal(dodajOkres('2027-11-30', 3, 'mies'), '2028-02-29');
  assert.equal(dodajOkres('2026-11-17', 12, 'mies'), '2027-11-17');
  assert.equal(dodajOkres('2026-11-17', 5, 'lata'), '2031-11-17');
  assert.equal(dodajOkres('2026-12-30', 3, 'dni'), '2027-01-02');
});

test('nastepnyTermin: od „ostatnio”; bez daty – brak; sezonowe – 1. dzień miesiąca', () => {
  assert.equal(nastepnyTermin({ co: 6, jedn: 'mies', ostatnio: '2026-05-12' }, '2026-11-17'), '2026-11-12');
  assert.equal(nastepnyTermin({ co: 6, jedn: 'mies' }, '2026-11-17'), null);
  assert.equal(nastepnyTermin({ miesiac: 9 }, '2026-11-17'), '2027-09-01');
  assert.equal(nastepnyTermin({ miesiac: 9 }, '2026-08-10'), '2026-09-01');
  assert.equal(nastepnyTermin({ miesiac: 9, ostatnio: '2026-09-20' }, '2026-11-17'), '2027-09-01');
  assert.equal(nastepnyTermin({ miesiac: 9, ostatnio: '2026-03-01' }, '2026-08-01'), '2026-09-01');
});

test('stanTerminu i opis częstotliwości', () => {
  assert.equal(stanTerminu('2026-11-12', '2026-11-17'), 'przeterminowane');
  assert.equal(stanTerminu('2026-11-30', '2026-11-17'), 'ten-miesiac');
  assert.equal(stanTerminu('2026-12-01', '2026-11-17'), 'pozniej');
  assert.equal(stanTerminu(null, '2026-11-17'), 'brak');
  assert.equal(opisCzestosci({ co: 1, jedn: 'mies' }), 'co miesiąc');
  assert.equal(opisCzestosci({ co: 6, jedn: 'mies' }), 'co 6 miesięcy');
  assert.equal(opisCzestosci({ co: 5, jedn: 'lata' }), 'co 5 lat');
  assert.equal(opisCzestosci({ co: 3, jedn: 'mies' }), 'co 3 miesiące');
  assert.equal(opisCzestosci({ miesiac: 9 }), 'co roku, wrzesień');
});

test('kalendarz: link Google z RRULE i plik .ics', () => {
  const p = { id: 'przeglad-001', nazwa: 'Filtr wody; kuchnia, test', co: 3, jedn: 'mies', notatka: 'a\nb' };
  const u = new URL(linkGoogle(p, '2026-12-01'));
  assert.equal(u.searchParams.get('recur'), 'RRULE:FREQ=MONTHLY;INTERVAL=3');
  assert.equal(u.searchParams.get('dates'), '20261201/20261202');
  const ics = plikIcs(p, '2026-12-01', new Date('2026-11-17T10:00:00Z'));
  assert.match(ics, /DTSTART;VALUE=DATE:20261201\r\n/);
  assert.match(ics, /RRULE:FREQ=MONTHLY;INTERVAL=3\r\n/);
  assert.match(ics, /SUMMARY:Mój domek: Filtr wody\\; kuchnia\\, test\r\n/);
  assert.match(ics, /TRIGGER:-PT15H/);
  assert.equal(new URL(linkGoogle({ nazwa: 'x', miesiac: 9 }, '2027-09-01')).searchParams.get('recur'), 'RRULE:FREQ=YEARLY');
});
