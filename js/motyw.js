// Mój domek – przełącznik motywu w nagłówku (komputer). Na telefonie ten sam wybór jest w panelu konta (konto.js).
// Samo ustawienie motywu dzieje się w <head> index.html (window.mojDomekMotyw), żeby strona nie mignęła.
const M = window.mojDomekMotyw;

function oznacz() {
  const w = M?.wybor() || 'ciemny';
  document.querySelectorAll('.motyw-przelacznik [data-motyw]').forEach((b) => {
    const tak = b.dataset.motyw === w;
    b.setAttribute('aria-checked', String(tak));
    b.tabIndex = tak ? 0 : -1;
  });
}

document.querySelector('.motyw-przelacznik')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-motyw]');
  if (b && M) M.ustaw(b.dataset.motyw);
});
// strzałki w grupie przełączników (jak w zwykłej grupie opcji)
document.querySelector('.motyw-przelacznik')?.addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || !M) return;
  const opcje = [...document.querySelectorAll('.motyw-przelacznik [data-motyw]')];
  const i = opcje.findIndex((b) => b.dataset.motyw === M.wybor());
  const n = opcje[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + opcje.length) % opcje.length];
  M.ustaw(n.dataset.motyw);
  n.focus();
  e.preventDefault();
});
window.addEventListener('mojdomek:motyw', oznacz);
oznacz();
