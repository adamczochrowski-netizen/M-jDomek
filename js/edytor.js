// Mój domek – edytor, krok 1: przesuwanie punktu elektrycznego po tej samej ścianie i zapis do wspólnej bazy.
// Tylko dla zalogowanych członków domu i tylko dla punktów, które są już w bazie.
// Przeciąganie: w 3D po płaszczyźnie ściany (wzdłuż i w pionie), na rzucie z góry tylko wzdłuż ściany.
// Zapis: wersja +1 i wpis w historii (js/dane/elementy.js), bez internetu czeka na urządzeniu i wysyła się sam.
import * as dane from './dane/elementy.js';
import { ustawZapis } from './status.js';

const zaokr = (v) => Math.round(v * 2) / 2;                  // co 0,5 cm
const fmt = (v) => String(zaokr(v)).replace('.', ',');

export function utworzEdytor(ctx) {
  const { THREE, canvas, kamera, sterowanie, stan, render, pokazKomunikat, wyborGeo, pokazZnacznik, planujBanki, esc } = ctx;
  let ed = null;               // { p, delta, dz, granice, ... }
  let oczekujace = 0;
  let ostatnia = null;         // { id, przed } – do „Cofnij”

  const aktywny = () => !!ed;
  // coś do zapisania: przesunięcie albo potwierdzenie pomiarem punktu, który jeszcze nie był potwierdzony
  const zmienione = () => !!ed && (ed.delta !== 0 || ed.dz !== 0 || (ed.zmierzone && !ed.bylZmierzony));
  const karta = () => document.getElementById('karta');

  function granice(p) {
    const szer = (p.n > 1 && !p.pion ? 7.5 * p.n : p.size) / 2;
    const wys = (p.pion && p.n > 1 ? 7.1 * (p.n - 1) : 0) + p.size / 2;
    const m = p.wzdluz?.minus?.d, pl = p.wzdluz?.plus?.d;
    return {
      dMin: m != null ? -(m - szer) : -300, dMax: pl != null ? pl - szer : 300,
      zMin: Math.max(0, p.size / 2) - (p.naZewnatrz ? (stan.A?.teren || 0) : 0),
      zMax: (stan.A?.zCeil || 260) - wys,
    };
  }
  const ogranicz = (v, a, b) => Math.min(b, Math.max(a, v));

  function pozycjaDucha() {
    const { p, delta, dz } = ed, z = p.znacznik;
    return p.ax === 'v' ? [z.x, z.y + dz, z.z + delta] : [z.x + delta, z.y + dz, z.z];
  }
  function odswiezDucha() {
    const [x, y, z] = pozycjaDucha();
    wyborGeo.attributes.position.setXYZ(0, x, y, z);
    wyborGeo.attributes.position.needsUpdate = true;
    wyborGeo.computeBoundingSphere();
    render();
  }

  // ---------------------------------------------------------------- panel w karcie punktu
  function rysujPanel() {
    const { p, delta, dz } = ed;
    const k = karta();
    const m = p.wzdluz?.minus, pl = p.wzdluz?.plus;
    const odl = [m ? `${p.kierunki[0]} ${fmt(m.d + delta)} cm do ${m.cel}` : null, pl ? `${p.kierunki[1]} ${fmt(pl.d - delta)} cm do ${pl.cel}` : null]
      .filter(Boolean).join(' · ');
    const polePol = m ? { etyk: `Od ${m.cel === 'narożnika' ? 'narożnika' : 'ściany'} ${p.kierunki[0]}`, wart: m.d + delta, znak: 1 }
      : { etyk: `Od ${pl?.cel || 'ściany'} ${p.kierunki[1]}`, wart: (pl?.d ?? 0) - delta, znak: -1 };
    ed.polePol = polePol;
    const przyciski = (co) => [-5, -1, 1, 5].map((v) => `<button type="button" data-krok="${co}" data-o="${v}">${v > 0 ? '+' : '−'}${Math.abs(v)}</button>`).join('');
    k.innerHTML = `
      <div class="karta-naglowek">
        <img src="${ctx.ikona(p)}" alt="">
        <div><h3>Przesuwanie punktu</h3><div class="pod"><code>${esc(p.id)}</code> · ${esc(p.pokoj?.nazwa || (p.naZewnatrz ? 'na zewnątrz' : ''))}</div></div>
        <button type="button" class="zamknij" data-ed="anuluj" aria-label="Anuluj">✕</button>
      </div>
      <div class="karta-tresc edytor">
        <p class="male">${stan.tryb === 'gora' ? 'Przeciągnij punkt wzdłuż ściany (wysokość ustawisz poniżej).' : 'Przeciągnij punkt po ścianie – wzdłuż i w pionie.'} Punkt zostaje na tej samej ścianie.</p>
        <div class="ed-odl" aria-live="polite">${esc(odl || '—')}<br>${fmt(p.z + dz)} cm nad podłogą</div>
        <label class="ed-pole"><span>${esc(polePol.etyk)} (cm)</span>
          <input type="number" inputmode="decimal" step="0.5" data-pole="wzdluz" value="${zaokr(polePol.wart)}"></label>
        <div class="ed-kroki" role="group" aria-label="Przesuń wzdłuż ściany o cm">${przyciski('wzdluz')}</div>
        <label class="ed-pole"><span>Wysokość nad podłogą (cm)</span>
          <input type="number" inputmode="decimal" step="0.5" data-pole="z" value="${zaokr(p.z + dz)}"></label>
        <div class="ed-kroki" role="group" aria-label="Przesuń w pionie o cm">${przyciski('z')}</div>
        <label class="ed-zmierzone"><input type="checkbox" data-pole="zmierzone" ${ed.zmierzone ? 'checked' : ''}>
          <span>Zmierzone miarką – położenie pewne (✓ potwierdzona). Bez zaznaczenia: „prawdopodobna”.</span></label>
        <div class="karta-akcje">
          <button type="button" class="glowny" data-ed="zapisz" ${zmienione() ? '' : 'disabled'}>Zapisz</button>
          <button type="button" data-ed="anuluj">Anuluj</button>
        </div>
        <p class="male">Zmiana trafi do wspólnej bazy z Twoim imieniem i datą; poprzednie położenie zostaje w historii.
          Rysunek CAD i model Blender zmieni dopiero sesja „Projekt DOMEK”.</p>
      </div>`;
  }
  function aktualizujOdl() {         // bez przerysowania pól (żeby nie gubić kursora przy wpisywaniu)
    const { p, delta, dz } = ed, k = karta();
    const m = p.wzdluz?.minus, pl = p.wzdluz?.plus;
    const odl = [m ? `${p.kierunki[0]} ${fmt(m.d + delta)} cm do ${m.cel}` : null, pl ? `${p.kierunki[1]} ${fmt(pl.d - delta)} cm do ${pl.cel}` : null]
      .filter(Boolean).join(' · ');
    k.querySelector('.ed-odl').innerHTML = `${esc(odl || '—')}<br>${fmt(p.z + dz)} cm nad podłogą`;
    const zapisz = k.querySelector('[data-ed="zapisz"]');
    if (zapisz) zapisz.disabled = !zmienione();
  }
  function ustawPola() {
    const k = karta(), { p, delta, dz, polePol } = ed;
    const w = k.querySelector('[data-pole="wzdluz"]'), z = k.querySelector('[data-pole="z"]');
    if (w && document.activeElement !== w) w.value = zaokr(polePol.znak > 0 ? p.wzdluz.minus.d + delta : (p.wzdluz?.plus?.d ?? 0) - delta);
    if (z && document.activeElement !== z) z.value = zaokr(p.z + dz);
  }
  function ustaw(delta, dz) {
    const g = ed.granice;
    ed.delta = zaokr(ogranicz(delta, g.dMin, g.dMax));
    ed.dz = zaokr(ogranicz(ed.p.z + dz, g.zMin, g.zMax) - ed.p.z);
    odswiezDucha(); aktualizujOdl(); ustawPola();
  }

  function obsluzKarte(e) {
    if (!ed) return;
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ed === 'anuluj') return zakoncz(false);
    if (b.dataset.ed === 'zapisz') return zapisz();
    if (b.dataset.krok) {
      const o = Number(b.dataset.o);
      if (b.dataset.krok === 'wzdluz') ustaw(ed.delta + o * ed.polePol.znak, ed.dz); else ustaw(ed.delta, ed.dz + o);
    }
  }
  function obsluzPole(e) {
    if (!ed) return;
    const t = e.target;
    if (t.dataset.pole === 'zmierzone') { ed.zmierzone = t.checked; aktualizujOdl(); return; }
    const v = Number(String(t.value).replace(',', '.'));
    if (!isFinite(v) || t.value === '') return;
    if (t.dataset.pole === 'z') ustaw(ed.delta, v - ed.p.z);
    if (t.dataset.pole === 'wzdluz') {
      const { p, polePol } = ed;
      ustaw(polePol.znak > 0 ? v - p.wzdluz.minus.d : (p.wzdluz?.plus?.d ?? 0) - v, ed.dz);
    }
  }

  // ---------------------------------------------------------------- przeciąganie
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), pkt = new THREE.Vector3();
  let ciagnie = null;
  function naPlaszczyzne(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, kamera());
    const z = ed.p.znacznik;
    const plaszcz = stan.tryb === 'gora' ? new THREE.Plane(new THREE.Vector3(0, 1, 0), -z.y)
      : ed.p.ax === 'v' ? new THREE.Plane(new THREE.Vector3(1, 0, 0), -z.x) : new THREE.Plane(new THREE.Vector3(0, 0, 1), -z.z);
    return ray.ray.intersectPlane(plaszcz, pkt) ? pkt.clone() : null;
  }
  function ekranDucha() {
    const v = new THREE.Vector3(...pozycjaDucha()).project(kamera());
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (!ed) return;
    const s = ekranDucha();
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > (e.pointerType === 'touch' ? 40 : 28)) return;
    const q = naPlaszczyzne(e);
    if (!q) return;
    e.stopImmediatePropagation();
    const along = ed.p.ax === 'v' ? q.z : q.x;
    ciagnie = { id: e.pointerId, a0: along - ed.delta, y0: q.y - ed.dz };
    sterowanie().enabled = false;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  }, true);
  canvas.addEventListener('pointermove', (e) => {
    if (!ciagnie || e.pointerId !== ciagnie.id) {
      if (ed && !e.buttons && e.pointerType !== 'touch') {
        const s = ekranDucha();
        canvas.style.cursor = Math.hypot(e.clientX - s.x, e.clientY - s.y) <= 28 ? 'grab' : '';
      }
      return;
    }
    const q = naPlaszczyzne(e);
    if (!q) return;
    const along = ed.p.ax === 'v' ? q.z : q.x;
    ustaw(along - ciagnie.a0, stan.tryb === 'gora' ? ed.dz : q.y - ciagnie.y0);
  }, true);
  const pusc = (e) => {
    if (!ciagnie || e.pointerId !== ciagnie.id) return;
    ciagnie = null;
    sterowanie().enabled = true;
    canvas.style.cursor = '';
    e.stopImmediatePropagation();
  };
  canvas.addEventListener('pointerup', pusc, true);
  canvas.addEventListener('pointercancel', pusc, true);

  // ---------------------------------------------------------------- start / koniec / zapis
  function zacznij(p) {
    if (!dane.stanBazy().elementy?.get(p.id)) { pokazKomunikat('Ten punkt nie jest jeszcze we wspólnej bazie.'); return; }
    const bylZmierzony = p.baza?.wiarygodnosc?.polozenie === 'POTWIERDZONA';
    // „zmierzone” zawsze do zaznaczenia od nowa – przesunięty punkt nie zostaje „potwierdzony” sam z siebie
    ed = { p, delta: 0, dz: 0, granice: granice(p), zmierzone: false, bylZmierzony };
    p.wEdycji = true;
    pokazZnacznik(p, false);
    document.body.classList.add('edycja');
    rysujPanel();
    ctx.widokNaPunkt(p);              // po narysowaniu panelu – kamera uwzględnia jego wielkość
    const k = karta();
    k.addEventListener('click', obsluzKarte);
    k.addEventListener('input', obsluzPole);
    k.addEventListener('change', obsluzPole);
    odswiezDucha();
  }
  function zakoncz(zostawKarte) {
    if (!ed) return;
    const { p } = ed, k = karta();
    k.removeEventListener('click', obsluzKarte);
    k.removeEventListener('input', obsluzPole);
    k.removeEventListener('change', obsluzPole);
    p.wEdycji = false;
    ed = null;
    sterowanie().enabled = true;
    document.body.classList.remove('edycja');
    pokazZnacznik(p, true);
    planujBanki(0);
    if (!zostawKarte) ctx.wybierz(p);       // wraca zwykła karta w starym miejscu
  }
  // przebudowa sceny w trakcie edycji (np. ktoś inny zmienił dane) – edycja przerwana, nic nie zapisane
  function przerwij() {
    if (!ed) return;
    const id = ed.p.id;
    zakoncz(true);
    pokazKomunikat(`Dane się zmieniły – przesuwanie ${id} przerwane, nic nie zapisano.`);
  }

  function wyslij(id, budujZmiane, opisZmiany) {
    let wynik;
    try { wynik = dane.zapiszZmiane(id, budujZmiane); } catch (err) { pokazKomunikat(err.message); return null; }
    oczekujace += 1; ustawZapis({ oczekujace, blad: '' });
    wynik.wyslano.then(() => {
      oczekujace -= 1; ustawZapis({ oczekujace });
    }).catch((err) => {
      oczekujace -= 1;
      const opis = err.code === 'permission-denied' ? 'baza odrzuciła zapis (ktoś mógł w tym czasie zmienić ten punkt)' : (err.code || err.message);
      ustawZapis({ oczekujace, blad: `${opisZmiany}: ${opis}` });
      pokazKomunikat(`Nie zapisano: ${opis}`);
    });
    return wynik;
  }

  function zapisz() {
    const { p, delta, dz, zmierzone } = ed;
    const nowe = { x: p.ax === 'v' ? p.x : p.x + delta, yd: p.ax === 'v' ? p.yd + delta : p.yd, z: p.z + dz };
    const id = p.id;
    zakoncz(true);
    const w = wyslij(id, (e, kto) => dane.zmianaPolozenia(e, nowe, { ...kto, zmierzone }), `przesunięcie ${id}`);
    if (!w) { ctx.wybierz(p); return; }
    ostatnia = { id, przed: w.przed };
    pokazCofnij(id);
  }

  // pasek „Zapisano · Cofnij” (15 s); „Cofnij” zapisuje poprzednie położenie jako nową wersję
  function pokazCofnij(id) {
    let el = document.getElementById('ed-cofnij');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ed-cofnij';
      el.setAttribute('role', 'status');
      document.getElementById('scena').append(el);
    }
    el.innerHTML = `<span>Zapisano położenie <code>${esc(id)}</code>${navigator.onLine ? '' : ' – wyśle się po powrocie internetu'}.</span>
      <button type="button">Cofnij</button>`;
    el.hidden = false;
    el.querySelector('button').onclick = () => {
      el.hidden = true;
      if (!ostatnia || ostatnia.id !== id) return;
      const { przed } = ostatnia;
      ostatnia = null;
      if (wyslij(id, (e) => dane.zmianaCofniecia(e, przed), `cofnięcie ${id}`)) pokazKomunikat(`Cofnięto – ${id} wraca na poprzednie miejsce.`);
    };
    clearTimeout(pokazCofnij.t);
    pokazCofnij.t = setTimeout(() => { el.hidden = true; }, 15000);
  }

  return { zacznij, aktywny, przerwij, mozna: (p) => !!(p?.baza && dane.stanBazy().aktywna && dane.stanBazy().elementy?.get(p.id)) };
}
