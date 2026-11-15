// Mój domek – pasek stanu danych (plan GUI, pkt 11): skąd są dane, internet, konto, synchronizacja bazy.
// Na komputerze plakietka w nagłówku (dotknięcie otwiera szczegóły w panelu konta), na telefonie kolor kropki przy koncie.
// Przygotowane pod zapis globalny (audyt 12b): ustawZapis({ oczekujace, blad }) pokaże „N zmian czeka” / „Błąd zapisu – ponów”.
// Zasada z rozdz. 22: „zsynchronizowano” tylko po potwierdzeniu serwera (czas z odczytu bez kopii lokalnej).
import { stanBazy } from './dane/elementy.js';

const stan = {
  dane: null,                       // { czas: Date|null, zrodlo: 'plik'|'github'|'kopia', blad }
  siec: typeof navigator === 'undefined' ? true : navigator.onLine,
  punkty: 'plik',                   // 'plik' | 'baza'
  zapis: { oczekujace: 0, blad: null },
};
const el = typeof document !== 'undefined' ? document.getElementById('status') : null;

const godz = (d) => d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
const dzien = (d) => d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const odm = (n, [a, b, c]) => (n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? b : c);

export function ustawDane(v) { stan.dane = v; odswiez(); }
export function ustawPunkty(v) { stan.punkty = v; odswiez(); }
export function ustawZapis(v) { Object.assign(stan.zapis, v); odswiez(); }

// najważniejsza informacja w kilku słowach + klasa koloru (ok / uwaga / blad / wyl)
export function podsumowanie() {
  const b = stanBazy();
  if (!stan.siec) return { klasa: 'uwaga', tekst: 'Bez internetu' };
  if (stan.zapis.blad) return { klasa: 'blad', tekst: 'Błąd zapisu – ponów' };
  if (stan.zapis.oczekujace) return { klasa: 'uwaga', tekst: `${stan.zapis.oczekujace} ${odm(stan.zapis.oczekujace, ['zmiana czeka', 'zmiany czekają', 'zmian czeka'])}` };
  if (b.aktywna && b.blad) return { klasa: 'blad', tekst: 'Błąd bazy' };
  if (b.aktywna && b.elementy && !b.zKopii && b.czas) return { klasa: 'ok', tekst: `Zsynchronizowano ${godz(b.czas)}` };
  if (b.aktywna && b.elementy && b.zKopii) return { klasa: 'uwaga', tekst: 'Kopia z urządzenia' };
  if (stan.dane?.blad) return { klasa: 'blad', tekst: 'Brak danych' };
  if (stan.dane?.czas) return { klasa: 'ok', tekst: `Dane z ${dzien(stan.dane.czas)}` };
  return { klasa: 'wyl', tekst: 'Wczytywanie…' };
}

// szczegóły do panelu konta
export function htmlSzczegoly() {
  const b = stanBazy();
  const wiersze = [];
  const d = stan.dane;
  const skad = d?.zrodlo === 'github' ? 'kopia na GitHubie' : d?.zrodlo === 'kopia' ? 'kopia w folderze aplikacji' : 'plik z ODSWIEZ.bat';
  wiersze.push(['Dane domu', d?.blad ? `<span class="uwaga">nie wczytano (${esc(d.blad)})</span>` : d?.czas ? `${skad}, ${dzien(d.czas)}` : 'wczytywanie…']);
  wiersze.push(['Punkty', stan.punkty === 'baza'
    ? (b.zKopii ? 'wspólna baza – kopia z tego urządzenia' : `wspólna baza – zsynchronizowano ${b.czas ? godz(b.czas) : ''}`)
    : 'z rysunku (plik)']);
  wiersze.push(['Internet', stan.siec ? 'jest' : '<span class="uwaga">brak – pokazuję zapisane dane</span>']);
  if (b.aktywna) wiersze.push(['Do wysłania', stan.zapis.blad ? `<span class="uwaga">błąd zapisu: ${esc(stan.zapis.blad)}</span>` : `${stan.zapis.oczekujace} ${odm(stan.zapis.oczekujace, ['zmiana', 'zmiany', 'zmian'])}`]);
  return `<dl class="k-status">${wiersze.map(([a, c]) => `<dt>${a}</dt><dd>${c}</dd>`).join('')}</dl>`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function odswiez() {
  if (el) {
    const p = podsumowanie();
    el.className = 'status-chip s-' + p.klasa;
    el.innerHTML = `<span class="kropka" aria-hidden="true"></span>${esc(p.tekst)}`;
    el.hidden = false;
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('mojdomek:status'));
}

if (typeof window !== 'undefined') {
  addEventListener('online', () => { stan.siec = true; odswiez(); });
  addEventListener('offline', () => { stan.siec = false; odswiez(); });
  addEventListener('mojdomek:baza', odswiez);
  el?.addEventListener('click', (e) => { e.stopPropagation(); window.dispatchEvent(new Event('mojdomek:otworz-konto')); });
  odswiez();
}
