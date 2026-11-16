// Mój domek – podgląd 3D: kamery, warstwy, legenda, karta punktu, odświeżanie danych.
import * as THREE from 'three';
import { OrbitControls } from '../lib/OrbitControls.js';
import { analizuj, TYPY, KOLEJNOSC_TYPOW } from './analiza.js';
import { zbudujDom, zbudujSciany, materialy, teksturaWyboru, teksturaZnacznika, ikonaTypu, POZIOM_PODLOGI, KOLOR_RUR } from './budowa3d.js';
import * as dane from './dane/elementy.js';
import { WIAR_OPIS } from './ikony.js';
import { ustawDane, ustawPunkty } from './status.js';

// dane_modelu.json tworzy ODSWIEZ.bat (skrypty/generuj.py):
//  - na komputerze (serwer.py) czytamy świeży plik ../skrypty/dane_modelu.json,
//  - na GitHub Pages – kopię dane_modelu.json obok index.html (wysyła ją WYSLIJ_NA_GITHUB.bat).
const NA_GITHUB = /\.github\.io$/i.test(location.hostname);
const ZRODLA_DANYCH = NA_GITHUB ? ['dane_modelu.json'] : ['../skrypty/dane_modelu.json', 'dane_modelu.json'];
const URL_OBWODOW = 'obwody.json';
const KLUCZ_USTAWIEN = 'mojDomek.ustawienia.v1';
const CO_ILE_SPRAWDZAC_MS = 4000;

const WARSTWY_BUDYNKU = [
  { k: 'sciany', nazwa: 'Ściany', wl: true },
  { k: 'okna', nazwa: 'Okna i drzwi', wl: true },
  { k: 'podlogi', nazwa: 'Podłogi', wl: true },
  { k: 'ogrzewanie', nazwa: 'Ogrzewanie podłogowe', wl: false },
  { k: 'sufity', nazwa: 'Sufity', wl: false },
  { k: 'belka', nazwa: 'Belka (kuchnia | salon)', wl: true },
  { k: 'meble', nazwa: 'Meble', wl: true },
  { k: 'sanitariaty', nazwa: 'Sanitariaty', wl: true },
  { k: 'urzadzenia', nazwa: 'Pompa ciepła (na zewnątrz)', wl: true },
  { k: 'studnia', nazwa: 'Studnia', wl: true },
  { k: 'teren', nazwa: 'Teren (siatka co 1 m)', wl: true },
  { k: 'nazwy', nazwa: 'Nazwy pomieszczeń', wl: true },
];
const NAZWA_WARSTWY_EL = { L: 'Lampy zewnętrzne' };
// tryby widoku (rozdz. 4.2): gotowe zestawy warstw włączane jednym dotknięciem
const TRYBY = {
  standard: { opis: 'Dom z gniazdkami i włącznikami – bez rur i sufitów.', wid: { ogrzewanie: false, sufity: false, meble: false } },
  instalacje: { opis: 'Elektryka i rury ogrzewania podłogowego (schemat).', wid: { ogrzewanie: true, sufity: false, meble: false } },
  techniczny: { opis: 'Wszystkie warstwy oraz informacje o plikach (wymiary.ini, obwody.json).', wid: { ogrzewanie: true, sufity: true, meble: true } },
};
const PODSTAWA_TRYBU = { sciany: true, okna: true, podlogi: true, belka: true, sanitariaty: true, urzadzenia: true, studnia: true, teren: true, nazwy: true };

const $ = (s) => document.querySelector(s);
const dotyk = matchMedia('(pointer: coarse)').matches;
// kolory sceny z motywu (zmienne w styl.css: --scena, --teren, --siatka-1, --siatka-2)
const kolorMotywu = (nazwa, zapas) => getComputedStyle(document.documentElement).getPropertyValue(nazwa).trim() || zapas;

// ---------------------------------------------------------------- stan i ustawienia
const stan = {
  M: null, A: null, obw: null, wersjaDanych: null,
  warstwy: {}, znaczniki: {}, korzen: null,
  wid: {}, wysokoscScian: null, tryb: '3d', wybrany: null, drzwi: 'otwarte',
};
for (const w of WARSTWY_BUDYNKU) stan.wid[w.k] = w.wl;
for (const t of KOLEJNOSC_TYPOW) stan.wid['el_' + t] = true;
try {
  const zap = JSON.parse(localStorage.getItem(KLUCZ_USTAWIEN) || 'null');
  if (zap && zap.wid) Object.assign(stan.wid, zap.wid);
  if (zap && typeof zap.wysokoscScian === 'number') stan.wysokoscScian = zap.wysokoscScian;
  if (zap && zap.trybWarstw) stan.trybWarstw = zap.trybWarstw;
  if (zap && zap.drzwi === 'zamkniete') stan.drzwi = 'zamkniete';
  if (!zap) stan.trybWarstw = 'standard';             // pierwsze uruchomienie: domyślne warstwy = tryb Standard
} catch { /* bez zapisanych ustawień */ }
function zapiszUstawienia() {
  try { localStorage.setItem(KLUCZ_USTAWIEN, JSON.stringify({ wid: stan.wid, wysokoscScian: stan.wysokoscScian, trybWarstw: stan.trybWarstw || null, drzwi: stan.drzwi })); } catch { /* np. tryb prywatny */ }
}

// ---------------------------------------------------------------- renderer, światło, kamery
const kontener = $('#scena');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
kontener.prepend(renderer.domElement);
const scene = new THREE.Scene();
const ustawTlo = () => { scene.background = new THREE.Color(kolorMotywu('--scena', '#1d242c')); render(); };
scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8a80, 1.9));
const slonce = new THREE.DirectionalLight(0xffffff, 1.5);
slonce.position.set(-500, 1000, 700);
scene.add(slonce);
const mat = materialy();
function koloryTerenu() {
  mat.teren.color.set(kolorMotywu('--teren', '#4d5c45'));
  mat.siatka = [kolorMotywu('--siatka-1', '#3f4c38'), kolorMotywu('--siatka-2', '#46553f')];
}
koloryTerenu();

const kamera3d = new THREE.PerspectiveCamera(45, 1, 5, 40000);
const kameraGora = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 40000);
kameraGora.up.set(0, 0, -1);          // na rzucie z góry: x w prawo, yd w dół – jak na rysunku

const ster3d = new OrbitControls(kamera3d, renderer.domElement);
Object.assign(ster3d, { enableDamping: true, dampingFactor: 0.12, maxPolarAngle: Math.PI * 0.495, minDistance: 15, maxDistance: 9000, screenSpacePanning: false, zoomToCursor: true });
const sterGora = new OrbitControls(kameraGora, renderer.domElement);
Object.assign(sterGora, { enableDamping: true, dampingFactor: 0.12, enableRotate: false, screenSpacePanning: true, zoomToCursor: true, minZoom: 0.3, maxZoom: 60, enabled: false });
sterGora.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
sterGora.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };

const kamera = () => (stan.tryb === 'gora' ? kameraGora : kamera3d);
const sterowanie = () => (stan.tryb === 'gora' ? sterGora : ster3d);

// znacznik wybranego punktu (pierścień zawsze na wierzchu)
const wyborGeo = new THREE.BufferGeometry();
wyborGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
const wyborPkt = new THREE.Points(wyborGeo, new THREE.PointsMaterial({
  size: dotyk ? 52 : 44, sizeAttenuation: false, map: teksturaWyboru(), transparent: true, depthTest: false,
}));
wyborPkt.renderOrder = 20;
wyborPkt.visible = false;
scene.add(wyborPkt);
// ikona wybranego punktu – zawsze pełna, nad przygaszoną resztą
const wyborIkona = new THREE.Points(wyborGeo, new THREE.PointsMaterial({
  size: dotyk ? 30 : 26, sizeAttenuation: false, transparent: true, depthTest: false, alphaTest: 0.2,
}));
wyborIkona.renderOrder = 21;
wyborIkona.visible = false;
scene.add(wyborIkona);
const ROZMIAR_ZNACZNIKA = dotyk ? 30 : 26;
function przygasZnaczniki(tak) {
  for (const pts of Object.values(stan.znaczniki || {})) pts.material.opacity = tak ? 0.28 : pts.userData.pelna ?? 1;
}

