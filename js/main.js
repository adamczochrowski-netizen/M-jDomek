// Mój domek – podgląd 3D: kamery, warstwy, legenda, karta punktu, odświeżanie danych.
import * as THREE from 'three';
import { OrbitControls } from '../lib/OrbitControls.js';
import { analizuj, TYPY, KOLEJNOSC_TYPOW } from './analiza.js';
import { zbudujDom, zbudujSciany, materialy, teksturaWyboru, ikonaTypu, POZIOM_PODLOGI } from './budowa3d.js';

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
  { k: 'sufity', nazwa: 'Sufity', wl: false },
  { k: 'belka', nazwa: 'Belka (kuchnia | salon)', wl: true },
  { k: 'meble', nazwa: 'Meble', wl: true },
  { k: 'sanitariaty', nazwa: 'Sanitariaty', wl: true },
  { k: 'teren', nazwa: 'Teren (siatka co 1 m)', wl: true },
  { k: 'nazwy', nazwa: 'Nazwy pomieszczeń', wl: true },
];
const NAZWA_WARSTWY_EL = { L: 'Lampy zewnętrzne' };

const $ = (s) => document.querySelector(s);
const dotyk = matchMedia('(pointer: coarse)').matches;
const ciemny = matchMedia('(prefers-color-scheme: dark)');

// ---------------------------------------------------------------- stan i ustawienia
const stan = {
  M: null, A: null, obw: null, wersjaDanych: null,
  warstwy: {}, znaczniki: {}, korzen: null,
  wid: {}, wysokoscScian: null, tryb: '3d', wybrany: null,
};
for (const w of WARSTWY_BUDYNKU) stan.wid[w.k] = w.wl;
for (const t of KOLEJNOSC_TYPOW) stan.wid['el_' + t] = true;
try {
  const zap = JSON.parse(localStorage.getItem(KLUCZ_USTAWIEN) || 'null');
  if (zap && zap.wid) Object.assign(stan.wid, zap.wid);
  if (zap && typeof zap.wysokoscScian === 'number') stan.wysokoscScian = zap.wysokoscScian;
} catch { /* bez zapisanych ustawień */ }
function zapiszUstawienia() {
  try { localStorage.setItem(KLUCZ_USTAWIEN, JSON.stringify({ wid: stan.wid, wysokoscScian: stan.wysokoscScian })); } catch { /* np. tryb prywatny */ }
}

// ---------------------------------------------------------------- renderer, światło, kamery
const kontener = $('#scena');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
kontener.prepend(renderer.domElement);
const scene = new THREE.Scene();
const ustawTlo = () => { scene.background = new THREE.Color(ciemny.matches ? 0x1d242c : 0xdfe7ee); render(); };
scene.add(new THREE.HemisphereLight(0xffffff, 0x8d8a80, 1.9));
const slonce = new THREE.DirectionalLight(0xffffff, 1.5);
slonce.position.set(-500, 1000, 700);
scene.add(slonce);
const mat = materialy();

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
  size: dotyk ? 46 : 38, sizeAttenuation: false, map: teksturaWyboru(), transparent: true, depthTest: false,
}));
wyborPkt.renderOrder = 20;
wyborPkt.visible = false;
scene.add(wyborPkt);

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
}
ster3d.addEventListener('change', render);
sterGora.addEventListener('change', render);

