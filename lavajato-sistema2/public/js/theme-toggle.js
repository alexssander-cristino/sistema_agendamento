/* =========================================================
   ORVIX — theme-toggle.js
   Alterna entre tema escuro (padrão) e claro.
   - Qualquer elemento com [data-theme-toggle] vira botão de troca.
   - Escolha salva em localStorage ("orvix-theme").
   - Para evitar "flash", o <head> tem um mini-script que aplica o tema
     salvo antes da página pintar (veja o trecho do index.html).
   API: window.OrvixTheme.get() / .set('light'|'dark') / .toggle()
   Evento: "orvix:themechange" (detail: { theme })
   ========================================================= */
(function () {
  'use strict';

  var KEY = 'orvix-theme';
  var root = document.documentElement;

  function read() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) {}
    return 'dark'; // padrão atual do sistema
  }

  function current() {
    return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function syncUI(theme) {
    var isLight = theme === 'light';
    var actionLabel = isLight ? 'Mudar para modo escuro' : 'Mudar para modo claro';

    document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(isLight));
      btn.setAttribute('aria-label', actionLabel);
      btn.setAttribute('title', actionLabel);
    });

    document.querySelectorAll('[data-theme-label]').forEach(function (el) {
      el.textContent = isLight ? 'Modo escuro' : 'Modo claro';
    });

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isLight ? '#f3f5fa' : '#0a0e1a');
  }

  function apply(theme, animate) {
    if (animate) {
      root.classList.add('theme-switching');
      window.setTimeout(function () { root.classList.remove('theme-switching'); }, 350);
    }

    if (theme === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');

    syncUI(theme);
  }

  function set(theme) {
    theme = theme === 'light' ? 'light' : 'dark';
    apply(theme, true);

    try { localStorage.setItem(KEY, theme); } catch (e) {}

    document.dispatchEvent(new CustomEvent('orvix:themechange', { detail: { theme: theme } }));
  }

  function toggle() {
    set(current() === 'light' ? 'dark' : 'light');
  }

  // clique (delegado: funciona mesmo para botões criados depois)
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    e.preventDefault();
    toggle();
  });

  // sincroniza entre abas abertas
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) apply(read(), true);
  });

  // estado inicial
  apply(read(), false);

  window.OrvixTheme = { get: current, set: set, toggle: toggle };
})();