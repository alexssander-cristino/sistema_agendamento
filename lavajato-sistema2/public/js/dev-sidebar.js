(() => {

  'use strict';

  // ============================================================
  // CONFIGURAÇÃO
  // ============================================================

  const AUTH_TOKEN_KEY = 'lavajato_auth_token';

  const ROTAS = {
    dashboard: '/admin/dashboard.html',
    planos: '/admin/planos.html',
    empresas: '/admin/empresas.html',
    assinaturas: '/admin/assinaturas.html',
    pagamentos: '/admin/pagamentos.html',
    usuarios: '/admin/usuarios.html',
    logs: '/admin/logs.html',
    tratamentos: '/admin/tratamentos.html',
    incidentes: '/admin/incidentes.html',
    sistema: '/',
    status: '/admin/dashboard.html#status'
  };


  // ============================================================
  // DETECTAR PÁGINA ATUAL
  // ============================================================

  function detectarPaginaAtual() {

    const caminho =
      window.location.pathname
        .replace(/\/+$/, '')
        .toLowerCase();

    for (const [pagina, rota] of Object.entries(ROTAS)) {

      const rotaLimpa =
        rota
          .split('#')[0]
          .replace(/\/+$/, '')
          .toLowerCase();

      if (rotaLimpa === caminho) {
        return pagina;
      }

    }

    return null;

  }


  // ============================================================
  // MARCAR MENU ATIVO
  // ============================================================

  function marcarMenuAtivo() {

    const paginaAtual =
      detectarPaginaAtual();

    if (!paginaAtual) {
      return;
    }

    document
      .querySelectorAll('.menu-btn[data-page]')
      .forEach(button => {

        const pagina =
          button.dataset.page;

        button.classList.toggle(
          'active',
          pagina === paginaAtual
        );

      });

  }


  // ============================================================
  // NAVEGAÇÃO
  // ============================================================

  function configurarNavegacao() {

    document
      .querySelectorAll('.menu-btn[data-page]')
      .forEach(button => {

        button.addEventListener(
          'click',
          () => {

            const pagina =
              button.dataset.page;

            const rota =
              ROTAS[pagina];

            if (!rota) {
              return;
            }

            /*
             * Fecha a sidebar no mobile
             * antes de navegar.
             */

            fecharSidebarMobile();

            window.location.href =
              rota;

          }
        );

      });

  }


  // ============================================================
  // LOGOUT
  // ============================================================

  function configurarLogout() {

    const botao =
      document.getElementById(
        'logout-btn'
      );

    if (!botao) {
      return;
    }

    botao.addEventListener(
      'click',
      () => {

        localStorage.removeItem(
          AUTH_TOKEN_KEY
        );

        localStorage.removeItem(
          'dev_empresa_contexto'
        );

        window.location.href =
          '/';

      }
    );

  }


  // ============================================================
  // MENU MOBILE
  // ============================================================

  function abrirSidebarMobile() {

    const sidebar =
      document.getElementById(
        'sidebar'
      );

    if (!sidebar) {
      return;
    }

    sidebar.classList.add(
      'open'
    );

  }


  function fecharSidebarMobile() {

    const sidebar =
      document.getElementById(
        'sidebar'
      );

    if (!sidebar) {
      return;
    }

    sidebar.classList.remove(
      'open'
    );

  }


  function configurarMenuMobile() {

    const botao =
      document.getElementById(
        'mobile-menu'
      );

    const sidebar =
      document.getElementById(
        'sidebar'
      );

    if (!botao || !sidebar) {
      return;
    }

    botao.addEventListener(
      'click',
      () => {

        sidebar.classList.toggle(
          'open'
        );

      }
    );


    /*
     * Fecha ao clicar fora da sidebar
     * em telas pequenas.
     */

    document.addEventListener(
      'click',
      event => {

        if (
          window.innerWidth > 900
        ) {
          return;
        }

        if (
          !sidebar.classList.contains(
            'open'
          )
        ) {
          return;
        }

        const clicouNaSidebar =
          sidebar.contains(
            event.target
          );

        const clicouNoBotao =
          botao.contains(
            event.target
          );

        if (
          !clicouNaSidebar &&
          !clicouNoBotao
        ) {

          fecharSidebarMobile();

        }

      }
    );


    /*
     * Fecha a sidebar quando
     * a janela volta para desktop.
     */

    window.addEventListener(
      'resize',
      () => {

        if (
          window.innerWidth > 900
        ) {

          fecharSidebarMobile();

        }

      }
    );

  }


  // ============================================================
  // FECHAR SIDEBAR AO CLICAR NO MENU
  // ============================================================

  function configurarFechamentoMenu() {

    document
      .querySelectorAll(
        '.menu-btn[data-page]'
      )
      .forEach(button => {

        button.addEventListener(
          'click',
          () => {

            if (
              window.innerWidth <= 900
            ) {

              fecharSidebarMobile();

            }

          }
        );

      });

  }


  // ============================================================
  // STATUS NO DASHBOARD
  // ============================================================

  function verificarHashStatus() {

    if (
      window.location.hash !== '#status'
    ) {
      return;
    }

    const elemento =
      document.getElementById(
        'status-api'
      );

    if (!elemento) {
      return;
    }

    setTimeout(
      () => {

        elemento.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });

      },
      300
    );

  }


  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  function iniciar() {

    marcarMenuAtivo();

    configurarNavegacao();

    configurarLogout();

    configurarMenuMobile();

    configurarFechamentoMenu();

    verificarHashStatus();

  }


  if (
    document.readyState === 'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      iniciar
    );

  } else {

    iniciar();

  }

})();