function rozmiar() {
  const w = kontener.clientWidth, h = kontener.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  kamera3d.aspect = w / h;
  kamera3d.updateProjectionMatrix();
  ustawFrustumGora();
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

// ---------------------------------------------------------------- budowa sceny z danych
function zwolnij(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.isPoints && o !== wyborPkt) { o.material.map?.dispose(); o.material.dispose(); }
  });
}
function zbudujScene() {
  if (stan.korzen) { scene.remove(stan.korzen); zwolnij(stan.korzen); }
  const zs = stan.wysokoscScian != null ? Math.min(stan.wysokoscScian, stan.A.zCeil) : null;
  const { warstwy, znaczniki } = zbudujDom(stan.M, stan.A, mat, { wysokoscScian: zs });
  stan.warstwy = warstwy;
  stan.znaczniki = znaczniki;
  stan.korzen = new THREE.Group();
  for (const g of Object.values(warstwy)) stan.korzen.add(g);
  scene.add(stan.korzen);
  for (const p of Object.values(znaczniki)) p.material.size = dotyk ? 22 : 20;
  ustawCiecie();
  zbudujEtykiety();
  zastosujWidocznosc();
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
  i.addEventListener('change', () => { stan.wid[k] = i.checked; zapiszUstawienia(); zastosujWidocznosc(); });
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
  for (const w of WARSTWY_BUDYNKU) {
    let ile = '', wylaczony = false, tytul = '';
    if (w.k === 'meble') {
      ile = String((M.furniture || []).length);
      if (!(M.furniture || []).length) { wylaczony = true; ile = 'wyłączone'; tytul = 'Włącz w wymiary.ini: [Meble] pokaż = tak, potem ODSWIEZ.bat'; }
    }
    if (w.k === 'sanitariaty') ile = String((M.sanitariaty || []).length);
    if (w.k === 'belka') { ile = String((M.belki || []).length); wylaczony = !(M.belki || []).length; }
    if (w.k === 'sufity') ile = `${A.ceilings.length} wys.`;
    lb.append(wierszWarstwy(w.k, w.nazwa, { ile, wylaczony, tytul }));
    if (w.k === 'sciany') lb.append(suwakScian());
    if (w.k === 'meble' && wylaczony) {
      const p = document.createElement('div'); p.className = 'podwiersz'; p.textContent = 'Włączysz je w wymiary.ini: [Meble] pokaż = tak.'; lb.append(p);
    }
  }

  const le = $('#lista-elektryka');
  le.textContent = '';
  let razemRamki = 0, razemSzt = 0;
  for (const t of KOLEJNOSC_TYPOW) {
    const L = A.liczniki[t] || { ramki: 0, sztuki: 0 };
    razemRamki += L.ramki; razemSzt += L.sztuki;
    const ile = L.sztuki === L.ramki ? `${L.ramki} szt.` : `${L.ramki} ${odmiana(L.ramki, ['ramka', 'ramki', 'ramek'])} · ${L.sztuki} gn.`;
    le.append(wierszWarstwy('el_' + t, NAZWA_WARSTWY_EL[t] || TYPY[t].nazwa, { ikona: ikonaTypu(t), ile, wylaczony: !L.ramki }));
  }
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
  if (blad) { el.innerHTML = `<span class="uwaga">${esc(blad)}</span>`; return; }
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
    g.traverse((o) => { if (o.isMesh && o.userData.zaslania) lista.push(o); });
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
  const promien = dotyk ? 26 : 15;
  const kand = [];
  for (const p of stan.A.items) {
    if (!widocznyPunkt(p)) continue;
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
  pokazKarte(p);
  document.body.classList.remove('panel-otwarty');
  render();
}
function zamknijKarte() {
  stan.wybrany = null;
  wyborPkt.visible = false;
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
  const gdzie = p.naZewnatrz ? `Na zewnątrz${s && s.za.typ === 'pokoj' ? ` – ściana ${s.za.pokoj?.nazwa ? 'pomieszczenia ' + s.za.pokoj.nazwa : ''}` : ''}` : (p.pokoj?.nazwa || '—');
  const wiersze = [
    ['Pomieszczenie', esc(gdzie)],
    ['Ściana', s ? `${esc(p.stronaSciany)} (na rzucie) · ${cm(s.grubosc)}, ${zewnetrzna ? 'zewnętrzna' : 'wewnętrzna'}` : esc(p.stronaSciany)],
    ['Za ścianą', esc(za)],
    ['Wysokość', esc(wys)],
    ['W ramce', esc(ramka)],
    ['Wzdłuż ściany', esc(wzdluz)],
    ['Opis', esc(opis)],
    ['Obwód', obwod ? esc([obwod.id, obwod.nazwa].filter(Boolean).join(' – ')) : '<span class="male">jeszcze nieprzypisany</span>'],
    ['ID punktu', `<code>${esc(p.id)}</code><button type="button" class="kopiuj" data-kopiuj="${esc(p.id)}">kopiuj</button>`],
    ['Położenie', `<span class="male">na licu ściany: x = ${cm(p.ax === 'v' ? p.c : p.x)}, y = ${cm(p.ax === 'v' ? p.yd : p.c)} (od wewnętrznego lewego górnego narożnika domu)</span>`],
  ];
  const k = $('#karta');
  k.innerHTML = `
    <div class="karta-naglowek">
      <img src="${ikonaTypu(p.typ)}" alt="">
      <div><h3>${esc(T.nazwa)}</h3><div class="pod">${esc(gdzie)}</div></div>
      <button type="button" class="zamknij" aria-label="Zamknij">✕</button>
    </div>
    <div class="karta-tresc">
      <dl>${wiersze.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>
      <p class="ostrzezenie">Część położeń pochodzi z rysunku i może odbiegać o ok. 10–15 cm. Przewody od puszki biegną zwykle w pionie lub poziomie – przed wierceniem w pobliżu sprawdź ścianę wykrywaczem.</p>
    </div>`;
  k.hidden = false;
  k.scrollTop = 0;
  k.querySelector('.zamknij').addEventListener('click', zamknijKarte);
  k.querySelector('.kopiuj').addEventListener('click', (e) => kopiuj(e.currentTarget.dataset.kopiuj, e.currentTarget));
}

async function kopiuj(tekst, przycisk) {
  try {
    await navigator.clipboard.writeText(tekst);
  } catch {
    const t = document.createElement('textarea');
    t.value = tekst; document.body.append(t); t.select();
    try { document.execCommand('copy'); } catch { /* trudno */ }
    t.remove();
  }
  przycisk.textContent = 'skopiowano';
  setTimeout(() => { przycisk.textContent = 'kopiuj'; }, 1500);
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
    if (r.status === 404) { stan.obw = {}; pokazInfoObwodow(); return; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    stan.obw = JSON.parse(await r.text());
    pokazInfoObwodow();
  } catch (e) {
    stan.obw = {};
    pokazInfoObwodow('Nie udało się odczytać obwody.json: ' + e.message + ' (sprawdź przecinki i cudzysłowy).');
  }
}

function zastosujDane(M, wersja, pierwszy) {
  const A = analizuj(M);
  const wybranyId = stan.wybrany?.id;
  stan.M = M; stan.A = A; stan.wersjaDanych = wersja;
  zbudujScene();
  zbudujPanel();
  pokazInfoObwodow();
  $('#stan-danych').textContent = opisWersji(wersja?.lm);
  $('#stan-danych').title = NA_GITHUB ? 'Kopia danych wysłana na GitHub (WYSLIJ_NA_GITHUB.bat)'
    : stan.urlDanych === ZRODLA_DANYCH[0] ? 'Plik: Projekt\\skrypty\\dane_modelu.json' : 'Kopia: aplikacja\\dane_modelu.json';
  if (pierwszy) stan.dopasowano = false;
  rozmiar();
  const p = wybranyId && A.items.find((q) => q.id === wybranyId);
  if (p) wybierz(p); else zamknijKarte();
  if (pierwszy) punktZAdresu();
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
window.addEventListener('hashchange', punktZAdresu);

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
    $('#stan-danych').textContent = 'brak danych';
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
$('#btn-odswiez').addEventListener('click', () => wczytaj());
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
  for (const t of KOLEJNOSC_TYPOW) stan.wid['el_' + t] = wl;
  document.querySelectorAll('#lista-elektryka input').forEach((i) => { if (!i.disabled) i.checked = wl; });
  zapiszUstawienia();
  zastosujWidocznosc();
}));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { zamknijKarte(); document.body.classList.remove('panel-otwarty'); } });
ciemny.addEventListener('change', ustawTlo);

$('#podpowiedz').textContent = dotyk
  ? '1 palec – obrót · 2 palce – przybliżanie i przesuwanie · dotknij kółko, by zobaczyć szczegóły'
  : 'Lewy przycisk – obrót · prawy – przesuwanie · kółko – przybliżanie · kliknij kółko punktu, by zobaczyć szczegóły';

// ---------------------------------------------------------------- start
window.mojDomek = { stan, kamera, zaslaniajace, zasloniety, THREE };   // do podglądu w konsoli przeglądarki (F12)
ustawTlo();
rozmiar();
petla();
if (location.protocol !== 'file:') wczytaj({ pierwszy: true });
