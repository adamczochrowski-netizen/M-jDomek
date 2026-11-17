// Mój domek – service worker: aplikacja na ekranie głównym telefonu i działanie bez internetu (plan GUI, pkt 13).
// Zasada: najpierw sieć (zawsze najnowsza wersja), a gdy jej nie ma – ostatnia zapisana kopia
// (szkielet aplikacji, dane domu, karty z arkusza „MójDomek”).
// Biblioteki Firebase z gstatic mają wersję w adresie (niezmienne) – najpierw z pamięci.
// Logowania i bazy (googleapis, firebaseapp) nie dotykamy – Firebase ma własną kopię danych na urządzeniu.
// Awaryjnie: dopisz do adresu ?bezsw – strona wyrejestruje ten plik i wyczyści pamięć.
const PAMIEC = 'mojdomek-v2';
const SZKIELET = [
  './', 'index.html', 'styl.css', 'manifest.webmanifest', 'obwody.json', 'dane_modelu.json',
  'js/main.js', 'js/sekcje.js', 'js/konto.js', 'js/motyw.js', 'js/status.js', 'js/ikony.js',
  'js/analiza.js', 'js/budowa3d.js', 'js/firebase.js', 'js/dane/elementy.js', 'js/edytor.js', 'js/plan.js', 'js/przeglady.js',
  'lib/three.module.min.js', 'lib/OrbitControls.js', 'ikony/ikona-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAMIEC)
    .then((c) => Promise.allSettled(SZKIELET.map((u) => c.add(new Request(u, { cache: 'reload' })))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((k) => Promise.all(k.filter((n) => n.startsWith('mojdomek-') && n !== PAMIEC).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

// „najpierw sieć” z pominięciem pamięci przeglądarki (GitHub Pages pozwala trzymać pliki 10 min) – serwer
// odpowiada krótko „bez zmian”, gdy plik jest ten sam, więc to nie kosztuje transferu, a nowa wersja jest od razu
const swiezy = (r) => (r.mode === 'navigate'
  ? fetch(r.url, { cache: 'no-cache', credentials: 'same-origin' }).then((o) => (o.redirected ? fetch(r) : o))
  : fetch(r, { cache: 'no-cache' }));
const zapamietaj = (r, o) => { if (o.ok && (o.type === 'basic' || o.type === 'cors')) { const k = o.clone(); caches.open(PAMIEC).then((c) => c.put(r, k)); } return o; };

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;                       // np. sprawdzanie zmian (HEAD) idzie prosto do serwera
  const u = new URL(r.url);
  const swoj = u.origin === self.location.origin;
  const arkusz = u.hostname === 'docs.google.com' && u.pathname.startsWith('/spreadsheets/');
  const biblioteka = u.hostname === 'www.gstatic.com' && u.pathname.startsWith('/firebasejs/');
  if (biblioteka) {
    e.respondWith(caches.match(r).then((z) => z || fetch(r).then((o) => zapamietaj(r, o))));
    return;
  }
  if (!swoj && !arkusz) return;
  e.respondWith(swiezy(r).then((o) => zapamietaj(r, o)).catch(() =>
    caches.match(r, { ignoreSearch: swoj }).then((z) => z || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
