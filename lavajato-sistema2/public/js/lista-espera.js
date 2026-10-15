
(() => {
  'use strict';

  // ============================================================
  // CONFIGURAÇÃO
  // ============================================================

  const API = '/api/lista-espera';
  const API_SERVICOS = '/api/servicos';

  const TOKEN_KEYS = [
    'orvix_auth_token',
    'lavajato_auth_token',
    'token'
  ];

  const STATUS_LABELS = {
    aguardando: 'Aguardando',
    contatado: 'Contatado',
    confirmado: 'Confirmado',
    convertido: 'Convertido',
    desistiu: 'Desistiu'
  };

  const PERIOD_LABELS = {
    qualquer: 'Qualquer horário',
    manha: 'Manhã',
    tarde: 'Tarde',
    noite: 'Noite'
  };

  const state = {
    itens: [],
    servicos: [],
    sugestaoAtiva: false,
    carregandoFila: false,
    carregandoServicos: false,
    salvando: false
  };

  const el = (id) => document.getElementById(id);

  // ============================================================
  // AUTENTICAÇÃO E REQUISIÇÕES
  // ============================================================

  function obterToken() {
    for (const chave of TOKEN_KEYS) {
      const valor = localStorage.getItem(chave);

      if (valor) return valor;
    }

    return null;
  }

  async function requisicao(url, opcoes = {}) {
    const headers = {
      Accept: 'application/json',
      ...(opcoes.body
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(opcoes.headers || {})
    };

    const token = obterToken();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const resposta = await fetch(url, {
      ...opcoes,
      headers,
      credentials: 'same-origin',
      cache: 'no-store'
    });

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok) {
      if (resposta.status === 401) {
        throw new Error(
          'Sua sessão expirou. Entre novamente no sistema.'
        );
      }

      if (resposta.status === 403) {
        throw new Error(
          dados.erro ||
          dados.mensagem ||
          'Você não tem permissão para executar esta ação.'
        );
      }

      throw new Error(
        dados.erro ||
        dados.mensagem ||
        `Não foi possível concluir a solicitação (HTTP ${resposta.status}).`
      );
    }

    return dados;
  }

  // ============================================================
  // UTILITÁRIOS
  // ============================================================

  function criarElemento(tag, classe = '', texto = '') {
    const elemento = document.createElement(tag);

    if (classe) {
      elemento.className = classe;
    }

    if (texto !== undefined && texto !== null) {
      elemento.textContent = String(texto);
    }

    return elemento;
  }

  function adicionarOpcao(select, valor, texto) {
    if (!select) return;

    const opcao = document.createElement('option');
    opcao.value = String(valor);
    opcao.textContent = texto;

    select.appendChild(opcao);
  }

  function normalizarTexto(valor) {
    return String(valor ?? '')
      .trim()
      .toLocaleLowerCase('pt-BR');
  }

  function dataLocalISO() {
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');

    return `${ano}-${mes}-${dia}`;
  }

  function formatarData(valor) {
    if (!valor) return 'Qualquer data';

    const texto = String(valor);
    const correspondencia = texto.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );

    if (correspondencia) {
      return (
        `${correspondencia[3]}/` +
        `${correspondencia[2]}/` +
        `${correspondencia[1]}`
      );
    }

    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) {
      return texto;
    }

    return data.toLocaleDateString('pt-BR');
  }

  function formatarHora(valor) {
    if (!valor) return '';

    return String(valor).slice(0, 5);
  }

  function diasNaFila(valor) {
    if (!valor) return 0;

    const data = new Date(valor).getTime();

    if (Number.isNaN(data)) return 0;

    return Math.max(
      0,
      Math.floor((Date.now() - data) / 86400000)
    );
  }

  function nomeDoCliente(item) {
    return item.nome_exibicao || item.cliente || 'Cliente sem nome';
  }

  function mostrarMensagem(texto, tipo = 'success') {
    const caixa = el('formMessage');

    if (!caixa) {
      if (tipo === 'error') alert(texto);
      return;
    }

    caixa.textContent = texto;
    caixa.className = `message visible ${tipo}`;

    if (tipo === 'success') {
      window.setTimeout(() => {
        caixa.className = 'message';
      }, 5000);
    }
  }

  function mostrarEstado(titulo, descricao) {
    const lista = el('waitList');

    if (!lista) return;

    const estado = criarElemento('div', 'state');

    estado.append(
      criarElemento('strong', '', titulo),
      criarElemento('span', '', descricao)
    );

    lista.replaceChildren(estado);
  }

  function definirBotao(botao, carregando, textoNormal, textoCarregando) {
    if (!botao) return;

    botao.disabled = carregando;
    botao.textContent = carregando ? textoCarregando : textoNormal;
  }

  // ============================================================
  // TEMA
  // ============================================================

  function configurarTema() {
    const botao = el('themeButton');

    function aplicarTema(tema) {
      if (tema === 'dark') {
        document.documentElement.dataset.theme = 'dark';
      } else {
        document.documentElement.removeAttribute('data-theme');
      }

      localStorage.setItem('orvix-theme', tema);
    }

    const temaSalvo = localStorage.getItem('orvix-theme');

    if (temaSalvo === 'dark') {
      aplicarTema('dark');
    }

    if (botao) {
      botao.addEventListener('click', () => {
        const atual =
          document.documentElement.dataset.theme === 'dark'
            ? 'dark'
            : 'light';

        aplicarTema(atual === 'dark' ? 'light' : 'dark');
      });
    }
  }

  // ============================================================
  // CARREGAMENTO DE SERVIÇOS
  // ============================================================

  function extrairListaServicos(dados) {
    if (Array.isArray(dados)) return dados;
    if (Array.isArray(dados.servicos)) return dados.servicos;
    if (Array.isArray(dados.dados)) return dados.dados;
    if (Array.isArray(dados.items)) return dados.items;

    return [];
  }

  async function carregarServicos() {
    if (state.carregandoServicos) return;

    state.carregandoServicos = true;

    const selectCadastro = el('serviceId');
    const selectHorario = el('slotServiceId');

    try {
      const dados = await requisicao(API_SERVICOS);
      const servicos = extrairListaServicos(dados);

      state.servicos = servicos.filter((servico) => {
        if (servico.ativo === false) return false;
        if (servico.ativo === 0) return false;

        return true;
      });

      for (const servico of state.servicos) {
        if (!servico.id || !servico.nome) continue;

        adicionarOpcao(
          selectCadastro,
          servico.id,
          servico.nome
        );

        adicionarOpcao(
          selectHorario,
          servico.id,
          servico.nome
        );
      }
    } catch (erro) {
      console.error(
        '[Lista de Espera] Erro ao carregar serviços:',
        erro
      );

      mostrarMensagem(
        'Não foi possível carregar os serviços. Você ainda pode cadastrar clientes sem selecionar um serviço.',
        'error'
      );
    } finally {
      state.carregandoServicos = false;
    }
  }

  // ============================================================
  // RESUMO
  // ============================================================

  function atualizarResumo() {
    const itens = state.itens;

    const contagens = {
      aguardando: itens.filter(
        (item) => item.status === 'aguardando'
      ).length,

      contatado: itens.filter(
        (item) => item.status === 'contatado'
      ).length,

      confirmado: itens.filter(
        (item) => item.status === 'confirmado'
      ).length,

      convertido: itens.filter(
        (item) => item.status === 'convertido'
      ).length
    };

    if (el('waitingCount')) {
      el('waitingCount').textContent = contagens.aguardando;
    }

    if (el('contactedCount')) {
      el('contactedCount').textContent = contagens.contatado;
    }

    if (el('confirmedCount')) {
      el('confirmedCount').textContent = contagens.confirmado;
    }

    if (el('convertedCount')) {
      el('convertedCount').textContent = contagens.convertido;
    }
  }

  // ============================================================
  // FILTROS
  // ============================================================

  function obterItensFiltrados() {
    const campoPesquisa = el('searchInput');
    const campoStatus = el('statusFilter');

    const termo = normalizarTexto(
      campoPesquisa ? campoPesquisa.value : ''
    );

    const status = campoStatus ? campoStatus.value : '';

    return state.itens.filter((item) => {
      if (status && item.status !== status) {
        return false;
      }

      if (termo) {
        const conteudo = [
          item.nome_exibicao,
          item.cliente,
          item.telefone,
          item.servico_nome,
          item.observacoes,
          item.status
        ]
          .filter(Boolean)
          .join(' ');

        if (!normalizarTexto(conteudo).includes(termo)) {
          return false;
        }
      }

      return true;
    });
  }

  // ============================================================
  // CONTATO PELO WHATSAPP
  // ============================================================

  function abrirWhatsApp(item) {
    const telefone = String(item.telefone || '').replace(/\D/g, '');

    if (telefone.length < 10 || telefone.length > 15) {
      alert(
        'O telefone cadastrado parece inválido. Corrija o número antes de contatar o cliente.'
      );
      return false;
    }

    const numero = telefone.startsWith('55')
      ? telefone
      : `55${telefone}`;

    const data = el('slotDate')?.value || item.data_desejada || '';
    const hora = el('slotTime')?.value || '';

    const horario = [
      data ? `no dia ${formatarData(data)}` : '',
      hora ? `às ${formatarHora(hora)}` : ''
    ].filter(Boolean).join(' ');

    const servicoSelecionado =
      el('slotServiceId')?.selectedOptions?.[0]?.textContent || '';

    const servico =
      servicoSelecionado &&
      el('slotServiceId').value
        ? servicoSelecionado
        : item.servico_nome || '';

    let mensagem =
      `Olá, ${nomeDoCliente(item)}! ` +
      'Surgiu uma oportunidade de horário';

    if (horario) {
      mensagem += ` ${horario}`;
    }

    if (servico) {
      mensagem += ` para ${servico}`;
    }

    mensagem += '. Você tem interesse?';

    const url =
      `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;

    // Abre a página de contato. O envio da mensagem continua manual.
    const janela = window.open(
      url,
      '_blank',
      'noopener,noreferrer'
    );

    return Boolean(janela);
  }

  // ============================================================
  // ATUALIZAR STATUS
  // ============================================================

  async function mudarStatus(id, status) {
    if (!id || !STATUS_LABELS[status]) {
      alert('Registro ou status inválido.');
      return;
    }

    try {
      await requisicao(`${API}/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });

      await carregarFila();

      mostrarMensagem(
        `Status atualizado para "${STATUS_LABELS[status]}".`
      );
    } catch (erro) {
      console.error(
        '[Lista de Espera] Erro ao atualizar status:',
        erro
      );

      alert(erro.message);
    }
  }

  // ============================================================
  // EXCLUIR REGISTRO
  // ============================================================

  async function excluirItem(id) {
    const confirmar = window.confirm(
      'Deseja remover definitivamente este cliente da lista de espera?'
    );

    if (!confirmar) return;

    try {
      await requisicao(`${API}/${id}`, {
        method: 'DELETE'
      });

      await carregarFila();

      mostrarMensagem('Cliente removido da lista de espera.');
    } catch (erro) {
      console.error(
        '[Lista de Espera] Erro ao excluir:',
        erro
      );

      alert(erro.message);
    }
  }

  // ============================================================
  // CRIAR AÇÕES DOS REGISTROS
  // ============================================================

  function criarBotaoAcao(texto, classe, callback) {
    const botao = criarElemento('button', `btn ${classe}`, texto);

    botao.type = 'button';

    botao.addEventListener('click', callback);

    return botao;
  }

  function criarAcoes(item) {
    const acoes = criarElemento('div', 'item-actions');

    if (
      item.status === 'aguardando' ||
      item.status === 'contatado'
    ) {
      acoes.appendChild(
        criarBotaoAcao(
          'Contatar via WhatsApp',
          '',
          async () => {
            const abriu = abrirWhatsApp(item);

            if (abriu && item.status === 'aguardando') {
              await mudarStatus(item.id, 'contatado');
            }
          }
        )
      );
    }

    if (item.status === 'aguardando') {
      acoes.appendChild(
        criarBotaoAcao(
          'Marcar contatado',
          '',
          () => mudarStatus(item.id, 'contatado')
        )
      );
    }

    if (
      item.status === 'aguardando' ||
      item.status === 'contatado'
    ) {
      acoes.appendChild(
        criarBotaoAcao(
          'Confirmar interesse',
          'btn-primary',
          () => {
            const confirmou = window.confirm(
              'O cliente confirmou que deseja aproveitar o horário?'
            );

            if (confirmou) {
              mudarStatus(item.id, 'confirmado');
            }
          }
        )
      );
    }

    if (item.status === 'confirmado') {
      acoes.appendChild(
        criarBotaoAcao(
          'Abrir agenda',
          'btn-primary',
          () => {
            window.location.href = '/index.html#agenda';
          }
        )
      );

      acoes.appendChild(
        criarBotaoAcao(
          'Marcar convertido',
          '',
          async () => {
            const confirmou = window.confirm(
              'Confirma que o agendamento já foi criado na agenda?'
            );

            if (confirmou) {
              await mudarStatus(item.id, 'convertido');
            }
          }
        )
      );
    }

    if (
      item.status !== 'convertido' &&
      item.status !== 'desistiu'
    ) {
      acoes.appendChild(
        criarBotaoAcao(
          'Marcar desistência',
          'btn-danger',
          async () => {
            const confirmou = window.confirm(
              'Confirma que o cliente desistiu da lista de espera?'
            );

            if (confirmou) {
              await mudarStatus(item.id, 'desistiu');
            }
          }
        )
      );
    }

    acoes.appendChild(
      criarBotaoAcao(
        'Remover',
        'btn-danger',
        () => excluirItem(item.id)
      )
    );

    return acoes;
  }

  // ============================================================
  // RENDERIZAR FILA
  // ============================================================

  function renderizarFila() {
    const lista = el('waitList');

    if (!lista) return;

    const itensFiltrados = obterItensFiltrados();

    lista.replaceChildren();

    if (itensFiltrados.length === 0) {
      mostrarEstado(
        state.itens.length
          ? 'Nenhum cliente encontrado'
          : 'A lista está vazia',
        state.itens.length
          ? 'Altere os filtros ou a pesquisa.'
          : 'Cadastre um cliente para começar.'
      );

      return;
    }

    for (const item of itensFiltrados) {
      const card = criarElemento('article', 'wait-item');
      const topo = criarElemento('div', 'item-top');
      const info = criarElemento('div', '');

      info.appendChild(
        criarElemento(
          'div',
          'item-name',
          nomeDoCliente(item)
        )
      );

      const subtitulo = [
        item.telefone || 'Sem telefone',
        item.servico_nome || ''
      ].filter(Boolean).join(' · ');

      info.appendChild(
        criarElemento('div', 'item-subtitle', subtitulo)
      );

      const pontuacao = Number(item.pontuacao || 0);

      topo.append(
        info,
        criarElemento('span', 'score', `${pontuacao} pts`)
      );

      const chips = criarElemento('div', 'chips');

      const statusChip = criarElemento(
        'span',
        'chip status',
        STATUS_LABELS[item.status] || item.status
      );

      statusChip.dataset.status = item.status || '';

      chips.appendChild(statusChip);

      chips.appendChild(
        criarElemento(
          'span',
          'chip',
          formatarData(item.data_desejada)
        )
      );

      chips.appendChild(
        criarElemento(
          'span',
          'chip',
          PERIOD_LABELS[item.periodo_preferido] ||
            'Qualquer horário'
        )
      );

      if (item.hora_inicio || item.hora_fim) {
        chips.appendChild(
          criarElemento(
            'span',
            'chip',
            `${formatarHora(item.hora_inicio) || 'Sem início'} – ` +
            `${formatarHora(item.hora_fim) || 'Sem fim'}`
          )
        );
      }

      chips.appendChild(
        criarElemento(
          'span',
          'chip',
          `Na fila há ${diasNaFila(item.criado_em)} dia(s)`
        )
      );

      if (item.observacoes) {
        chips.appendChild(
          criarElemento(
            'span',
            'chip',
            `Observação: ${item.observacoes}`
          )
        );
      }

      card.append(
        topo,
        chips,
        criarAcoes(item)
      );

      lista.appendChild(card);
    }

    const rodape = el('listFooter');

    if (rodape) {
      rodape.textContent =
        `${itensFiltrados.length} de ${state.itens.length} cliente(s) exibido(s).`;
    }
  }

  // ============================================================
  // CARREGAR FILA
  // ============================================================

  async function carregarFila() {
    if (state.carregandoFila) return;

    state.carregandoFila = true;

    const botao = el('refreshButton');

    definirBotao(
      botao,
      true,
      'Atualizar fila',
      'Atualizando...'
    );

    try {
      const parametros = new URLSearchParams();
      const status = el('statusFilter')?.value || '';

      if (status) {
        parametros.set('status', status);
      }

      if (state.sugestaoAtiva) {
        const data = el('slotDate')?.value || '';
        const hora = el('slotTime')?.value || '';
        const servicoId = el('slotServiceId')?.value || '';

        if (data) parametros.set('data', data);
        if (hora) parametros.set('hora', hora);

        if (servicoId) {
          parametros.set('servico_id', servicoId);
        }
      }

      const query = parametros.toString();

      const resposta = await requisicao(
        `${API}${query ? `?${query}` : ''}`
      );

      state.itens = Array.isArray(resposta.itens)
        ? resposta.itens
        : [];

      atualizarResumo();
      renderizarFila();

      const rodape = el('listFooter');

      if (rodape) {
        rodape.textContent =
          `${state.itens.length} cliente(s) carregado(s). ` +
          'A pontuação considera as regras de compatibilidade da API.';
      }
    } catch (erro) {
      console.error(
        '[Lista de Espera] Erro ao carregar fila:',
        erro
      );

      mostrarEstado(
        'Não foi possível carregar a lista',
        erro.message || 'Verifique sua conexão e tente novamente.'
      );
    } finally {
      state.carregandoFila = false;

      definirBotao(
        botao,
        false,
        'Atualizar fila',
        'Atualizando...'
      );
    }
  }

  // ============================================================
  // CADASTRAR CLIENTE
  // ============================================================

  async function cadastrarCliente(evento) {
    evento.preventDefault();

    if (state.salvando) return;

    const formulario = el('waitForm');

    if (!formulario) return;

    if (!formulario.reportValidity()) return;

    const botao = el('saveButton');
    const formData = new FormData(formulario);
    const body = Object.fromEntries(formData.entries());

    body.cliente = String(body.cliente || '').trim();
    body.telefone = String(body.telefone || '').trim();
    body.observacoes = String(body.observacoes || '').trim();

    body.periodo_preferido =
      body.periodo_preferido || 'qualquer';

    if (body.servico_id) {
      body.servico_id = Number(body.servico_id);
    } else {
      delete body.servico_id;
    }

    if (!body.data_desejada) delete body.data_desejada;
    if (!body.hora_inicio) delete body.hora_inicio;
    if (!body.hora_fim) delete body.hora_fim;

    if (
      body.hora_inicio &&
      body.hora_fim &&
      body.hora_inicio >= body.hora_fim
    ) {
      mostrarMensagem(
        'O horário final precisa ser posterior ao inicial.',
        'error'
      );

      return;
    }

    if (!body.cliente || !body.telefone) {
      mostrarMensagem(
        'Preencha o nome e o telefone do cliente.',
        'error'
      );

      return;
    }

    state.salvando = true;

    definirBotao(
      botao,
      true,
      'Adicionar à fila',
      'Salvando...'
    );

    try {
      const resposta = await requisicao(API, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      formulario.reset();
      state.sugestaoAtiva = false;

      mostrarMensagem(
        resposta.mensagem ||
        'Cliente adicionado à lista de espera.'
      );

      await carregarFila();
    } catch (erro) {
      console.error(
        '[Lista de Espera] Erro ao cadastrar cliente:',
        erro
      );

      mostrarMensagem(erro.message, 'error');
    } finally {
      state.salvando = false;

      definirBotao(
        botao,
        false,
        'Adicionar à fila',
        'Salvando...'
      );
    }
  }

  // ============================================================
  // SUGESTÃO DE CLIENTES PARA HORÁRIO LIVRE
  // ============================================================

  function pesquisarCompatibilidade() {
    const data = el('slotDate')?.value || '';
    const hora = el('slotTime')?.value || '';

    if (!data) {
      alert('Informe a data do horário liberado.');
      el('slotDate')?.focus();
      return;
    }

    if (data < dataLocalISO()) {
      alert('A data do horário liberado não pode estar no passado.');
      return;
    }

    if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) {
      alert('Informe um horário válido.');
      return;
    }

    state.sugestaoAtiva = true;

    carregarFila();
  }

  function limparSugestao() {
    if (el('slotDate')) el('slotDate').value = '';
    if (el('slotTime')) el('slotTime').value = '';

    if (el('slotServiceId')) {
      el('slotServiceId').value = '';
    }

    state.sugestaoAtiva = false;

    carregarFila();
  }

  // ============================================================
  // EVENTOS
  // ============================================================

  function configurarEventos() {
    const formulario = el('waitForm');

    if (formulario) {
      formulario.addEventListener(
        'submit',
        cadastrarCliente
      );
    }

    const atualizar = el('refreshButton');

    if (atualizar) {
      atualizar.addEventListener('click', carregarFila);
    }

    const pesquisa = el('searchInput');

    if (pesquisa) {
      pesquisa.addEventListener('input', renderizarFila);
    }

    const status = el('statusFilter');

    if (status) {
      status.addEventListener('change', carregarFila);
    }

    const sugerir = el('suggestButton');

    if (sugerir) {
      sugerir.addEventListener(
        'click',
        pesquisarCompatibilidade
      );
    }

    const limpar = el('clearSuggestion');

    if (limpar) {
      limpar.addEventListener('click', limparSugestao);
    }

    const data = el('slotDate');

    if (data) {
      data.min = dataLocalISO();
    }
  }

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  async function iniciar() {
    configurarTema();
    configurarEventos();

    // Os serviços e a fila são carregados independentemente.
    await Promise.allSettled([
      carregarServicos(),
      carregarFila()
    ]);
  }

  iniciar();
})();
