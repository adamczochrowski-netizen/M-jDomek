// Mój domek – analiza danych z dane_modelu.json (bez Three.js).
// Układ rzutu: x w prawo, yd w dół (od wewnętrznej górnej ściany domu), z = wysokość nad podłogą.
// Jednostki: cm. Logika siatki komórek jest przeniesiona z skrypty/buduj_3d.py.

export const TYPY = {
  Z: { nazwa: 'Gniazdko zwykłe', kolor: '#e03131', tekst: '#ffffff' },
  S: { nazwa: 'Gniazdko do sprzętu', kolor: '#2f54c9', tekst: '#ffffff' },
  I: { nazwa: 'Gniazdko indukcji', kolor: '#f2c200', tekst: '#1d1d1d' },
  W: { nazwa: 'Włącznik', kolor: '#37a52b', tekst: '#ffffff' },
  D: { nazwa: 'Dzwonek (przycisk)', kolor: '#262626', tekst: '#ffffff' },
  G: { nazwa: 'Gong dzwonka', kolor: '#f6f6f6', tekst: '#1d1d1d', obrys: '#555555' },
  L: { nazwa: 'Lampa zewnętrzna', kolor: '#ff9f1c', tekst: '#1d1d1d' },
};
export const KOLEJNOSC_TYPOW = ['Z', 'S', 'I', 'W', 'D', 'G', 'L'];

const uniq = (a) => [...new Set(a)].sort((p, q) => p - q);
const mids = (a) => a.slice(1).map((v, i) => (a[i] + v) / 2);
const inside = (r, x, y) => r[0] < x && x < r[1] && r[2] < y && y < r[3];

// indeks i taki, że arr[i] <= v < arr[i+1]; -1 poza zakresem
function bisect(arr, v) {
  if (!(v >= arr[0] && v < arr[arr.length - 1])) return -1;
  let lo = 0, hi = arr.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= v) lo = m; else hi = m;
  }
  return lo;
}

