/* ============================================================
   ORVIX — CONFIGURAÇÕES
   Carregar DEPOIS do app.js.
   ============================================================ */

(() => {
  'use strict';

  // ==========================================================
  // CONSTANTES
  // ==========================================================

  const AUTH_TOKEN_KEY = 'lavajato_auth_token';

  const CORES_PADRAO = {
    primaria: '#0E3A4C',
    destaque: '#06B6C4',
    fundo: '#F5F7FA'
  };

  const NICHOS_VALIDOS = [
    'lavajato',
    'barbearia',
    'clinica',
    'pet',
    'oficina',
    'personal',
    'generico'
  ];

  const INTERVALOS_AGENDA_VALIDOS = [15, 30, 45, 60, 90, 120];

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const COR_REGEX = /^#[0-9A-Fa-f]{6}$/;
  const HORARIO_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;


  // ==========================================================
  // FUNÇÕES AUXILIARES
  // ==========================================================

  function elemento(id) {
    return document.getElementById(id);
  }


  function obterToken() {
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY) || '';
    } catch (error) {
      return '';
    }
  }


  function ehCheckbox(el) {
    return el && (el.type === 'checkbox' || el.type === 'radio');
  }


  function obterValor(id, fallback = '') {

    const el = elemento(id);

    if (!el) {
      return fallback;
    }

    if (ehCheckbox(el)) {
      return el.checked;
    }

    return el.value ?? fallback;
  }


  function obterTexto(id, fallback = '') {
    return String(obterValor(id, fallback) ?? '').trim();
  }


  function obterBooleano(id, fallback = false) {

    const el = elemento(id);

    if (!el) {
      return fallback;
    }

    if (ehCheckbox(el)) {
      return Boolean(el.checked);
    }

    const valor = String(el.value || '').trim().toLowerCase();

    if (valor === 'true') {
      return true;
    }

    if (valor === 'false') {
      return false;
    }

    return fallback;
  }


  /*
   * Campos que podem ser checkbox (booleano) ou texto/select,
   * dependendo do HTML (ex.: telefone_documentos, dashboard_inicial).
   * Lê no formato compatível com o elemento existente.
   */
  function obterValorFlexivel(id, fallback) {

    const el = elemento(id);

    if (!el) {
      return fallback;
    }

    if (ehCheckbox(el)) {
      return Boolean(el.checked);
    }

    const valor = String(el.value ?? '').trim();

    if (valor === 'true') {
      return true;
    }

    if (valor === 'false') {
      return false;
    }

    return valor === '' ? fallback : valor;
  }


  function definirValor(id, valor) {

    const el = elemento(id);

    if (!el) {
      return;
    }

    if (ehCheckbox(el)) {
      el.checked = Boolean(valor);
      return;
    }

    el.value = valor ?? '';
  }


  function definirValorFlexivel(id, valor) {

    const el = elemento(id);

    if (!el) {
      return;
    }

    if (ehCheckbox(el)) {

      el.checked = !(
        valor === false ||
        valor === null ||
        valor === undefined ||
        valor === '' ||
        valor === 0 ||
        valor === '0' ||
        valor === 'false'
      );

      return;
    }

    if (valor === null || valor === undefined) {
      el.value = '';
      return;
    }

    el.value = String(valor);
  }


  function definirTexto(id, texto) {

    const el = elemento(id);

    if (el) {
      el.textContent = texto ?? '';
    }
  }


  // ==========================================================
  // MENSAGENS
  // ==========================================================

  function mostrarMensagem(id, mensagem, tipo = 'success') {

    const el = elemento(id);

    if (!el) {
      return;
    }

    clearTimeout(el._timeoutMensagem);

    el.textContent = mensagem || '';

    el.classList.remove(
      'success',
      'error',
      'warning',
      'info',
      'sucesso',
      'erro'
    );

    if (mensagem) {

      el.classList.add(tipo);

      // Compatibilidade com CSS em português
      if (tipo === 'success') {
        el.classList.add('sucesso');
      } else if (tipo === 'error') {
        el.classList.add('erro');
      }
    }

    el.style.display = mensagem ? '' : 'none';

    if (mensagem) {
      el._timeoutMensagem = setTimeout(() => {
        el.style.display = 'none';
      }, 5000);
    }
  }


  function limparMensagem(id) {
    mostrarMensagem(id, '');
  }


  // ==========================================================
  // ESTADO DOS BOTÕES
  // ==========================================================

  function alterarEstadoBotao(botao, carregando) {

    if (!botao) {
      return;
    }

    if (carregando) {

      if (!botao.dataset.textoOriginal) {
        botao.dataset.textoOriginal = botao.textContent;
      }

      botao.disabled = true;
      botao.textContent = 'Salvando...';

    } else {

      botao.disabled = false;

      if (botao.dataset.textoOriginal) {
        botao.textContent = botao.dataset.textoOriginal;
      }
    }
  }


  // ==========================================================
  // REQUISIÇÕES
  // ==========================================================

  function requisicaoConfiguracoes(url, opcoes = {}) {

    const token = obterToken();

    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(opcoes.headers || {})
    };

    /*
     * Mantemos o Bearer como compatibilidade.
     * O backend também trabalha com cookie HttpOnly.
     */
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return fetch(url, {
      ...opcoes,
      headers,
      credentials: 'include',
      cache: 'no-store'
    }).then(async resposta => {

      let dados = null;

      try {
        dados = await resposta.json();
      } catch (error) {
        dados = null;
      }

      if (!resposta.ok) {

        if (resposta.status === 429) {
          window.location.replace('/429.html');
        }

        if (resposta.status === 401) {
          try {
            localStorage.removeItem(AUTH_TOKEN_KEY);
          } catch (error) {
            // Ignorado.
          }
        }

        let mensagem =
          dados?.erro ||
          dados?.mensagem ||
          `Erro HTTP ${resposta.status}`;

        if (resposta.status === 401) {
          mensagem = 'Sua sessão expirou. Faça login novamente.';
        }

        const erro = new Error(mensagem);

        erro.status = resposta.status;
        erro.statusCode = resposta.status;
        erro.response = { status: resposta.status };

        if (dados?.codigo) {
          erro.codigo = dados.codigo;
        }

        throw erro;
      }

      return dados;
    });
  }


  // ==========================================================
  // EMPRESA ATUAL
  // (o app.js expõe window.empresaLogada / window.usuarioLogado)
  // ==========================================================

  function obterEmpresaAtual() {
    return window.empresaLogada || null;
  }


  function atualizarEmpresaLocal(empresa) {

    if (!empresa || typeof empresa !== 'object') {
      return;
    }

    window.empresaLogada = {
      ...(window.empresaLogada || {}),
      ...empresa
    };

    // Atualiza nome da empresa na sidebar, acesso e nicho (função do app.js)
    if (typeof window.atualizarSidebarUsuario === 'function') {
      try {
        window.atualizarSidebarUsuario();
      } catch (error) {
        console.warn('Não foi possível atualizar a sidebar:', error);
      }
    } else {

      const empresaSidebar = elemento('sidebar-company');

      if (empresaSidebar) {
        empresaSidebar.textContent =
          window.empresaLogada.nome_exibicao ||
          window.empresaLogada.nome ||
          'Empresa';
      }
    }
  }


  // ==========================================================
  // NICHOS
  // ==========================================================

  function sincronizarNichoLocal(nicho) {

    if (!nicho || !NICHOS_VALIDOS.includes(nicho)) {
      return;
    }

    window.nichoAtual = nicho;

    if (window.empresaLogada) {
      window.empresaLogada.nicho = nicho;
    }
  }


  function atualizarCamposVisuaisNicho(nicho) {

    if (!nicho) {
      return;
    }

    /*
     * A lógica de nichos fica no app.js
     * (que expõe window.aplicarNicho).
     */
    if (typeof window.aplicarNicho === 'function') {
      try {
        window.aplicarNicho(nicho);
        return;
      } catch (error) {
        console.warn('Não foi possível aplicar o nicho pelo app.js:', error);
      }
    }

    definirValor('config-empresa-nicho', nicho);
  }


  // ==========================================================
  // CORES
  // ==========================================================

  function corValida(cor) {
    return typeof cor === 'string' && COR_REGEX.test(cor.trim());
  }


  function normalizarCor(cor, fallback) {

    const valor = String(cor || '').trim();

    return corValida(valor) ? valor.toUpperCase() : fallback;
  }


  function definirCor(colorId, textId, valor, fallback = CORES_PADRAO.primaria) {

    const cor = normalizarCor(valor, fallback);

    const colorInput = elemento(colorId);
    const textInput = elemento(textId);

    if (colorInput) {
      colorInput.value = cor;
    }

    if (textInput) {
      textInput.value = cor;
    }
  }


  function lerCor(colorId, textId, fallback) {

    const valorTexto = (elemento(textId)?.value || '').trim();
    const valorColor = (elemento(colorId)?.value || '').trim();

    if (corValida(valorTexto)) {
      return valorTexto;
    }

    if (corValida(valorColor)) {
      return valorColor;
    }

    return fallback;
  }


  function aplicarTema(primaria, destaque, fundo) {

    primaria = primaria || CORES_PADRAO.primaria;
    destaque = destaque || CORES_PADRAO.destaque;
    fundo = fundo || CORES_PADRAO.fundo;

    const root = document.documentElement;

    [
      '--primary',
      '--primary-color',
      '--cor-primaria'
    ].forEach(v => root.style.setProperty(v, primaria));

    [
      '--accent',
      '--accent-color',
      '--cor-destaque'
    ].forEach(v => root.style.setProperty(v, destaque));

    [
      '--bg',
      '--background',
      '--background-color',
      '--cor-fundo'
    ].forEach(v => root.style.setProperty(v, fundo));
  }


  function atualizarPreviewTema() {

    const primaria = lerCor(
      'config-cor-principal',
      'config-cor-principal-text',
      CORES_PADRAO.primaria
    );

    const destaque = lerCor(
      'config-cor-destaque',
      'config-cor-destaque-text',
      CORES_PADRAO.destaque
    );

    const fundo = lerCor(
      'config-cor-fundo',
      'config-cor-fundo-text',
      CORES_PADRAO.fundo
    );

    aplicarTema(primaria, destaque, fundo);

    const preview = elemento('config-tema-preview');
    const previewTitle = elemento('config-tema-preview-title');
    const previewBadge = elemento('config-tema-preview-badge');
    const previewButton = elemento('config-tema-preview-button');

    if (preview) {
      preview.style.background = fundo;
      preview.style.setProperty('--preview-primary', primaria);
      preview.style.setProperty('--preview-accent', destaque);
    }

    if (previewTitle) {
      previewTitle.style.color = primaria;
    }

    if (previewBadge) {
      previewBadge.style.background = destaque;
    }

    if (previewButton) {
      previewButton.style.background = primaria;
    }
  }


  function prefixarCor(valor) {

    let v = String(valor || '').trim().toUpperCase();

    if (!v.startsWith('#') && /^[0-9A-F]{6}$/.test(v)) {
      v = '#' + v;
    }

    return v;
  }


  function configurarInputsDeCor() {

    const pares = [
      ['config-cor-principal', 'config-cor-principal-text'],
      ['config-cor-destaque', 'config-cor-destaque-text'],
      ['config-cor-fundo', 'config-cor-fundo-text']
    ];

    pares.forEach(([colorId, textId]) => {

      const colorInput = elemento(colorId);
      const textInput = elemento(textId);

      if (!colorInput || !textInput) {
        return;
      }

      colorInput.addEventListener('input', () => {

        if (corValida(colorInput.value)) {
          textInput.value = colorInput.value.toUpperCase();
          atualizarPreviewTema();
        }
      });

      textInput.addEventListener('input', () => {

        const valor = prefixarCor(textInput.value);

        if (corValida(valor)) {
          colorInput.value = valor.toLowerCase();
          atualizarPreviewTema();
        }
      });

      textInput.addEventListener('blur', () => {

        const valor = prefixarCor(textInput.value);

        if (corValida(valor)) {
          textInput.value = valor;
          colorInput.value = valor.toLowerCase();
        } else {
          textInput.value = (colorInput.value || CORES_PADRAO.primaria).toUpperCase();
        }

        atualizarPreviewTema();
      });
    });
  }


  function configurarPresetsTema() {

    document.querySelectorAll('.theme-preset').forEach(preset => {

      preset.addEventListener('click', event => {

        event.preventDefault();

        definirCor(
          'config-cor-principal',
          'config-cor-principal-text',
          preset.dataset.primary || CORES_PADRAO.primaria,
          CORES_PADRAO.primaria
        );

        definirCor(
          'config-cor-destaque',
          'config-cor-destaque-text',
          preset.dataset.accent || CORES_PADRAO.destaque,
          CORES_PADRAO.destaque
        );

        definirCor(
          'config-cor-fundo',
          'config-cor-fundo-text',
          preset.dataset.background || CORES_PADRAO.fundo,
          CORES_PADRAO.fundo
        );

        atualizarPreviewTema();
      });
    });
  }


  // ==========================================================
  // PREENCHER EMPRESA
  // ==========================================================

  function preencherDadosEmpresa(empresa) {

    if (!empresa) {
      return;
    }

    definirValor('config-empresa-nome', empresa.nome);
    definirValor('config-empresa-nome-exibicao', empresa.nome_exibicao || empresa.nome || '');
    definirValor('config-empresa-email', empresa.email);
    definirValor('config-empresa-telefone', empresa.telefone);
    definirValor('config-empresa-nicho', empresa.nicho || 'generico');
    definirValor('config-logo-url', empresa.logo_url);

    // Preferências regionais
    definirValor('config-moeda', empresa.moeda || 'BRL');
    definirValor('config-idioma', empresa.idioma || 'pt-BR');
    definirValor('config-formato-data', empresa.formato_data || 'DD/MM/YYYY');
    definirValor('config-formato-hora', empresa.formato_hora || '24h');
    definirValor('config-fuso-horario', empresa.fuso_horario || 'America/Sao_Paulo');

    // Preferências do sistema
    definirValor('config-notificacoes-ativas', empresa.notificacoes_ativas !== false);
    definirValor('config-mostrar-valores', empresa.mostrar_valores !== false);
    definirValorFlexivel('config-dashboard-inicial', empresa.dashboard_inicial ?? 'agenda');
    definirValor('config-modo-compacto', Boolean(empresa.modo_compacto));

    // Documentos
    definirValor('config-rodape-documentos', empresa.rodape_documentos || '');
    definirValorFlexivel('config-telefone-documentos', empresa.telefone_documentos ?? '');

    // Agenda
    definirValor('config-agenda-inicio', empresa.agenda_horario_inicio || '08:00');
    definirValor('config-agenda-fim', empresa.agenda_horario_fim || '18:00');
    definirValor('config-agenda-intervalo', empresa.agenda_intervalo || 30);

    // Aparência
    definirCor(
      'config-cor-principal',
      'config-cor-principal-text',
      empresa.cor_primaria,
      CORES_PADRAO.primaria
    );

    definirCor(
      'config-cor-destaque',
      'config-cor-destaque-text',
      empresa.cor_destaque,
      CORES_PADRAO.destaque
    );

    definirCor(
      'config-cor-fundo',
      'config-cor-fundo-text',
      empresa.cor_fundo,
      CORES_PADRAO.fundo
    );

    // Informações do sistema
    definirValor('config-info-empresa', empresa.nome_exibicao || empresa.nome);

    // Nicho
    sincronizarNichoLocal(empresa.nicho || 'generico');
    atualizarCamposVisuaisNicho(empresa.nicho || 'generico');

    // Sidebar
    const empresaSidebar = elemento('sidebar-company');

    if (empresaSidebar) {
      empresaSidebar.textContent =
        empresa.nome_exibicao || empresa.nome || 'Empresa';
    }

    // Tema
    atualizarPreviewTema();
  }


  // ==========================================================
  // PREENCHER USUÁRIO
  // ==========================================================

  function preencherDadosUsuario(usuario) {

    if (!usuario) {
      return;
    }

    definirValor('config-usuario-nome', usuario.nome);
    definirValor('config-usuario-email', usuario.email);

    definirValor(
      'config-usuario-perfil',
      usuario.perfil === 'administrador' ? 'Administrador' : 'Funcionário'
    );
  }


  // ==========================================================
  // CARREGAR CONFIGURAÇÕES
  // ==========================================================

  async function carregarConfiguracoes() {

    limparMensagem('configuracoes-message');

    if (!obterToken() && !window.usuarioLogado) {
      return null;
    }

    try {

      const resposta = await requisicaoConfiguracoes('/api/configuracoes', {
        method: 'GET'
      });

      const empresa = resposta?.empresa || null;

      if (!empresa) {
        throw new Error('Os dados da empresa não foram encontrados.');
      }

      preencherDadosEmpresa(empresa);
      atualizarEmpresaLocal(empresa);

      preencherDadosUsuario(window.usuarioLogado);
      preencherInformacoesSistema();

      return empresa;

    } catch (error) {

      console.error('Erro ao carregar configurações:', error);

      mostrarMensagem(
        'configuracoes-message',
        error.message || 'Não foi possível carregar as configurações.',
        'error'
      );

      throw error;
    }
  }


  async function carregarUsuarioAtual() {

    // O app.js já carregou o usuário: evita requisição repetida.
    if (window.usuarioLogado) {
      preencherDadosUsuario(window.usuarioLogado);
      return { usuario: window.usuarioLogado, empresa: window.empresaLogada };
    }

    if (!obterToken()) {
      return null;
    }

    try {

      const resposta = await requisicaoConfiguracoes('/api/auth/me', {
        method: 'GET'
      });

      if (resposta?.usuario) {
        preencherDadosUsuario(resposta.usuario);
      }

      if (resposta?.empresa) {
        atualizarEmpresaLocal(resposta.empresa);
      }

      return resposta;

    } catch (error) {

      console.warn('Não foi possível carregar o usuário atual:', error);

      return null;
    }
  }


  // ==========================================================
  // PAYLOADS
  // ==========================================================

  function montarPayloadEmpresa() {

    const nome = obterTexto('config-empresa-nome');
    const email = obterTexto('config-empresa-email');
    const telefone = obterTexto('config-empresa-telefone');
    const nomeExibicao = obterTexto('config-empresa-nome-exibicao');
    const nicho = obterTexto('config-empresa-nicho', 'generico').toLowerCase();
    const logoUrl = obterTexto('config-logo-url');

    if (!nome) {
      throw new Error('Informe o nome da empresa.');
    }

    if (email && !EMAIL_REGEX.test(email)) {
      throw new Error('Informe um e-mail válido.');
    }

    if (!NICHOS_VALIDOS.includes(nicho)) {
      throw new Error('O nicho selecionado é inválido.');
    }

    const payload = {
      nome,
      telefone: telefone || null,
      nome_exibicao: nomeExibicao || nome,
      nicho,
      logo_url: logoUrl || null
    };

    // Só envia o e-mail quando preenchido
    if (email) {
      payload.email = email;
    }

    return payload;
  }


  function montarPayloadRegional() {

    return {
      moeda: obterTexto('config-moeda', 'BRL'),
      idioma: obterTexto('config-idioma', 'pt-BR'),
      formato_data: obterTexto('config-formato-data', 'DD/MM/YYYY'),
      formato_hora: obterTexto('config-formato-hora', '24h'),
      fuso_horario: obterTexto('config-fuso-horario', 'America/Sao_Paulo')
    };
  }


  function montarPayloadPreferencias() {

    return {
      notificacoes_ativas: obterBooleano('config-notificacoes-ativas', true),
      mostrar_valores: obterBooleano('config-mostrar-valores', true),
      dashboard_inicial: obterValorFlexivel('config-dashboard-inicial', 'agenda'),
      modo_compacto: obterBooleano('config-modo-compacto', false)
    };
  }


  function montarPayloadAparencia() {

    const corPrimaria = lerCor(
      'config-cor-principal',
      'config-cor-principal-text',
      CORES_PADRAO.primaria
    );

    const corDestaque = lerCor(
      'config-cor-destaque',
      'config-cor-destaque-text',
      CORES_PADRAO.destaque
    );

    const corFundo = lerCor(
      'config-cor-fundo',
      'config-cor-fundo-text',
      CORES_PADRAO.fundo
    );

    if (!corValida(corPrimaria)) {
      throw new Error('A cor principal informada é inválida.');
    }

    if (!corValida(corDestaque)) {
      throw new Error('A cor de destaque informada é inválida.');
    }

    if (!corValida(corFundo)) {
      throw new Error('A cor de fundo informada é inválida.');
    }

    return {
      cor_primaria: corPrimaria,
      cor_destaque: corDestaque,
      cor_fundo: corFundo
    };
  }


  function montarPayloadDocumentos() {

    const telefone = obterValorFlexivel('config-telefone-documentos', '');

    return {
      rodape_documentos: obterTexto('config-rodape-documentos') || null,
      telefone_documentos: telefone
    };
  }


  function horarioParaMinutos(horario) {

    const [h, m] = horario.split(':').map(Number);

    return h * 60 + m;
  }


  function normalizarHorario(valor) {

    const horario = String(valor ?? '').trim();

    if (!horario) {
      return '';
    }

    // Aceita HH:MM ou HH:MM:SS
    const match = horario.match(/^(\d{2}:\d{2})(?::\d{2})?$/);

    return match ? match[1] : horario;
  }


  function montarPayloadAgenda() {

    const inicio = normalizarHorario(obterValor('config-agenda-inicio', '08:00'));
    const fim = normalizarHorario(obterValor('config-agenda-fim', '18:00'));

    const intervaloTexto = String(obterValor('config-agenda-intervalo', 30) ?? '');
    const intervaloMatch = intervaloTexto.match(/\d+/);
    const intervalo = intervaloMatch ? Number(intervaloMatch[0]) : NaN;

    if (!inicio || !HORARIO_REGEX.test(inicio)) {
      throw new Error('Horário inicial da agenda inválido. Use o formato HH:MM.');
    }

    if (!fim || !HORARIO_REGEX.test(fim)) {
      throw new Error('Horário final da agenda inválido. Use o formato HH:MM.');
    }

    if (!INTERVALOS_AGENDA_VALIDOS.includes(intervalo)) {
      throw new Error(
        'Intervalo inválido. Escolha 15, 30, 45, 60, 90 ou 120 minutos.'
      );
    }

    if (horarioParaMinutos(fim) <= horarioParaMinutos(inicio)) {
      throw new Error('O horário final deve ser maior que o horário inicial.');
    }

    return {
      agenda_horario_inicio: inicio,
      agenda_horario_fim: fim,
      agenda_intervalo: intervalo
    };
  }


  // ==========================================================
  // SALVAR (função única, usada por todas as seções)
  // ==========================================================

  async function salvarConfiguracoes(payload) {

    const resposta = await requisicaoConfiguracoes('/api/configuracoes', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    const empresa = resposta?.empresa || null;

    if (empresa) {
      atualizarEmpresaLocal(empresa);
    }

    return resposta;
  }


  /*
   * Executa uma rotina de salvamento controlando botão e mensagem.
   * Retorna a resposta ou null em caso de erro (a mensagem já é exibida).
   */
  async function executarSalvamento({
    botao,
    mensagemId = 'configuracoes-message',
    sucesso,
    montarPayload,
    aoSalvar
  }) {

    limparMensagem(mensagemId);

    try {

      alterarEstadoBotao(botao, true);

      const payload = montarPayload();

      const resposta = await salvarConfiguracoes(payload);

      if (typeof aoSalvar === 'function') {
        aoSalvar(resposta, payload);
      }

      mostrarMensagem(mensagemId, sucesso, 'success');

      return resposta;

    } catch (error) {

      console.error('Erro ao salvar configurações:', error);

      mostrarMensagem(
        mensagemId,
        error.message || 'Não foi possível salvar as configurações.',
        'error'
      );

      return null;

    } finally {

      alterarEstadoBotao(botao, false);
    }
  }


  function salvarEmpresa() {

    return executarSalvamento({
      botao: elemento('btn-salvar-configuracoes'),
      sucesso: 'Dados da empresa salvos com sucesso.',
      montarPayload: montarPayloadEmpresa,
      aoSalvar: resposta => {

        if (resposta?.empresa) {
          preencherDadosEmpresa(resposta.empresa);
        }
      }
    });
  }


  function salvarPreferenciasRegionais() {

    return executarSalvamento({
      botao: elemento('btn-salvar-regional'),
      sucesso: 'Preferências regionais salvas com sucesso.',
      montarPayload: montarPayloadRegional
    });
  }


  function salvarPreferencias() {

    return executarSalvamento({
      botao: elemento('btn-salvar-preferencias'),
      sucesso: 'Preferências salvas com sucesso.',
      montarPayload: () => ({
        ...montarPayloadRegional(),
        ...montarPayloadPreferencias()
      }),
      aoSalvar: resposta => {

        if (resposta?.empresa) {
          preencherDadosEmpresa(resposta.empresa);
        }
      }
    });
  }


  function salvarAparencia() {

    return executarSalvamento({
      botao: elemento('btn-salvar-tema'),
      mensagemId: 'config-aparencia-message',
      sucesso: 'Aparência salva com sucesso.',
      montarPayload: montarPayloadAparencia,
      aoSalvar: (resposta, payload) => {

        const empresa = resposta?.empresa || {};

        const primaria = empresa.cor_primaria || payload.cor_primaria;
        const destaque = empresa.cor_destaque || payload.cor_destaque;
        const fundo = empresa.cor_fundo || payload.cor_fundo;

        definirCor('config-cor-principal', 'config-cor-principal-text', primaria, CORES_PADRAO.primaria);
        definirCor('config-cor-destaque', 'config-cor-destaque-text', destaque, CORES_PADRAO.destaque);
        definirCor('config-cor-fundo', 'config-cor-fundo-text', fundo, CORES_PADRAO.fundo);

        aplicarTema(primaria, destaque, fundo);
        atualizarPreviewTema();
      }
    });
  }


  function salvarDocumentos() {

    return executarSalvamento({
      botao: elemento('btn-salvar-documentos'),
      sucesso: 'Configurações dos documentos salvas com sucesso.',
      montarPayload: montarPayloadDocumentos,
      aoSalvar: resposta => {

        if (resposta?.empresa) {
          preencherDadosEmpresa(resposta.empresa);
        }
      }
    });
  }


  function salvarAgenda() {

    return executarSalvamento({
      botao: elemento('btn-salvar-agenda'),
      sucesso: 'Configurações da agenda salvas com sucesso.',
      montarPayload: montarPayloadAgenda,
      aoSalvar: resposta => {

        const empresa = resposta?.empresa;

        if (!empresa) {
          return;
        }

        definirValor('config-agenda-inicio', empresa.agenda_horario_inicio);
        definirValor('config-agenda-fim', empresa.agenda_horario_fim);
        definirValor('config-agenda-intervalo', empresa.agenda_intervalo);
      }
    });
  }


  // ==========================================================
  // RESTAURAR TEMA
  // ==========================================================

  function restaurarTema() {

    definirCor('config-cor-principal', 'config-cor-principal-text', CORES_PADRAO.primaria);
    definirCor('config-cor-destaque', 'config-cor-destaque-text', CORES_PADRAO.destaque);
    definirCor('config-cor-fundo', 'config-cor-fundo-text', CORES_PADRAO.fundo);

    atualizarPreviewTema();

    mostrarMensagem(
      'config-aparencia-message',
      'Tema restaurado. Clique em "Salvar aparência" para aplicar definitivamente.',
      'info'
    );
  }


  // ==========================================================
  // EVENTOS
  // ==========================================================

  function aoClicar(id, funcao) {

    const botao = elemento(id);

    if (!botao) {
      return;
    }

    botao.addEventListener('click', async event => {

      event.preventDefault();

      await funcao();
    });
  }


  function configurarFormularioPrincipal() {

    const form = elemento('form-configuracoes');

    if (!form) {
      return;
    }

    form.addEventListener('submit', async event => {

      event.preventDefault();

      await salvarEmpresa();
    });
  }


  function configurarBotoes() {

    aoClicar('btn-salvar-configuracoes', salvarEmpresa);
    aoClicar('btn-salvar-regional', salvarPreferenciasRegionais);
    aoClicar('btn-salvar-preferencias', salvarPreferencias);
    aoClicar('btn-salvar-tema', salvarAparencia);
    aoClicar('btn-salvar-documentos', salvarDocumentos);
    aoClicar('btn-salvar-agenda', salvarAgenda);

    aoClicar('btn-restaurar-tema', () => restaurarTema());
  }


  function configurarNicho() {

    const select = elemento('config-empresa-nicho');

    if (!select) {
      return;
    }

    select.addEventListener('change', () => {

      const nicho = String(select.value || '').trim().toLowerCase();

      if (!NICHOS_VALIDOS.includes(nicho)) {
        return;
      }

      sincronizarNichoLocal(nicho);
      atualizarCamposVisuaisNicho(nicho);
    });
  }


  // ==========================================================
  // INFORMAÇÕES DO SISTEMA
  // ==========================================================

  function preencherInformacoesSistema() {

    const empresa = obterEmpresaAtual();

    if (!empresa) {
      return;
    }

    definirTexto('config-info-status', 'Ativo');

    definirTexto(
      'config-info-empresa',
      empresa.nome_exibicao || empresa.nome || 'Minha empresa'
    );
  }


  // ==========================================================
  // INICIALIZAÇÃO
  // ==========================================================

  async function inicializarConfiguracoes() {

    configurarInputsDeCor();
    configurarPresetsTema();
    configurarFormularioPrincipal();
    configurarBotoes();
    configurarNicho();

    limparMensagem('configuracoes-message');
    limparMensagem('config-aparencia-message');

    const empresaInicial = obterEmpresaAtual();

    if (empresaInicial) {
      preencherDadosEmpresa(empresaInicial);
    }

    atualizarPreviewTema();

    /*
     * Se o usuário ainda não estiver autenticado, nada é carregado aqui.
     * Após o login, o app.js chama carregarConfiguracoes().
     */
    try {
      await carregarUsuarioAtual();
    } catch (error) {}

    try {
      await carregarConfiguracoes();
    } catch (error) {}

    preencherInformacoesSistema();
  }


  // ==========================================================
  // API PÚBLICA
  // ==========================================================

  window.OrvixConfiguracoes = {
    carregarConfiguracoes,
    carregarUsuarioAtual,
    salvarConfiguracoes,
    salvarEmpresa,
    salvarPreferenciasRegionais,
    salvarPreferencias,
    salvarAparencia,
    salvarDocumentos,
    salvarAgenda,
    restaurarTema,
    aplicarTema,
    atualizarPreviewTema,
    preencherDadosEmpresa,
    requisicaoConfiguracoes
  };


  // Compatibilidade com chamadas antigas
  window.salvarConfiguracoes = salvarConfiguracoes;
  window.salvarAgenda = salvarAgenda;
  window.salvarAparencia = salvarAparencia;
  window.salvarDocumentos = salvarDocumentos;
  window.salvarPreferencias = salvarPreferencias;
  window.atualizarPreviewTema = atualizarPreviewTema;


  // ==========================================================
  // DOM READY
  // ==========================================================

  if (document.readyState === 'loading') {

    document.addEventListener('DOMContentLoaded', inicializarConfiguracoes, {
      once: true
    });

  } else {

    inicializarConfiguracoes();
  }

})();