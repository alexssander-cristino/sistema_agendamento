/* =========================================================
   Orvix | Painel DEV - sidebar única
   Substitui o <aside> de cada página por esta versão.
   Para adicionar/mudar um item do menu, edite só MENU abaixo.
   ========================================================= */
(() => {
  'use strict';

  const MENU = [
    { title: 'Geral', items: [
      { page: 'dashboard', label: 'Dashboard', icon: '▦', href: '/admin/dashboard.html' },
      { page: 'planos', label: 'Planos', icon: '◆', href: '/admin/planos.html' }
    ]},
    { title: 'SaaS', items: [
      { page: 'empresas', label: 'Empresas', icon: '◉', href: '/admin/empresas.html' },
      { page: 'assinaturas', label: 'Assinaturas', icon: '↻', href: '/admin/assinaturas.html' },
      { page: 'pagamentos', label: 'Pagamentos', icon: '$', href: '/admin/pagamentos.html' },
      { page: 'usuarios', label: 'Usuários', icon: '◇', href: '/admin/usuarios.html' },
      { page: 'logs', label: 'Logs', icon: '≡', href: '/admin/logs.html' },
      { page: 'tratamentos', label: 'Tratamentos', icon: '▣', href: '/admin/tratamentos.html' },
      { page: 'incidentes', label: 'Incidentes', icon: '⚠', href: '/admin/incidentes.html' }
    ]},
    { title: 'Atendimento', items: [
      { page: 'suporte', label: 'Solicitações', icon: '▤', href: '/admin/admin-suporte.html' },
      { page: 'solicitacoes-reembolso', label: 'Solicitações de Reembolso', icon: '↩', href: '/admin-solicitacoes-reembolso.html'}
    ]},
    { title: 'Plataforma', items: [
      { page: 'novidades', label: 'Centro de Novidades', icon: '✦', href: '/admin/novidades.html' }
    ]},
    { title: 'Sistema', items: [
      { page: 'sistema', label: 'Abrir sistema', icon: '↗', href: '/admin.html' },
      { page: 'status', label: 'Status da API', icon: '●', href: '/admin/dashboard.html#status-api' }
    ]}
  ];

  const esc = s => String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);

  const normalize = p => p.replace(/\/+$/, '') || '/';
  const here = normalize(window.location.pathname);

  function isActive(item) {
    if (item.page === 'status') return false;
    return normalize(item.href.split('#')[0]) === here;
  }

  function build() {
    const menu = MENU.map(group => `
      <div class="menu-title">${esc(group.title)}</div>
      ${group.items.map(item => `
        <a class="menu-btn${isActive(item) ? ' active' : ''}"
           data-page="${esc(item.page)}"
           href="${esc(item.href)}"
           ${isActive(item) ? 'aria-current="page"' : ''}
           style="text-decoration:none">
          <span class="menu-icon" aria-hidden="true">${esc(item.icon)}</span>
          <span>${esc(item.label)}</span>
        </a>`).join('')}
    `).join('');

    const aside = document.createElement('aside');
    aside.id = 'sidebar';
    aside.className = 'sidebar';
    aside.innerHTML = `
      <div class="brand">
        <h1 class="brand-title">Orvix</h1>
        <p class="brand-subtitle">Administração do SaaS</p>
        <span class="dev-badge">DEV</span>
      </div>
      <nav class="menu" aria-label="Menu administrativo">${menu}</nav>
      <div class="sidebar-footer">
        <button type="button" id="logout-btn" class="logout-btn">Sair do painel DEV</button>
      </div>`;
    return aside;
  }

  function addNotificationsButton(aside) {
    if (!window.OrvixFirebaseNotific) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-btn';
    button.innerHTML = '<span class="menu-icon" aria-hidden="true">🔔</span><span>Ativar notificações</span>';
    button.addEventListener('click', async () => {
      try {
        const result = await window.OrvixFirebaseNotific.ativarNotificacoes();
        window.Dev ? Dev.toast(result.mensagem, 'success') : alert(result.mensagem);
      } catch (error) {
        window.Dev ? Dev.toast(error.message, 'error') : alert(error.message);
      }
    });

    aside.querySelector('.menu').appendChild(button);
  }

  function setOpen(aside, open) {
    aside.classList.toggle('open', open);

    let overlay = document.getElementById('mobileOverlay') || document.getElementById('sidebar-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'mobileOverlay';
      overlay.className = 'mobile-overlay';
      overlay.addEventListener('click', () => setOpen(aside, false));
      document.body.appendChild(overlay);
    }
    overlay.classList.toggle('show', open);
  }

  function init() {
    const old = document.querySelector('aside#sidebar, aside.sidebar');

    /* Páginas com layout próprio (ex.: novidades.html usa .sidebar-nav)
       ainda não são trocadas: serão migradas junto com a reescrita da página. */
    if (!old || old.querySelector('.sidebar-nav')) return;

    const aside = build();

    /* Preserva o indicador de conexão usado por admin-suporte.html */
    const connection = old.querySelector('.sidebar-connection');
    if (connection) aside.appendChild(connection);

    addNotificationsButton(aside);
    old.replaceWith(aside);

    aside.querySelector('#logout-btn').addEventListener('click', () => {
      localStorage.removeItem('lavajato_auth_token');
      window.location.href = '/';
    });

    /* Botão ☰ das páginas (ids variam). #mobileMenuButton é tratado pelo
       próprio admin-suporte.html e fica de fora para não alternar duas vezes. */
    document.querySelectorAll('#mobile-menu, #mobile-menu-btn').forEach(btn => {
      btn.addEventListener('click', () => setOpen(aside, !aside.classList.contains('open')));
    });

    aside.addEventListener('click', e => {
      if (e.target.closest('a.menu-btn') && window.innerWidth <= 760) setOpen(aside, false);
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') setOpen(aside, false);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();