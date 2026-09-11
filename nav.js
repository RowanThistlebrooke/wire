// Three pages is when a nav is worth making. It lives in one file, so
// adding a page later changes this file and nothing else.
const PAGES = [
  ['you.html', 'you'],
  ['pad.html', 'pad'],
  ['commit.html', 'commits'],
  ['test.html', 'did it work'],
  ['scan.html', 'scan'],
  ['import.html', 'import']
];

(() => {
  const el = document.querySelector('.foot');
  if (!el) return;
  const here = location.pathname.split('/').pop() || 'index.html';
  el.insertAdjacentHTML('afterbegin', PAGES
    .filter(([file]) => file !== here)
    .map(([file, name]) => `<a href="${file}">${name}</a>`).join(''));
})();
