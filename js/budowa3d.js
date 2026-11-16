// Mój domek – budowa sceny Three.js z danych (wzór: skrypty/buduj_3d.py).
// Rzut (x, yd, z) -> Three.js (X, Y, Z) = (x, z, yd): Y w górę, rzut z góry wygląda jak rysunek.
import * as THREE from 'three';
import { TYPY, KOLEJNOSC_TYPOW } from './analiza.js';
import { kanwaZnacznika, ikonaTypu } from './ikony.js';

export const POZIOM_PODLOGI = 0.4;
const P = (x, yd, z) => [x, z, yd];

// ---------------------------------------------------------------- materiały
const lambert = (kolor, extra = {}) => new THREE.MeshLambertMaterial({ color: kolor, ...extra });
export function materialy() {
  return {
    sciana: lambert(0xeae7e0),
    podlogaDrewno: lambert(0xb08a62),
    plytki: lambert(0xd3d3cf),
    sufit: new THREE.MeshLambertMaterial({ color: 0xc9dcf2, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }),
    sufitObrys: new THREE.LineBasicMaterial({ color: 0x2f6aa8 }),
    szklo: new THREE.MeshLambertMaterial({ color: 0xbfe0f2, transparent: true, opacity: 0.3, depthWrite: false }),
    rama: lambert(0xf5f5f5),
    drzwi: lambert(0x6b4a2e),
    drzwiZewn: lambert(0xb87a38),
    fundament: lambert(0x9a9a9a),
    teren: lambert(0x9fb48a),          // trawa i siatka – kolory z motywu (main.js: koloryTerenu)
    siatka: [0x7f9670, 0x8ea67e],
    belka: lambert(0x9e6634),
    krawedzie: new THREE.LineBasicMaterial({ color: 0x4a4a4a, transparent: true, opacity: 0.45 }),
    meble: {
      'drewno': lambert(0xb38d61), 'biały': lambert(0xededeb), 'tkanina': lambert(0x737a85),
      'tkanina_ciemna': lambert(0x383a42), 'pościel': lambert(0xe0e0ea), 'poduszka': lambert(0xf7f7f7),
      'ciemny': lambert(0x141414), 'stal': lambert(0xb8babf), 'ceramika': lambert(0xf8f8f8),
      'blat': lambert(0x4d4a47), 'lodówka': lambert(0xd9dbdd), 'pompa': lambert(0xe9eaec), 'beton': lambert(0x9c9a94), 'bloczek': lambert(0xa3a19b), 'styropian': lambert(0xf4f5f2),
      'wlaz': lambert(0x3b3a38), 'rura_pvc': lambert(0x8d9095), 'hydrofor': lambert(0x1f8fb3), 'zlacze': lambert(0xc9cbc6),
    },
    el: Object.fromEntries(KOLEJNOSC_TYPOW.map((t) => [t, lambert(TYPY[t].kolor)])),
    lampaObudowa: lambert(0x1b1b1e),
    lampaSwiatlo: new THREE.MeshBasicMaterial({ color: 0xffd98c }),
  };
}

// ---------------------------------------------------------------- pomocnicze
class Siatka {
  constructor() { this.p = []; this.n = []; this.i = []; }
  quad(a, b, c, d, nrm) {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const order = cr[0] * nrm[0] + cr[1] * nrm[1] + cr[2] * nrm[2] >= 0 ? [a, b, c, d] : [a, d, c, b];
    const base = this.p.length / 3;
    for (const q of order) { this.p.push(q[0], q[1], q[2]); this.n.push(nrm[0], nrm[1], nrm[2]); }
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  geometria() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

// bryła z komórek siatki (ściany, fundament): rysujemy tylko ścianki między pełną a pustą komórką
function voxel(xs, ys, zs, filled) {
  const nx = xs.length - 1, ny = ys.length - 1, nz = zs.length - 1;
  const F = new Uint8Array(nx * ny * nz);
  const id = (i, j, k) => (i * ny + j) * nz + k;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) F[id(i, j, k)] = filled(i, j, k) ? 1 : 0;
  const f = (i, j, k) => i >= 0 && i < nx && j >= 0 && j < ny && k >= 0 && k < nz && F[id(i, j, k)] === 1;
  const S = new Siatka();
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    if (!F[id(i, j, k)]) continue;
    const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1], z0 = zs[k], z1 = zs[k + 1];
    if (!f(i - 1, j, k)) S.quad(P(x0, y0, z0), P(x0, y1, z0), P(x0, y1, z1), P(x0, y0, z1), [-1, 0, 0]);
    if (!f(i + 1, j, k)) S.quad(P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1), [1, 0, 0]);
    if (!f(i, j - 1, k)) S.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y0, z1), P(x0, y0, z1), [0, 0, -1]);
    if (!f(i, j + 1, k)) S.quad(P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1), [0, 0, 1]);
    if (!f(i, j, k - 1)) S.quad(P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0), [0, -1, 0]);
    if (!f(i, j, k + 1)) S.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), [0, 1, 0]);
  }
  return S.geometria();
}

