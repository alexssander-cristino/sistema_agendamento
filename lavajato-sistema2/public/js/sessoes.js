/* ============================================================
   ORVIX — SEGURANÇA E DISPOSITIVOS (Configurações)
   ============================================================ */
(() => {
  'use strict';

  const API = '/api';
  const TOKEN_KEY = 'lavajato_auth_token';

  const $ = id => document.getElementById(id);

  const lista = $('sessoes-lista');
  if (!lista) return;

  const mensagem = $('sessoes-mensagem');
  const btnOutras = $('btn-sessoes-encerrar-outras');
  const btnAtualizar = $('btn-sessoes-atualizar');

  let carregando = false;
  let ocupado = false;

  // ---------- estilo (autocontido) ----------

  const estilo = document.createElement('style');
  estilo.textContent = `
    .sessao-item{display:flex;align-items:center;gap:14px;padding:14px 16px;margin-bottom:10px;border:1px solid var(--border,#e2e8f0);border-radius:14px;background:var(--card-bg,#fff)}
    .sessao-item.atual{border-color:var(--primary,#2563eb)}
    .sessao-icone{display:grid;place-items:center;flex-shrink:0;width:40px;height:40px;border-radius:12px;background:rgba(37,99,235,.1);color:var(--primary,#2563eb)}
    .sessao-icone svg{width:20px;height:20px}
    .sessao-info{flex:1;min-width:0}
    .sessao-titulo{font-weight:700;font-size:14px;display:flex;flex-wrap:wrap;align-items:center;gap:8px}
    .sessao-meta{margin-top:3px;font-size:12.5px;color:var(--muted,#64748b);overflow-wrap:anywhere}
    .sessao-selo{padding:2px 9px;border-radius:999px;background:rgba(21,128,61,.12);color:#15803d;font-size:11px;font-weight:700}
    @media(max-width:560px){.sessao-item{flex-wrap:wrap}.sessao-item .btn{width:100%}}
  `;
  document.head.appendChild(estilo);

  // ---------- utilidades ----------

  function escapeHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[c]);
  }

  function tempoRelativo(valor) {
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) return '-';

    const seg = Math.floor((Date.now() - data.getTime()) / 1000);
    if (seg < 60) return 'agora mesmo';

    const min = Math.floor(seg / 60);
    if (min < 60) return `há ${min} min`;

    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h} h`;

    const dias = Math.floor(h / 24);
    if (dias < 30) return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;

    return data.toLocaleDateString('pt-BR');
  }

  function formatarData(valor) {
    const data = new Date(valor);

    return Number.isNaN(data.getTime())
      ? '-'
      : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function icone(tipo) {
    const caminho = tipo === 'celular'
      ? '<rect x="6" y="2.5" width="8" height="15" rx="2"/><path d="M9 15h2"/>'
      : tipo === 'tablet'
        ? '<rect x="4" y="2.5" width="12" height="15" rx="2"/><path d="M9 15h2"/>'
        : '<rect x="2.5" y="4" width="15" height="10" rx="1.5"/><path d="M7 17h6M10 14v3"/>';

    return `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${caminho}</svg>`;
  }

  function aviso(texto, tipo) {
    if (!mensagem) return;

    mensagem.textContent = texto || '';
    mensagem.style.display = texto ? 'block' : 'none';
    mensagem.style.color = tipo === 'sucesso' ? '#15803d' : '';
  }

  async function api(caminho, opcoes = {}) {
    const token = localStorage.getItem(TOKEN_KEY);

    const headers = {
      ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    const resposta = await fetch(API + caminho, {
      ...opcoes,
      headers,
      credentials: 'same-origin'
    });

    let dados = null;
    try { dados = await resposta.json(); } catch (_) {}

    if (resposta.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.reload();
      throw new Error('Sessão encerrada.');
    }

    if (!resposta.ok) {
      throw new Error(dados?.erro || 'Não foi possível concluir a operação.');
    }

    return dados;
  }

  // ---------- renderização ----------

  function renderizar(sessoes) {
    if (!sessoes.length) {
      lista.innerHTML = '<div class="empty"><strong>Nenhuma sessão ativa encontrada</strong></div>';
      btnOutras.disabled = true;
      return;
    }

    btnOutras.disabled = !sessoes.some(s => !s.atual);

    lista.innerHTML = sessoes.map(s => `
      <div class="sessao-item ${s.atual ? 'atual' : ''}" data-id="${escapeHtml(s.id)}">
        <div class="sessao-icone">${icone(s.tipo_dispositivo)}</div>

        <div class="sessao-info">
          <div class="sessao-titulo">
            ${escapeHtml(s.navegador || 'Navegador desconhecido')} · ${escapeHtml(s.sistema || 'Sistema desconhecido')}
            ${s.atual ? '<span class="sessao-selo">Este dispositivo</span>' : ''}
          </div>

          <div class="sessao-meta">
            ${s.ip ? `IP ${escapeHtml(s.ip)} · ` : ''}
            Último acesso ${escapeHtml(tempoRelativo(s.ultimo_acesso))} ·
            Conectado em ${escapeHtml(formatarData(s.criada_em))}
          </div>
        </div>

        ${s.atual
          ? ''
          : '<button type="button" class="btn btn-ghost btn-small" data-encerrar>Encerrar</button>'}
      </div>
    `).join('');
  }

  async function carregar() {
    if (carregando) return;
    carregando = true;

    aviso('');

    try {
      const dados = await api('/sessoes');
      renderizar(Array.isArray(dados?.sessoes) ? dados.sessoes : []);
    } catch (erro) {
      lista.innerHTML = '';
      aviso(erro.message || 'Não foi possível carregar as sessões.');
    } finally {
      carregando = false;
    }
  }

  // ---------- ações ----------

  async function encerrar(id) {
    if (ocupado || !id) return;

    if (!confirm('Encerrar esta sessão? O dispositivo será desconectado.')) return;

    ocupado = true;

    try {
      await api(`/sessoes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      aviso('Sessão encerrada.', 'sucesso');
    } catch (erro) {
      aviso(erro.message);
    } finally {
      ocupado = false;
    }

    await carregar();
  }

  async function encerrarOutras() {
    if (ocupado) return;

    if (!confirm('Encerrar todas as outras sessões? Só este dispositivo continuará conectado.')) return;

    ocupado = true;
    btnOutras.disabled = true;

    try {
      const dados = await api('/sessoes/encerrar-outras', { method: 'POST' });
      aviso(dados?.mensagem || 'Sessões encerradas.', 'sucesso');
    } catch (erro) {
      aviso(erro.message);
    } finally {
      ocupado = false;
    }

    await carregar();
  }

  lista.addEventListener('click', evento => {
    const botao = evento.target.closest('[data-encerrar]');
    if (!botao) return;

    encerrar(botao.closest('.sessao-item')?.dataset.id);
  });

  btnOutras?.addEventListener('click', encerrarOutras);
  btnAtualizar?.addEventListener('click', carregar);

  // Carrega quando a aba Configurações é aberta.
  document.addEventListener('click', evento => {
    if (evento.target.closest('[data-tab="configuracoes"]')) {
      setTimeout(carregar, 0);
    }
  });

  window.OrvixSessoes = { carregar };
})();