// Mój domek – edytor punktów elektrycznych (rozdz. 21), zapis do wspólnej bazy.
// Krok 1: przesuwanie po ścianie (3D: wzdłuż i w pionie, rzut: wzdłuż), liczby ±1/±5, „zmierzone miarką”.
// Krok 2: przeniesienie na inną ścianę (dotknięcie ściany w 3D), nowy punkt, rodzaj, ramka (ile gniazd, pionowa), usunięcie.
// Tylko dla zalogowanych członków domu. Zapis: wersja +1 i wpis w historii (js/dane/elementy.js);
// bez internetu czeka na urządzeniu i wysyła się sam. „Cofnij” przez 15 s po zapisie.
import * as dane from './dane/elementy.js';
import { ustawZapis } from './status.js';
import { analizuj, TYPY, KOLEJNOSC_TYPOW } from './analiza.js';

const zaokr = (v) => Math.round(v * 2) / 2;                  // co 0,5 cm
const fmt = (v) => String(zaokr(v)).replace('.', ',');
const OD_LICA = 10;                                           // punkt opisu: 10 cm od lica ściany (jak w generuj.py)
const ZNACZNIK = 4.5;                                         // znacznik 3D: 4,5 cm od lica (jak w budowa3d.js)

export function utworzEdytor(ctx) {
  const { THREE, canvas, kamera, sterowanie, stan, render, pokazKomunikat, wyborGeo, pokazZnacznik, planujBanki, esc } = ctx;
  let ed = null;
  let oczekujace = 0;
  let ostatnia = null;         // { id, przed } – do „Cofnij”; przed = null: element nowy (cofnięcie = usunięcie)

  const aktywny = () => !!ed;
  const karta = () => document.getElementById('karta');
  const zP = () => ctx.POZIOM_PODLOGI || 0;
  const ogranicz = (v, a, b) => Math.min(b, Math.max(a, v));

  // ---------------------------------------------------------------- położenie edytowanego punktu
  // poz = { ax, c, s, along, z }: ściana (oś, lico, strona) + odległość wzdłuż osi + wysokość nad podłogą
  const pozZPunktu = (p) => ({ ax: p.ax, c: p.c, s: p.s, along: p.ax === 'v' ? p.yd : p.x, z: p.z });
  const xyd = (q) => (q.ax === 'v' ? { x: q.c + q.s * OD_LICA, yd: q.along } : { x: q.along, yd: q.c + q.s * OD_LICA });
  const tenSamaSciana = () => !!(ed.start && ed.poz && ed.poz.ax === ed.start.ax && ed.poz.c === ed.start.c && ed.poz.s === ed.start.s);
  const polozenieZmienione = () => !ed.nowy && (ed.poz.along !== ed.start.along || ed.poz.z !== ed.start.z || !tenSamaSciana());
  const zmienione = () => !!ed && (ed.nowy ? !!ed.poz : (polozenieZmienione()
    || ed.kod !== ed.p.typ || ed.n !== ed.p.n || ed.pion !== ed.p.pion || (ed.zmierzone && !ed.bylZmierzony)));

  function granice() {
    const szer = (ed.n > 1 && !ed.pion ? 7.5 * ed.n : 8) / 2;
    const wys = (ed.pion && ed.n > 1 ? 7.1 * (ed.n - 1) : 0) + 4;
    const zMax = (stan.A?.zCeil || 260) - wys, zMin = 4 - (stan.A?.teren || 0);
    const p = ed.p;
    if (p && tenSamaSciana()) {                   // na swojej ścianie: do najbliższych ścian poprzecznych
      const m = p.wzdluz?.minus?.d, pl = p.wzdluz?.plus?.d;
      return { aMin: m != null ? ed.start.along - (m - szer) : ed.start.along - 300,
        aMax: pl != null ? ed.start.along + (pl - szer) : ed.start.along + 300, zMin, zMax };
    }
    return { aMin: ed.poz.along - 1500, aMax: ed.poz.along + 1500, zMin, zMax };   // nowa ściana: granice po zapisie
  }
  function ustawPoz(along, z) {
    const g = granice();
    ed.poz = { ...ed.poz, along: zaokr(ogranicz(along, g.aMin, g.aMax)), z: zaokr(ogranicz(z, g.zMin, g.zMax)) };
    odswiezDucha(); aktualizujOdl(); ustawPola();
  }

  function pozycjaDucha() {
    const q = ed.poz, y = q.z + zP() + (ed.pion && ed.n > 1 ? 7.1 * (ed.n - 1) / 2 : 0), w = q.c + q.s * ZNACZNIK;
    return q.ax === 'v' ? [w, y, q.along] : [q.along, y, w];
  }
  function odswiezDucha() {
    if (!ed.poz) { ctx.pokazDucha(false); render(); return; }
    const [x, y, z] = pozycjaDucha();
    wyborGeo.attributes.position.setXYZ(0, x, y, z);
    wyborGeo.attributes.position.needsUpdate = true;
    wyborGeo.computeBoundingSphere();
    ctx.pokazDucha(true, ed.kod, ed.zmierzone ? 'P' : 'R');
    render();
  }

  // ---------------------------------------------------------------- panel w karcie
  function tekstOdl() {
    if (!ed.poz) return 'Miejsce: jeszcze nie wybrane.';
    const wys = `${fmt(ed.poz.z)} cm nad podłogą`;
    if (ed.nowy || !tenSamaSciana()) return `${ed.nowy ? 'Nowy punkt' : 'Nowa ściana'} – odległości od ścian pokażą się po zapisie.<br>${wys}`;
    const p = ed.p, m = p.wzdluz?.minus, pl = p.wzdluz?.plus, d = ed.poz.along - ed.start.along;
    const odl = [m ? `${p.kierunki[0]} ${fmt(m.d + d)} cm do ${m.cel}` : null, pl ? `${p.kierunki[1]} ${fmt(pl.d - d)} cm do ${pl.cel}` : null]
      .filter(Boolean).join(' · ');
    return `${esc(odl || '—')}<br>${wys}`;
  }
  // pole „wzdłuż”: na swojej ścianie – odległość od ściany poprzecznej; na nowej – brak (przeciąganie lub ±)
  function poleWzdluz() {
    if (ed.nowy || !ed.poz || !tenSamaSciana()) return null;
    const p = ed.p, m = p.wzdluz?.minus, pl = p.wzdluz?.plus;
    if (m) return { etyk: `Od ${m.cel === 'narożnika' ? 'narożnika' : 'ściany'} ${p.kierunki[0]}`, znak: 1 };
    if (pl) return { etyk: `Od ${pl.cel} ${p.kierunki[1]}`, znak: -1 };
    return null;
  }
  const wartWzdluz = () => {
    const d = ed.poz.along - ed.start.along;
    return ed.pw.znak > 0 ? ed.p.wzdluz.minus.d + d : ed.p.wzdluz.plus.d - d;
  };
  function rysujPanel() {
    const k = karta(), pw = poleWzdluz();
    ed.pw = pw;
    const brakPoz = !ed.poz;
    const przyciski = (co) => [-5, -1, 1, 5].map((v) => `<button type="button" data-krok="${co}" data-o="${v}" ${brakPoz ? 'disabled' : ''}>${v > 0 ? '+' : '−'}${Math.abs(v)}</button>`).join('');
    k.innerHTML = `
      <div class="karta-naglowek">
        <img src="${ctx.ikona(ed.kod, ed.zmierzone ? 'P' : 'R')}" alt="">
        <div><h3>${ed.nowy ? 'Nowy punkt' : 'Edycja punktu'}</h3><div class="pod">${ed.nowy ? 'zapisze się jako nowy element bazy'
          : `<code>${esc(ed.p.id)}</code> · ${esc(ed.p.pokoj?.nazwa || (ed.p.naZewnatrz ? 'na zewnątrz' : ''))}`}</div></div>
        <button type="button" class="zamknij" data-ed="anuluj" aria-label="Anuluj">✕</button>
      </div>
      <div class="karta-tresc edytor">
        <div class="ed-odl" aria-live="polite">${tekstOdl()}</div>
        ${ed.wybieranie ? `<p class="ed-wskazowka">${ed.nowy ? 'Dotknij ścianę w miejscu, gdzie jest punkt.' : 'Dotknij ścianę, na którą przenieść punkt.'}
          Działa w widoku 3D (nie na rzucie z góry).</p>`
          : `<p class="male">${stan.tryb === 'gora' ? 'Przeciągnij punkt wzdłuż ściany (wysokość – poniżej).' : 'Przeciągnij punkt po ścianie – wzdłuż i w pionie.'}</p>`}
        ${!ed.nowy ? `<button type="button" class="ed-sciana" data-ed="sciana" aria-pressed="${ed.wybieranie}">${ed.wybieranie ? 'Wybierz ścianę na modelu… (anuluj)' : 'Przenieś na inną ścianę'}</button>` : ''}
        ${pw ? `<label class="ed-pole"><span>${esc(pw.etyk)} (cm)</span>
          <input type="number" inputmode="decimal" step="0.5" data-pole="wzdluz" value="${zaokr(wartWzdluz())}"></label>` : '<div class="ed-pole"><span>Wzdłuż ściany (cm)</span></div>'}
        <div class="ed-kroki" role="group" aria-label="Przesuń wzdłuż ściany o cm">${przyciski('wzdluz')}</div>
        <label class="ed-pole"><span>Wysokość nad podłogą (cm)</span>
          <input type="number" inputmode="decimal" step="0.5" data-pole="z" value="${brakPoz ? '' : zaokr(ed.poz.z)}" ${brakPoz ? 'disabled' : ''}></label>
        <div class="ed-kroki" role="group" aria-label="Przesuń w pionie o cm">${przyciski('z')}</div>
        <div class="ed-rzad">
          <label class="ed-pole"><span>Rodzaj</span>
            <select data-pole="kod">${KOLEJNOSC_TYPOW.map((t) => `<option value="${t}" ${t === ed.kod ? 'selected' : ''}>${esc(TYPY[t]?.nazwa || t)}</option>`).join('')}</select></label>
          <label class="ed-pole"><span>W ramce</span>
            <select data-pole="n">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === ed.n ? 'selected' : ''}>${n === 1 ? 'pojedyncze' : n + ' gniazda'}</option>`).join('')}</select></label>
        </div>
        <label class="ed-zmierzone"><input type="checkbox" data-pole="pion" ${ed.pion ? 'checked' : ''} ${ed.n > 1 ? '' : 'disabled'}><span>Ramka pionowa (gniazda jedno nad drugim)</span></label>
        <label class="ed-zmierzone"><input type="checkbox" data-pole="zmierzone" ${ed.zmierzone ? 'checked' : ''}>
          <span>Zmierzone miarką – położenie pewne (✓ potwierdzona). Bez zaznaczenia: „prawdopodobna”.</span></label>
        <div class="karta-akcje">
          <button type="button" class="glowny" data-ed="zapisz" ${zmienione() ? '' : 'disabled'}>${ed.nowy ? 'Dodaj' : 'Zapisz'}</button>
          <button type="button" data-ed="anuluj">Anuluj</button>
        </div>
        ${!ed.nowy ? '<button type="button" class="ed-usun" data-ed="usun">Usuń punkt…</button>' : ''}
        <p class="male">Zmiana trafi do wspólnej bazy z Twoim imieniem i datą; poprzedni stan zostaje w historii.
          Rysunek CAD i model Blender zmieni dopiero sesja „Projekt DOMEK”.</p>
      </div>`;
  }
  function aktualizujOdl() {           // bez przerysowania pól (żeby nie gubić kursora przy wpisywaniu)
    const k = karta();
    k.querySelector('.ed-odl').innerHTML = tekstOdl();
    const z = k.querySelector('[data-ed="zapisz"]');
    if (z) z.disabled = !zmienione();
  }
  function ustawPola() {
    const k = karta();
    const w = k.querySelector('[data-pole="wzdluz"]'), z = k.querySelector('[data-pole="z"]');
    if (w && ed.pw && document.activeElement !== w) w.value = zaokr(wartWzdluz());
    if (z && ed.poz && document.activeElement !== z) z.value = zaokr(ed.poz.z);
  }

  function obsluzKarte(e) {
    if (!ed) return;
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ed === 'anuluj') return zakoncz(false);
    if (b.dataset.ed === 'zapisz') return zapisz();
    if (b.dataset.ed === 'usun') return usun();
    if (b.dataset.ed === 'sciana') {
      ed.wybieranie = !ed.wybieranie;
      if (ed.wybieranie && stan.tryb === 'gora') ctx.widok3d();
      rysujPanel();
      return;
    }
    if (b.dataset.krok && ed.poz) {
      const o = Number(b.dataset.o);
      if (b.dataset.krok === 'wzdluz') ustawPoz(ed.poz.along + o * (ed.pw?.znak || 1), ed.poz.z); else ustawPoz(ed.poz.along, ed.poz.z + o);
    }
  }
  function obsluzPole(e) {
    if (!ed) return;
    const t = e.target, pole = t.dataset.pole;
    if (pole === 'zmierzone') { ed.zmierzone = t.checked; odswiezDucha(); aktualizujOdl(); return; }
    if (pole === 'kod') { ed.kod = t.value; odswiezDucha(); aktualizujOdl(); karta().querySelector('.karta-naglowek img').src = ctx.ikona(ed.kod, 'R'); return; }
    if (pole === 'n') { ed.n = Number(t.value); if (ed.n === 1) ed.pion = false; rysujPanel(); if (ed.poz) odswiezDucha(); return; }
    if (pole === 'pion') { ed.pion = t.checked; if (ed.poz) odswiezDucha(); aktualizujOdl(); return; }
    if (!ed.poz || e.type !== 'input') return;
    const v = Number(String(t.value).replace(',', '.'));
    if (!isFinite(v) || t.value === '') return;
    if (pole === 'z') ustawPoz(ed.poz.along, v);
    if (pole === 'wzdluz' && ed.pw) {
      const d = ed.pw.znak > 0 ? v - ed.p.wzdluz.minus.d : ed.p.wzdluz.plus.d - v;
      ustawPoz(ed.start.along + d, ed.poz.z);
    }
  }

  // ---------------------------------------------------------------- dotknięcie ściany (inna ściana / nowy punkt)
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), pkt = new THREE.Vector3();
  function promien(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, kamera());
  }
  function scianaPod(e) {
    const g = stan.warstwy?.sciany;
    if (!g || !g.visible || stan.tryb === 'gora') return null;
    promien(e);
    const hit = ray.intersectObject(g, true).find((h) => h.object.isMesh && h.face);   // bez krawędzi (LineSegments)
    if (!hit) return null;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    if (Math.abs(n.y) > 0.5) return null;                              // góra ściany – to nie lico
    const v = Math.abs(n.x) > Math.abs(n.z);
    return { ax: v ? 'v' : 'h', c: zaokr(v ? hit.point.x : hit.point.z), s: Math.sign(v ? n.x : n.z) || 1,
      along: zaokr(v ? hit.point.z : hit.point.x), z: zaokr(hit.point.y - zP()) };
  }

  // ---------------------------------------------------------------- przeciąganie
  let ciagnie = null;
  function naPlaszczyzne(e) {
    promien(e);
    const [x, y, z] = pozycjaDucha();
    const plaszcz = stan.tryb === 'gora' ? new THREE.Plane(new THREE.Vector3(0, 1, 0), -y)
      : ed.poz.ax === 'v' ? new THREE.Plane(new THREE.Vector3(1, 0, 0), -x) : new THREE.Plane(new THREE.Vector3(0, 0, 1), -z);
    return ray.ray.intersectPlane(plaszcz, pkt) ? pkt.clone() : null;
  }
  function ekranDucha() {
    const v = new THREE.Vector3(...pozycjaDucha()).project(kamera());
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }
  let dotkniecieSciany = null;          // ściana pod palcem przy pointerdown; wybór dopiero przy puszczeniu bez ruchu
  canvas.addEventListener('pointerdown', (e) => {
    if (!ed) return;
    if (ed.wybieranie) {                 // obrót widoku nadal działa – ścianę wybiera krótkie dotknięcie
      dotkniecieSciany = { x: e.clientX, y: e.clientY, t: performance.now() };
      return;
    }
    if (!ed.poz) return;
    const s = ekranDucha();
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > (e.pointerType === 'touch' ? 40 : 28)) return;
    const q = naPlaszczyzne(e);
    if (!q) return;
    e.stopImmediatePropagation();
    const along = ed.poz.ax === 'v' ? q.z : q.x;
    ciagnie = { id: e.pointerId, a0: along - ed.poz.along, y0: q.y - ed.poz.z };
    sterowanie().enabled = false;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  }, true);
  canvas.addEventListener('pointermove', (e) => {
    if (!ed) return;
    if (!ciagnie || e.pointerId !== ciagnie.id) {
      if (!e.buttons && e.pointerType !== 'touch') {
        if (ed.wybieranie) { canvas.style.cursor = scianaPod(e) ? 'crosshair' : ''; return; }
        if (!ed.poz) return;
        const s = ekranDucha();
        canvas.style.cursor = Math.hypot(e.clientX - s.x, e.clientY - s.y) <= 28 ? 'grab' : '';
      }
      return;
    }
    const q = naPlaszczyzne(e);
    if (!q) return;
    const along = ed.poz.ax === 'v' ? q.z : q.x;
    ustawPoz(along - ciagnie.a0, stan.tryb === 'gora' ? ed.poz.z : q.y - ciagnie.y0);
  }, true);
  const pusc = (e) => {
    if (ed?.wybieranie && dotkniecieSciany && e.type === 'pointerup') {
      const d = dotkniecieSciany;
      dotkniecieSciany = null;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8 || performance.now() - d.t > 600) return;   // to był obrót
      const s = scianaPod(e);
      if (!s) { pokazKomunikat(stan.tryb === 'gora' ? 'Ścianę wybierz w widoku 3D.' : 'Dotknij boku ściany (nie jej górnej krawędzi) – przybliż widok, jeśli trzeba.'); return; }
      ed.poz = ed.nowy ? s : { ...s, z: ed.poz?.z ?? s.z };
      ed.wybieranie = false;
      rysujPanel();
      ustawPoz(ed.poz.along, ed.poz.z);
      return;
    }
    if (!ciagnie || e.pointerId !== ciagnie.id) return;
    ciagnie = null;
    sterowanie().enabled = true;
    canvas.style.cursor = '';
    e.stopImmediatePropagation();
  };
  canvas.addEventListener('pointerup', pusc, true);
  canvas.addEventListener('pointercancel', pusc, true);

  // ---------------------------------------------------------------- start / koniec
  function podlacz() {
    const k = karta();
    k.hidden = false;
    k.addEventListener('click', obsluzKarte);
    k.addEventListener('input', obsluzPole);
    k.addEventListener('change', obsluzPole);
    document.body.classList.add('edycja');
  }
  function zacznij(p) {
    if (!dane.stanBazy().elementy?.get(p.id)) { pokazKomunikat('Ten punkt nie jest jeszcze we wspólnej bazie.'); return; }
    const bylZmierzony = p.baza?.wiarygodnosc?.polozenie === 'POTWIERDZONA';
    // „zmierzone” zawsze do zaznaczenia od nowa – przesunięty punkt nie zostaje „potwierdzony” sam z siebie
    ed = { p, nowy: false, start: pozZPunktu(p), poz: pozZPunktu(p), kod: p.typ, n: p.n, pion: p.pion, zmierzone: false, bylZmierzony, wybieranie: false };
    p.wEdycji = true;
    pokazZnacznik(p, false);
    podlacz();
    rysujPanel();
    ctx.widokNaPunkt(p);              // po narysowaniu panelu – kamera uwzględnia jego wielkość
    odswiezDucha();
  }
  function dodaj() {
    if (!moznaDodac()) { pokazKomunikat('Dodawanie punktów – po zalogowaniu.'); return; }
    if (ed) zakoncz(true);
    ctx.zamknijKarte();
    if (stan.tryb === 'gora') ctx.widok3d();
    ed = { p: null, nowy: true, start: null, poz: null, kod: 'Z', n: 1, pion: false, zmierzone: false, bylZmierzony: false, wybieranie: true };
    podlacz();
    rysujPanel();
    odswiezDucha();
  }
  function zakoncz(zostawKarte) {
    if (!ed) return;
    const { p } = ed, k = karta();
    k.removeEventListener('click', obsluzKarte);
    k.removeEventListener('input', obsluzPole);
    k.removeEventListener('change', obsluzPole);
    if (p) { p.wEdycji = false; pokazZnacznik(p, true); }
    ed = null;
    ciagnie = null;
    dotkniecieSciany = null;
    sterowanie().enabled = true;
    canvas.style.cursor = '';
    document.body.classList.remove('edycja');
    planujBanki(0);
    if (zostawKarte) return;
    if (p) ctx.wybierz(p); else ctx.zamknijKarte();
  }
  // przebudowa sceny w trakcie edycji (np. ktoś inny zmienił dane) – edycja przerwana, nic nie zapisane
  function przerwij() {
    if (!ed) return;
    const opis = ed.p ? ed.p.id : 'nowy punkt';
    zakoncz(true);
    ctx.zamknijKarte();
    pokazKomunikat(`Dane się zmieniły – edycja (${opis}) przerwana, nic nie zapisano.`);
  }

  // ---------------------------------------------------------------- zapis
  function sledz(wynik, opisZmiany) {
    oczekujace += 1; ustawZapis({ oczekujace, blad: '' });
    wynik.wyslano.then(() => {
      oczekujace -= 1; ustawZapis({ oczekujace });
    }).catch((err) => {
      oczekujace -= 1;
      const opis = err.code === 'permission-denied' ? 'baza odrzuciła zapis (ktoś mógł w tym czasie zmienić ten punkt)' : (err.code || err.message);
      ustawZapis({ oczekujace, blad: `${opisZmiany}: ${opis}` });
      pokazKomunikat(`Nie zapisano: ${opis}`);
    });
  }
  function wyslij(id, budujZmiane, opisZmiany) {
    let wynik;
    try { wynik = dane.zapiszZmiane(id, budujZmiane); } catch (err) { pokazKomunikat(err.message); return null; }
    sledz(wynik, opisZmiany);
    return wynik;
  }
  // identyfikator nowego punktu: pomieszczenie-TYPnn jak w analiza.js, następny wolny numer
  function nowyId(item) {
    let auto = `nowy-${item.type}01`;
    try { auto = analizuj({ ...stan.M, items: [item] }).items[0]?.id || auto; } catch { /* zostaje „nowy-…” */ }
    const prefiks = auto.replace(/\d+$/, '');
    return dane.wolnyId(prefiks, [...dane.zajeteId(), ...(stan.A?.items || []).map((q) => q.id)]);
  }
  function zapisz() {
    if (!zmienione()) return;
    const { zmierzone } = ed;
    if (ed.nowy) {
      const q = ed.poz, { x, yd } = xyd(q);
      const item = { type: ed.kod, x, yd, z: q.z, face: [q.ax, q.c, q.s], n: ed.n, pion: ed.n > 1 && ed.pion, size: 8 };
      const id = nowyId(item);
      zakoncz(true);
      ctx.zamknijKarte();
      let wynik;
      try { wynik = dane.utworzElement((kto) => dane.nowyElement({ id, kod: item.type, x, yd, z: q.z, face: item.face, n: item.n, pion: item.pion }, { ...kto, zmierzone })); }
      catch (err) { pokazKomunikat(err.message); return; }
      sledz(wynik, `dodanie ${id}`);
      ostatnia = { id, przed: null };
      pokazCofnij(`Dodano punkt <code>${esc(id)}</code>`, id);
      return;
    }
    const p = ed.p, zm = {};
    if (polozenieZmienione()) {
      const q = ed.poz, { x, yd } = xyd(q);
      zm.polozenie = { x, yd, z: q.z, ...(tenSamaSciana() ? {} : { face: [q.ax, q.c, q.s] }) };
    }
    if (ed.kod !== p.typ) zm.kod = ed.kod;
    if (ed.n !== p.n || ed.pion !== p.pion) zm.parametry = { n: ed.n, pion: ed.n > 1 && ed.pion };
    zakoncz(true);
    const w = wyslij(p.id, (e, kto) => dane.zmianaElementu(e, zm, { ...kto, zmierzone }), `zmiana ${p.id}`);
    if (!w) { ctx.wybierz(p); return; }
    ostatnia = { id: p.id, przed: w.przed };
    pokazCofnij(`Zapisano <code>${esc(p.id)}</code>`, p.id);
  }
  function usun() {
    const p = ed.p;
    if (!confirm(`Usunąć punkt ${p.id}? Zostanie oznaczony jako usunięty – zostaje w historii i można to cofnąć.`)) return;
    zakoncz(true);
    ctx.zamknijKarte();
    const w = wyslij(p.id, (e, kto) => dane.zmianaElementu(e, { usuniety: true }, kto), `usunięcie ${p.id}`);
    if (!w) return;
    ostatnia = { id: p.id, przed: w.przed };
    pokazCofnij(`Usunięto <code>${esc(p.id)}</code>`, p.id);
  }

  // pasek „Zapisano · Cofnij” (15 s): „Cofnij” zapisuje poprzedni stan jako nową wersję (nowy punkt – oznacza usunięty)
  function pokazCofnij(html, id) {
    let el = document.getElementById('ed-cofnij');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ed-cofnij';
      el.setAttribute('role', 'status');
      document.getElementById('scena').append(el);
    }
    el.innerHTML = `<span>${html}${navigator.onLine ? '' : ' – wyśle się po powrocie internetu'}.</span><button type="button">Cofnij</button>`;
    el.hidden = false;
    el.querySelector('button').onclick = () => {
      el.hidden = true;
      if (!ostatnia || ostatnia.id !== id) return;
      const { przed } = ostatnia;
      ostatnia = null;
      const ok = przed
        ? wyslij(id, (e) => dane.zmianaCofniecia(e, przed), `cofnięcie ${id}`)
        : wyslij(id, (e, kto) => dane.zmianaElementu(e, { usuniety: true }, kto), `cofnięcie dodania ${id}`);
      if (ok) pokazKomunikat(`Cofnięto – ${id}.`);
    };
    clearTimeout(pokazCofnij.t);
    pokazCofnij.t = setTimeout(() => { el.hidden = true; }, 15000);
  }

  const mozna = (p) => !!(p?.baza && dane.stanBazy().aktywna && dane.stanBazy().elementy?.get(p.id));
  const moznaDodac = () => !!(dane.stanBazy().aktywna && dane.stanBazy().elementy);
  return { zacznij, dodaj, aktywny, przerwij, mozna, moznaDodac };
}
