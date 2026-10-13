/* =========================================================
   ORVIX — MELHORIAS DE UX
   Incluir DEPOIS de /js/app.js:
   <script src="/js/ui-melhorias.js"></script>
   ========================================================= */
(function () {
  'use strict';

  // ----------------------------------------------------------
  // 1. TOASTS (substituem o alert() bloqueante)
  // ----------------------------------------------------------
  let box = null;

  function container() {
    if (!box) {
      box = document.createElement('div');
      box.className = 'ui-toasts';
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }

    return box;
  }

  function toast(message, type, duration) {
    const text = String(message == null ? '' : message).trim();

    if (!text) return;

    const kind = type || 'info';
    const el = document.createElement('div');

    el.className = 'ui-toast ' + kind;

    if (kind === 'error') el.setAttribute('role', 'alert');

    const msg = document.createElement('div');
    msg.className = 'ui-toast-msg';
    msg.textContent = text;

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ui-toast-close';
    close.setAttribute('aria-label', 'Fechar aviso');
    close.innerHTML = '&times;';

    el.append(msg, close);

    const wrapper = container();
    wrapper.appendChild(el);

    // no máximo 4 avisos ao mesmo tempo
    while (wrapper.children.length > 4) {
      wrapper.firstElementChild.remove();
    }

    function dismiss() {
      if (!el.isConnected || el.classList.contains('leaving')) return;

      el.classList.add('leaving');
      setTimeout(() => el.remove(), 180);
    }

    close.addEventListener('click', dismiss);

    setTimeout(dismiss, duration || (kind === 'error' ? 7000 : 4000));
  }

  function tipoDaMensagem(texto) {
    const t = String(texto || '');

    if (/erro|não foi possível|nao foi possivel|falha|inválid|invalid/i.test(t)) return 'error';
    if (/^(informe|apenas|você não|voce nao|selecione)/i.test(t.trim())) return 'warning';

    return 'info';
  }

  window.alertNativo = window.alert.bind(window);

  window.alert = function (mensagem) {
    toast(mensagem, tipoDaMensagem(mensagem));
  };

  window.Toast = {
    show: toast,
    success: (m, ms) => toast(m, 'success', ms),
    warning: (m, ms) => toast(m, 'warning', ms),
    error: (m, ms) => toast(m, 'error', ms),
    info: (m, ms) => toast(m, 'info', ms)
  };

  // ----------------------------------------------------------
  // 2. ESC FECHA MODAIS E PAINÉIS
  // ----------------------------------------------------------
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;

    // formulário de cliente (fica por cima dos outros)
    const formCliente = document.getElementById('cli-form-modal');

    if (formCliente && formCliente.classList.contains('is-open')) {
      formCliente.querySelector('[data-cli-form-close]')?.click();
      return;
    }

    // modais de agendamento, serviço, despesa e usuário
    const overlay = document.querySelector('.overlay.active');

    if (overlay) {
      const cancelar = overlay.querySelector('[id^="btn-cancel"]');

      if (cancelar) {
        cancelar.click();
      } else {
        overlay.classList.remove('active');
      }

      return;
    }

    // painel de notificações
    const painel = document.getElementById('painel-notificacoes');

    if (painel && !painel.hidden) {
      document.getElementById('btn-notificacoes-fechar')?.click();
    }
  });

  // ----------------------------------------------------------
  // 3. TRAVA A ROLAGEM DO FUNDO COM MODAL ABERTO
  // ----------------------------------------------------------
  let travado = false;
  let overflowAnterior = '';

  function sincronizarRolagem() {
    const aberto = Boolean(
      document.querySelector('.overlay.active, .cli-form-modal.is-open, .cli-modal.open')
    );

    if (aberto && !travado) {
      overflowAnterior = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      travado = true;
    } else if (!aberto && travado) {
      document.body.style.overflow = overflowAnterior;
      travado = false;
    }
  }

  new MutationObserver(sincronizarRolagem).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });

  // ----------------------------------------------------------
  // 4. SPINNER NOS TEXTOS "Carregando…" / "Buscando…"
  // ----------------------------------------------------------
  const TEXTO_CARREGANDO = /^(carregando|buscando)/i;

  function marcarCarregando(el) {
    el.classList.toggle('is-loading', TEXTO_CARREGANDO.test(el.textContent.trim()));
  }

  function varrer(no) {
    if (!(no instanceof Element)) return;

    if (no.matches('.empty')) marcarCarregando(no);

    no.querySelectorAll('.empty').forEach(marcarCarregando);
  }

  new MutationObserver(function (mutacoes) {
    mutacoes.forEach(function (m) {
      m.addedNodes.forEach(varrer);
    });
  }).observe(document.body, { childList: true, subtree: true });

  varrer(document.body);
})();