// ---------------------------------------------------------------- rysowanie na żądanie
let potrzebaRender = true;
function render() { potrzebaRender = true; }
function petla() {
  requestAnimationFrame(petla);
  if (sterowanie().update()) potrzebaRender = true;
  if (!potrzebaRender || !stan.A) return;
  potrzebaRender = false;
  renderer.render(scene, kamera());
  aktualizujEtykiety();
  aktualizujBanki();
}
ster3d.addEventListener('change', () => { render(); planujBanki(); });
sterGora.addEventListener('change', () => { render(); planujBanki(); });

function rozmiar() {
  const w = kontener.clientWidth, h = kontener.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  kamera3d.aspect = w / h;
  kamera3d.updateProjectionMatrix();
  ustawFrustumGora();
  planujBanki();
  // aplikacja mogła wystartować na innej zakładce menu – kadr ustawiamy przy pierwszym pokazaniu sceny
  if (stan.A && !stan.dopasowano) { stan.dopasowano = true; widokUkos(); }
  render();
}
function ustawFrustumGora() {
  if (!stan.A) return;
  const w = kontener.clientWidth, h = kontener.clientHeight, a = w / h || 1;
  const bb = stan.A.bbox, m = 70;
  const half = Math.max((bb.y1 - bb.y0) / 2 + m, ((bb.x1 - bb.x0) / 2 + m) / a);
  Object.assign(kameraGora, { left: -half * a, right: half * a, top: half, bottom: -half });
  kameraGora.updateProjectionMatrix();
}
new ResizeObserver(rozmiar).observe(kontener);

// ---------------------------------------------------------------- widoki
function srodekDomu() {
  const bb = stan.A.bbox;
  return new THREE.Vector3((bb.x0 + bb.x1) / 2, 0, (bb.y0 + bb.y1) / 2);
}
function przelaczTryb(tryb) {
  stan.tryb = tryb;
  ster3d.enabled = tryb === '3d';
  sterGora.enabled = tryb === 'gora';
  const b = $('#btn-gora');
  b.textContent = tryb === 'gora' ? 'Widok 3D' : 'Rzut z góry';
  b.classList.toggle('aktywny', tryb === 'gora');
  document.querySelectorAll('[data-widok]').forEach((el) => el.classList.toggle('aktywny', el.dataset.widok === (tryb === 'gora' ? 'gora' : 'ukos') && !stan.ujecie));
  render();
}
function widokUkos() {
  stan.ujecie = null;
  $('#kamery').value = '';
  przelaczTryb('3d');
  const c = srodekDomu(), bb = stan.A.bbox;
  kamera3d.fov = 45;
  kamera3d.updateProjectionMatrix();
  const r = 0.5 * Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0);
  const vf = THREE.MathUtils.degToRad(kamera3d.fov);
  const hf = 2 * Math.atan(Math.tan(vf / 2) * kamera3d.aspect);
  // w pionie dom jest skrócony perspektywą (można podejść bliżej), w poziomie widać całą przekątną
  const d = Math.max((r / Math.sin(vf / 2)) * 0.82, (r / Math.sin(hf / 2)) * 1.02);
  const kier = new THREE.Vector3(900, 1200, 1100).normalize();   // jak kamera „z ukosa” w Blenderze
  ster3d.target.copy(c).setY(40);
  kamera3d.position.copy(ster3d.target).addScaledVector(kier, d);
  ster3d.update();
  przelaczTryb('3d');
}
function widokGora() {
  stan.ujecie = null;
  $('#kamery').value = '';
  const c = srodekDomu();
  sterGora.target.copy(c);
  kameraGora.position.set(c.x, 3000, c.z);
  kameraGora.zoom = 1;
  ustawFrustumGora();
  kameraGora.lookAt(c);
  sterGora.update();
  przelaczTryb('gora');
}
function ujecie(k) {
  stan.ujecie = k;
  przelaczTryb('3d');
  const pol = Math.atan(18 / (k.obiektyw || 20));      // obiektyw jak w Blenderze (matryca 36 mm)
  const a = kamera3d.aspect;
  kamera3d.fov = THREE.MathUtils.radToDeg(2 * (a >= 1 ? Math.atan(Math.tan(pol) / a) : pol));
  kamera3d.updateProjectionMatrix();
  kamera3d.position.set(k.pos[0], k.pos[2] + POZIOM_PODLOGI, k.pos[1]);
  ster3d.target.set(k.cel[0], k.cel[2] + POZIOM_PODLOGI, k.cel[1]);
  ster3d.update();
  przelaczTryb('3d');
}

