// Executed before paint by the web layout and copied as a script into Electron.
export const themeInit = `(() => {
  const key = 'barbacue-color-theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const root = document.documentElement;
  const read = () => {
    try {
      const saved = localStorage.getItem(key);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return null;
  };
  let selected = read();
  const apply = () => {
    root.dataset.theme = selected ?? (system.matches ? 'dark' : 'light');
    const chrome = document.querySelector('meta[name="theme-color"]');
    if (chrome) chrome.content = root.dataset.theme === 'dark' ? '#14110f' : '#fbf7f2';
  };
  apply();
  system.addEventListener('change', apply);
  window.addEventListener('storage', (event) => {
    if (event.key === key || event.key === null) {
      selected = read();
      apply();
    }
  });
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-theme-toggle]')) return;
    selected = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(key, selected); } catch {}
    apply();
  });
})();`;
