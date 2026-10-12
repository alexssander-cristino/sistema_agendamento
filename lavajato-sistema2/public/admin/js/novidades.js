
(() => {
  'use strict';

  // ============================================================
  // CONFIGURAÇÃO
  // ============================================================

  const API = '/api';
  const TOKEN_KEY = 'lavajato_auth_token';

  const ROTAS = {
    sessao: `${API}/auth/me`,
    novidades: `${API}/admin/novidades`
  };

  const CATEGORIAS = {
    novidade: 'Novidade',
    melhoria: 'Melhoria',
    correcao: 'Correção',
    aviso: 'Aviso'
  };

  const STATUS = {
    rascunho: 'Rascunho',
    publicada: 'Publicada',
    arquivada: 'Arquivada'
  };

  const elementos = {};

  let novidades = [];
  let salvando = false;
  let carregando = false;

  // ============================================================
  // ELEMENTOS HTML
  // ============================================================

  function obterElementos() {
    const ids = [
      'newsList',
      'newsLoading',
      'newsFeedback',
      'newsModal',
      'newsForm',
      'newsFormFeedback',
      'newsStatusFilter',
      'newsSearch',
      'newsCategoryFilter',
      'btnNovaNovidade',
      'btnAtualizarNovidades',
      'btnCriarPrimeiraNovidade',
      'btnFecharModal',
      'btnCancelarNovidade',
      'btnSalvarNovidade',
      'newsId',
      'newsTitle',
      'newsSummary',
      'newsCategory',
      'newsMessage',
      'newsLink',
      'newsModalTitle',
      'newsModalDescription',
      'newsEmpty',
      'statTotal',
      'statRascunhos',
      'statPublicadas',
      'statArquivadas'
    ];

    const ausentes = [];

    ids.forEach((id) => {
      const elemento = document.getElementById(id);

      if (elemento) {
        elementos[id] = elemento;
      } else {
        ausentes.push(id);
      }
    });

    if (ausentes.length) {
      console.error(
        '[Centro de Novidades] Elementos HTML não encontrados:',
        ausentes
      );
    }

    const obrigatorios = [
      'newsList',
      'newsLoading',
      'newsFeedback',
      'newsStatusFilter',
      'newsSearch',
      'newsCategoryFilter',
      'newsForm',
      'newsModal',
      'newsTitle',
      'newsSummary',
      'newsCategory',
      'newsMessage',
      'newsLink',
      'newsId',
      'btnSalvarNovidade'
    ];

    const faltantesObrigatorios = obrigatorios.filter(
      (id) => !elementos[id]
    );

    if (faltantesObrigatorios.length) {
      console.error(
        '[Centro de Novidades] Não é possível inicializar. Faltam:',
        faltantesObrigatorios
      );

      return false;
    }

    return true;
  }

  // ============================================================
  // UTILITÁRIOS
  // ============================================================

  function escaparHTML(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, (caractere) => {
      const mapa = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      };

      return mapa[caractere];
    });
  }

  function obterToken() {
    try {
      return (
        localStorage.getItem(TOKEN_KEY) ||
        sessionStorage.getItem(TOKEN_KEY) ||
        ''
      );
    } catch (erro) {
      console.error('Erro ao obter token:', erro);
      return '';
    }
  }

  function formatarData(valor) {
    if (!valor) return 'Data não informada';

    const data = new Date(valor);

    if (Number.isNaN(data.getTime())) {
      return 'Data não informada';
    }

    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(data);
  }

  function normalizarTexto(valor) {
    return String(valor ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function obterStatus(novidade) {
    return String(novidade.status || 'rascunho').toLowerCase();
  }

  function obterId(novidade) {
    return novidade.id ?? novidade.novidade_id ?? novidade.uuid;
  }

  function obterAutor(novidade) {
    const usuario = novidade.criador || novidade.usuario || {};

    return (
      novidade.criador_nome ||
      novidade.nome_criador ||
      novidade.autor ||
      usuario.nome ||
      'Administrador'
    );
  }

  function mostrarFeedback(mensagem, tipo = 'success') {
    const elemento = elementos.newsFeedback;

    if (!elemento) return;

    elemento.textContent = mensagem;
    elemento.className = `news-feedback ${tipo}`;
    elemento.hidden = false;

    elemento.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  }

  function limparFeedback() {
    const elemento = elementos.newsFeedback;

    if (!elemento) return;

    elemento.textContent = '';
    elemento.hidden = true;
    elemento.className = 'news-feedback';
  }

  function mostrarErroFormulario(mensagem) {
    const elemento = elementos.newsFormFeedback;

    if (!elemento) {
      window.alert(mensagem);
      return;
    }

    elemento.textContent = mensagem;
    elemento.hidden = false;
    elemento.className = 'news-form-feedback error';
  }

  function limparErroFormulario() {
    const elemento = elementos.newsFormFeedback;

    if (!elemento) return;

    elemento.textContent = '';
    elemento.hidden = true;
    elemento.className = 'news-form-feedback';
  }

  function definirCarregamento(ativo) {
    carregando = ativo;

    if (elementos.newsLoading) {
      elementos.newsLoading.hidden = !ativo;
    }

    if (elementos.btnAtualizarNovidades) {
      elementos.btnAtualizarNovidades.disabled = ativo;
      elementos.btnAtualizarNovidades.textContent = ativo
        ? 'Atualizando...'
        : 'Atualizar lista';
    }
  }

  // ============================================================
  // REQUISIÇÕES À API
  // ============================================================

  async function api(caminho, opcoes = {}) {
    const token = obterToken();

    if (!token) {
      throw new Error(
        'Sua sessão não foi encontrada. Entre novamente no painel administrativo.'
      );
    }

    const cabecalhos = new Headers(opcoes.headers || {});

    cabecalhos.set('Authorization', `Bearer ${token}`);
    cabecalhos.set('Accept', 'application/json');

    if (opcoes.body && !(opcoes.body instanceof FormData)) {
      cabecalhos.set('Content-Type', 'application/json');
    }

    let resposta;

    try {
      resposta = await fetch(caminho, {
        ...opcoes,
        headers: cabecalhos,
        credentials: 'same-origin'
      });
    } catch (erro) {
      console.error('Erro de conexão com a API:', erro);

      throw new Error(
        'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'
      );
    }

    const texto = await resposta.text();

    let dados = {};

    if (texto) {
      try {
        dados = JSON.parse(texto);
      } catch {
        dados = { mensagem: texto };
      }
    }

    if (resposta.status === 401) {
      throw new Error(
        'Sua sessão expirou. Entre novamente no painel administrativo.'
      );
    }

    if (resposta.status === 403) {
      throw new Error(
        'Acesso negado. Verifique se sua conta possui permissão de desenvolvedor.'
      );
    }

    if (!resposta.ok) {
      const mensagem =
        dados.mensagem ||
        dados.message ||
        dados.erro ||
        dados.error ||
        `O servidor retornou o erro ${resposta.status}.`;

      throw new Error(mensagem);
    }

    return dados;
  }

  // ============================================================
  // SESSÃO E PERMISSÕES
  // ============================================================

  async function verificarSessao() {
    const dados = await api(ROTAS.sessao);

    const usuario = dados.usuario || dados.user || dados;

    if (usuario.perfil !== 'dev') {
      throw new Error(
        'Esta área é exclusiva para usuários desenvolvedores.'
      );
    }

    return usuario;
  }

  // ============================================================
  // ESTATÍSTICAS
  // ============================================================

  function atualizarEstatisticas() {
    const total = novidades.length;

    const rascunhos = novidades.filter(
      (item) => obterStatus(item) === 'rascunho'
    ).length;

    const publicadas = novidades.filter(
      (item) => obterStatus(item) === 'publicada'
    ).length;

    const arquivadas = novidades.filter(
      (item) => obterStatus(item) === 'arquivada'
    ).length;

    elementos.statTotal.textContent = total;
    elementos.statRascunhos.textContent = rascunhos;
    elementos.statPublicadas.textContent = publicadas;
    elementos.statArquivadas.textContent = arquivadas;
  }

  // ============================================================
  // RENDERIZAÇÃO
  // ============================================================

  function criarCard(novidade) {
    const id = obterId(novidade);
    const status = obterStatus(novidade);

    const titulo = escaparHTML(novidade.titulo || 'Sem título');
    const resumo = escaparHTML(
      novidade.resumo || 'Nenhum resumo informado.'
    );

    const mensagem = escaparHTML(novidade.mensagem || '');
    const categoria = escaparHTML(
      CATEGORIAS[novidade.categoria] || novidade.categoria || 'Novidade'
    );

    const statusTexto = escaparHTML(STATUS[status] || status);
    const autor = escaparHTML(obterAutor(novidade));

    const data = formatarData(
      novidade.atualizada_em ||
      novidade.criada_em ||
      novidade.created_at
    );

    const idSeguro = escaparHTML(id ?? '');

    let botoes = '';

    if (status === 'rascunho') {
      botoes = `
        <button
          type="button"
          class="btn btn-ghost"
          data-acao="editar"
          data-id="${idSeguro}"
        >
          Editar
        </button>

        <button
          type="button"
          class="btn btn-primary"
          data-acao="publicar"
          data-id="${idSeguro}"
        >
          Publicar
        </button>

        <button
          type="button"
          class="btn btn-ghost"
          data-acao="arquivar"
          data-id="${idSeguro}"
        >
          Arquivar
        </button>
      `;
    } else if (status === 'publicada') {
      botoes = `
        <button
          type="button"
          class="btn btn-ghost"
          data-acao="arquivar"
          data-id="${idSeguro}"
        >
          Arquivar
        </button>
      `;
    }

    return `
      <article class="news-card" data-id="${idSeguro}">
        <div class="news-card-header">
          <div class="news-card-badges">
            <span class="news-category-badge">
              ${categoria}
            </span>

            <span class="news-status-badge status-${escaparHTML(status)}">
              ${statusTexto}
            </span>
          </div>
        </div>

        <div class="news-card-content">
          <h3>${titulo}</h3>
          <p class="news-card-summary">${resumo}</p>

          ${
            mensagem
              ? `<details class="news-card-details">
                   <summary>Ver conteúdo completo</summary>
                   <div class="news-card-message">${mensagem}</div>
                 </details>`
              : ''
          }

          ${
            novidade.link
              ? `<p class="news-card-link">
                   <a
                     href="${escaparHTML(novidade.link)}"
                     target="_blank"
                     rel="noopener noreferrer"
                   >Abrir link relacionado</a>
                 </p>`
              : ''
          }
        </div>

        <div class="news-card-meta">
          <span>Por ${autor}</span>
          <time>${escaparHTML(data)}</time>
        </div>

        ${
          botoes
            ? `<footer class="news-card-actions">${botoes}</footer>`
            : ''
        }
      </article>
    `;
  }

  function obterNovidadesFiltradas() {
    const busca = normalizarTexto(elementos.newsSearch.value);
    const statusFiltro = elementos.newsStatusFilter.value;
    const categoriaFiltro = elementos.newsCategoryFilter.value;

    return novidades.filter((item) => {
      const titulo = normalizarTexto(item.titulo);
      const resumo = normalizarTexto(item.resumo);
      const mensagem = normalizarTexto(item.mensagem);

      const correspondeBusca =
        !busca ||
        titulo.includes(busca) ||
        resumo.includes(busca) ||
        mensagem.includes(busca);

      const correspondeStatus =
        statusFiltro === 'todos' ||
        obterStatus(item) === statusFiltro;

      const correspondeCategoria =
        categoriaFiltro === 'todas' ||
        normalizarTexto(item.categoria) ===
          normalizarTexto(categoriaFiltro);

      return (
        correspondeBusca &&
        correspondeStatus &&
        correspondeCategoria
      );
    });
  }

  function renderizarNovidades() {
    const lista = obterNovidadesFiltradas();

    elementos.newsList.innerHTML = lista
      .map(criarCard)
      .join('');

    if (elementos.newsEmpty) {
      elementos.newsEmpty.hidden = lista.length > 0;
    }

    elementos.newsList.hidden = lista.length === 0;
  }

  // ============================================================
  // CARREGAR REGISTROS DO BANCO
  // ============================================================

  async function carregarNovidades() {
    if (carregando) return;

    limparFeedback();
    definirCarregamento(true);

    elementos.newsList.hidden = true;

    if (elementos.newsEmpty) {
      elementos.newsEmpty.hidden = true;
    }

    try {
      const dados = await api(ROTAS.novidades);

      let registros;

      if (Array.isArray(dados)) {
        registros = dados;
      } else {
        registros =
          dados.novidades ??
          dados.registros ??
          dados.items ??
          dados.data ??
          [];
      }

      if (!Array.isArray(registros)) {
        throw new Error(
          'O servidor não retornou uma lista válida de publicações.'
        );
      }

      novidades = registros;

      atualizarEstatisticas();
      renderizarNovidades();

      console.info(
        `[Centro de Novidades] ${novidades.length} registro(s) carregado(s).`
      );
    } catch (erro) {
      console.error('[Centro de Novidades]', erro);

      mostrarFeedback(
        erro.message || 'Não foi possível carregar as publicações.',
        'error'
      );

      elementos.newsList.innerHTML = '';
      elementos.newsList.hidden = true;

      if (elementos.newsEmpty) {
        elementos.newsEmpty.hidden = true;
      }
    } finally {
      definirCarregamento(false);
    }
  }

  // ============================================================
  // MODAL
  // ============================================================

  function abrirModal(novidade = null) {
    limparErroFormulario();

    elementos.newsForm.reset();

    elementos.newsId.value = novidade
      ? obterId(novidade) ?? ''
      : '';

    elementos.newsTitle.value = novidade?.titulo || '';
    elementos.newsSummary.value = novidade?.resumo || '';
    elementos.newsMessage.value = novidade?.mensagem || '';
    elementos.newsCategory.value = novidade?.categoria || 'novidade';
    elementos.newsLink.value = novidade?.link || '';

    const editando = Boolean(novidade);

    elementos.newsModalTitle.textContent = editando
      ? 'Editar publicação'
      : 'Nova publicação';

    if (elementos.newsModalDescription) {
      elementos.newsModalDescription.textContent = editando
        ? 'Altere as informações do rascunho.'
        : 'Preencha as informações para salvar a publicação como rascunho.';
    }

    elementos.btnSalvarNovidade.textContent = 'Salvar rascunho';
    elementos.btnSalvarNovidade.disabled = false;

    elementos.newsModal.hidden = false;
    document.body.classList.add('news-modal-open');

    window.setTimeout(() => {
      elementos.newsTitle.focus();
    }, 50);
  }

  function fecharModal() {
    if (salvando) return;

    elementos.newsModal.hidden = true;
    document.body.classList.remove('news-modal-open');

    limparErroFormulario();
  }

  function obterNovidadePorId(id) {
    return novidades.find(
      (item) => String(obterId(item)) === String(id)
    );
  }

  // ============================================================
  // VALIDAÇÃO E SALVAMENTO
  // ============================================================

  function obterPayload() {
    const titulo = elementos.newsTitle.value.trim();
    const resumo = elementos.newsSummary.value.trim();
    const mensagem = elementos.newsMessage.value.trim();
    const categoria = elementos.newsCategory.value;
    const link = elementos.newsLink.value.trim();

    if (!titulo) {
      throw new Error('Informe o título da publicação.');
    }

    if (titulo.length > 160) {
      throw new Error('O título deve ter no máximo 160 caracteres.');
    }

    if (resumo.length > 280) {
      throw new Error('O resumo deve ter no máximo 280 caracteres.');
    }

    if (!mensagem) {
      throw new Error('Informe o conteúdo completo da publicação.');
    }

    if (mensagem.length > 20000) {
      throw new Error(
        'O conteúdo deve ter no máximo 20.000 caracteres.'
      );
    }

    if (!Object.prototype.hasOwnProperty.call(CATEGORIAS, categoria)) {
      throw new Error('Selecione uma categoria válida.');
    }

    if (link) {
      let url;

      try {
        url = new URL(link);
      } catch {
        throw new Error('Informe um endereço válido para o link.');
      }

      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('O link deve utilizar HTTP ou HTTPS.');
      }
    }

    return {
      titulo,
      resumo,
      mensagem,
      categoria,
      link: link || null
    };
  }

  async function salvarRascunho(evento) {
    evento.preventDefault();

    if (salvando) return;

    limparErroFormulario();

    let payload;

    try {
      payload = obterPayload();
    } catch (erro) {
      mostrarErroFormulario(erro.message);
      return;
    }

    const id = elementos.newsId.value.trim();
    const editando = Boolean(id);

    salvando = true;
    elementos.btnSalvarNovidade.disabled = true;
    elementos.btnSalvarNovidade.textContent = 'Salvando...';

    try {
      const url = editando
        ? `${ROTAS.novidades}/${encodeURIComponent(id)}`
        : ROTAS.novidades;

      const resultado = await api(url, {
        method: editando ? 'PUT' : 'POST',
        body: JSON.stringify(payload)
      });

      elementos.newsModal.hidden = true;
      document.body.classList.remove('news-modal-open');

      mostrarFeedback(
        resultado.mensagem ||
          resultado.message ||
          (editando
            ? 'Rascunho atualizado com sucesso.'
            : 'Rascunho criado com sucesso.'),
        'success'
      );

      await carregarNovidades();
    } catch (erro) {
      console.error('Erro ao salvar publicação:', erro);
      mostrarErroFormulario(
        erro.message || 'Não foi possível salvar a publicação.'
      );
    } finally {
      salvando = false;
      elementos.btnSalvarNovidade.disabled = false;
      elementos.btnSalvarNovidade.textContent = 'Salvar rascunho';
    }
  }

  // ============================================================
  // PUBLICAR E ARQUIVAR
  // ============================================================

  async function executarAcao(acao, id) {
    if (!id) {
      mostrarFeedback('Identificador da publicação inválido.', 'error');
      return;
    }

    const novidade = obterNovidadePorId(id);

    if (!novidade) {
      mostrarFeedback('Publicação não encontrada na lista.', 'error');
      return;
    }

    const titulo = novidade.titulo || 'esta publicação';

    let mensagem;
    let caminho;

    if (acao === 'publicar') {
      mensagem =
        `Deseja publicar "${titulo}"?\n\n` +
        'Essa ação poderá gerar notificações para as empresas.';

      caminho =
        `${ROTAS.novidades}/${encodeURIComponent(id)}/publicar`;
    } else if (acao === 'arquivar') {
      mensagem =
        `Deseja arquivar "${titulo}"?\n\n` +
        'A publicação deixará de aparecer como conteúdo ativo.';

      caminho =
        `${ROTAS.novidades}/${encodeURIComponent(id)}/arquivar`;
    } else {
      return;
    }

    if (!window.confirm(mensagem)) return;

    limparFeedback();

    try {
      const resultado = await api(caminho, {
        method: 'POST'
      });

      mostrarFeedback(
        resultado.mensagem ||
          resultado.message ||
          (acao === 'publicar'
            ? 'Publicação realizada com sucesso.'
            : 'Publicação arquivada com sucesso.'),
        'success'
      );

      await carregarNovidades();
    } catch (erro) {
      console.error(`Erro ao ${acao} publicação:`, erro);

      mostrarFeedback(
        erro.message ||
          `Não foi possível ${acao} a publicação.`,
        'error'
      );
    }
  }

  // ============================================================
  // EVENTOS
  // ============================================================

  function registrarEventos() {
    elementos.btnNovaNovidade?.addEventListener('click', () => {
      abrirModal();
    });

    elementos.btnCriarPrimeiraNovidade?.addEventListener('click', () => {
      abrirModal();
    });

    elementos.btnFecharModal?.addEventListener('click', fecharModal);

    elementos.btnCancelarNovidade?.addEventListener('click', fecharModal);

    elementos.newsForm.addEventListener('submit', salvarRascunho);

    elementos.btnAtualizarNovidades?.addEventListener(
      'click',
      carregarNovidades
    );

    elementos.newsSearch.addEventListener('input', renderizarNovidades);

    elementos.newsStatusFilter.addEventListener(
      'change',
      renderizarNovidades
    );

    elementos.newsCategoryFilter.addEventListener(
      'change',
      renderizarNovidades
    );

    elementos.newsList.addEventListener('click', async (evento) => {
      const botao = evento.target.closest('button[data-acao][data-id]');

      if (!botao) return;

      const acao = botao.dataset.acao;
      const id = botao.dataset.id;

      if (acao === 'editar') {
        const novidade = obterNovidadePorId(id);

        if (!novidade) {
          mostrarFeedback('Publicação não encontrada.', 'error');
          return;
        }

        if (obterStatus(novidade) !== 'rascunho') {
          mostrarFeedback(
            'Somente rascunhos podem ser editados.',
            'error'
          );
          return;
        }

        abrirModal(novidade);
        return;
      }

      botao.disabled = true;

      try {
        await executarAcao(acao, id);
      } finally {
        botao.disabled = false;
      }
    });

    elementos.newsModal.addEventListener('click', (evento) => {
      if (evento.target.matches('[data-close-modal]')) {
        fecharModal();
      }
    });

    document.addEventListener('keydown', (evento) => {
      if (
        evento.key === 'Escape' &&
        elementos.newsModal &&
        !elementos.newsModal.hidden
      ) {
        fecharModal();
      }
    });
  }

  // ============================================================
  // INICIALIZAÇÃO
  // ============================================================

  async function iniciarPagina() {
    if (!obterElementos()) return;

    registrarEventos();

    try {
      await verificarSessao();
      await carregarNovidades();
    } catch (erro) {
      console.error('Erro ao inicializar Centro de Novidades:', erro);

      mostrarFeedback(
        erro.message ||
          'Não foi possível iniciar o Centro de Novidades.',
        'error'
      );

      elementos.newsLoading.hidden = true;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarPagina, {
      once: true
    });
  } else {
    iniciarPagina();
  }
})();