// ---------------------------------------------------------------- etykiety pomieszczeń (HTML nad sceną)
const etykietyEl = $('#etykiety');
let etykiety = [];
function zbudujEtykiety() {
  etykietyEl.textContent = '';
  etykiety = stan.A.rooms.map((r) => {
    const el = document.createElement('div');
    el.className = 'etykieta';
    const b = document.createElement('b');
    b.innerHTML = r.lines.map(esc).join('<br>');
    const s = document.createElement('span');
    s.textContent = `sufit ${fmtLiczba(r.sufit)} cm`;
    el.append(b, s);
    etykietyEl.append(el);
    const [x, z] = r.centre3d;
    return {
      el, poz: new THREE.Vector3(x, POZIOM_PODLOGI + 2, z),
      // blednie tylko, gdy żaden z tych punktów pomieszczenia nie jest widoczny
      proby: [POZIOM_PODLOGI + 2, 120, r.sufit - 15].map((y) => new THREE.Vector3(x, y, z)),
    };
  });
}
const _v = new THREE.Vector3();
function aktualizujEtykiety() {
  if (!stan.wid.nazwy) return;
  const w = kontener.clientWidth, h = kontener.clientHeight, cam = kamera();
  // z daleka sama nazwa (mniej zasłania punkty); wysokość sufitu po przybliżeniu
  const blisko = stan.tryb === 'gora' ? kameraGora.zoom >= 1.8 : kamera3d.position.distanceTo(ster3d.target) < 1100;
  etykietyEl.classList.toggle('szczegoly', blisko);
  for (const e of etykiety) {
    _v.copy(e.poz).project(cam);
    const ok = _v.z > -1 && _v.z < 1;
    e.el.style.display = ok ? '' : 'none';
    if (ok) e.el.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px) translate(-50%, -50%)`;
  }
  clearTimeout(aktualizujEtykiety.t);
  aktualizujEtykiety.t = setTimeout(zaslonieteEtykiety, 150);   // gdy kamera się zatrzyma
}
// nazwy pomieszczeń schowane za ścianami robią się blade
function zaslonieteEtykiety() {
  if (!stan.wid.nazwy || !stan.A) return;
  const cam = kamera(), przeszkody = zaslaniajace();
  for (const e of etykiety) e.el.classList.toggle('zasloniety', e.proby.every((q) => zasloniety(q, cam, przeszkody)));
}

// ---------------------------------------------------------------- bliskie punkty: bańka z liczbą
// Punkty, które na ekranie nachodzą na siebie (np. potrójne gniazdko), chowamy i pokazujemy jedną bańkę „3”.
// Dotknięcie bańki przybliża widok, aż punkty się rozdzielą. Przeliczenie po zatrzymaniu kamery.
const bankiEl = document.createElement('div');
bankiEl.id = 'banki';
kontener.append(bankiEl);
let banki = [];
function pokazZnacznik(p, tak) {
  const r = p.znacznikRef;
  if (!r) return;
  const a = r.pts.geometry.attributes.position;
  a.setXYZ(r.i, p.znacznik.x, tak ? p.znacznik.y : -1e7, p.znacznik.z);
  a.needsUpdate = true;
}
function planujBanki(ms = 160) {
  clearTimeout(planujBanki.t);
  planujBanki.t = setTimeout(przeliczBanki, ms);
}
function przeliczBanki() {
  if (!stan.A) return;
  const w = kontener.clientWidth, h = kontener.clientHeight, cam = kamera();
  if (!w || !h) return;
  const R = dotyk ? 28 : 20;
  const kand = [];
  for (const p of stan.A.items) {
    p.wBance = false;
    if (!widocznyPunkt(p) || p === stan.wybrany) continue;
    _v.copy(p.znacznik).project(cam);
    if (_v.z < -1 || _v.z > 1) continue;
    const sx = ((_v.x + 1) / 2) * w, sy = ((1 - _v.y) / 2) * h;
    if (sx < -R || sy < -R || sx > w + R || sy > h + R) continue;
    kand.push({ p, sx, sy });
  }
  // tylko punkty, które mają sąsiada i nie są zasłonięte ścianą (zasłonięte i tak nie są widoczne)
  const maSasiada = kand.filter((a) => kand.some((b) => a !== b && Math.hypot(a.sx - b.sx, a.sy - b.sy) <= R));
  const przeszkody = zaslaniajace();
  const widoczne = maSasiada.filter((k) => !zasloniety(k.p.znacznik, cam, przeszkody)).sort((a, b) => a.sx - b.sx);
  const grupy = [];
  for (const a of widoczne) {
    if (a.g) continue;
    const g = [a];
    a.g = g;
    for (const b of widoczne) if (!b.g && Math.hypot(a.sx - b.sx, a.sy - b.sy) <= R) { b.g = g; g.push(b); }
    if (g.length > 1) grupy.push(g.map((k) => k.p));
  }
  for (const g of grupy) for (const p of g) p.wBance = true;
  for (const p of stan.A.items) if (p.znacznikRef) pokazZnacznik(p, !p.wBance);
  bankiEl.textContent = '';
  banki = grupy.map((punkty) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'banka';
    el.textContent = String(punkty.length);
    el.setAttribute('aria-label', `${punkty.length} punkty blisko siebie: ${punkty.map((p) => p.id).join(', ')} – przybliż`);
    el.title = punkty.map((p) => p.id).join(', ');
    const srodek = punkty.reduce((s, p) => s.add(p.znacznik), new THREE.Vector3()).multiplyScalar(1 / punkty.length);
    el.addEventListener('click', () => przyblizDo(srodek));
    bankiEl.append(el);
    return { el, srodek };
  });
  aktualizujBanki();
  render();
}
function aktualizujBanki() {
  if (!banki.length) return;
  const w = kontener.clientWidth, h = kontener.clientHeight, cam = kamera();
  for (const b of banki) {
    _v.copy(b.srodek).project(cam);
    const ok = _v.z > -1 && _v.z < 1;
    b.el.style.display = ok ? '' : 'none';
    if (ok) b.el.style.transform = `translate(${((_v.x + 1) / 2) * w}px, ${((1 - _v.y) / 2) * h}px) translate(-50%, -50%)`;
  }
}
function przyblizDo(c) {
  if (stan.tryb === 'gora') {
    sterGora.target.set(c.x, 0, c.z);
    kameraGora.position.set(c.x, 3000, c.z);
    kameraGora.zoom = Math.min(sterGora.maxZoom, kameraGora.zoom * 2.6);
    kameraGora.updateProjectionMatrix();
    kameraGora.lookAt(c.x, 0, c.z);
    sterGora.update();
  } else {
    const kier = kamera3d.position.clone().sub(ster3d.target);
    const d = Math.max(ster3d.minDistance * 3, kier.length() * 0.38);
    ster3d.target.copy(c);
    kamera3d.position.copy(c).addScaledVector(kier.normalize(), d);
    ster3d.update();
  }
  planujBanki(0);
  render();
}

// ---------------------------------------------------------------- budowa sceny z danych
function zwolnij(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    // tekstury ikon są wspólne (pamięć w budowa3d.js) – zwalniamy tylko materiał znaczników
    if (o.isPoints && o !== wyborPkt && o !== wyborIkona) o.material.dispose();
    else if (o.userData?.wlasnyMaterial) { o.material.map?.dispose(); o.material.dispose(); }
  });
}
const widokWidoczny = () => document.body.dataset.sekcja === 'widok';
function zbudujScene() {
  if (!widokWidoczny()) { stan.scenaCzeka = true; return; }
  stan.scenaCzeka = false;
  if (stan.korzen) { scene.remove(stan.korzen); zwolnij(stan.korzen); }
  const zs = stan.wysokoscScian != null ? Math.min(stan.wysokoscScian, stan.A.zCeil) : null;
  const { warstwy, znaczniki } = zbudujDom(stan.M, stan.A, mat, { wysokoscScian: zs, ogrzewanie: stan.obw?.ogrzewanie_podlogowe, drzwi: stan.drzwi });
  stan.warstwy = warstwy;
  stan.znaczniki = znaczniki;
  stan.korzen = new THREE.Group();
  for (const g of Object.values(warstwy)) stan.korzen.add(g);
  scene.add(stan.korzen);
  for (const p of Object.values(znaczniki)) p.material.size = ROZMIAR_ZNACZNIKA;
  banki = []; bankiEl.textContent = '';
  if (stan.wybrany) przygasZnaczniki(true);
  ustawCiecie();
  zbudujEtykiety();
  zastosujWidocznosc();
  if (stan.podswietlonePetle) podswietlOgrzewanie(stan.podswietlonePetle);
}
// okna i drzwi przycinamy razem ze ścianami (płaszczyzna cięcia na wysokości ścian)
const ciecie = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6);
renderer.localClippingEnabled = true;
for (const m of [mat.rama, mat.szklo, mat.drzwi, mat.drzwiZewn]) m.clippingPlanes = [ciecie];
function ustawCiecie() {
  ciecie.constant = stan.wysokoscScian != null && stan.A && stan.wysokoscScian < stan.A.zCeil
    ? stan.wysokoscScian + POZIOM_PODLOGI : 1e6;
}
function przebudujSciany() {
  const g = stan.warstwy.sciany;
  if (!g) return;
  zwolnij(g);
  g.clear();
  const nowe = zbudujSciany(stan.A, mat, stan.wysokoscScian ?? stan.A.zCeil);
  for (const c of [...nowe.children]) g.add(c);
  ustawCiecie();
  render();
}
function zastosujWidocznosc() {
  for (const [k, g] of Object.entries(stan.warstwy)) g.visible = !!stan.wid[k];
  etykietyEl.style.display = stan.wid.nazwy ? '' : 'none';
  planujBanki(0);
  if (stan.wybrany && !stan.wid['el_' + stan.wybrany.typ]) zamknijKarte();
  render();
}

// ---------------------------------------------------------------- panel: warstwy i legenda
function odmiana(n, [jeden, kilka, wiele]) {
  if (n === 1) return jeden;
  const d = n % 10, s = n % 100;
  return d >= 2 && d <= 4 && (s < 12 || s > 14) ? kilka : wiele;
}
function fmtLiczba(v) { return String(Math.round(v * 2) / 2).replace('.', ','); }
const cm = (v) => `${fmtLiczba(v)} cm`;
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }

function wierszWarstwy(k, nazwa, { ikona, ile, wylaczony, tytul } = {}) {
  const l = document.createElement('label');
  l.className = 'wiersz' + (ikona ? ' el' : '') + (wylaczony ? ' wylaczony' : '');
  if (tytul) l.title = tytul;
  const i = document.createElement('input');
  i.type = 'checkbox';
  i.checked = !!stan.wid[k] && !wylaczony;
  i.disabled = !!wylaczony;
  i.dataset.k = k;
  i.addEventListener('change', () => { stan.wid[k] = i.checked; ustawTryb(null); zapiszUstawienia(); zastosujWidocznosc(); });
  l.append(i);
  if (ikona) { const im = document.createElement('img'); im.className = 'ikona'; im.alt = ''; im.src = ikona; l.append(im); }
  const n = document.createElement('span'); n.className = 'nazwa'; n.textContent = nazwa; l.append(n);
  const c = document.createElement('span'); c.className = 'ile'; c.textContent = ile ?? ''; l.append(c);
  return l;
}

function zbudujPanel() {
  const A = stan.A, M = stan.M;
  const lb = $('#lista-budynek');
  lb.textContent = '';
  $('#lista-ogrzewanie').textContent = '';
  for (const w of WARSTWY_BUDYNKU) {
    let ile = '', wylaczony = false, tytul = '';
    if (w.k === 'meble') {
      ile = String((M.furniture || []).length);
      if (!(M.furniture || []).length) { wylaczony = true; ile = 'wyłączone'; tytul = 'Włącz w wymiary.ini: [Meble] pokaż = tak, potem ODSWIEZ.bat'; }
    }
    if (w.k === 'sanitariaty') ile = String((M.sanitariaty || []).length);
    const jestStudnia = (f) => /^studnia/i.test(f.nazwa || '');
    if (w.k === 'urzadzenia') { wylaczony = !(M.urzadzenia || []).filter((f) => !jestStudnia(f)).length; ile = wylaczony ? 'brak danych' : ''; }
    if (w.k === 'studnia') { wylaczony = !(M.urzadzenia || []).some(jestStudnia); ile = wylaczony ? 'brak danych' : ''; }
    if (w.k === 'belka') { ile = String((M.belki || []).length); wylaczony = !(M.belki || []).length; }
    if (w.k === 'sufity') ile = `${A.ceilings.length} wys.`;
    if (w.k === 'ogrzewanie') {
      const og = stan.obw?.ogrzewanie_podlogowe;
      if (!og) { wylaczony = true; ile = 'brak danych'; tytul = 'Wpisz w obwody.json sekcję ogrzewanie_podlogowe'; }
      else { ile = og.pomieszczenia === 'wszystkie' ? 'cały dom' : `${(og.pomieszczenia || []).length} pom.`; tytul = og.uwagi || ''; }
    }
    (w.k === 'ogrzewanie' ? $('#lista-ogrzewanie') : lb).append(wierszWarstwy(w.k, w.nazwa, { ile, wylaczony, tytul }));
    if (w.k === 'sciany') lb.append(suwakScian());
    if (w.k === 'urzadzenia' && !wylaczony) {    // uczciwie: co zmierzone, co szacowane
      const p = document.createElement('div'); p.className = 'podwiersz';
      p.innerHTML = 'Miejsce zmierzone, wymiary z instrukcji Immergas, wysokość nad ziemią to szacunek. <span class="wiar wiar-prawd">prawdopodobna</span>';
      lb.append(p);
    }
    if (w.k === 'studnia' && !wylaczony) {
      const p = document.createElement('div'); p.className = 'podwiersz';
      p.innerHTML = 'Zmierzone 430 cm od frontu wiatrołapu. Położenie w bok (na wprost drzwi), wymiary ok. 150×150, głębokość ok. 150 cm oraz miejsce włazu i rury (ze zdjęć) to szacunek. Komora jest pod ziemią – widać ją po wyłączeniu „Terenu”. <span class="wiar wiar-prawd">prawdopodobna</span>';
      lb.append(p);
    }
    if (w.k === 'okna' && (M.doors || []).length) lb.append(przelacznikDrzwi());
    if (w.k === 'meble' && wylaczony) {       // podpowiedź techniczna – tylko w trybie „Techniczny”
      const p = document.createElement('div'); p.className = 'podwiersz tylko-techniczny'; p.textContent = 'Włączysz je w wymiary.ini: [Meble] pokaż = tak.'; lb.append(p);
    }
  }

  const le = $('#lista-elektryka');
  le.textContent = '';
  let razemRamki = 0, razemSzt = 0;
  for (const t of KOLEJNOSC_TYPOW) {
    const L = A.liczniki[t] || { ramki: 0, sztuki: 0 };
    razemRamki += L.ramki; razemSzt += L.sztuki;
    const ile = L.sztuki === L.ramki ? `${L.ramki} szt.` : `${L.ramki} ${odmiana(L.ramki, ['ramka', 'ramki', 'ramek'])} · ${L.sztuki} gn.`;
    le.append(wierszWarstwy('el_' + t, NAZWA_WARSTWY_EL[t] || TYPY[t].nazwa, { ikona: ikonaTypu(t, 'R'), ile, wylaczony: !L.ramki }));
  }
  const ileW = { P: 0, R: 0, N: 0 };
  for (const p of A.items) ileW[p.wiar] += 1;
  const lw = document.createElement('div');
  lw.className = 'legenda-wiar';
  lw.innerHTML = '<div class="male">Pewność położenia (znaczek na ikonie):</div>' + ['P', 'R', 'N'].map((w) =>
    `<div class="lw"><img src="${ikonaTypu('Z', w)}" alt=""><span>${esc(WIAR_OPIS[w])}</span><span class="ile">${ileW[w]}</span></div>`).join('');
  le.append(lw);
  $('#suma-el').textContent = `Razem ${razemRamki} ${odmiana(razemRamki, ['punkt', 'punkty', 'punktów'])} (${razemSzt} ${odmiana(razemSzt, ['element', 'elementy', 'elementów'])} licząc każde gniazdo w ramce). Kliknij punkt na modelu, żeby zobaczyć szczegóły.`;

  const sel = $('#kamery');
  sel.length = 1;
  for (const [n, k] of (M.kamery || []).entries()) {
    const o = document.createElement('option');
    o.value = String(n);
    o.textContent = k.nazwa.replace(/^Kamera\s*[–-]\s*/, '');
    sel.append(o);
  }
  sel.closest('label').hidden = !(M.kamery || []).length;
}

// drzwi otwarte / zamknięte (prośba Adama, 16.11.2026) – bez przebudowy sceny, zapamiętywane
function przelacznikDrzwi() {
  const d = document.createElement('div');
  d.className = 'podwiersz';
  d.innerHTML = `<div>Drzwi:</div><div class="przelacznik-widoku drzwi-przelacznik" role="group" aria-label="Drzwi">
    <button type="button" data-drzwi="otwarte">Otwarte</button><button type="button" data-drzwi="zamkniete">Zamknięte</button></div>`;
  d.addEventListener('click', (e) => { const b = e.target.closest('[data-drzwi]'); if (b) ustawDrzwi(b.dataset.drzwi); });
  oznaczDrzwi(d);
  return d;
}
function oznaczDrzwi(el = document) {
  el.querySelectorAll('[data-drzwi]').forEach((b) => {
    const tak = b.dataset.drzwi === stan.drzwi;
    b.classList.toggle('aktywny', tak);
    b.setAttribute('aria-pressed', String(tak));
  });
}
function ustawDrzwi(v) {
  stan.drzwi = v === 'zamkniete' ? 'zamkniete' : 'otwarte';
  stan.warstwy.okna?.traverse((o) => { if (o.userData.drzwi) o.visible = o.userData.drzwi === stan.drzwi; });
  oznaczDrzwi();
  zapiszUstawienia();
  planujBanki(0);
  render();
}

function suwakScian() {
  const A = stan.A;
  const d = document.createElement('div');
  d.className = 'podwiersz';
  const opis = document.createElement('div');
  const r = document.createElement('input');
  r.type = 'range'; r.min = '40'; r.max = String(A.zCeil); r.step = '1';
  r.value = String(stan.wysokoscScian ?? A.zCeil);
  r.setAttribute('aria-label', 'Wysokość ścian');
  const pokaz = () => {
    const v = Number(r.value);
    opis.textContent = v >= A.zCeil ? `Wysokość ścian: pełna (${fmtLiczba(A.zCeil)} cm)` : `Wysokość ścian: przycięte na ${v} cm`;
  };
  let czeka = false;
  r.addEventListener('input', () => {
    const v = Number(r.value);
    stan.wysokoscScian = v >= A.zCeil ? null : v;
    pokaz();
    if (!czeka) { czeka = true; requestAnimationFrame(() => { czeka = false; przebudujSciany(); }); }
  });
  r.addEventListener('change', zapiszUstawienia);
  pokaz();
  d.append(opis, r);
  return d;
}

// ---------------------------------------------------------------- obwody.json (przygotowanie pod wersję 2)
function idsWObwodach(obw) {
  const ids = new Set(Object.keys(obw.punkty || {}));
  for (const o of obw.obwody || []) for (const id of o.punkty || []) ids.add(id);
  for (const t of obw.trasy || []) for (const w of t.punkty || []) if (w && typeof w === 'object' && !Array.isArray(w) && w.punkt) ids.add(w.punkt);
  return ids;
}
function obwodPunktu(id) {
  const obw = stan.obw;
  if (!obw) return null;
  const wlasny = obw.punkty?.[id]?.obwod;
  return (obw.obwody || []).find((o) => o.id === wlasny || (o.punkty || []).includes(id)) || (wlasny ? { id: wlasny } : null);
}
function pokazInfoObwodow(blad) {
  const el = $('#obwody-info');
  if (blad) { stan.bladObwodow = blad; el.innerHTML = `<span class="uwaga">${esc(blad)}</span>`; return; }
  if (stan.bladObwodow) { el.innerHTML = `<span class="uwaga">${esc(stan.bladObwodow)}</span>`; return; }
  if (!stan.A) return;                     // obwody.json bywa wczytany przed danymi domu – podsumowanie pokaże zastosujDane
  const obw = stan.obw || {};
  const n = (obw.obwody || []).length, t = (obw.trasy || []).length, p = Object.keys(obw.punkty || {}).length;
  const znane = new Set(stan.A.items.map((q) => q.id));
  const brak = [...idsWObwodach(obw)].filter((id) => id !== 'rozdzielnica' && !znane.has(id));
  el.innerHTML =
    `Obwody: <b>${n}</b> · trasy: <b>${t}</b> · opisane punkty: <b>${p}</b><br>` +
    'Plik <b>obwody.json</b> w folderze aplikacji (format w README.txt). Rysowanie tras kabli – w wersji 2.' +
    (brak.length ? `<br><span class="uwaga">Nie ma takich punktów: ${brak.map(esc).join(', ')}</span>` : '');
}

// ---------------------------------------------------------------- wybieranie punktów
const raycaster = new THREE.Raycaster();
function widocznyPunkt(p) { return !!stan.wid['el_' + p.typ] && p.znacznik; }
function zaslaniajace() {
  const lista = [];
  for (const [k, g] of Object.entries(stan.warstwy)) {
    if (!g.visible || k.startsWith('el_')) continue;
    g.traverseVisible((o) => { if (o.isMesh && o.userData.zaslania) lista.push(o); });
  }
  return lista;
}
function zasloniety(poz, cam, przeszkody) {
  const ndc = poz.clone().project(cam);
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), cam);
  const dist = raycaster.ray.origin.distanceTo(poz);
  const hit = raycaster.intersectObjects(przeszkody, false)[0];
  return !!hit && hit.distance < dist - 2;
}
function punktPod(clientX, clientY) {
  if (!stan.A) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  const mx = clientX - rect.left, my = clientY - rect.top;
  const cam = kamera();
  const promien = dotyk ? 24 : 16;                     // ok. 48 px średnicy na telefonie
  const kand = [];
  for (const p of stan.A.items) {
    if (!widocznyPunkt(p) || p.wBance) continue;
    _v.copy(p.znacznik).project(cam);
    if (_v.z < -1 || _v.z > 1) continue;
    const d = Math.hypot(((_v.x + 1) / 2) * rect.width - mx, ((1 - _v.y) / 2) * rect.height - my);
    if (d <= promien) kand.push({ p, d });
  }
  if (!kand.length) return null;
  kand.sort((a, b) => a.d - b.d);
  const przeszkody = zaslaniajace();
  for (const k of kand) if (!zasloniety(k.p.znacznik, cam, przeszkody)) return k.p;
  return null;
}

let start = null;
const canvas = renderer.domElement;
canvas.addEventListener('pointerdown', (e) => {
  start = { x: e.clientX, y: e.clientY, t: performance.now() };
  $('#podpowiedz').classList.add('schowana');
});
canvas.addEventListener('pointerup', (e) => {
  if (!start) return;
  const ruch = Math.hypot(e.clientX - start.x, e.clientY - start.y), czas = performance.now() - start.t;
  start = null;
  if (ruch > 8 || czas > 600) return;
  const p = punktPod(e.clientX, e.clientY);
  if (p) wybierz(p);
  else if (document.body.classList.contains('panel-otwarty')) document.body.classList.remove('panel-otwarty');
  else zamknijKarte();
});
if (!dotyk) {
  let czeka = false, ostatni = null;
  canvas.addEventListener('pointermove', (e) => {
    ostatni = e;
    if (czeka || e.buttons) return;
    czeka = true;
    requestAnimationFrame(() => { czeka = false; canvas.style.cursor = punktPod(ostatni.clientX, ostatni.clientY) ? 'pointer' : ''; });
  });
}

function wybierz(p) {
  stan.wybrany = p;
  wyborGeo.attributes.position.setXYZ(0, p.znacznik.x, p.znacznik.y, p.znacznik.z);
  wyborGeo.attributes.position.needsUpdate = true;
  wyborGeo.computeBoundingSphere();
  wyborPkt.visible = true;
  wyborIkona.material.map = teksturaZnacznika(p.typ, p.wiar);
  wyborIkona.material.needsUpdate = true;
  wyborIkona.visible = true;
  przygasZnaczniki(true);
  planujBanki(0);
  pokazKarte(p);
  document.body.classList.remove('panel-otwarty');
  render();
}
function zamknijKarte() {
  stan.wybrany = null;
  wyborPkt.visible = false;
  wyborIkona.visible = false;
  przygasZnaczniki(false);
  planujBanki(0);
  $('#karta').hidden = true;
  render();
}

function pokazKarte(p) {
  const A = stan.A, T = TYPY[p.typ] || { nazwa: p.typ };
  const wpis = stan.obw?.punkty?.[p.id] || {};
  const obwod = obwodPunktu(p.id);
  const s = p.sciana;
  const za = !s ? '—' : s.za.typ === 'pokoj' ? (s.za.pokoj?.nazwa || 'pomieszczenie')
    : s.za.typ === 'zewnatrz' ? 'na zewnątrz' : 'styk z inną ścianą';
  const zewnetrzna = s && (p.naZewnatrz || s.za.typ === 'zewnatrz' || s.grubosc >= 20);
  const kier = (k, w) => (w ? `${k} ${cm(w.d)} do ${w.cel}` : null);
  const wzdluz = p.wzdluz ? [kier(p.kierunki[0], p.wzdluz.minus), kier(p.kierunki[1], p.wzdluz.plus)].filter(Boolean).join(' · ') : '—';
  const ramka = p.n === 1 ? '1' : `${p.n} (ramka ${p.pion ? 'pionowa' : 'pozioma'})`;
  let wys = `${cm(p.z)} nad podłogą`;
  if (p.pion && p.n > 1) wys += ' (środek dolnego gniazda)';
  if (p.naZewnatrz && A.teren) wys += ` · ${cm(p.z + A.teren)} nad terenem`;
  const opis = wpis.opis || p.opisDanych || p.opisAuto;
  // osprzęt: własny wpis punktu albo domyślny dla typu (tylko wewnątrz domu) – z obwody.json
  const osp = wpis.osprzet ? { nazwa: wpis.osprzet } : (!p.naZewnatrz && stan.obw?.osprzet?.[p.typ]) || null;
  let ospHost = '';
  try { if (osp?.link) ospHost = new URL(osp.link).hostname.replace(/^www\./, ''); } catch { /* zły link */ }
  const osprzet = osp ? esc(osp.nazwa || '') + (ospHost ? ` <a class="opcja" href="${esc(osp.link)}" target="_blank" rel="noopener noreferrer">${esc(ospHost)}</a>` : '') : null;
  const gdzie = p.naZewnatrz ? `Na zewnątrz${s && s.za.typ === 'pokoj' ? ` – ściana ${s.za.pokoj?.nazwa ? 'pomieszczenia ' + s.za.pokoj.nazwa : ''}` : ''}` : (p.pokoj?.nazwa || '—');
  const wiersze = [
    ['Pomieszczenie', esc(gdzie)],
    ['Ściana', s ? `${esc(p.stronaSciany)} (na rzucie) · ${cm(s.grubosc)}, ${zewnetrzna ? 'zewnętrzna' : 'wewnętrzna'}` : esc(p.stronaSciany)],
    ['Za ścianą', esc(za)],
    ['Wysokość', esc(wys)],
    ['W ramce', esc(ramka)],
    ['Wzdłuż ściany', esc(wzdluz)],
    ['Opis', esc(opis)],
    ...(osprzet ? [['Osprzęt', osprzet]] : []),
    ['Obwód', obwod ? esc([obwod.id, obwod.nazwa].filter(Boolean).join(' – ')) : '<span class="male">jeszcze nieprzypisany</span>'],
    ['Pewność położenia', p.baza ? wiarPunktu(p.baza) : wiarZPliku(p)],
    ['ID punktu', `<code>${esc(p.id)}</code>`],
    ['Położenie', `<span class="male">na licu ściany: x = ${cm(p.ax === 'v' ? p.c : p.x)}, y = ${cm(p.ax === 'v' ? p.yd : p.c)} (od wewnętrznego lewego górnego narożnika domu)</span>`],
  ];
  const k = $('#karta');
  k.innerHTML = `
    <div class="karta-naglowek">
      <img src="${ikonaTypu(p.typ, p.wiar)}" alt="">
      <div><h3>${esc(T.nazwa)}</h3><div class="pod">${esc(gdzie)}</div></div>
      <button type="button" class="zamknij" aria-label="Zamknij">✕</button>
    </div>
    <div class="karta-tresc">
      <dl>${wiersze.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>
      <div class="karta-akcje">
        <button type="button" data-akcja="rzut">Pokaż na rzucie</button>
        <button type="button" data-akcja="kopiuj">Kopiuj ID</button>
        <button type="button" data-akcja="link">Udostępnij link</button>
      </div>
      <p class="ostrzezenie">Część położeń pochodzi z rysunku i może odbiegać o ok. 10–15 cm. Przewody od puszki biegną zwykle w pionie lub poziomie – przed wierceniem w pobliżu sprawdź ścianę wykrywaczem.${stan.obw?.ogrzewanie_podlogowe ? `<br><b>Podłoga:</b> ${esc(stan.obw.ogrzewanie_podlogowe.uwagi || 'jest ogrzewanie podłogowe – nie wierć w posadzce.')}` : ''}</p>
    </div>`;
  k.hidden = false;
  k.scrollTop = 0;
  k.querySelector('.zamknij').addEventListener('click', zamknijKarte);
  k.querySelector('[data-akcja="kopiuj"]').addEventListener('click', (e) => kopiuj(p.id, e.currentTarget));
  k.querySelector('[data-akcja="rzut"]').addEventListener('click', () => pokazNaRzucie(p));
  k.querySelector('[data-akcja="link"]').addEventListener('click', (e) => udostepnij(p, T, e.currentTarget));
}

// rzut z góry przybliżony do punktu; na telefonie karta się chowa (dotknięcie punktu ją przywraca)
function pokazNaRzucie(p) {
  widokGora();
  const c = p.znacznik, telefon = matchMedia('(max-width: 760px)').matches;
  kameraGora.zoom = Math.min(sterGora.maxZoom, 3.2);
  // na komputerze karta zasłania prawą część sceny – punkt ustawiamy na środku widocznej części
  const k = $('#karta'), naCm = (kameraGora.right - kameraGora.left) / kameraGora.zoom / kontener.clientWidth;
  const x = c.x + (!telefon && !k.hidden ? ((k.offsetWidth + 24) / 2) * naCm : 0);
  sterGora.target.set(x, 0, c.z);
  kameraGora.position.set(x, 3000, c.z);
  kameraGora.updateProjectionMatrix();
  kameraGora.lookAt(x, 0, c.z);
  sterGora.update();
  if (telefon) { k.hidden = true; pokazKomunikat(`${p.id} – dotknij punkt, żeby wrócić do karty`); }
  planujBanki(0);
  render();
}
async function udostepnij(p, T, przycisk) {
  const url = location.href.split('#')[0] + '#punkt=' + encodeURIComponent(p.id);
  if (navigator.share) {
    try { await navigator.share({ title: `Mój domek – ${T.nazwa} ${p.id}`, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  kopiuj(url, przycisk, 'skopiowano link');
}
// pewność położenia bez logowania: ze źródła zapisanego przez generuj.py w pliku rysunku
function wiarZPliku(p) {
  const w = dane.wiarygodnoscPolozenia({ zrodlo: p.zrodlo });
  const [klasa, etyk] = w.polozenie === 'POTWIERDZONA' ? ['wiar-potw', 'potwierdzona'] : ['wiar-prawd', 'prawdopodobna'];
  return `<span class="wiar ${klasa}">${etyk}</span> <span class="male">${esc(w.zrodlo)}</span>`;
}

// znaczek wiarygodności położenia + źródło i ostatnia zmiana (punkty z bazy)
function wiarPunktu(b) {
  const w = b.wiarygodnosc || {};
  const [klasa, etyk] = w.polozenie === 'POTWIERDZONA' ? ['wiar-potw', 'potwierdzona'] : w.polozenie === 'PRAWDOPODOBNA'
    ? ['wiar-prawd', 'prawdopodobna'] : ['wiar-niezw', 'niezweryfikowana'];
  const kiedy = b.zmieniono ? b.zmieniono.toLocaleDateString('pl-PL') : '';
  return `<span class="wiar ${klasa}">${etyk}</span> <span class="male">${esc(w.zrodlo || '')}`
    + `${b.wersja ? `<br>wersja ${b.wersja}${b.zmienilNazwa ? ` · ${esc(b.zmienilNazwa)}` : ''}${kiedy ? ` · ${kiedy}` : ''}` : ''}</span>`;
}

async function kopiuj(tekst, przycisk, gotowe = 'skopiowano') {
  try {
    await navigator.clipboard.writeText(tekst);
  } catch {
    const t = document.createElement('textarea');
    t.value = tekst; document.body.append(t); t.select();
    try { document.execCommand('copy'); } catch { /* trudno */ }
    t.remove();
  }
  const bylo = przycisk.dataset.napis || (przycisk.dataset.napis = przycisk.textContent);
  przycisk.textContent = gotowe;
  setTimeout(() => { przycisk.textContent = bylo; }, 1500);
}

// ---------------------------------------------------------------- wczytywanie danych
function pokazKomunikat(txt) {
  const el = $('#komunikat');
  el.textContent = txt;
  el.hidden = false;
  clearTimeout(pokazKomunikat.t);
  pokazKomunikat.t = setTimeout(() => { el.hidden = true; }, 3500);
}
function opisWersji(lm) {
  if (!lm) return 'dane wczytane';
  const d = new Date(lm);
  return isNaN(d) ? 'dane wczytane' : 'dane z ' + d.toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function wczytajObwody() {
  try {
    const r = await fetch(URL_OBWODOW, { cache: 'no-store' });
    stan.wersjaObwodow = r.headers.get('last-modified');
    stan.bladObwodow = null;
    if (r.status === 404) stan.obw = {};
    else if (!r.ok) throw new Error('HTTP ' + r.status);
    else stan.obw = JSON.parse(await r.text());
  } catch (e) {
    stan.obw = {};
    stan.bladObwodow = 'Nie udało się odczytać obwody.json: ' + e.message + ' (sprawdź przecinki i cudzysłowy).';
  }
  pokazInfoObwodow();
}

// wczytywanie modelu: po 8 s bez danych – wyjaśnienie i „Spróbuj ponownie” (plan GUI, pkt 12)
const ladowanie3d = $('#ladowanie-3d');
setTimeout(() => {
  if (stan.A || !ladowanie3d) return;
  ladowanie3d.querySelector('span').textContent = 'Wczytywanie trwa dłużej niż zwykle – sprawdź internet albo czy działa serwer (URUCHOM.bat).';
  ladowanie3d.querySelector('button').hidden = false;
}, 8000);
ladowanie3d?.querySelector('button').addEventListener('click', () => wczytaj());
function zastosujDane(M, wersja, pierwszy) {
  if (ladowanie3d) ladowanie3d.hidden = true;
  // M – dane z pliku (geometria + punkty z rysunku); punkty z bazy zastępują punkty z rysunku po zalogowaniu
  const zBazy = dane.punktyZBazy();
  stan.Mplik = M;
  stan.podpisPunktow = zBazy ? JSON.stringify(zBazy) : 'plik';
  stan.zrodloPunktow = zBazy ? 'baza' : 'plik';
  const Mw = zBazy ? { ...M, items: zBazy } : M;
  const A = analizuj(Mw);
  const wybranyId = stan.wybrany?.id;
  stan.M = Mw; stan.A = A; stan.wersjaDanych = wersja;
  zbudujScene();
  zbudujPanel();
  pokazInfoObwodow();
  // pasek stanu: skąd i z kiedy są dane, skąd punkty
  const lm = wersja?.lm ? new Date(wersja.lm) : null;
  ustawDane({ czas: lm && !isNaN(lm) ? lm : null, zrodlo: NA_GITHUB ? 'github' : stan.urlDanych === ZRODLA_DANYCH[0] ? 'plik' : 'kopia' });
  ustawPunkty(zBazy ? 'baza' : 'plik');
  if (pierwszy) stan.dopasowano = false;
  rozmiar();
  const p = wybranyId && A.items.find((q) => q.id === wybranyId);
  if (p) wybierz(p); else zamknijKarte();
  if (pierwszy) obsluzAdres();
  window.dispatchEvent(new Event('mojdomek:dane'));      // dla modułów (np. Elektryka: punkty w pomieszczeniach)
  dane.ustawPlik(M.items, !NA_GITHUB);                   // porównanie rysunku z bazą (panel konta) – tylko na komputerze
}

// zmiany w bazie (wczytanie, zapis drugiej osoby, wylogowanie) – przebudowa tylko, gdy zmieniły się punkty
window.addEventListener('mojdomek:baza', () => {
  if (!stan.Mplik) return;
  const zBazy = dane.punktyZBazy();
  if ((zBazy ? JSON.stringify(zBazy) : 'plik') === stan.podpisPunktow) return;
  const zmianaZrodla = (zBazy ? 'baza' : 'plik') !== stan.zrodloPunktow;
  zastosujDane(stan.Mplik, stan.wersjaDanych, false);
  if (zmianaZrodla) pokazKomunikat(zBazy ? `Punkty elektryczne ze wspólnej bazy (${zBazy.length})` : 'Punkty elektryczne z rysunku (plik)');
});

// adresy: #punkt=ID (karta punktu), #pokoj=Nazwa (pomieszczenie na rzucie), #ogrzewanie=Nazwa (rury tego pomieszczenia)
function obsluzAdres() {
  const h = location.hash;
  if (!/ogrzewanie=/.test(h)) podswietlOgrzewanie(null);
  punktyZAdresu();
  punktZAdresu();
  const m = /(pokoj|ogrzewanie)=([^&]+)/.exec(h);
  if (m && stan.A) pokazPokoj(decodeURIComponent(m[2]), m[1] === 'ogrzewanie');
}

// nazwa z arkusza („Magda biuro”, „Pom. gospodarcze”, „hol”) -> pomieszczenie modelu
const SYNONIMY_POKOI = { hol: 'salon', korytarz: 'salon', przedpokoj: 'salon', kotlownia: 'gospodarcze' };
const slowaNazwy = (s) => String(s).toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && w !== 'pom' && w !== 'pomieszczenie').map((w) => SYNONIMY_POKOI[w] || w);
function dopasujPokoj(nazwa) {
  const q = slowaNazwy(nazwa);
  if (!q.length || !stan.A) return null;
  return stan.A.ceilings.find((c) => { const w = slowaNazwy(c.nazwa); return q.every((x) => w.includes(x)); })
    || stan.A.ceilings.find((c) => { const w = slowaNazwy(c.nazwa); return w.length && w.every((x) => q.includes(x)); }) || null;
}
function pokazPokoj(nazwa, ogrzewanie) {
  const c = dopasujPokoj(nazwa);
  if (!c) { pokazKomunikat(`Nie znalazłem pomieszczenia „${nazwa}” na modelu`); return; }
  if (ogrzewanie) {
    stan.wid.ogrzewanie = true;
    const i = document.querySelector('#lista-budynek input[data-k="ogrzewanie"]');
    if (i) i.checked = true;
    zastosujWidocznosc();
    podswietlOgrzewanie(c.nazwa);
  }
  // rzut z góry przybliżony do pomieszczenia
  const x0 = Math.min(...c.cells.map((k) => k[0])), x1 = Math.max(...c.cells.map((k) => k[1]));
  const y0 = Math.min(...c.cells.map((k) => k[2])), y1 = Math.max(...c.cells.map((k) => k[3]));
  widokGora();
  const cx = (x0 + x1) / 2, cz = (y0 + y1) / 2;
  sterGora.target.set(cx, 0, cz);
  kameraGora.position.set(cx, 3000, cz);
  const szer = kameraGora.right - kameraGora.left, wys = kameraGora.top - kameraGora.bottom;
  kameraGora.zoom = Math.max(0.3, Math.min(szer / (x1 - x0 + 160), wys / (y1 - y0 + 160)));
  kameraGora.updateProjectionMatrix();
  kameraGora.lookAt(cx, 0, cz);
  sterGora.update();
  render();
  pokazKomunikat(ogrzewanie ? `Ogrzewanie podłogowe: ${c.nazwa}` : c.nazwa);
}
// rury jednego pomieszczenia wyraźne, pozostałe przygaszone (null = wszystkie normalnie)
function podswietlOgrzewanie(nazwa) {
  stan.podswietlonePetle = nazwa;
  const g = stan.warstwy?.ogrzewanie;
  if (!g) return;
  for (const m of g.children) {
    const ten = !nazwa || m.userData.pokoj === nazwa;
    m.material.color.set(nazwa && ten ? 0xff2a00 : nazwa ? 0x9a9a9a : KOLOR_RUR);
    m.material.opacity = nazwa && !ten ? 0.22 : 0.85;
  }
  render();
}

// kilka punktów naraz: …/#punkty=kuchnia-Z06,kuchnia-Z07 – świecą, reszta przygasa, rzut z góry na nie
const podswietlenie = new THREE.Group();
podswietlenie.renderOrder = 22;
scene.add(podswietlenie);
function punktyZAdresu() {
  podswietlenie.children.slice().forEach((o) => { podswietlenie.remove(o); o.geometry.dispose(); o.material.dispose(); });
  const m = /punkty=([^&]+)/.exec(location.hash);
  if (!m || !stan.A) { if (!stan.wybrany) przygasZnaczniki(false); render(); return; }
  const ids = new Set(decodeURIComponent(m[1]).split(','));
  const lista = stan.A.items.filter((p) => ids.has(p.id) && p.znacznik);
  if (!lista.length) { pokazKomunikat('Nie znalazłem tych punktów na modelu'); return; }
  const wg = new Map();
  for (const p of lista) { const k = p.typ + p.wiar; if (!wg.has(k)) wg.set(k, []); wg.get(k).push(p); }
  for (const [k, l] of wg) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(l.flatMap((p) => [p.znacznik.x, p.znacznik.y, p.znacznik.z]), 3));
    for (const [map, skala] of [[wyborPkt.material.map, 1.7], [teksturaZnacznika(k[0], k[1]), 1]]) {
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: ROZMIAR_ZNACZNIKA * skala, sizeAttenuation: false, map, transparent: true, depthTest: false, alphaTest: 0.2 }));
      pts.renderOrder = 22;
      podswietlenie.add(pts);
    }
  }
  przygasZnaczniki(true);
  for (const t of new Set(lista.map((p) => p.typ))) stan.wid['el_' + t] = true;
  zastosujWidocznosc();
  pokazKomunikat(`Podświetlone punkty: ${lista.length}`);
  render();
}

// link do punktu: …/#punkt=kuchnia-Z06
function punktZAdresu() {
  const m = /punkt=([^&]+)/.exec(location.hash);
  const p = m && stan.A?.items.find((q) => q.id === decodeURIComponent(m[1]));
  if (!p) return;
  stan.wid['el_' + p.typ] = true;
  const i = document.querySelector(`#lista-elektryka input[data-k="el_${p.typ}"]`);
  if (i) i.checked = true;
  zastosujWidocznosc();
  wybierz(p);
}
window.addEventListener('hashchange', obsluzAdres);

async function pobierzDane() {
  let blad = null;
  for (const url of ZRODLA_DANYCH) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) { blad = new Error(`serwer odpowiedział ${r.status} dla ${url}`); continue; }
      const M = JSON.parse(await r.text());
      stan.urlDanych = url;
      return { M, r };
    } catch (e) { blad = e; }
  }
  throw blad || new Error('brak danych');
}