function plaska(cells, z, nrmY = 1) {
  const S = new Siatka();
  for (const [x0, x1, y0, y1] of cells) S.quad(P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z), [0, nrmY, 0]);
  return S.geometria();
}

// ---------------------------------------------------------------- ogrzewanie podłogowe (schemat jak na zdjęciach z budowy)
// Pomieszczenie dzielimy na prostokąty z komórek siatki (największy możliwy, potem następny…).
// W dużym prostokącie rury idą „ślimakiem”: pętle co ROZSTAW od ścian do środka, w środku zawijas w kształcie S.
// W wąskim pasie (korytarz, przejście) – proste rury wzdłuż pasa, jak wiązka zasilająca pokoje.
const ROZSTAW = 15, OD_SCIANY = 8, GRUBOSC_RURY = 2.2;
export const KOLOR_RUR = 0xd9452b;

function prostokatyZKomorek(cells, A) {
  const nx = A.xs.length - 1, ny = A.ys.length - 1;
  const ix = new Map(A.xs.map((v, i) => [v, i])), iy = new Map(A.ys.map((v, i) => [v, i]));
  const mask = Array.from({ length: nx }, () => new Uint8Array(ny));
  for (const [x0, , y0] of cells) mask[ix.get(x0)][iy.get(y0)] = 1;
  const wynik = [];
  for (let krok = 0; krok < 30; krok++) {
    // sumy prefiksowe – szybkie sprawdzanie, czy prostokąt komórek jest cały w pomieszczeniu
    const S = Array.from({ length: nx + 1 }, () => new Float64Array(ny + 1));
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) S[i + 1][j + 1] = mask[i][j] + S[i][j + 1] + S[i + 1][j] - S[i][j];
    const pelny = (i0, i1, j0, j1) => S[i1 + 1][j1 + 1] - S[i0][j1 + 1] - S[i1 + 1][j0] + S[i0][j0] === (i1 - i0 + 1) * (j1 - j0 + 1);
    let best = null, bestPole = 0;
    for (let i0 = 0; i0 < nx; i0++) for (let i1 = i0; i1 < nx; i1++) for (let j0 = 0; j0 < ny; j0++) {
      if (!mask[i0][j0]) continue;
      for (let j1 = j0; j1 < ny && pelny(i0, i1, j0, j1); j1++) {
        const pole = (A.xs[i1 + 1] - A.xs[i0]) * (A.ys[j1 + 1] - A.ys[j0]);
        if (pole > bestPole) { bestPole = pole; best = [i0, i1, j0, j1]; }
      }
    }
    if (!best) break;
    const [i0, i1, j0, j1] = best;
    const r = [A.xs[i0], A.xs[i1 + 1], A.ys[j0], A.ys[j1 + 1]];
    if (Math.min(r[1] - r[0], r[3] - r[2]) < 2 * OD_SCIANY + ROZSTAW || bestPole < 2500) break;   // zostały okruchy
    wynik.push(r);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) mask[i][j] = 0;
  }
  return wynik;
}

