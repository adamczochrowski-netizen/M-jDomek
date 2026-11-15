// Mój domek – budowa sceny Three.js z danych (wzór: skrypty/buduj_3d.py).
// Rzut (x, yd, z) -> Three.js (X, Y, Z) = (x, z, yd): Y w górę, rzut z góry wygląda jak rysunek.
import * as THREE from 'three';
import { TYPY, KOLEJNOSC_TYPOW } from './analiza.js';

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
    teren: lambert(0x9fb48a),
    belka: lambert(0x9e6634),
    krawedzie: new THREE.LineBasicMaterial({ color: 0x4a4a4a, transparent: true, opacity: 0.45 }),
    meble: {
      'drewno': lambert(0xb38d61), 'biały': lambert(0xededeb), 'tkanina': lambert(0x737a85),
      'tkanina_ciemna': lambert(0x383a42), 'pościel': lambert(0xe0e0ea), 'poduszka': lambert(0xf7f7f7),
      'ciemny': lambert(0x141414), 'stal': lambert(0xb8babf), 'ceramika': lambert(0xf8f8f8),
      'blat': lambert(0x4d4a47), 'lodówka': lambert(0xd9dbdd),
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

// ---------------------------------------------------------------- tekstury znaczników
function teksturaZnacznika(t) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const T = TYPY[t] || { kolor: '#888', tekst: '#fff' };
  x.beginPath(); x.arc(64, 64, 54, 0, Math.PI * 2);
  x.fillStyle = T.kolor; x.fill();
  x.lineWidth = 10; x.strokeStyle = T.obrys || 'rgba(255,255,255,0.95)'; x.stroke();
  x.fillStyle = T.tekst; x.font = 'bold 62px system-ui, Segoe UI, Arial, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, 64, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
export const ikonaTypu = (t) => teksturaZnacznika(t).image.toDataURL();

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
  const siatka = new THREE.GridHelper(2 * R, 32, 0x7f9670, 0x8ea67e);
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

  // drzwi otwarte jak na rzucie
  const ZEWN = new Set(['Wejscie', 'Taras', 'Wiatrolap']);
  const LEAF = 4;
  for (const d of M.doors || []) {
    const [hx, hy] = d.hinge, sw = d.swing, cl = d.closed;
    const wl = d.width - 6, hl = d.top - 5;
    const obrot = Math.atan2(-sw[1], sw[0]);
    const at = (u, v) => [hx + sw[0] * u - cl[0] * v, hy + sw[1] * u - cl[1] * v];
    if (d.name === 'Taras') {
      const F = 8;
      for (const [u, z, su, sz, m] of [[wl / 2, F / 2, wl, F, mat.rama], [wl / 2, hl - F / 2, wl, F, mat.rama],
        [F / 2, hl / 2, F, hl, mat.rama], [wl - F / 2, hl / 2, F, hl, mat.rama], [wl / 2, hl / 2, wl - 2 * F, hl - 2 * F, mat.szklo]]) {
        const [x, y] = at(u, LEAF / 2);
        grupa('okna').add(blok(x, y, z, su, m === mat.szklo ? 1 : LEAF, sz, m, obrot));
      }
    } else {
      const [x, y] = at(wl / 2, LEAF / 2);
      const m = blok(x, y, hl / 2, wl, LEAF, hl, ZEWN.has(d.name) ? mat.drzwiZewn : mat.drzwi, obrot);
      m.userData.zaslania = true;
      grupa('okna').add(m);
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

  // elektryka: prawdziwej wielkości puszki + znaczniki (kółka o stałej wielkości na ekranie)
  const poz = { };
  for (const t of KOLEJNOSC_TYPOW) { grupa('el_' + t); poz[t] = []; }
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
    poz[t in poz ? t : 'Z'].push(p.znacznik.x, p.znacznik.y, p.znacznik.z);
  }
  const znaczniki = {};
  for (const t of KOLEJNOSC_TYPOW) {
    if (!poz[t].length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(poz[t], 3));
    const pm = new THREE.PointsMaterial({ size: 20, sizeAttenuation: false, map: teksturaZnacznika(t), transparent: true, alphaTest: 0.2 });
    const pts = new THREE.Points(geo, pm);
    pts.renderOrder = 3;
    znaczniki[t] = pts;
    grupa('el_' + t).add(pts);
  }
  return { warstwy: W, znaczniki };
}
