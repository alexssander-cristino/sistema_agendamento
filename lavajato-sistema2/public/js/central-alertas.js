
(() => {
  'use strict';

  const API_URL = '/api/central-alertas';

  const TOKEN_KEYS = [
    'orvix_auth_token',
    'lavajato_auth_token',
    'token'
  ];

  const state = {
    alertas: [],
    carregando: false
  };

  const elementos = {
    total: document.getElementById('totalCount'),
    alta: document.getElementById('highCount'),
    media: document.getElementById('mediumCount'),
    baixa: document.getElementById('lowCount'),
    resultado: document.getElementById('resultCount'),
    lista: document.getElementById('alertList'),
    atualizado: document.getElementById('lastUpdated'),
    pesquisa: document.getElementById('searchInput'),
    categoria: document.getElementById('categoryFilter'),
    prioridade: document.getElementById('priorityFilter'),
    atualizar: document.getElementById('refreshButton'),
    tema: document.getElementById('themeButton')
  };

  const categorias = {
    agendamentos: 'Agendamentos',
    pagamentos: 'Pagamentos',
    financeiro: 'Financeiro',
    clientes: 'Clientes',
    inconsistencias: 'Inconsistências'
  };

  const prioridades = {
    alta: 'Alta',
    media: 'Média',
    baixa: 'Baixa'
  };

  const icones = {
    agendamentos: 'A',
    pagamentos: 'R$',
    financeiro: '$',
    clientes: 'C',
    inconsistencias: '!'
  };

  function obterToken() {
    for (const chave of TOKEN_KEYS) {
      const token = localStorage.getItem(chave);

      if (token) return token;
    }

    return null;
  }

  function formatarData(valor) {
    if (!valor) return 'Data não informada';

    // Evita interpretar YYYY-MM-DD como UTC e deslocar a data
    // para o dia anterior em alguns fusos horários.
    const texto = String(valor);
    const apenasData = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (apenasData) {
      return `${apenasData[3]}/${apenasData[2]}/${apenasData[1]}`;
    }

    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) {
      return texto;
    }

    return data.toLocaleDateString('pt-BR');
  }

  function formatarMoeda(valor) {
    if (valor === null || valor === undefined || valor === '') {
      return '';
    }

    const numero = Number(valor);

    if (!Number.isFinite(numero)) return '';

    return numero.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function criarElemento(tag, classe, texto) {
    const elemento = document.createElement(tag);

    if (classe) elemento.className = classe;
    if (texto !== undefined) elemento.textContent = texto;

    return elemento;
  }

  function mostrarEstado(titulo, descricao) {
    elementos.lista.replaceChildren();

    const estado = criarElemento('div', 'state');
    estado.append(
      criarElemento('strong', '', titulo),
      criarElemento('span', '', descricao)
    );

    elementos.lista.appendChild(estado);
  }

  function atualizarResumo() {
    const alertas = state.alertas;

    elementos.total.textContent = alertas.length;
    elementos.alta.textContent = alertas.filter(
      (a) => a.prioridade === 'alta'
    ).length;
    elementos.media.textContent = alertas.filter(
      (a) => a.prioridade === 'media'
    ).length;
    elementos.baixa.textContent = alertas.filter(
      (a) => a.prioridade === 'baixa'
    ).length;
  }

  function obterAlertasFiltrados() {
    const termo = elementos.pesquisa.value
      .trim()
      .toLocaleLowerCase('pt-BR');

    const categoria = elementos.categoria.value;
    const prioridade = elementos.prioridade.value;

    return state.alertas.filter((alerta) => {
      if (categoria && alerta.categoria !== categoria) {
        return false;
      }

      if (prioridade && alerta.prioridade !== prioridade) {
        return false;
      }

      if (termo) {
        const conteudo = [
          alerta.titulo,
          alerta.descricao,
          categorias[alerta.categoria] || alerta.categoria
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('pt-BR');

        if (!conteudo.includes(termo)) return false;
      }

      return true;
    });
  }

  function destinoSeguro(destino) {
    if (typeof destino !== 'string' || !destino.startsWith('/')) {
      return '/index.html';
    }

    // Aceita apenas destinos internos ao site.
    if (destino.startsWith('//') || destino.includes('\\')) {
      return '/index.html';
    }

    try {
      const url = new URL(destino, window.location.origin);

      if (url.origin !== window.location.origin) {
        return '/index.html';
      }

      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return '/index.html';
    }
  }

  function renderizarAlertas() {
    const alertas = obterAlertasFiltrados();

    elementos.resultado.textContent =
      `${alertas.length} de ${state.alertas.length} alerta(s)`;

    elementos.lista.replaceChildren();

    if (alertas.length === 0) {
      mostrarEstado(
        state.alertas.length ? 'Nenhum resultado encontrado' : 'Tudo em dia',
        state.alertas.length
          ? 'Tente mudar os filtros ou os termos da pesquisa.'
          : 'Não há alertas para exibir neste momento.'
      );
      return;
    }

    for (const alerta of alertas) {
      const item = criarElemento('article', 'alert');
      item.dataset.priority = alerta.prioridade || 'baixa';

      const icone = criarElemento(
        'div',
        'alert-icon',
        icones[alerta.categoria] || '!'
      );
      icone.setAttribute('aria-hidden', 'true');

      const conteudo = criarElemento('div', 'alert-content');
      const titulo = criarElemento(
        'h3',
        'alert-title',
        alerta.titulo || 'Alerta'
      );

      const descricao = criarElemento(
        'p',
        'alert-description',
        alerta.descricao || 'Sem detalhes adicionais.'
      );

      const meta = criarElemento('div', 'alert-meta');

      const prioridadeClasse = {
        alta: 'high',
        media: 'medium',
        baixa: 'low'
      }[alerta.prioridade] || '';

      meta.appendChild(
        criarElemento(
          'span',
          `pill ${prioridadeClasse}`.trim(),
          prioridades[alerta.prioridade] || 'Não definida'
        )
      );

      meta.appendChild(
        criarElemento(
          'span',
          'pill',
          categorias[alerta.categoria] || 'Outros'
        )
      );

      if (alerta.data) {
        meta.appendChild(
          criarElemento('span', 'pill', formatarData(alerta.data))
        );
      }

      if (alerta.valor !== null && alerta.valor !== undefined) {
        meta.appendChild(
          criarElemento('span', 'pill', formatarMoeda(alerta.valor))
        );
      }

      conteudo.append(titulo, descricao, meta);

      const acao = criarElemento('a', 'alert-action', 'Resolver →');
      acao.href = destinoSeguro(alerta.destino);
      acao.setAttribute(
        'aria-label',
        `Resolver: ${alerta.titulo || 'alerta'}`
      );

      item.append(icone, conteudo, acao);
      elementos.lista.appendChild(item);
    }
  }

  async function carregarAlertas() {
    if (state.carregando) return;

    state.carregando = true;
    elementos.atualizar.disabled = true;
    elementos.atualizar.textContent = 'Atualizando...';

    mostrarEstado('Carregando alertas', 'Consultando os registros da empresa.');

    try {
      const headers = {
        Accept: 'application/json'
      };

      const token = obterToken();

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const resposta = await fetch(API_URL, {
        method: 'GET',
        headers,
        credentials: 'same-origin',
        cache: 'no-store'
      });

      if (resposta.status === 401 || resposta.status === 403) {
        throw new Error(
          'Sua sessão expirou ou você não tem acesso a esta área. Entre novamente e tente outra vez.'
        );
      }

      if (!resposta.ok) {
        throw new Error(
          `A API retornou um erro HTTP ${resposta.status}.`
        );
      }

      const dados = await resposta.json();

      if (!dados.sucesso || !Array.isArray(dados.alertas)) {
        throw new Error(
          dados.mensagem || 'A resposta da API está em formato inesperado.'
        );
      }

      state.alertas = dados.alertas;

      atualizarResumo();
      renderizarAlertas();

      elementos.atualizado.textContent =
        `Última atualização: ${new Date().toLocaleString('pt-BR')}`;
    } catch (erro) {
      console.error('[Central de Alertas]', erro);

      mostrarEstado(
        'Não foi possível carregar os alertas',
        erro.message || 'Verifique a conexão e tente novamente.'
      );

      elementos.resultado.textContent = 'Falha ao carregar';
    } finally {
      state.carregando = false;
      elementos.atualizar.disabled = false;
      elementos.atualizar.textContent = 'Atualizar alertas';
    }
  }

  function configurarTema() {
    const temaSalvo = localStorage.getItem('orvix-theme');

    if (temaSalvo === 'dark') {
      document.documentElement.dataset.theme = 'dark';
    }

    elementos.tema.addEventListener('click', () => {
      const atual = document.documentElement.dataset.theme;
      const novo = atual === 'dark' ? 'light' : 'dark';

      document.documentElement.dataset.theme =
        novo === 'dark' ? 'dark' : '';

      localStorage.setItem('orvix-theme', novo);
    });
  }

  elementos.pesquisa.addEventListener('input', renderizarAlertas);
  elementos.categoria.addEventListener('change', renderizarAlertas);
  elementos.prioridade.addEventListener('change', renderizarAlertas);
  elementos.atualizar.addEventListener('click', carregarAlertas);

  configurarTema();
  carregarAlertas();
})();