// zaokrąglony prostokąt jako zamknięta łamana
function zaokraglony(x0, x1, y0, y1, r) {
  const pkt = [], N = 5;
  const naroznik = (cx, cy, a0) => { for (let k = 0; k <= N; k++) { const a = a0 + (k / N) * Math.PI / 2; pkt.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  naroznik(x1 - r, y0 + r, -Math.PI / 2);
  naroznik(x1 - r, y1 - r, 0);
  naroznik(x0 + r, y1 - r, Math.PI / 2);
  naroznik(x0 + r, y0 + r, Math.PI);
  pkt.push(pkt[0]);
  return pkt;
}

function trasyRur(prost) {
  const [X0, X1, Y0, Y1] = prost;
  const w = X1 - X0, h = Y1 - Y0, linie = [];
  if (Math.min(w, h) < 90) {                         // wąski pas: proste rury wzdłuż
    const wzdluzX = w >= h, szer = wzdluzX ? h : w;
    for (let d = OD_SCIANY; d <= szer - OD_SCIANY + 0.1; d += ROZSTAW) {
      linie.push(wzdluzX ? [[X0 + 2, Y0 + d], [X1 - 2, Y0 + d]] : [[X0 + d, Y0 + 2], [X0 + d, Y1 - 2]]);
    }
    return linie;
  }
  let k = 0;
  for (; ; k++) {                                    // pętle od ścian do środka
    const e = OD_SCIANY + k * ROZSTAW;
    const x0 = X0 + e, x1 = X1 - e, y0 = Y0 + e, y1 = Y1 - e;
    if (x1 - x0 < 2 * ROZSTAW || y1 - y0 < 2 * ROZSTAW) break;
    linie.push(zaokraglony(x0, x1, y0, y1, Math.min(14, (x1 - x0) / 2, (y1 - y0) / 2)));
  }
  const e = OD_SCIANY + k * ROZSTAW;                 // zawijas S w środku
  const x0 = X0 + e, x1 = X1 - e, y0 = Y0 + e, y1 = Y1 - e;
  if (x1 - x0 > 4 && y1 - y0 > 4) {
    const poziomo = x1 - x0 >= y1 - y0, dl = poziomo ? x1 - x0 : y1 - y0, amp = (poziomo ? y1 - y0 : x1 - x0) / 2 - 1;
    const s = [];
    for (let t = 0; t <= 24; t++) {
      const u = t / 24, a = Math.sin(u * 2 * Math.PI) * amp;
      s.push(poziomo ? [x0 + u * dl, (y0 + y1) / 2 + a] : [(x0 + x1) / 2 + a, y0 + u * dl]);
    }
    linie.push(s);
  }
  return linie;
}

// łamane -> płaskie wstążki (rury) leżące na podłodze
function wstazki(linie, z, grub) {
  const p = [], idx = [];
  for (const l of linie) for (let i = 0; i + 1 < l.length; i++) {
    const [ax, ay] = l[i], [bx, by] = l[i + 1];
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy);
    if (d < 1e-6) continue;
    const nx = (-dy / d) * grub / 2, ny = (dx / d) * grub / 2, b = p.length / 3;
    p.push(ax + nx, z, ay + ny, bx + nx, z, by + ny, bx - nx, z, by - ny, ax - nx, z, ay - ny);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setIndex(idx);
  return g;
}

// prostopadłościan w układzie rzutu: środek (x, yd, z), wymiary (dx, dyd, dz), obrót wokół pionu
function blok(x, yd, z, dx, dyd, dz, mat, obrot = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(dx, dz, dyd), mat);
  m.position.set(x, z, yd);
  m.rotation.y = obrot;
  return m;
}
const blokXY = (x0, x1, y0, y1, z0, z1, mat) => blok((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, mat);

// ---------------------------------------------------------------- ściany (z możliwością obniżenia)
export function zbudujSciany(A, mat, wysokosc) {
  const doors = A.openings;
  const top = Math.min(wysokosc ?? A.zCeil, A.zCeil);
  const zs = [...new Set([0, A.zSill, A.zWin, A.zCeil, ...doors.map((o) => o.z1)])]
    .filter((z) => z < top).concat([top]).sort((a, b) => a - b);
  const cz = zs.slice(1).map((z, k) => (zs[k] + z) / 2);
  const geo = voxel(A.xs, A.ys, zs, (i, j, k) => {
    if (!A.isWall[i][j]) return false;
    for (const o of A.openings) {
      const r = o.r;
      if (r[0] < A.cx[i] && A.cx[i] < r[1] && r[2] < A.cy[j] && A.cy[j] < r[3] && o.z0 < cz[k] && cz[k] < o.z1) return false;
    }
    return true;
  });
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(geo, mat.sciana);
  mesh.userData.zaslania = true;
  g.add(mesh);
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), mat.krawedzie));
  return g;
}

