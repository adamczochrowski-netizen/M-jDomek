// Szybki przegląd działania aplikacji w przeglądarce (do wklejenia w konsoli albo uruchomienia z narzędzi testowych).
// Sprawdza: model 3D, kartę punktu, rozdzielnicę, kurki, Wyposażenie, konto i przewijanie w bok.
// Wynik: obiekt z liczbami – porównaj z oczekiwanymi (69 punktów, 18 wyłączników, 9 kurków…).
window.przegladMojegoDomku = async function () {
  const czekaj = (ms) => new Promise((r) => setTimeout(r, ms));
  const w = {};
  location.hash = '#widok'; await czekaj(900);
  w.motyw = document.documentElement.dataset.motyw;
  w.szerokosc = innerWidth;
  w.punkty3d = window.mojDomek?.stan.A?.items.length ?? 0;
  location.hash = '#punkt=kuchnia-Z06'; await czekaj(900);
  w.karta = !document.getElementById('karta').hidden ? document.querySelector('#karta h3')?.innerText : 'BRAK';
  location.hash = '#elektryka'; await czekaj(2500);
  w.wylaczniki = document.querySelectorAll('.wyl-svg').length;
  location.hash = '#ogrzewanie'; await czekaj(2000);
  w.kurki = document.querySelectorAll('.kurek').length;
  location.hash = '#mamy'; await czekaj(2500);
  w.wyposazenie = document.querySelectorAll('.pozycja').length;
  w.konto = document.getElementById('konto').innerText.split('\n')[0];
  w.przewijanieWBok = [...document.querySelectorAll('.strona')].some((s) => s.scrollWidth > s.clientWidth + 1);
  w.bledy = (window.__bledy || []).slice(-5);
  location.hash = '#widok';
  return w;
};
if (!window.__bledy) { window.__bledy = []; addEventListener('error', (e) => window.__bledy.push(String(e.message))); }
