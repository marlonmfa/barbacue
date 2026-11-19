export function ThemeToggle() {
  return (
    <button type="button" className="theme-toggle" data-theme-toggle>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="10" r="7.25" />
        <path d="M10 2.75a7.25 7.25 0 0 1 0 14.5Z" fill="currentColor" />
      </svg>
      <span data-theme-label="dark">Tema escuro</span>
      <span data-theme-label="light">Tema claro</span>
    </button>
  );
}
