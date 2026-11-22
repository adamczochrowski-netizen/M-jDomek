// Mój domek – ikony punktów elektrycznych (model 3D, legenda, listy w Instalacjach, karta punktu).
// Rodzaj punktu poznajemy po KSZTAŁCIE i literze, nie po kolorze (rozdz. 17: elektryka = żółto-pomarańczowa):
// gniazdko – kółko, do sprzętu – kwadrat, indukcja – sześciokąt, włącznik – szeroki prostokąt,
// dzwonek i gong – romb, lampa – gwiazdka, wyprowadzenie kabla – czarny trójkąt (ostrzeżenie: nie wierć).
// Pewność położenia: POTWIERDZONA – zielony znaczek ✓; PRAWDOPODOBNA – zwykła ikona;
// NIEZWERYFIKOWANA – przygaszona, szara, ze znakiem „?”.
import { TYPY } from './analiza.js';

export const WIAR_KOD = { POTWIERDZONA: 'P', PRAWDOPODOBNA: 'R', NIEZWERYFIKOWANA: 'N' };
export const WIAR_OPIS = { P: 'położenie potwierdzone (pomiar)', R: 'położenie prawdopodobne (rysunek, szacunek)', N: 'położenie niezweryfikowane' };

function sciezka(x, ksztalt) {
  x.beginPath();
  const zaokr = (x0, y0, x1, y1, r) => {
    x.moveTo(x0 + r, y0); x.arcTo(x1, y0, x1, y1, r); x.arcTo(x1, y1, x0, y1, r); x.arcTo(x0, y1, x0, y0, r); x.arcTo(x0, y0, x1, y0, r); x.closePath();
  };
  const wielokat = (n, r, obrot = -Math.PI / 2, r2 = null) => {
    const k = r2 ? 2 * n : n;
    for (let i = 0; i < k; i++) {
      const a = obrot + (i * 2 * Math.PI) / k, rr = r2 && i % 2 ? r2 : r;
      const px = 64 + rr * Math.cos(a), py = 64 + rr * Math.sin(a);
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.closePath();
  };
  switch (ksztalt) {
    case 'kwadrat': zaokr(18, 18, 110, 110, 12); break;
    case 'szesciokat': wielokat(6, 52, 0); break;
    case 'prostokat': zaokr(8, 30, 120, 98, 16); break;
    case 'romb': wielokat(4, 56); break;
    case 'gwiazda': wielokat(5, 60, -Math.PI / 2, 27); break;
    case 'trojkat': x.moveTo(64, 10); x.lineTo(119, 110); x.lineTo(9, 110); x.closePath(); break;
    default: x.arc(64, 64, 50, 0, Math.PI * 2);
  }
}

const kanwy = new Map();
// płótno 128×128 z ikoną (rysowane raz, potem z pamięci)
export function kanwaZnacznika(t, w = 'R') {
  const klucz = t + w;
  if (kanwy.has(klucz)) return kanwy.get(klucz);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const T = TYPY[t] || { kolor: '#9a9a9a', tekst: '#1d1d1d' };
  const niezw = w === 'N';
  x.lineJoin = 'round';
  sciezka(x, T.ksztalt);
  x.lineWidth = 14; x.strokeStyle = 'rgba(255,255,255,0.95)'; x.stroke();     // jasna obwódka – widać na każdym tle
  x.fillStyle = niezw ? '#c4c4c4' : T.kolor; x.fill();
  x.lineWidth = 4; x.strokeStyle = niezw ? '#6b6b6b' : '#3d2a00'; x.stroke();
  x.fillStyle = niezw ? '#555555' : (T.tekst || '#1d1d1d');
  x.font = `bold ${T.ksztalt === 'gwiazda' ? 44 : T.ksztalt === 'trojkat' ? 52 : 58}px system-ui, Segoe UI, Arial, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(t, 64, T.ksztalt === 'gwiazda' ? 70 : T.ksztalt === 'trojkat' ? 80 : 67);
  if (w === 'P' || niezw) {                                                   // znaczek w prawym górnym rogu
    x.beginPath(); x.arc(102, 26, 22, 0, Math.PI * 2);
    x.fillStyle = niezw ? '#4a4a4a' : '#1f8a3a'; x.fill();
    x.lineWidth = 5; x.strokeStyle = '#ffffff'; x.stroke();
    if (niezw) {
      x.fillStyle = '#ffffff'; x.font = 'bold 30px system-ui, Segoe UI, Arial, sans-serif'; x.fillText('?', 102, 28);
    } else {
      x.beginPath(); x.moveTo(91, 27); x.lineTo(99, 35); x.lineTo(114, 18);
      x.lineWidth = 6; x.lineCap = 'round'; x.strokeStyle = '#ffffff'; x.stroke();
    }
  }
  kanwy.set(klucz, c);
  return c;
}

const adresy = new Map();
export function ikonaTypu(t, w = 'R') {
  const klucz = t + w;
  if (!adresy.has(klucz)) adresy.set(klucz, kanwaZnacznika(t, w).toDataURL());
  return adresy.get(klucz);
}