export function slug(s) {
  return s.toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const RAMKA = { 1: 'pojedyncze', 2: 'podwójne', 3: 'potrójne', 4: 'poczwórne' };

function opisAuto(p) {
  const t = p.typ;
  let s;
  if (t === 'Z' || t === 'S' || t === 'I') {
    const rodzaj = t === 'Z' ? 'gniazdko' : t === 'S' ? 'gniazdko do sprzętu' : 'gniazdko do płyty indukcyjnej';
    s = p.n >= 5 ? `Rząd ${p.n} gniazdek` + (t === 'Z' ? '' : ` (${rodzaj})`)
      : `${RAMKA[p.n] || p.n + '×'} ${rodzaj}`;
    if (p.pion && p.n > 1) s += ' w ramce pionowej – podana wysokość to dolne gniazdo, pozostałe są nad nim';
  } else if (t === 'W') s = p.n > 1 ? `Włącznik (${p.n} w ramce)` : 'Włącznik';
  else if (t === 'D') s = 'Przycisk dzwonka przy drzwiach';
  else if (t === 'G') s = `Gong dzwonka (obudowa ok. ${p.size} cm)`;
  else if (t === 'L') s = 'Lampa na ścianie zewnętrznej';
  else s = 'Punkt elektryczny';
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

export function analizuj(M) {
  const HG = M.heights || {};
  const zSill = HG.parapet ?? 85;
  const zWin = HG['góra_okna'] ?? 220;
  const sufitDom = HG.sufit ?? 256;
  const teren = HG['podłoga_nad_terenem'] ?? 0;

  const rooms = (M.rooms || []).map((r) => ({
    nazwa: r.lines.join(' '), lines: r.lines, centre: r.centre,
    centre3d: r.centre3d || r.centre, sufit: r.sufit ?? sufitDom, region: -1,
  }));
  const zCeil = Math.max(sufitDom, ...rooms.map((r) => r.sufit));
  const doors = M.doors || [], windows = M.windows || [];
  const openings = [
    ...doors.map((d) => ({ r: d.rect, z0: 0, z1: d.top })),
    ...windows.map((w) => ({ r: w.rect, z0: zSill, z1: zWin })),
  ];
  const rects = [...M.walls, ...openings.map((o) => o.r)];
  const xs = uniq(rects.flatMap((r) => [r[0], r[1]]));
  const ys = uniq(rects.flatMap((r) => [r[2], r[3]]));
  const cx = mids(xs), cy = mids(ys);
  const nx = cx.length, ny = cy.length;

  const isWall = [], outside = [], region = [];
  for (let i = 0; i < nx; i++) {
    isWall.push(cy.map((y) => M.walls.some((r) => inside(r, cx[i], y))));
    outside.push(new Array(ny).fill(false));
    region.push(new Array(ny).fill(-1));
  }
  const sasiedzi = (i, j) => [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]
    .filter(([a, b]) => a >= 0 && a < nx && b >= 0 && b < ny);

  // na zewnątrz: zalewanie od brzegu siatki
  const stack = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++)
    if ((i === 0 || j === 0 || i === nx - 1 || j === ny - 1) && !isWall[i][j]) stack.push([i, j]);
  while (stack.length) {
    const [i, j] = stack.pop();
    if (outside[i][j] || isWall[i][j]) continue;
    outside[i][j] = true;
    for (const [a, b] of sasiedzi(i, j)) if (!outside[a][b] && !isWall[a][b]) stack.push([a, b]);
  }
  // pomieszczenia = spójne obszary wnętrza
  const regions = [];
  for (let i0 = 0; i0 < nx; i0++) for (let j0 = 0; j0 < ny; j0++) {
    if (isWall[i0][j0] || outside[i0][j0] || region[i0][j0] >= 0) continue;
    const rid = regions.length, cells = [], st = [[i0, j0]];
    while (st.length) {
      const [i, j] = st.pop();
      if (region[i][j] >= 0) continue;
      region[i][j] = rid; cells.push([i, j]);
      for (const [a, b] of sasiedzi(i, j))
        if (region[a][b] < 0 && !isWall[a][b] && !outside[a][b]) st.push([a, b]);
    }
    regions.push(cells);
  }

  const cellAt = (x, y) => {
    const i = bisect(xs, x), j = bisect(ys, y);
    return i < 0 || j < 0 ? null : [i, j];
  };

  const regionRooms = regions.map(() => []);
  for (const r of rooms) {
    const c = cellAt(r.centre[0], r.centre[1]);
    if (c && region[c[0]][c[1]] >= 0) {
      r.region = region[c[0]][c[1]];
      regionRooms[r.region].push(r);
    }
  }
  const zones = (M.sufit_strefy || []).map((z) => ({ nazwa: z.nazwa, box: z.box, h: z.h }));
  const zoneNames = new Set(zones.map((z) => z.nazwa));

  // pomieszczenie w obszarze (np. kuchnia + salon to jeden obszar – dzieli je strefa sufitu kuchni)
  function pokojW(rid, x, y) {
    const list = regionRooms[rid];
    if (!list.length) return null;
    for (const z of zones) {
      if (!inside(z.box, x, y)) continue;
      const r = list.find((q) => q.nazwa === z.nazwa);
      if (r) return r;
    }
    let cand = list.filter((q) => !zoneNames.has(q.nazwa));
    if (!cand.length) cand = list;
    let best = null, bd = Infinity;
    for (const q of cand) {
      const d = Math.hypot(q.centre[0] - x, q.centre[1] - y);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  function miejsce(x, y) {
    const c = cellAt(x, y);
    if (!c || outside[c[0]][c[1]]) return { typ: 'zewnatrz' };
    if (isWall[c[0]][c[1]]) return { typ: 'sciana' };
    const rid = region[c[0]][c[1]];
    return { typ: 'pokoj', pokoj: pokojW(rid, x, y), region: rid };
  }

  // ---------------------------------------------------------------- podłogi, sufity, progi, obrys
  const floors = regions.map((cells, rid) => {
    const names = regionRooms[rid].map((r) => r.nazwa);
    const nazwa = names.length ? names.join(' + ') : 'Pomieszczenie';
    const plytki = /^(Łazienka|Wiatrołap|Pomieszczenie)/.test(nazwa);
    return { nazwa, plytki, cells: cells.map(([i, j]) => [xs[i], xs[i + 1], ys[j], ys[j + 1]]) };
  });

  const ceilMap = new Map();
  regions.forEach((cells, rid) => {
    for (const [i, j] of cells) {
      const x = cx[i], y = cy[j];
      const zone = zones.find((z) => inside(z.box, x, y) && regionRooms[rid].some((r) => r.nazwa === z.nazwa));
      const room = pokojW(rid, x, y);
      const nazwa = zone ? zone.nazwa : room ? room.nazwa : 'Pomieszczenie';
      const h = zone ? zone.h : room ? room.sufit : sufitDom;
      const key = nazwa + '|' + h;
      if (!ceilMap.has(key)) ceilMap.set(key, { nazwa, h, cells: [] });
      ceilMap.get(key).cells.push([xs[i], xs[i + 1], ys[j], ys[j + 1]]);
    }
  });

  const thresholds = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++)
    if (isWall[i][j] && doors.some((d) => inside(d.rect, cx[i], cy[j])))
      thresholds.push([xs[i], xs[i + 1], ys[j], ys[j + 1]]);

  const foot = isWall.map((col, i) => col.map((w, j) => w || !outside[i][j]));

  // ---------------------------------------------------------------- punkty elektryczne
  // przez ścianę: grubość (z prostokąta ściany, którego lico jest w tym miejscu) i co jest po drugiej stronie
  function przezSciane(ax, c, s, along) {
    const behind = c - s * 0.05;
    let grubosc = Infinity;
    for (const r of M.walls) {
      const ok = ax === 'v' ? inside(r, behind, along) && Math.abs((s > 0 ? r[1] : r[0]) - c) < 0.01
                            : inside(r, along, behind) && Math.abs((s > 0 ? r[3] : r[2]) - c) < 0.01;
      if (ok) grubosc = Math.min(grubosc, ax === 'v' ? r[1] - r[0] : r[3] - r[2]);
    }
    if (!isFinite(grubosc)) return null;
    const p = c - s * (grubosc + 5);
    const za = ax === 'v' ? miejsce(p, along) : miejsce(along, p);
    return { grubosc, za };
  }

  // wzdłuż ściany (na rzucie): odległość do najbliższej ściany poprzecznej;
  // na zewnątrz, gdy nic nie stoi na drodze – do narożnika tej ściany
  function wzdluz(ax, c, s, along, zew) {
    const A = ax === 'v' ? xs : ys, B = ax === 'v' ? ys : xs;
    const nb = B.length - 1;
    const j0 = bisect(B, along);
    if (j0 < 0) return null;
    const wallAt = (ia, j) => (ax === 'v' ? isWall[ia][j] : isWall[j][ia]);
    const iaOut = bisect(A, c + s * 0.5), iaIn = bisect(A, c - s * 0.5);
    const wynik = {};
    for (const dir of [-1, 1]) {
      let res = null;
      if (iaOut >= 0) {                 // linia tuż przed licem ściany – do pierwszej ściany poprzecznej
        let j = j0;
        while (j >= 0 && j < nb && !wallAt(iaOut, j)) j += dir;
        if (j >= 0 && j < nb) res = { d: dir < 0 ? along - B[j + 1] : B[j] - along, cel: 'ściany' };
      }
      if (!res && zew && iaIn >= 0) {    // na zewnątrz: do narożnika budynku
        let j = j0;
        while (j >= 0 && j < nb && wallAt(iaIn, j)) j += dir;
        const kraniec = dir < 0 ? (j >= 0 ? B[j + 1] : B[0]) : (j < nb ? B[j] : B[nb]);
        res = { d: Math.abs(along - kraniec), cel: 'narożnika' };
      }
      wynik[dir < 0 ? 'minus' : 'plus'] = res;
    }
    return wynik;
  }

  const items = (M.items || []).map((it, idx) => {
    const [ax, c, s] = it.face;
    const p = {
      idx, typ: it.type, x: it.x, yd: it.yd, z: it.z, n: it.n || 1, pion: !!it.pion,
      ax, c, s, size: it.size || 8, opisDanych: it.opis || '', idDanych: it.id || null,
    };
    const along = ax === 'v' ? it.yd : it.x;
    const m = ax === 'v' ? miejsce(c + s * 5, it.yd) : miejsce(it.x, c + s * 5);
    p.naZewnatrz = m.typ !== 'pokoj';
    p.pokoj = m.pokoj || null;
    p.sciana = przezSciane(ax, c, s, along);
    p.wzdluz = wzdluz(ax, c, s, along, p.naZewnatrz);
    // strona ściany na rzucie, patrząc od miejsca, w którym jest punkt
    const pierwsza = ax === 'v' ? 'lewa' : 'górna', druga = ax === 'v' ? 'prawa' : 'dolna';
    p.stronaSciany = p.naZewnatrz ? (s < 0 ? pierwsza : druga) : (s > 0 ? pierwsza : druga);
    p.kierunki = ax === 'v' ? ['↑', '↓'] : ['←', '→'];
    p.opisAuto = opisAuto(p);
    return p;
  });

  // identyfikatory: pomieszczenie-TYPnn, numeracja w kolejności czytania rzutu (z góry na dół, od lewej)
  const grupy = new Map();
  for (const p of items) {
    const key = (p.pokoj ? slug(p.pokoj.nazwa) : 'zewnatrz') + '-' + p.typ;
    if (!grupy.has(key)) grupy.set(key, []);
    grupy.get(key).push(p);
  }
  for (const [key, list] of grupy) {
    list.sort((a, b) => Math.round(a.yd) - Math.round(b.yd) || Math.round(a.x) - Math.round(b.x) || a.z - b.z);
    list.forEach((p, k) => { p.id = p.idDanych || `${key}${String(k + 1).padStart(2, '0')}`; });
  }

  const liczniki = {};
  for (const t of KOLEJNOSC_TYPOW) liczniki[t] = { ramki: 0, sztuki: 0 };
  for (const p of items) {
    if (!liczniki[p.typ]) liczniki[p.typ] = { ramki: 0, sztuki: 0 };
    liczniki[p.typ].ramki += 1;
    liczniki[p.typ].sztuki += p.n;
  }

  return {
    xs, ys, cx, cy, nx, ny, isWall, outside, region, regions, foot,
    rooms, regionRooms, zones, openings, zSill, zWin, zCeil, teren,
    floors, ceilings: [...ceilMap.values()], thresholds, items, liczniki,
    bbox: { x0: xs[0], x1: xs[xs.length - 1], y0: ys[0], y1: ys[ys.length - 1] },
  };
}
