
(() => {
  'use strict';

  const TOKEN_KEY = 'lavajato_auth_token';
  const API_BASE = '/api/privacidade/dev';

  const $ = selector => document.querySelector(selector);

  const state = {
    tickets: [],
    selectedId: null,
    loading: false
  };

  function token() {
    return localStorage.getItem(TOKEN_KEY);
  }

  async function apiRequest(url, options = {}) {
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await response.json()
      : null;

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        data?.erro || 'Sessão inválida ou acesso não autorizado.'
      );
    }

    if (!response.ok) {
      throw new Error(
        data?.erro || data?.mensagem || `Erro HTTP ${response.status}.`
      );
    }

    return data;
  }

  function mostrarMensagem(mensagem, tipo = 'success') {
    let elemento = $('#supportMessage');

    if (!elemento) {
      elemento = document.createElement('div');
      elemento.id = 'supportMessage';
      elemento.className = 'message';
      elemento.setAttribute('role', 'status');
      document.body.appendChild(elemento);
    }

    elemento.textContent = mensagem;
    elemento.classList.toggle('error', tipo === 'error');
    elemento.hidden = false;

    window.clearTimeout(elemento._timer);
    elemento._timer = window.setTimeout(() => {
      elemento.hidden = true;
    }, 4500);
  }

  function escapar(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, caractere => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[caractere]);
  }

  function formatarData(valor) {
    if (!valor) return '—';

    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) {
      return String(valor);
    }

    return data.toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
  }

  function normalizarStatus(status) {
    return String(status || 'pendente')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_');
  }

  function rotuloStatus(status) {
    const rotulos = {
      pendente: 'Pendente',
      em_analise: 'Em análise',
      aguardando_informacoes: 'Aguardando informações',
      atendida: 'Atendida',
      recusada: 'Recusada',
      cancelada: 'Cancelada'
    };

    return rotulos[normalizarStatus(status)] || status || 'Pendente';
  }

  function statusHTML(status) {
    const normalizado = normalizarStatus(status);

    return `
      <span class="status status-${escapar(normalizado)}">
        ${escapar(rotuloStatus(normalizado))}
      </span>
    `;
  }

  function elementoPorIds(ids) {
    for (const id of ids) {
      const elemento = document.getElementById(id);
      if (elemento) return elemento;
    }

    return null;
  }

  function obterFiltroTexto() {
    const campo = elementoPorIds([
      'searchInput',
      'search',
      'filtroBusca',
      'filterSearch'
    ]);

    return (campo?.value || '').trim().toLowerCase();
  }

  function obterFiltroStatus() {
    const campo = elementoPorIds([
      'statusFilter',
      'filterStatus',
      'filtroStatus'
    ]);

    return campo?.value || '';
  }

  function obterFiltroPrioridade() {
    const campo = elementoPorIds([
      'priorityFilter',
      'filterPriority',
      'filtroPrioridade'
    ]);

    return campo?.value || '';
  }

  function filtrarTickets() {
    const texto = obterFiltroTexto();
    const status = obterFiltroStatus();
    const prioridade = obterFiltroPrioridade();

    return state.tickets.filter(ticket => {
      const conteudo = [
        ticket.id,
        ticket.assunto,
        ticket.empresa_nome,
        ticket.nome_empresa,
        ticket.usuario_nome,
        ticket.tipo,
        ticket.descricao,
        ticket.referencia
      ].filter(Boolean).join(' ').toLowerCase();

      const correspondeTexto = !texto || conteudo.includes(texto);

      const correspondeStatus =
        !status || normalizarStatus(ticket.status) === normalizarStatus(status);

      const correspondePrioridade =
        !prioridade ||
        String(ticket.prioridade || 'normal').toLowerCase() ===
          prioridade.toLowerCase();

      return correspondeTexto &&
        correspondeStatus &&
        correspondePrioridade;
    });
  }

  function atualizarEstatisticas() {
    const total = state.tickets.length;
    const pendentes = state.tickets.filter(ticket =>
      normalizarStatus(ticket.status) === 'pendente'
    ).length;

    const emAnalise = state.tickets.filter(ticket =>
      normalizarStatus(ticket.status) === 'em_analise'
    ).length;

    const atendidas = state.tickets.filter(ticket =>
      normalizarStatus(ticket.status) === 'atendida'
    ).length;

    const valores = {
      total,
      pendentes,
      emAnalise,
      atendidas
    };

    const seletores = {
      total: ['totalTickets', 'statTotal', 'totalSolicitacoes'],
      pendentes: ['pendingTickets', 'statPending', 'totalPendentes'],
      emAnalise: ['inProgressTickets', 'statInProgress', 'totalEmAnalise'],
      atendidas: ['resolvedTickets', 'statResolved', 'totalAtendidas']
    };

    for (const [chave, ids] of Object.entries(seletores)) {
      const elemento = elementoPorIds(ids);

      if (elemento) {
        elemento.textContent = String(valores[chave]);
      }
    }
  }

  function renderizarLista() {
    const lista = elementoPorIds([
      'ticketList',
      'ticketsList',
      'solicitacoesList',
      'requestsList'
    ]);

    if (!lista) {
      console.warn('Lista de solicitações não encontrada no HTML.');
      return;
    }

    const tickets = filtrarTickets();

    if (!tickets.length) {
      lista.innerHTML = `
        <div class="empty">
          Nenhuma solicitação encontrada para os filtros selecionados.
        </div>
      `;
      return;
    }

    lista.innerHTML = tickets.map(ticket => {
      const id = String(ticket.id);
      const assunto = ticket.assunto || `Solicitação #${id}`;
      const empresa = ticket.empresa_nome ||
        ticket.nome_empresa ||
        'Empresa não identificada';

      return `
        <button
          type="button"
          class="ticket-item ${String(state.selectedId) === id ? 'active' : ''}"
          data-ticket-id="${escapar(id)}"
        >
          <span class="ticket-title">${escapar(assunto)}</span>
          <span class="ticket-description">${escapar(empresa)}</span>
          <span class="ticket-meta">
            <span>#${escapar(id)}</span>
            ${statusHTML(ticket.status)}
            <span>${escapar(formatarData(ticket.criado_em))}</span>
          </span>
        </button>
      `;
    }).join('');
  }

  function valorDetalhe(ids, valor) {
    const elemento = elementoPorIds(ids);

    if (elemento) {
      elemento.textContent = valor || '—';
    }
  }

  function selecionarTicket(id) {
    const ticket = state.tickets.find(item => String(item.id) === String(id));

    if (!ticket) {
      mostrarMensagem('Solicitação não encontrada.', 'error');
      return;
    }

    state.selectedId = ticket.id;
    renderizarLista();

    valorDetalhe(
      ['detailId', 'ticketId', 'solicitacaoId'],
      `#${ticket.id}`
    );

    valorDetalhe(
      ['detailSubject', 'ticketSubject', 'solicitacaoAssunto'],
      ticket.assunto || `Solicitação #${ticket.id}`
    );

    valorDetalhe(
      ['detailCompany', 'ticketCompany', 'solicitacaoEmpresa'],
      ticket.empresa_nome || ticket.nome_empresa || '—'
    );

    valorDetalhe(
      ['detailUser', 'ticketUser', 'solicitacaoUsuario'],
      ticket.usuario_nome || ticket.usuario_id || '—'
    );

    valorDetalhe(
      ['detailType', 'ticketType', 'solicitacaoTipo'],
      ticket.tipo || '—'
    );

    valorDetalhe(
      ['detailPriority', 'ticketPriority', 'solicitacaoPrioridade'],
      ticket.prioridade || 'Normal'
    );

    valorDetalhe(
      ['detailDate', 'ticketDate', 'solicitacaoData'],
      formatarData(ticket.criado_em)
    );

    valorDetalhe(
      ['detailReference', 'ticketReference', 'solicitacaoReferencia'],
      ticket.referencia || '—'
    );

    valorDetalhe(
      ['detailDescription', 'ticketDescription', 'solicitacaoDescricao'],
      ticket.descricao || 'Sem descrição.'
    );

    valorDetalhe(
      ['detailResponse', 'ticketResponse', 'solicitacaoResposta'],
      ticket.resposta || 'Nenhuma resposta registrada.'
    );

    const statusSelect = elementoPorIds([
      'responseStatus',
      'ticketStatus',
      'statusResposta'
    ]);

    if (statusSelect) {
      statusSelect.value = normalizarStatus(ticket.status);
    }

    const resposta = elementoPorIds([
      'responseInput',
      'ticketResponseInput',
      'respostaInput',
      'response'
    ]);

    if (resposta) {
      resposta.value = ticket.resposta || '';
    }

    const painel = elementoPorIds([
      'ticketDetail',
      'ticketDetails',
      'detailPanel',
      'detailsPanel'
    ]);

    if (painel) {
      painel.hidden = false;
    }

    const vazio = elementoPorIds([
      'ticketEmpty',
      'emptyDetail',
      'noTicketSelected'
    ]);

    if (vazio) {
      vazio.hidden = true;
    }
  }

  async function carregarSolicitacoes() {
    if (state.loading) return;

    state.loading = true;

    const botaoAtualizar = elementoPorIds([
      'refreshButton',
      'refreshBtn',
      'btnAtualizar'
    ]);

    if (botaoAtualizar) {
      botaoAtualizar.disabled = true;
    }

    try {
      const data = await apiRequest(API_BASE);

      const tickets = Array.isArray(data)
        ? data
        : Array.isArray(data?.solicitacoes)
          ? data.solicitacoes
          : Array.isArray(data?.tickets)
            ? data.tickets
            : null;

      if (!tickets) {
        throw new Error('O servidor retornou uma lista inválida.');
      }

      state.tickets = tickets;

      atualizarEstatisticas();
      renderizarLista();

      if (state.selectedId !== null) {
        const aindaExiste = state.tickets.some(
          ticket => String(ticket.id) === String(state.selectedId)
        );

        if (aindaExiste) {
          selecionarTicket(state.selectedId);
        } else {
          state.selectedId = null;
        }
      }

    } catch (error) {
      console.error('Erro ao carregar solicitações:', error);

      mostrarMensagem(
        error.message || 'Não foi possível carregar as solicitações.',
        'error'
      );

      if (
        error.message.includes('Sessão inválida') ||
        error.message.includes('não autorizado')
      ) {
        localStorage.removeItem(TOKEN_KEY);
        window.location.replace('/');
      }
    } finally {
      state.loading = false;

      if (botaoAtualizar) {
        botaoAtualizar.disabled = false;
      }
    }
  }

  async function salvarAtendimento(event) {
    event.preventDefault();

    if (state.selectedId === null) {
      mostrarMensagem('Selecione uma solicitação primeiro.', 'error');
      return;
    }

    const respostaInput = elementoPorIds([
      'responseInput',
      'ticketResponseInput',
      'respostaInput',
      'response'
    ]);

    const statusInput = elementoPorIds([
      'responseStatus',
      'ticketStatus',
      'statusResposta'
    ]);

    const resposta = respostaInput?.value.trim() || '';
    const status = statusInput?.value || '';

    if (!status) {
      mostrarMensagem('Selecione o status do atendimento.', 'error');
      return;
    }

    const botaoSalvar = elementoPorIds([
      'saveResponseButton',
      'saveButton',
      'btnSalvarResposta'
    ]);

    if (botaoSalvar) {
      botaoSalvar.disabled = true;
    }

    try {
      await apiRequest(
        `${API_BASE}/${encodeURIComponent(state.selectedId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status, resposta })
        }
      );

      mostrarMensagem('Atendimento salvo com sucesso.');

      await carregarSolicitacoes();

    } catch (error) {
      console.error('Erro ao salvar atendimento:', error);

      mostrarMensagem(
        error.message ||
          'Não foi possível salvar. Verifique a rota de atendimento no servidor.',
        'error'
      );
    } finally {
      if (botaoSalvar) {
        botaoSalvar.disabled = false;
      }
    }
  }

  function descartarAlteracoes() {
    if (state.selectedId === null) {
      mostrarMensagem('Selecione uma solicitação primeiro.', 'error');
      return;
    }

    selecionarTicket(state.selectedId);
    mostrarMensagem('Alterações não salvas foram descartadas.');
  }

  function configurarEventos() {
    const botaoAtualizar = elementoPorIds([
      'refreshButton',
      'refreshBtn',
      'btnAtualizar'
    ]);

    botaoAtualizar?.addEventListener('click', carregarSolicitacoes);

    const formulario = elementoPorIds([
      'responseForm',
      'ticketResponseForm',
      'supportForm',
      'formResposta'
    ]);

    formulario?.addEventListener('submit', salvarAtendimento);

    const botaoSalvar = elementoPorIds([
      'saveResponseButton',
      'saveButton',
      'btnSalvarResposta'
    ]);

    if (!formulario && botaoSalvar) {
      botaoSalvar.addEventListener('click', salvarAtendimento);
    }

    const botaoDescartar = elementoPorIds([
      'discardButton',
      'cancelChangesButton',
      'btnDescartar'
    ]);

    botaoDescartar?.addEventListener('click', descartarAlteracoes);

    const botaoSair = elementoPorIds([
      'logoutButton',
      'logout-btn'
    ]);

    botaoSair?.addEventListener('click', () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('dev_empresa_contexto');
      window.location.replace('/');
    });

    const campoBusca = elementoPorIds([
      'searchInput',
      'search',
      'filtroBusca',
      'filterSearch'
    ]);

    campoBusca?.addEventListener('input', renderizarLista);

    [
      'statusFilter',
      'filterStatus',
      'filtroStatus',
      'priorityFilter',
      'filterPriority',
      'filtroPrioridade'
    ].forEach(id => {
      document.getElementById(id)?.addEventListener('change', renderizarLista);
    });

    document.addEventListener('click', event => {
      const item = event.target.closest('[data-ticket-id]');

      if (!item) return;

      selecionarTicket(item.dataset.ticketId);
    });
  }

  async function verificarAcesso() {
    if (!token()) {
      window.location.replace('/');
      return false;
    }

    const data = await apiRequest('/api/auth/me');

    const usuario =
      data?.dados?.usuario ||
      data?.usuario ||
      data?.dados ||
      data;

    if (usuario?.perfil !== 'dev') {
      window.location.replace('/');
      return false;
    }

    const nome = elementoPorIds(['user-name', 'userName']);
    const avatar = elementoPorIds(['user-avatar', 'userAvatar']);

    if (nome) {
      nome.textContent = usuario.nome || 'Desenvolvedor';
    }

    if (avatar) {
      avatar.textContent = (usuario.nome || 'D').charAt(0).toUpperCase();
    }

    return true;
  }

  async function iniciar() {
    configurarEventos();

    try {
      const autorizado = await verificarAcesso();

      if (autorizado) {
        await carregarSolicitacoes();
      }
    } catch (error) {
      console.error('Erro ao inicializar central de suporte:', error);

      mostrarMensagem(
        error.message || 'Não foi possível validar o acesso.',
        'error'
      );
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();