async function wczytaj({ pierwszy = false, cicho = false } = {}) {
  try {
    const { M, r } = await pobierzDane();
    await wczytajObwody();
    zastosujDane(M, { lm: r.headers.get('last-modified'), len: r.headers.get('content-length') }, pierwszy || !stan.A);
    $('#blad').hidden = true;
    if (!cicho && !pierwszy) pokazKomunikat('Wczytano dane');
  } catch (e) {
    console.error(e);
    if (stan.A) { pokazKomunikat('Nie udało się odświeżyć danych: ' + e.message); return; }
    $('#blad-tekst').textContent = e.message + (NA_GITHUB ? ' – odśwież stronę za chwilę.' : '');
    $('#blad').hidden = false;
    ustawDane({ blad: e.message });
  }
}

// samoczynne odświeżanie po ODSWIEZ.bat: lekkie zapytanie HEAD co kilka sekund
// (tylko na komputerze; na GitHub Pages nowe dane pojawiają się po WYSLIJ_NA_GITHUB.bat i przeładowaniu strony)
async function sprawdzZmiany() {
  if (NA_GITHUB || document.visibilityState !== 'visible' || !stan.wersjaDanych || stan.zPliku) return;
  try {
    const r = await fetch(stan.urlDanych, { method: 'HEAD', cache: 'no-store' });
    if (!r.ok) return;
    const lm = r.headers.get('last-modified'), len = r.headers.get('content-length');
    if (lm !== stan.wersjaDanych.lm || len !== stan.wersjaDanych.len) {
      await wczytaj({ cicho: true });
      pokazKomunikat('Wczytano nowe dane po ODSWIEZ.bat');
      return;
    }
    const ro = await fetch(URL_OBWODOW, { method: 'HEAD', cache: 'no-store' });
    if (ro.headers.get('last-modified') !== stan.wersjaObwodow) {
      await wczytajObwody();
      zbudujScene();                       // np. zmiana ogrzewania podłogowego
      zbudujPanel();
      if (stan.wybrany) pokazKarte(stan.wybrany);
      pokazKomunikat('Wczytano zmiany w obwody.json');
    }
  } catch { /* serwer wyłączony – spróbujemy później */ }
}
setInterval(sprawdzZmiany, CO_ILE_SPRAWDZAC_MS);
document.addEventListener('visibilitychange', sprawdzZmiany);