// ---------------------------------------------------------------- tekstury znaczników (rysunek ikon: js/ikony.js)
const tekstury = new Map();
export function teksturaZnacznika(t, w = 'R') {
  if (!tekstury.has(t + w)) {
    const tex = new THREE.CanvasTexture(kanwaZnacznika(t, w));
    tex.colorSpace = THREE.SRGBColorSpace;
    tekstury.set(t + w, tex);
  }
  return tekstury.get(t + w);
}
export function teksturaWyboru() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.beginPath(); x.arc(64, 64, 52, 0, Math.PI * 2);
  x.lineWidth = 14; x.strokeStyle = '#ffffff'; x.stroke();
  x.lineWidth = 8; x.strokeStyle = '#0a84ff'; x.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
export { ikonaTypu };

// ---------------------------------------------------------------- cała scena
// zwraca { warstwy: {klucz: THREE.Group}, znaczniki: {typ: THREE.Points} }
export function zbudujDom(M, A, mat, opcje = {}) {
  const W = {};
  const grupa = (k) => (W[k] = W[k] || new THREE.Group());

  W.sciany = zbudujSciany(A, mat, opcje.wysokoscScian);

  // podłogi i progi
  for (const f of A.floors) {
    const m = new THREE.Mesh(plaska(f.cells, POZIOM_PODLOGI), f.plytki ? mat.plytki : mat.podlogaDrewno);
    m.name = 'Podłoga – ' + f.nazwa;
    grupa('podlogi').add(m);
  }
  if (A.thresholds.length) grupa('podlogi').add(new THREE.Mesh(plaska(A.thresholds, POZIOM_PODLOGI), mat.plytki));

  // ogrzewanie podłogowe: schemat rur w każdym pomieszczeniu (podział jak sufity: kuchnia osobno, salon z holem)
  const og = opcje.ogrzewanie;
  if (og) {
    const wszystkie = og.pomieszczenia === 'wszystkie' || !Array.isArray(og.pomieszczenia);
    const lista = wszystkie ? [] : og.pomieszczenia.map((s) => String(s).toLowerCase());
    for (const c of A.ceilings) {                    // osobna siatka na pomieszczenie – można podświetlić jedno
      if (!wszystkie && !lista.includes(c.nazwa.toLowerCase())) continue;
      const linie = prostokatyZKomorek(c.cells, A).flatMap(trasyRur);
      if (!linie.length) continue;
      const m = new THREE.Mesh(wstazki(linie, POZIOM_PODLOGI + 0.3, GRUBOSC_RURY), new THREE.MeshBasicMaterial({
        color: KOLOR_RUR, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      m.name = 'Ogrzewanie – ' + c.nazwa;
      m.userData = { pokoj: c.nazwa, wlasnyMaterial: true };
      m.renderOrder = 1;
      grupa('ogrzewanie').add(m);
    }
  }

  // sufity – każde pomieszczenie (i strefa) na swojej wysokości
  for (const c of A.ceilings) {
    const geo = plaska(c.cells, c.h + POZIOM_PODLOGI, -1);
    const m = new THREE.Mesh(geo, mat.sufit);
    m.name = `Sufit – ${c.nazwa} (${c.h} cm)`;
    m.renderOrder = 2;
    grupa('sufity').add(m, new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), mat.sufitObrys));
  }

  // belki
  for (const b of M.belki || []) {
    const m = blokXY(b.x0, b.x1, b.yd0, b.yd1, b.z0 + POZIOM_PODLOGI, b.z1 + POZIOM_PODLOGI, mat.belka);
    m.userData.zaslania = true;
    grupa('belka').add(m);
  }

  // teren: fundament, trawa i siatka co 1 m
  const g = grupa('teren');
  if (A.teren > 0) {
    const fund = voxel(A.xs, A.ys, [-A.teren, 0], (i, j) => A.foot[i][j]);
    g.add(new THREE.Mesh(fund, mat.fundament));
  }
  // środek terenu zaokrąglony do 1 m, żeby linie siatki wypadały co metr od wewnętrznego narożnika domu
  const bb = A.bbox, cxm = Math.round((bb.x0 + bb.x1) / 200) * 100, cym = Math.round((bb.y0 + bb.y1) / 200) * 100;
  const R = 1600;
  const trawa = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, 2 * R), mat.teren);
  trawa.rotation.x = -Math.PI / 2;
  trawa.position.set(cxm, -A.teren - 0.6, cym);
  g.add(trawa);
  const siatka = new THREE.GridHelper(2 * R, 32, mat.siatka[0], mat.siatka[1]);
  siatka.position.set(cxm, -A.teren - 0.3, cym);
  siatka.material.transparent = true; siatka.material.opacity = 0.5;
  g.add(siatka);

  // okna: rama + szyba
  const FR = 6, FD = 8;
  for (const w of M.windows || []) {
    const [x0, x1, y0, y1] = w.rect, hor = w.orient === 'h';
    const wc = hor ? (y0 + y1) / 2 : (x0 + x1) / 2;
    const L = hor ? x1 - x0 : y1 - y0, mid = hor ? (x0 + x1) / 2 : (y0 + y1) / 2;
    const hgt = A.zWin - A.zSill;
    const place = (u, z, su, sz, m, depth = FD) => grupa('okna').add(
      hor ? blok(mid + u, wc, z, su, depth, sz, m) : blok(wc, mid + u, z, depth, su, sz, m));
    place(0, A.zSill + FR / 2, L, FR, mat.rama);
    place(0, A.zWin - FR / 2, L, FR, mat.rama);
    place(-L / 2 + FR / 2, A.zSill + hgt / 2, FR, hgt, mat.rama);
    place(L / 2 - FR / 2, A.zSill + hgt / 2, FR, hgt, mat.rama);
    place(0, A.zSill + hgt / 2, L - 2 * FR, hgt - 2 * FR, mat.szklo, 1);
  }

  // drzwi: skrzydło otwarte (jak na rzucie, kierunek swing) i zamknięte (w świetle otworu, kierunek closed);
  // widać jedno z nich – przełącznik „Drzwi: otwarte / zamknięte” (opcje.drzwi, main.js: ustawDrzwi)
  const ZEWN = new Set(['Wejscie', 'Taras', 'Wiatrolap']);
  const LEAF = 4;
  const widoczne = opcje.drzwi === 'zamkniete' ? 'zamkniete' : 'otwarte';
  for (const d of M.doors || []) {
    const [hx, hy] = d.hinge;
    const wl = d.width - 6, hl = d.top - 5;
    // kier – wzdłuż skrzydła od zawiasu; bok – grubość skrzydła idzie w stronę przeciwną do „bok”;
    // u0 – odsunięcie od zawiasu (zamknięte: szczelina 3 cm z obu stron otworu)
    for (const [stanDrzwi, kier, bok, u0] of [['otwarte', d.swing, d.closed, 0], ['zamkniete', d.closed, d.swing, 3]]) {
      const obrot = Math.atan2(-kier[1], kier[0]);
      const at = (u, v) => [hx + kier[0] * (u0 + u) - bok[0] * v, hy + kier[1] * (u0 + u) - bok[1] * v];
      const F = 8;
      const czesci = d.name === 'Taras'
        ? [[wl / 2, F / 2, wl, F, mat.rama], [wl / 2, hl - F / 2, wl, F, mat.rama],
          [F / 2, hl / 2, F, hl, mat.rama], [wl - F / 2, hl / 2, F, hl, mat.rama], [wl / 2, hl / 2, wl - 2 * F, hl - 2 * F, mat.szklo]]
        : [[wl / 2, hl / 2, wl, hl, ZEWN.has(d.name) ? mat.drzwiZewn : mat.drzwi]];
      for (const [u, z, su, sz, m] of czesci) {
        const [x, y] = at(u, LEAF / 2);
        const o = blok(x, y, z, su, m === mat.szklo ? 1 : LEAF, sz, m, obrot);
        o.userData.drzwi = stanDrzwi;
        if (d.name !== 'Taras') o.userData.zaslania = true;
        o.visible = stanDrzwi === widoczne;
        grupa('okna').add(o);
      }
    }
  }

  // meble i sanitariaty
  const dodajMebel = (f, k) => {
    const m = mat.meble[f.mat] || mat.meble['drewno'];
    const z0 = f.z0 + POZIOM_PODLOGI, z1 = f.z1 + POZIOM_PODLOGI;
    const add = (o) => { o.userData.zaslania = true; grupa(k).add(o); };
    if (f.typ === 'cyl') {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 32), m);
      c.scale.set(f.x1 - f.x0, z1 - z0, f.yd1 - f.yd0);
      c.position.set((f.x0 + f.x1) / 2, (z0 + z1) / 2, (f.yd0 + f.yd1) / 2);
      add(c);
    } else if (f.typ === 'table') {
      add(blokXY(f.x0, f.x1, f.yd0, f.yd1, z1 - 4, z1, m));
      for (const [lx, ly] of [[f.x0 + 3, f.yd0 + 3], [f.x1 - 8, f.yd0 + 3], [f.x0 + 3, f.yd1 - 8], [f.x1 - 8, f.yd1 - 8]])
        add(blokXY(lx, lx + 5, ly, ly + 5, z0, z1 - 4, m));
    } else add(blokXY(f.x0, f.x1, f.yd0, f.yd1, z0, z1, m));
  };
  grupa('meble'); grupa('sanitariaty');
  for (const f of M.furniture || []) dodajMebel(f, 'meble');
  for (const f of M.sanitariaty || []) dodajMebel(f, 'sanitariaty');
  // urządzenia na zewnątrz – ten sam format co meble, z od podłogi domu; studnia osobną warstwą
  // (komora leży pod ziemią – widać ją po wyłączeniu warstwy „Teren”)
  grupa('urzadzenia'); grupa('studnia'); grupa('zlacze');
  for (const f of M.urzadzenia || []) dodajMebel(f, /^studnia/i.test(f.nazwa || '') ? 'studnia' : /^złącze/i.test(f.nazwa || '') ? 'zlacze' : 'urzadzenia');

  // elektryka: prawdziwej wielkości puszki + znaczniki (kółka o stałej wielkości na ekranie)
  const poz = { };
  for (const t of KOLEJNOSC_TYPOW) { grupa('el_' + t); poz[t] = {}; }
  for (const p of A.items) {
    const t = p.typ, k = 'el_' + (W['el_' + t] ? t : 'Z');
    const { ax, c, s } = p;
    const zP = POZIOM_PODLOGI;
    if (t === 'L') {
      const z = p.z + zP;
      for (const [off, along, out, hgt, zc, m] of [[1, 8, 2, 16, z + 6, mat.lampaObudowa], [6, 3, 10, 3, z + 13, mat.lampaObudowa],
        [13, 18, 18, 5, z + 11, mat.lampaObudowa], [13, 13, 13, 18, z - 0.5, mat.lampaSwiatlo], [13, 15, 15, 4, z - 11.5, mat.lampaObudowa]]) {
        grupa(k).add(ax === 'v' ? blok(c + s * off, p.yd, zc, out, along, hgt, m) : blok(p.x, c + s * off, zc, along, out, hgt, m));
      }
      p.znacznik = new THREE.Vector3(...(ax === 'v' ? P(c + s * 24, p.yd, z) : P(p.x, c + s * 24, z)));
    } else {
      const sz = p.size;
      let ln = p.n > 1 ? 7.5 * p.n : sz, hz = sz, zc = p.z;
      if (p.pion && p.n > 1) { ln = sz; hz = 7.5 * p.n; zc = p.z + 7.1 * (p.n - 1) / 2; }
      const d = t === 'G' ? 5 : 1.5;
      const m = mat.el[t] || mat.el.Z;
      grupa(k).add(ax === 'v' ? blok(c + s * d / 2, p.yd, zc + zP, d, ln, hz, m) : blok(p.x, c + s * d / 2, zc + zP, ln, d, hz, m));
      p.znacznik = new THREE.Vector3(...(ax === 'v' ? P(c + s * (d + 3), p.yd, zc + zP) : P(p.x, c + s * (d + 3), zc + zP)));
    }
    const kt = t in poz ? t : 'Z';
    (poz[kt][p.wiar || 'R'] = poz[kt][p.wiar || 'R'] || []).push(p);
  }
  // znaczniki: osobny zestaw dla każdego rodzaju i stopnia pewności (inna ikona); p.znacznikRef pozwala
  // schować pojedynczy punkt (łączenie bliskich punktów w bańkę) i przygasić resztę po wyborze punktu
  const znaczniki = {};
  for (const t of KOLEJNOSC_TYPOW) {
    for (const [w, lista] of Object.entries(poz[t])) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(lista.flatMap((p) => [p.znacznik.x, p.znacznik.y, p.znacznik.z]), 3));
      const pm = new THREE.PointsMaterial({ size: 22, sizeAttenuation: false, map: teksturaZnacznika(t, w), transparent: true, alphaTest: 0.2,
        opacity: w === 'N' ? 0.75 : 1 });
      const pts = new THREE.Points(geo, pm);
      pts.renderOrder = 3;
      pts.userData.pelna = pm.opacity;
      lista.forEach((p, i) => { p.znacznikRef = { pts, i }; });
      znaczniki[t + w] = pts;
      grupa('el_' + t).add(pts);
    }
  }
  return { warstwy: W, znaczniki };
}
