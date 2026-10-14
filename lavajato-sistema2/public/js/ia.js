(() => {
  'use strict';

  const API_CHAT = '/api/ia/chat';
  const TOKEN_KEY = 'lavajato_auth_token';
  const LIMITE_MENSAGEM = 2000;
  const TIMEOUT_MS = 60000;

  function iniciarOrvixAI() {
    const toggle = document.getElementById('orvix-ai-toggle');
    const panel = document.getElementById('orvix-ai-panel');
    const closeButton = document.getElementById('orvix-ai-close');
    const newButton = document.getElementById('orvix-ai-new');
    const form = document.getElementById('orvix-ai-form');
    const input = document.getElementById('orvix-ai-input');
    const sendButton = document.getElementById('orvix-ai-send');
    const messages = document.getElementById('orvix-ai-messages');
    const welcome = document.getElementById('orvix-ai-welcome');
    const typing = document.getElementById('orvix-ai-typing');

    if (
      !toggle || !panel || !form || !input ||
      !sendButton || !messages || !welcome || !typing
    ) {
      console.error('Orvix AI: elementos do chat não encontrados.');
      return;
    }

    let enviando = false;

    // =========================================================
    // VISIBILIDADE (some na tela de login)
    // =========================================================

    function loginEstaVisivel() {
      const auth = document.getElementById('auth-screen');

      if (!auth) return false;

      const estilo = getComputedStyle(auth);

      return (
        !auth.hidden &&
        estilo.display !== 'none' &&
        estilo.visibility !== 'hidden'
      );
    }

    function chatEstaAberto() {
      return panel.classList.contains('orvix-ai-open');
    }

    function atualizarVisibilidade() {
      const loginVisivel = loginEstaVisivel();

      toggle.hidden = loginVisivel;

      if (loginVisivel) {
        panel.classList.remove('orvix-ai-open');
        panel.hidden = true;
        panel.setAttribute('aria-hidden', 'true');
        toggle.setAttribute('aria-expanded', 'false');
      } else {
        panel.hidden = false;
        panel.setAttribute('aria-hidden', String(!chatEstaAberto()));
      }
    }

    function abrirChat(aberto) {
      atualizarVisibilidade();

      if (loginEstaVisivel() || toggle.hidden) return;

      panel.classList.toggle('orvix-ai-open', aberto);
      panel.setAttribute('aria-hidden', String(!aberto));
      toggle.setAttribute('aria-expanded', String(aberto));

      if (aberto) {
        input.focus();
        rolarParaBaixo();
      }
    }

    // =========================================================
    // MENSAGENS
    // =========================================================

    function rolarParaBaixo() {
      messages.scrollTop = messages.scrollHeight;
    }

    function adicionarMensagem(tipo, texto) {
      welcome.hidden = true;

      const container = document.createElement('div');
      container.className = `orvix-ai-message orvix-ai-${tipo}`;

      const autor = document.createElement('span');
      autor.className = 'orvix-ai-message-author';
      autor.textContent = tipo === 'user' ? 'Você' : 'Orvix AI';

      const balao = document.createElement('div');
      balao.className = 'orvix-ai-message-bubble';
      balao.textContent = String(texto);

      container.append(autor, balao);

      // Se o indicador "digitando" estiver dentro da lista,
      // as mensagens entram antes dele (ele fica sempre por último).
      if (typing.parentNode === messages) {
        messages.insertBefore(container, typing);
      } else {
        messages.appendChild(container);
      }

      rolarParaBaixo();
    }

    function ajustarCampo() {
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight, 110)}px`;
    }

    // =========================================================
    // ENVIO
    // =========================================================

    async function enviarMensagem(texto) {
      const mensagem = String(texto || '').trim();

      if (enviando || !mensagem) return;

      if (mensagem.length > LIMITE_MENSAGEM) {
        adicionarMensagem(
          'assistant',
          `A mensagem deve ter no máximo ${LIMITE_MENSAGEM} caracteres.`
        );
        return;
      }

      enviando = true;
      sendButton.disabled = true;
      input.disabled = true;

      adicionarMensagem('user', mensagem);
      input.value = '';
      ajustarCampo();
      typing.hidden = false;
      rolarParaBaixo();

      const controlador = new AbortController();
      const limite = setTimeout(() => controlador.abort(), TIMEOUT_MS);

      try {
        // O sistema autentica com Bearer token (o mesmo das outras telas).
        const token = localStorage.getItem(TOKEN_KEY);

        if (!token) {
          throw new Error('Sua sessão expirou. Entre novamente no Orvix.');
        }

        const response = await fetch(API_CHAT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          credentials: 'same-origin',
          signal: controlador.signal,
          body: JSON.stringify({ mensagem })
        });

        let dados = null;

        try {
          dados = await response.json();
        } catch {
          dados = null;
        }

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error('Sua sessão expirou. Entre novamente no Orvix.');
          }

          if (response.status === 403) {
            throw new Error(
              dados?.erro || 'Você não tem permissão para usar o agente.'
            );
          }

          if (response.status === 429) {
            throw new Error(
              dados?.erro || 'Muitas mensagens em pouco tempo. Aguarde um instante.'
            );
          }

          throw new Error(
            dados?.erro || `Erro na solicitação (HTTP ${response.status}).`
          );
        }

        if (!dados) {
          throw new Error('O servidor retornou uma resposta inválida.');
        }

        if (
          typeof dados.resposta !== 'string' ||
          !dados.resposta.trim()
        ) {
          throw new Error('O assistente retornou uma resposta vazia.');
        }

        adicionarMensagem('assistant', dados.resposta.trim());
      } catch (erro) {
        console.error('Erro no Orvix AI:', erro);

        const texto =
          erro.name === 'AbortError'
            ? 'O assistente demorou demais para responder. Tente novamente.'
            : erro.message || 'Não foi possível conectar ao assistente.';

        adicionarMensagem('assistant', texto);
      } finally {
        clearTimeout(limite);
        typing.hidden = true;
        enviando = false;
        sendButton.disabled = false;
        input.disabled = false;

        if (chatEstaAberto()) input.focus();

        rolarParaBaixo();
      }
    }

    // =========================================================
    // EVENTOS
    // =========================================================

    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      abrirChat(!chatEstaAberto());
    });

    closeButton?.addEventListener('click', (event) => {
      event.preventDefault();
      abrirChat(false);
    });

    newButton?.addEventListener('click', (event) => {
      event.preventDefault();

      if (enviando) return;

      const typingDentro = typing.parentNode === messages;

      messages.replaceChildren();
      messages.appendChild(welcome);

      // replaceChildren também remove o "digitando" se ele estiver aqui dentro.
      if (typingDentro) messages.appendChild(typing);

      typing.hidden = true;
      welcome.hidden = false;
      input.value = '';
      ajustarCampo();
      input.focus();
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      enviarMensagem(input.value);
    });

    input.addEventListener('input', ajustarCampo);

    input.addEventListener('keydown', (event) => {
      if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.isComposing
      ) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    document.querySelectorAll('[data-orvix-prompt]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        enviarMensagem(button.getAttribute('data-orvix-prompt') || '');
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && chatEstaAberto()) {
        abrirChat(false);
      }
    });

    // =========================================================
    // ACOMPANHA LOGIN / LOGOUT
    // O login termina de forma assíncrona (depois do clique), então
    // observamos a própria tela de login em vez de checar só no clique.
    // =========================================================

    window.atualizarVisibilidadeOrvixAI = atualizarVisibilidade;

    const authScreen = document.getElementById('auth-screen');

    if (authScreen && 'MutationObserver' in window) {
      new MutationObserver(atualizarVisibilidade).observe(authScreen, {
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden']
      });
    }

    // Cobre o caso de a tela de login ser removida/inserida no <body>.
    if ('MutationObserver' in window) {
      new MutationObserver(atualizarVisibilidade).observe(document.body, {
        childList: true
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) atualizarVisibilidade();
    });

    window.addEventListener('focus', atualizarVisibilidade);

    atualizarVisibilidade();
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      iniciarOrvixAI,
      { once: true }
    );
  } else {
    iniciarOrvixAI();
  }
})();