$('#plik-danych').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    const M = JSON.parse(await f.text());
    stan.zPliku = true;
    stan.obw = stan.obw || {};
    zastosujDane(M, { lm: new Date(f.lastModified).toUTCString() }, true);
    $('#blad').hidden = true;
  } catch (err) {
    $('#blad-tekst').textContent = 'To nie jest poprawny plik dane_modelu.json: ' + err.message;
  }
});

// ---------------------------------------------------------------- przyciski
$('#btn-gora').addEventListener('click', () => (stan.tryb === 'gora' ? widokUkos() : widokGora()));
$('#btn-reset').addEventListener('click', () => (stan.tryb === 'gora' ? widokGora() : widokUkos()));
$('#btn-panel').addEventListener('click', () => document.body.classList.toggle('panel-otwarty'));
window.addEventListener('mojdomek:odswiez', () => wczytaj());    // przycisk „Odśwież dane” w panelu konta
document.querySelectorAll('[data-widok]').forEach((b) => b.addEventListener('click', () => {
  (b.dataset.widok === 'gora' ? widokGora : widokUkos)();
  document.body.classList.remove('panel-otwarty');
}));
$('#kamery').addEventListener('change', (e) => {
  const k = stan.M?.kamery?.[Number(e.target.value)];
  if (e.target.value !== '' && k) { ujecie(k); document.body.classList.remove('panel-otwarty'); }
});
document.querySelectorAll('[data-el]').forEach((b) => b.addEventListener('click', () => {
  const wl = b.dataset.el === 'wszystkie';
  ustawTryb(null);
  for (const t of KOLEJNOSC_TYPOW) stan.wid['el_' + t] = wl;
  document.querySelectorAll('#lista-elektryka input').forEach((i) => { if (!i.disabled) i.checked = wl; });
  zapiszUstawienia();
  zastosujWidocznosc();
}));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { zamknijKarte(); document.body.classList.remove('panel-otwarty'); } });
// zmiana motywu: tło, trawa i siatka (siatkę trzeba zbudować od nowa – stąd przebudowa sceny)
window.addEventListener('mojdomek:motyw', () => {
  ustawTlo();
  koloryTerenu();
  if (stan.A) zbudujScene();
  render();
});

