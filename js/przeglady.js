// Mój domek – przeglądy i czynności cykliczne (zakładka w „Planie prac”; prośba Adama, 17.11.2026).
// Pozycje są we wspólnej bazie (elementy, kategoria „przeglad”): co ile, kiedy ostatnio → następny termin.
// Przypomnienia: link „Kalendarz Google” (wydarzenie powtarzające się, RRULE) i plik .ics (iPhone / inne kalendarze) –
// telefon przypomina sam, bez powiadomień z serwera (te wymagałyby planu Blaze).
// Częstotliwości startowe są ORIENTACYJNE („szacunek – do sprawdzenia w instrukcji”), dopóki Adam nie poda ich z instrukcji.

export const JEDNOSTKI = { dni: ['dzień', 'dni', 'dni'], mies: ['miesiąc', 'miesiące', 'miesięcy'], lata: ['rok', 'lata', 'lat'] };
export const ZRODLA = ['szacunek – do sprawdzenia w instrukcji', 'z instrukcji / gwarancji'];
export const MIESIACE = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
const odm = (n, [a, b, c]) => (n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? b : c);

// ---------------------------------------------------------------- daty (ISO „RRRR-MM-DD”, bez stref czasowych)
const zIso = (s) => { const [r, m, d] = String(s).split('-').map(Number); return { r, m, d }; };
const doIso = (r, m, d) => `${r}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dniWMies = (r, m) => new Date(Date.UTC(r, m, 0)).getUTCDate();
export function dodajOkres(iso, n, jedn) {
  const { r, m, d } = zIso(iso);
  if (jedn === 'dni') { const t = new Date(Date.UTC(r, m - 1, d + n)); return t.toISOString().slice(0, 10); }
  const mies = jedn === 'lata' ? 12 * n : n;
  const m0 = m - 1 + mies, r2 = r + Math.floor(m0 / 12), m2 = (m0 % 12 + 12) % 12 + 1;
  return doIso(r2, m2, Math.min(d, dniWMies(r2, m2)));      // 31.01 + 1 mies. = 28/29.02
}
// następny termin: co ile od „ostatnio”; pozycja sezonowa (miesiac 1–12) – raz w roku, 1. dnia tego miesiąca
export function nastepnyTermin(p, dzis) {
  if (p.miesiac) {
    const t = zIso(dzis), m = Number(p.miesiac);
    if (p.ostatnio) { const o = zIso(p.ostatnio); return doIso(o.m < m ? o.r : o.r + 1, m, 1); }
    return doIso(t.m <= m ? t.r : t.r + 1, m, 1);
  }
  if (!p.ostatnio || !p.co) return null;
  return dodajOkres(p.ostatnio, Number(p.co), p.jedn || 'mies');
}
export function stanTerminu(nast, dzis) {
  if (!nast) return 'brak';
  if (nast < dzis) return 'przeterminowane';
  return nast.slice(0, 7) === dzis.slice(0, 7) ? 'ten-miesiac' : 'pozniej';
}
export const opisCzestosci = (p) => (p.miesiac ? `co roku, ${MIESIACE[p.miesiac - 1]}`
  : `co ${Number(p.co) === 1 ? '' : p.co + ' '}${odm(Number(p.co), JEDNOSTKI[p.jedn || 'mies'])}`.replace('co  ', 'co '));

// ---------------------------------------------------------------- kalendarz
const rrule = (p) => (p.miesiac ? 'FREQ=YEARLY' : `FREQ=${{ dni: 'DAILY', mies: 'MONTHLY', lata: 'YEARLY' }[p.jedn || 'mies']};INTERVAL=${Number(p.co) || 1}`);
const bezKresek = (iso) => iso.replace(/-/g, '');
const opisWydarzenia = (p) => [p.urzadzenie && `Urządzenie: ${p.urzadzenie}`, `Częstotliwość: ${opisCzestosci(p)} (${p.zrodlo || ZRODLA[0]})`,
  p.notatka, 'Z aplikacji „Mój domek” – po wykonaniu kliknij tam „Zrobione dziś”.'].filter(Boolean).join('\n');
export function linkGoogle(p, start) {
  const u = new URL('https://calendar.google.com/calendar/render');
  u.searchParams.set('action', 'TEMPLATE');
  u.searchParams.set('text', `Mój domek: ${p.nazwa}`);
  u.searchParams.set('dates', `${bezKresek(start)}/${bezKresek(dodajOkres(start, 1, 'dni'))}`);   // cały dzień
  u.searchParams.set('recur', `RRULE:${rrule(p)}`);
  u.searchParams.set('details', opisWydarzenia(p));
  return u.toString();
}
const icsTekst = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
export function plikIcs(p, start, teraz = new Date()) {
  const stamp = teraz.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Moj domek//PL', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${p.id || 'przeglad'}-${bezKresek(start)}@mojdomek`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${bezKresek(start)}`, `DTEND;VALUE=DATE:${bezKresek(dodajOkres(start, 1, 'dni'))}`,
    `RRULE:${rrule(p)}`, `SUMMARY:${icsTekst('Mój domek: ' + p.nazwa)}`, `DESCRIPTION:${icsTekst(opisWydarzenia(p))}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsTekst(p.nazwa)}`, 'TRIGGER:-PT15H', 'END:VALARM',   // dzień wcześniej o 9:00
    'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}

// ---------------------------------------------------------------- pozycje startowe (zapis dopiero po kliknięciu)
export const START_PRZEGLADOW = [
  ['Oczyszczalnia: biopreparat / tabletka z bakteriami', 'Oczyszczalnia Idmar 2000 l', '#miejsce=Szambo', 1, 'mies', 0, ''],
  ['Oczyszczalnia: wywóz osadu', 'Oczyszczalnia Idmar 2000 l', '#miejsce=Szambo', 6, 'mies', 0, 'orientacyjnie co 6–12 mies.'],
  ['Oczyszczalnia: przegląd', 'Oczyszczalnia Idmar 2000 l', '#miejsce=Szambo', 12, 'mies', 0, ''],
  ['Woda: wymiana / czyszczenie filtra', 'Studnia / hydrofor', '#miejsce=Studnia', 3, 'mies', 0, 'orientacyjnie co 3–6 mies.; gdzie są filtry – do uzupełnienia'],
  ['Hydrofor: ciśnienie powietrza w zbiorniku', 'Hydrofor w studni', '#miejsce=Studnia', 12, 'mies', 0, ''],
  ['Pompa ciepła: czyszczenie filtra siatkowego na wodzie', 'Pompa ciepła Immergas', '#ogrzewanie', 12, 'mies', 0, ''],
  ['Pompa ciepła: przegląd serwisowy', 'Pompa ciepła Immergas', '#ogrzewanie', 12, 'mies', 0, 'często warunek gwarancji – sprawdzić w karcie gwarancyjnej'],
  ['Ogrzewanie podłogowe: odpowietrzenie i rotametry przed sezonem', 'Rozdzielacz ogrzewania podłogowego', '#ogrzewanie', 1, 'lata', 9, ''],
  ['Elektryka: test różnicówki przyciskiem TEST', 'Różnicówka 3.4 w rozdzielnicy', '#wyl=3.4', 6, 'mies', 0, ''],
  ['Elektryka: przegląd instalacji', 'Instalacja elektryczna', '#elektryka', 5, 'lata', 0, ''],
  ['Czujniki dymu / czadu: test i bateria', 'Czujniki dymu / czadu', '', 12, 'mies', 0, 'jeśli są w domu – do potwierdzenia'],
];
