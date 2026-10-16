/* =========================================================
   Orvix | Painel DEV - utilitários compartilhados
   Uso: <script src="/js/dev-common.js"></script> (antes do script da página)
   ========================================================= */
(() => {
  'use strict';

  const API = '/api';
  const TOKEN_KEY = 'lavajato_auth_token';

  const getToken = () => localStorage.getItem(TOKEN_KEY);

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function goHome() {
    window.location.href = '/';
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    goHome();
  }

  /* Requisição única: lê o token a cada chamada, aceita corpo objeto,
     tolera resposta que não é JSON e trata 401 de forma igual em todas as páginas. */
  async function api(path, options = {}) {
    const token = getToken();

    if (!token) {
      goHome();
      throw new Error('Sessão não encontrada. Faça login novamente.');
    }

    const hasBody = options.body !== undefined && options.body !== null;
    const body = hasBody && typeof options.body !== 'string'
      ? JSON.stringify(options.body)
      : options.body;

    const response = await fetch(API + path, {
      ...options,
      body,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });

    const raw = await response.text();
    let data = null;

    if (raw) {
      try { data = JSON.parse(raw); } catch { data = { erro: raw }; }
    }

    if (response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      goHome();
      throw new Error('Sessão expirada. Entre novamente.');
    }

    if (!response.ok) {
      const fallback = response.status === 403
        ? 'Acesso não autorizado.'
        : `Não foi possível concluir a operação (${response.status}).`;
      throw new Error(data?.erro || data?.mensagem || data?.message || fallback);
    }

    return data;
  }

  /* Garante que o usuário é DEV. Preenche nome/avatar se existirem. */
  async function requireDev() {
    const data = await api('/auth/me');
    const usuario = data?.usuario || data;

    if (!usuario || usuario.perfil !== 'dev') {
      goHome();
      throw new Error('Acesso restrito ao desenvolvedor.');
    }

    const nome = usuario.nome || 'Desenvolvedor';
    const nameEl = document.getElementById('user-name');
    const avatarEl = document.getElementById('user-avatar');
    if (nameEl) nameEl.textContent = nome;
    if (avatarEl) avatarEl.textContent = nome.charAt(0).toUpperCase();

    return usuario;
  }

  /* Toast simples, sem depender de markup da página. */
  function toast(message, type = 'success') {
    let box = document.getElementById('dev-toasts');

    if (!box) {
      box = document.createElement('div');
      box.id = 'dev-toasts';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      box.style.cssText =
        'position:fixed;right:16px;bottom:16px;z-index:3000;display:flex;' +
        'flex-direction:column;gap:8px;max-width:min(380px,calc(100vw - 32px))';
      document.body.appendChild(box);
    }

    const colors = { success: '#15803d', error: '#b91c1c', info: '#1d4ed8' };
    const el = document.createElement('div');
    el.textContent = message;
    el.style.cssText =
      `background:${colors[type] || colors.info};color:#fff;padding:12px 16px;` +
      'border-radius:10px;font:500 14px system-ui,sans-serif;' +
      'box-shadow:0 8px 24px rgba(15,23,42,.18)';
    box.appendChild(el);

    setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
  }

  /* Substitui window.confirm: retorna Promise<boolean>. Fecha com Esc e clique fora. */
  function confirmDialog(message, { title = 'Confirmar ação', okText = 'Confirmar', danger = true } = {}) {
    return new Promise(resolve => {
      const previous = document.activeElement;
      const overlay = document.createElement('div');
      overlay.style.cssText =
        'position:fixed;inset:0;z-index:3100;display:grid;place-items:center;' +
        'padding:16px;background:rgba(15,23,42,.55)';

      overlay.innerHTML = `
        <div role="alertdialog" aria-modal="true" aria-labelledby="dc-title" aria-describedby="dc-text"
             style="width:100%;max-width:420px;background:#fff;color:#0f172a;border-radius:14px;
                    padding:22px;box-shadow:0 20px 50px rgba(15,23,42,.3);font-family:system-ui,sans-serif">
          <h2 id="dc-title" style="margin:0 0 8px;font-size:18px">${escapeHTML(title)}</h2>
          <p id="dc-text" style="margin:0 0 20px;color:#475569;line-height:1.5">${escapeHTML(message)}</p>
          <div style="display:flex;justify-content:flex-end;gap:10px">
            <button type="button" data-r="0" style="padding:10px 16px;border:1px solid #cbd5e1;
              border-radius:9px;background:#fff;cursor:pointer;font-weight:600">Cancelar</button>
            <button type="button" data-r="1" style="padding:10px 16px;border:0;border-radius:9px;
              background:${danger ? '#dc2626' : '#2563eb'};color:#fff;cursor:pointer;font-weight:600">
              ${escapeHTML(okText)}</button>
          </div>
        </div>`;

      const close = result => {
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        if (previous && previous.focus) previous.focus();
        resolve(result);
      };

      const onKey = e => { if (e.key === 'Escape') close(false); };

      overlay.addEventListener('click', e => {
        if (e.target === overlay) return close(false);
        const btn = e.target.closest('[data-r]');
        if (btn) close(btn.dataset.r === '1');
      });

      document.addEventListener('keydown', onKey);
      document.body.appendChild(overlay);
      overlay.querySelector('[data-r="0"]').focus();
    });
  }

  window.Dev = { API, TOKEN_KEY, getToken, escapeHTML, api, requireDev, toast, confirmDialog, logout };
})();