$('#podpowiedz').textContent = dotyk
  ? '1 palec – obrót · 2 palce – przybliżanie i przesuwanie · dotknij kółko, by zobaczyć szczegóły'
  : 'Lewy przycisk – obrót · prawy – przesuwanie · kółko – przybliżanie · kliknij kółko punktu, by zobaczyć szczegóły';

window.addEventListener('mojdomek:sekcja', () => {
  if (widokWidoczny() && stan.scenaCzeka && stan.A) { zbudujScene(); rozmiar(); obsluzAdres(); }
});

// ---------------------------------------------------------------- tryby widoku i grupy panelu
function ustawTryb(k) {
  stan.trybWarstw = k;
  document.querySelectorAll('[data-tryb]').forEach((b) => { b.classList.toggle('aktywny', b.dataset.tryb === k); b.setAttribute('aria-pressed', String(b.dataset.tryb === k)); });
  document.body.classList.toggle('tryb-techniczny', k === 'techniczny');
  $('#opis-trybu').textContent = k ? TRYBY[k].opis : 'Własny zestaw warstw.';
}
function zastosujTryb(k) {
  Object.assign(stan.wid, PODSTAWA_TRYBU, TRYBY[k].wid);
  for (const t of KOLEJNOSC_TYPOW) stan.wid['el_' + t] = true;
  if (k !== 'techniczny') stan.wysokoscScian = null;
  ustawTryb(k);
  zapiszUstawienia();
  document.querySelectorAll('#panel input[data-k]').forEach((i) => { if (!i.disabled) i.checked = !!stan.wid[i.dataset.k]; });
  if (stan.A) { przebudujSciany(); zbudujPanel(); }
  zastosujWidocznosc();
}
document.querySelectorAll('[data-tryb]').forEach((b) => b.addEventListener('click', () => zastosujTryb(b.dataset.tryb)));
ustawTryb(stan.trybWarstw ?? null);
// zwijane grupy panelu – aplikacja pamięta, które są otwarte
{
  const KLUCZ = 'mojDomek.grupy.v1';
  let otwarte = {};
  try { otwarte = JSON.parse(localStorage.getItem(KLUCZ) || '{}'); } catch { /* domyślnie */ }
  document.querySelectorAll('details[data-grupa]').forEach((d) => {
    if (d.dataset.grupa in otwarte) d.open = !!otwarte[d.dataset.grupa];
    d.addEventListener('toggle', () => { otwarte[d.dataset.grupa] = d.open; try { localStorage.setItem(KLUCZ, JSON.stringify(otwarte)); } catch { /* trudno */ } });
  });
}
// telefon: uchwyt panelu przełącza połowę ekranu / cały ekran
$('.uchwyt')?.addEventListener('click', () => document.body.classList.toggle('panel-pelny'));

// ---------------------------------------------------------------- start
window.mojDomek = { stan, kamera, zaslaniajace, zasloniety, THREE };   // do podglądu w konsoli przeglądarki (F12)
ustawTlo();
rozmiar();
petla();
if (location.protocol !== 'file:') wczytaj({ pierwszy: true });
