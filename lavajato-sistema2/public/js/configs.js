/* ============================================================
   ORVIX — CONFIGURAÇÕES
   ============================================================ */

(() => {
  'use strict';

  // ==========================================================
  // CONSTANTES
  // ==========================================================

  const AUTH_TOKEN_KEY = 'lavajato_auth_token';

  const CORES_PADRAO = {
    primaria: '#2563eb',
    destaque: '#10b981',
    fundo: '#f8fafc'
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

  const INTERVALOS_AGENDA_VALIDOS = [
    15,
    30,
    45,
    60,
    90,
    120
  ];

  const EMAIL_REGEX =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // ==========================================================
  // FUNÇÕES AUXILIARES
  // ==========================================================

  function obterToken() {
    try {
      return localStorage.getItem(AUTH_TOKEN_KEY) || '';
    } catch (error) {
      return '';
    }
  }


  function escaparHtml(valor) {
    return String(valor ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }


  function obterValor(id, fallback = '') {
    const elemento = document.getElementById(id);

    if (!elemento) {
      return fallback;
    }

    if (
      elemento.type === 'checkbox' ||
      elemento.type === 'radio'
    ) {
      return elemento.checked;
    }

    return elemento.value ?? fallback;
  }


  function definirValor(id, valor) {
    const elemento = document.getElementById(id);

    if (!elemento) {
      return;
    }

    if (
      elemento.type === 'checkbox' ||
      elemento.type === 'radio'
    ) {
      elemento.checked = Boolean(valor);
      return;
    }

    elemento.value = valor ?? '';
  }


  function definirTexto(id, texto) {
    const elemento = document.getElementById(id);

    if (elemento) {
      elemento.textContent = texto ?? '';
    }
  }


  function mostrarMensagem(id, mensagem, tipo = 'success') {
    const elemento = document.getElementById(id);

    if (!elemento) {
      return;
    }

    elemento.textContent = mensagem || '';

    elemento.classList.remove(
      'success',
      'error',
      'warning',
      'info'
    );

    if (mensagem) {
      elemento.classList.add(tipo);
    }

    elemento.style.display = mensagem ? '' : 'none';
  }


  function limparMensagem(id) {
    mostrarMensagem(id, '');
  }


  function requisicaoConfiguracoes(url, opcoes = {}) {
    const token = obterToken();

    const headers = {
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
      credentials: 'include'
    }).then(async resposta => {

      let dados = null;

      try {
        dados = await resposta.json();
      } catch (error) {
        dados = null;
      }

      if (!resposta.ok) {
        const erro = new Error(
          dados?.erro ||
          dados?.mensagem ||
          `Erro HTTP ${resposta.status}`
        );

        erro.status = resposta.status;
        erro.statusCode = resposta.status;
        erro.response = {
          status: resposta.status
        };

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
  // ==========================================================

  function obterEmpresaAtual() {

    if (
      typeof empresaLogada !== 'undefined' &&
      empresaLogada
    ) {
      return empresaLogada;
    }

    if (
      typeof window !== 'undefined' &&
      window.empresaLogada
    ) {
      return window.empresaLogada;
    }

    return null;
  }


  function atualizarEmpresaLocal(empresa) {

    if (!empresa || typeof empresa !== 'object') {
      return;
    }

    if (
      typeof empresaLogada !== 'undefined'
    ) {
      empresaLogada = {
        ...(empresaLogada || {}),
        ...empresa
      };
    }

    /*
     * Mantém também a referência global, caso o app use.
     * Não sobrescrevemos nenhuma função do app.js.
     */
    window.empresaLogada = {
      ...(window.empresaLogada || {}),
      ...empresa
    };
  }


  // ==========================================================
  // NICHOS
  // ==========================================================

  function obterNichoAtual() {

    const empresa = obterEmpresaAtual();

    return (
      empresa?.nicho ||
      window.nichoAtual ||
      'generico'
    );
  }


  function sincronizarNichoLocal(nicho) {

    if (!nicho || !NICHOS_VALIDOS.includes(nicho)) {
      return;
    }

    window.nichoAtual = nicho;

    atualizarEmpresaLocal({
      nicho
    });
  }


  function atualizarCamposVisuaisNicho(nicho) {

    if (!nicho) {
      return;
    }

    /*
     * Não recriamos a lógica de nichos do app.js.
     *
     * Se o app.js expôs aplicarNicho globalmente,
     * utilizamos a função original.
     */
    if (typeof window.aplicarNicho === 'function') {
      try {
        window.aplicarNicho(nicho);
        return;
      } catch (error) {
        console.warn(
          'Não foi possível aplicar o nicho pelo app.js:',
          error
        );
      }
    }

    /*
     * Fallback mínimo para o campo da própria configuração.
     */
    definirValor(
      'config-empresa-nicho',
      nicho
    );
  }


  // ==========================================================
  // PREENCHER EMPRESA
  // ==========================================================

  function preencherDadosEmpresa(empresa) {

    if (!empresa) {
      return;
    }

    definirValor(
      'config-empresa-nome',
      empresa.nome
    );

    definirValor(
      'config-empresa-nome-exibicao',
      empresa.nome_exibicao || empresa.nome || ''
    );

    definirValor(
      'config-empresa-email',
      empresa.email
    );

    definirValor(
      'config-empresa-telefone',
      empresa.telefone
    );

    definirValor(
      'config-empresa-nicho',
      empresa.nicho || 'generico'
    );

    definirValor(
      'config-logo-url',
      empresa.logo_url
    );

    definirValor(
      'config-moeda',
      empresa.moeda || 'BRL'
    );

    definirValor(
      'config-idioma',
      empresa.idioma || 'pt-BR'
    );

    definirValor(
      'config-formato-data',
      empresa.formato_data || 'DD/MM/YYYY'
    );

    definirValor(
      'config-formato-hora',
      empresa.formato_hora || '24h'
    );

    definirValor(
      'config-fuso-horario',
      empresa.fuso_horario || 'America/Sao_Paulo'
    );

    definirValor(
      'config-notificacoes-ativas',
      empresa.notificacoes_ativas !== false
    );

    definirValor(
      'config-mostrar-valores',
      empresa.mostrar_valores !== false
    );

    definirValor(
      'config-dashboard-inicial',
      empresa.dashboard_inicial || 'agenda'
    );

    definirValor(
      'config-modo-compacto',
      Boolean(empresa.modo_compacto)
    );

    definirValor(
      'config-rodape-documentos',
      empresa.rodape_documentos || ''
    );

    definirValor(
      'config-telefone-documentos',
      empresa.telefone_documentos || ''
    );

    definirValor(
      'config-agenda-inicio',
      empresa.agenda_horario_inicio || '08:00'
    );

    definirValor(
      'config-agenda-fim',
      empresa.agenda_horario_fim || '18:00'
    );

    definirValor(
      'config-agenda-intervalo',
      empresa.agenda_intervalo || 30
    );

    definirCor(
      'config-cor-principal',
      'config-cor-principal-text',
      empresa.cor_primaria || CORES_PADRAO.primaria
    );

    definirCor(
      'config-cor-destaque',
      'config-cor-destaque-text',
      empresa.cor_destaque || CORES_PADRAO.destaque
    );

    definirCor(
      'config-cor-fundo',
      'config-cor-fundo-text',
      empresa.cor_fundo || CORES_PADRAO.fundo
    );

    sincronizarNichoLocal(
      empresa.nicho || 'generico'
    );

    atualizarCamposVisuaisNicho(
      empresa.nicho || 'generico'
    );

    atualizarPreviewTema();
  }


  // ==========================================================
  // PREENCHER USUÁRIO
  // ==========================================================

  function preencherDadosUsuario(usuario) {

    if (!usuario) {
      return;
    }

    definirValor(
      'config-usuario-nome',
      usuario.nome
    );

    definirValor(
      'config-usuario-email',
      usuario.email
    );

    definirValor(
      'config-usuario-perfil',
      usuario.perfil === 'administrador'
        ? 'Administrador'
        : 'Funcionário'
    );
  }


  // ==========================================================
  // CARREGAR CONFIGURAÇÕES
  // ==========================================================

  async function carregarConfiguracoes() {

    limparMensagem('configuracoes-message');

    try {

      const resposta =
        await requisicaoConfiguracoes(
          '/api/configuracoes',
          {
            method: 'GET'
          }
        );

      const empresa = resposta?.empresa || null;

      if (!empresa) {
        throw new Error(
          'Os dados da empresa não foram encontrados.'
        );
      }

      atualizarEmpresaLocal(empresa);
      preencherDadosEmpresa(empresa);

      return empresa;

    } catch (error) {

      console.error(
        'Erro ao carregar configurações:',
        error
      );

      mostrarMensagem(
        'configuracoes-message',
        error.message ||
          'Não foi possível carregar as configurações.',
        'error'
      );

      throw error;
    }
  }


  async function carregarUsuarioAtual() {

    try {

      const resposta =
        await requisicaoConfiguracoes(
          '/api/auth/me',
          {
            method: 'GET'
          }
        );

      const usuario =
        resposta?.usuario || null;

      if (usuario) {
        preencherDadosUsuario(usuario);
      }

      if (resposta?.empresa) {
        atualizarEmpresaLocal(
          resposta.empresa
        );
      }

      return resposta;

    } catch (error) {

      console.warn(
        'Não foi possível carregar o usuário atual:',
        error
      );

      return null;
    }
  }


  // ==========================================================
  // CORES
  // ==========================================================

  function corValida(cor) {

    if (typeof cor !== 'string') {
      return false;
    }

    return /^#[0-9A-Fa-f]{6}$/.test(
      cor.trim()
    );
  }


  function normalizarCor(cor, fallback) {

    const valor =
      String(cor || '').trim();

    return corValida(valor)
      ? valor.toLowerCase()
      : fallback;
  }


  function definirCor(
    colorId,
    textId,
    valor
  ) {

    const cor =
      normalizarCor(
        valor,
        CORES_PADRAO.primaria
      );

    const colorInput =
      document.getElementById(colorId);

    const textInput =
      document.getElementById(textId);

    if (colorInput) {
      colorInput.value = cor;
    }

    if (textInput) {
      textInput.value = cor;
    }
  }


  function lerCor(colorId, textId, fallback) {

    const colorInput =
      document.getElementById(colorId);

    const textInput =
      document.getElementById(textId);

    const valorColor =
      colorInput?.value?.trim() || '';

    const valorTexto =
      textInput?.value?.trim() || '';

    if (corValida(valorTexto)) {
      return valorTexto;
    }

    if (corValida(valorColor)) {
      return valorColor;
    }

    return fallback;
  }


  function aplicarCoresTema(
    primaria,
    destaque,
    fundo
  ) {

    const root =
      document.documentElement;

    root.style.setProperty(
      '--primary',
      primaria
    );

    root.style.setProperty(
      '--primary-color',
      primaria
    );

    root.style.setProperty(
      '--accent',
      destaque
    );

    root.style.setProperty(
      '--accent-color',
      destaque
    );

    root.style.setProperty(
      '--bg',
      fundo
    );

    root.style.setProperty(
      '--background',
      fundo
    );
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

    aplicarCoresTema(
      primaria,
      destaque,
      fundo
    );

    const preview =
      document.getElementById(
        'config-tema-preview'
      );

    const previewTitle =
      document.getElementById(
        'config-tema-preview-title'
      );

    const previewBadge =
      document.getElementById(
        'config-tema-preview-badge'
      );

    const previewButton =
      document.getElementById(
        'config-tema-preview-button'
      );

    if (preview) {
      preview.style.background = fundo;
      preview.style.setProperty(
        '--preview-primary',
        primaria
      );
      preview.style.setProperty(
        '--preview-accent',
        destaque
      );
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


  function configurarInputsDeCor() {

    const pares = [
      [
        'config-cor-principal',
        'config-cor-principal-text'
      ],
      [
        'config-cor-destaque',
        'config-cor-destaque-text'
      ],
      [
        'config-cor-fundo',
        'config-cor-fundo-text'
      ]
    ];

    pares.forEach(
      ([colorId, textId]) => {

        const colorInput =
          document.getElementById(colorId);

        const textInput =
          document.getElementById(textId);

        if (!colorInput || !textInput) {
          return;
        }

        colorInput.addEventListener(
          'input',
          () => {

            const valor =
              colorInput.value;

            if (corValida(valor)) {
              textInput.value =
                valor;

              atualizarPreviewTema();
            }
          }
        );

        textInput.addEventListener(
          'input',
          () => {

            const valor =
              textInput.value.trim();

            if (corValida(valor)) {

              colorInput.value =
                valor;

              atualizarPreviewTema();
            }
          }
        );

        textInput.addEventListener(
          'blur',
          () => {

            const valor =
              textInput.value.trim();

            if (!corValida(valor)) {

              textInput.value =
                colorInput.value ||
                CORES_PADRAO.primaria;

              atualizarPreviewTema();
            }
          }
        );
      }
    );
  }


  // ==========================================================
  // PRESETS
  // ==========================================================

  function configurarPresetsTema() {

    document
      .querySelectorAll('.theme-preset')
      .forEach(preset => {

        preset.addEventListener(
          'click',
          () => {

            const primaria =
              preset.dataset.primary ||
              CORES_PADRAO.primaria;

            const destaque =
              preset.dataset.accent ||
              CORES_PADRAO.destaque;

            const fundo =
              preset.dataset.background ||
              CORES_PADRAO.fundo;

            definirCor(
              'config-cor-principal',
              'config-cor-principal-text',
              primaria
            );

            definirCor(
              'config-cor-destaque',
              'config-cor-destaque-text',
              destaque
            );

            definirCor(
              'config-cor-fundo',
              'config-cor-fundo-text',
              fundo
            );

            atualizarPreviewTema();
          }
        );
      });
  }


  // ==========================================================
  // PAYLOAD — EMPRESA
  // ==========================================================

  function montarPayloadEmpresa() {

    const nome =
      String(
        obterValor(
          'config-empresa-nome'
        )
      ).trim();

    const email =
      String(
        obterValor(
          'config-empresa-email'
        )
      ).trim();

    const telefone =
      String(
        obterValor(
          'config-empresa-telefone'
        )
      ).trim();

    const nomeExibicao =
      String(
        obterValor(
          'config-empresa-nome-exibicao'
        )
      ).trim();

    const nicho =
      String(
        obterValor(
          'config-empresa-nicho',
          'generico'
        )
      ).trim().toLowerCase();

    const logoUrl =
      String(
        obterValor(
          'config-logo-url'
        )
      ).trim();

    if (!nome) {
      throw new Error(
        'Informe o nome da empresa.'
      );
    }

    if (
      email &&
      !EMAIL_REGEX.test(email)
    ) {
      throw new Error(
        'Informe um e-mail válido.'
      );
    }

    if (
      !NICHOS_VALIDOS.includes(nicho)
    ) {
      throw new Error(
        'O nicho selecionado é inválido.'
      );
    }

    return {
      nome,
      email,
      telefone,
      nome_exibicao:
        nomeExibicao || nome,
      nicho,
      logo_url: logoUrl
    };
  }


  // ==========================================================
  // PAYLOAD — PREFERÊNCIAS
  // ==========================================================

  function montarPayloadPreferencias() {

    return {
      moeda:
        obterValor(
          'config-moeda',
          'BRL'
        ),

      idioma:
        obterValor(
          'config-idioma',
          'pt-BR'
        ),

      formato_data:
        obterValor(
          'config-formato-data',
          'DD/MM/YYYY'
        ),

      formato_hora:
        obterValor(
          'config-formato-hora',
          '24h'
        ),

      fuso_horario:
        obterValor(
          'config-fuso-horario',
          'America/Sao_Paulo'
        ),

      notificacoes_ativas:
        Boolean(
          obterValor(
            'config-notificacoes-ativas',
            true
          )
        ),

      mostrar_valores:
        Boolean(
          obterValor(
            'config-mostrar-valores',
            true
          )
        ),

      dashboard_inicial:
        obterValor(
          'config-dashboard-inicial',
          'agenda'
        ),

      modo_compacto:
        Boolean(
          obterValor(
            'config-modo-compacto',
            false
          )
        )
    };
  }


  // ==========================================================
  // PAYLOAD — APARÊNCIA
  // ==========================================================

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
      throw new Error(
        'A cor principal informada é inválida.'
      );
    }

    if (!corValida(corDestaque)) {
      throw new Error(
        'A cor de destaque informada é inválida.'
      );
    }

    if (!corValida(corFundo)) {
      throw new Error(
        'A cor de fundo informada é inválida.'
      );
    }

    return {
      cor_primaria: corPrimaria,
      cor_destaque: corDestaque,
      cor_fundo: corFundo
    };
  }


  // ==========================================================
  // PAYLOAD — DOCUMENTOS
  // ==========================================================

  function montarPayloadDocumentos() {

    return {
      rodape_documentos:
        String(
          obterValor(
            'config-rodape-documentos'
          )
        ).trim(),

      telefone_documentos:
        String(
          obterValor(
            'config-telefone-documentos'
          )
        ).trim()
    };
  }


  // ==========================================================
  // PAYLOAD — AGENDA
  // ==========================================================

  function montarPayloadAgenda() {

    const inicio =
      String(
        obterValor(
          'config-agenda-inicio',
          '08:00'
        )
      ).trim();

    const fim =
      String(
        obterValor(
          'config-agenda-fim',
          '18:00'
        )
      ).trim();

    const intervalo =
      Number(
        obterValor(
          'config-agenda-intervalo',
          30
        )
      );

    const horarioRegex =
      /^(?:[01]\d|2[0-3]):[0-5]\d$/;

    if (!horarioRegex.test(inicio)) {
      throw new Error(
        'Horário inicial da agenda inválido.'
      );
    }

    if (!horarioRegex.test(fim)) {
      throw new Error(
        'Horário final da agenda inválido.'
      );
    }

    if (
      !INTERVALOS_AGENDA_VALIDOS.includes(
        intervalo
      )
    ) {
      throw new Error(
        'Intervalo da agenda inválido.'
      );
    }

    return {
      agenda_horario_inicio: inicio,
      agenda_horario_fim: fim,
      agenda_intervalo: intervalo
    };
  }


  // ==========================================================
  // SALVAR CONFIGURAÇÕES
  // ==========================================================

  async function salvarConfiguracoes(
    payload,
    mensagemId = 'configuracoes-message',
    mensagemSucesso =
      'Configurações salvas com sucesso.'
  ) {

    try {

      const resposta =
        await requisicaoConfiguracoes(
          '/api/configuracoes',
          {
            method: 'PUT',
            body: JSON.stringify(payload)
          }
        );

      const empresa =
        resposta?.empresa || null;

      if (empresa) {
        atualizarEmpresaLocal(
          empresa
        );
      }

      mostrarMensagem(
        mensagemId,
        mensagemSucesso,
        'success'
      );

      return resposta;

    } catch (error) {

      console.error(
        'Erro ao salvar configurações:',
        error
      );

      mostrarMensagem(
        mensagemId,
        error.message ||
          'Não foi possível salvar as configurações.',
        'error'
      );

      throw error;
    }
  }


  // ==========================================================
  // SALVAR EMPRESA
  // ==========================================================

  async function salvarEmpresa() {

    limparMensagem(
      'configuracoes-message'
    );

    try {

      const payload =
        montarPayloadEmpresa();

      const resposta =
        await salvarConfiguracoes(
          payload,
          'configuracoes-message',
          'Dados da empresa salvos com sucesso.'
        );

      const empresa =
        resposta?.empresa;

      if (empresa) {

        atualizarEmpresaLocal(
          empresa
        );

        sincronizarNichoLocal(
          empresa.nicho
        );

        preencherDadosEmpresa(
          empresa
        );

        /*
         * O app.js continua sendo responsável pela
         * atualizarSidebarUsuario().
         *
         * Não chamamos essa função aqui porque ela está
         * no escopo do app.js.
         */
        atualizarCamposVisuaisNicho(
          empresa.nicho
        );
      }

      return resposta;

    } catch (error) {
      return null;
    }
  }


  // ==========================================================
  // SALVAR PREFERÊNCIAS
  // ==========================================================

  async function salvarPreferencias() {

    try {

      const payload =
        montarPayloadPreferencias();

      const resposta =
        await salvarConfiguracoes(
          payload,
          'configuracoes-message',
          'Preferências salvas com sucesso.'
        );

      if (resposta?.empresa) {

        atualizarEmpresaLocal(
          resposta.empresa
        );

        preencherDadosEmpresa(
          resposta.empresa
        );
      }

      return resposta;

    } catch (error) {
      return null;
    }
  }


  // ==========================================================
  // SALVAR APARÊNCIA
  // ==========================================================

  async function salvarAparencia() {

    limparMensagem(
      'config-aparencia-message'
    );

    try {

      const payload =
        montarPayloadAparencia();

      aplicarCoresTema(
        payload.cor_primaria,
        payload.cor_destaque,
        payload.cor_fundo
      );

      const resposta =
        await salvarConfiguracoes(
          payload,
          'config-aparencia-message',
          'Aparência salva com sucesso.'
        );

      if (resposta?.empresa) {

        atualizarEmpresaLocal(
          resposta.empresa
        );

        definirCor(
          'config-cor-principal',
          'config-cor-principal-text',
          resposta.empresa.cor_primaria ||
            payload.cor_primaria
        );

        definirCor(
          'config-cor-destaque',
          'config-cor-destaque-text',
          resposta.empresa.cor_destaque ||
            payload.cor_destaque
        );

        definirCor(
          'config-cor-fundo',
          'config-cor-fundo-text',
          resposta.empresa.cor_fundo ||
            payload.cor_fundo
        );
      }

      atualizarPreviewTema();

      return resposta;

    } catch (error) {

      return null;
    }
  }


  // ==========================================================
  // RESTAURAR TEMA
  // ==========================================================

  function restaurarTema() {

    definirCor(
      'config-cor-principal',
      'config-cor-principal-text',
      CORES_PADRAO.primaria
    );

    definirCor(
      'config-cor-destaque',
      'config-cor-destaque-text',
      CORES_PADRAO.destaque
    );

    definirCor(
      'config-cor-fundo',
      'config-cor-fundo-text',
      CORES_PADRAO.fundo
    );

    atualizarPreviewTema();

    mostrarMensagem(
      'config-aparencia-message',
      'Tema restaurado. Clique em "Salvar tema" para aplicar definitivamente.',
      'info'
    );
  }


  // ==========================================================
  // SALVAR DOCUMENTOS
  // ==========================================================

  async function salvarDocumentos() {

    try {

      const payload =
        montarPayloadDocumentos();

      const resposta =
        await salvarConfiguracoes(
          payload,
          'configuracoes-message',
          'Configurações dos documentos salvas com sucesso.'
        );

      if (resposta?.empresa) {

        atualizarEmpresaLocal(
          resposta.empresa
        );

        preencherDadosEmpresa(
          resposta.empresa
        );
      }

      return resposta;

    } catch (error) {
      return null;
    }
  }


  // ==========================================================
  // SALVAR AGENDA
  // ==========================================================

  async function salvarAgenda() {

    try {

      const payload =
        montarPayloadAgenda();

      const resposta =
        await salvarConfiguracoes(
          payload,
          'configuracoes-message',
          'Configurações da agenda salvas com sucesso.'
        );

      if (resposta?.empresa) {

        atualizarEmpresaLocal(
          resposta.empresa
        );

        definirValor(
          'config-agenda-inicio',
          resposta.empresa.agenda_horario_inicio
        );

        definirValor(
          'config-agenda-fim',
          resposta.empresa.agenda_horario_fim
        );

        definirValor(
          'config-agenda-intervalo',
          resposta.empresa.agenda_intervalo
        );
      }

      return resposta;

    } catch (error) {
      return null;
    }
  }


  // ==========================================================
  // EVENTOS DOS FORMULÁRIOS
  // ==========================================================

  function configurarFormularioPrincipal() {

    const form =
      document.getElementById(
        'form-configuracoes'
      );

    if (!form) {
      return;
    }

    form.addEventListener(
      'submit',
      async event => {

        event.preventDefault();

        await salvarEmpresa();
      }
    );
  }


  // ==========================================================
  // BOTÕES
  // ==========================================================

  function configurarBotoes() {

    document
      .getElementById(
        'btn-salvar-configuracoes'
      )
      ?.addEventListener(
        'click',
        async event => {

          event.preventDefault();

          await salvarEmpresa();
        }
      );


    document
      .getElementById(
        'btn-salvar-preferencias'
      )
      ?.addEventListener(
        'click',
        async event => {

          event.preventDefault();

          await salvarPreferencias();
        }
      );


    document
      .getElementById(
        'btn-salvar-tema'
      )
      ?.addEventListener(
        'click',
        async event => {

          event.preventDefault();

          await salvarAparencia();
        }
      );


    document
      .getElementById(
        'btn-restaurar-tema'
      )
      ?.addEventListener(
        'click',
        event => {

          event.preventDefault();

          restaurarTema();
        }
      );


    document
      .getElementById(
        'btn-salvar-documentos'
      )
      ?.addEventListener(
        'click',
        async event => {

          event.preventDefault();

          await salvarDocumentos();
        }
      );


    document
      .getElementById(
        'btn-salvar-agenda'
      )
      ?.addEventListener(
        'click',
        async event => {

          event.preventDefault();

          await salvarAgenda();
        }
      );
  }


  // ==========================================================
  // ALTERAÇÃO DE NICHO
  // ==========================================================

  function configurarNicho() {

    const select =
      document.getElementById(
        'config-empresa-nicho'
      );

    if (!select) {
      return;
    }

    select.addEventListener(
      'change',
      () => {

        const nicho =
          String(
            select.value || ''
          ).trim().toLowerCase();

        if (
          !NICHOS_VALIDOS.includes(nicho)
        ) {
          return;
        }

        sincronizarNichoLocal(
          nicho
        );

        atualizarCamposVisuaisNicho(
          nicho
        );
      }
    );
  }


  // ==========================================================
  // INFORMAÇÕES DO SISTEMA
  // ==========================================================

  function preencherInformacoesSistema() {

    const empresa =
      obterEmpresaAtual();

    if (!empresa) {
      return;
    }

    definirTexto(
      'config-info-status',
      'Ativo'
    );

    definirTexto(
      'config-info-empresa',
      empresa.nome ||
        'Minha empresa'
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

    atualizarPreviewTema();

    const empresaInicial =
      obterEmpresaAtual();

    if (empresaInicial) {
      preencherDadosEmpresa(
        empresaInicial
      );
    }

    try {
      await carregarUsuarioAtual();
    } catch (error) {}

    try {
      await carregarConfiguracoes();
    } catch (error) {}

    preencherInformacoesSistema();
    atualizarPreviewTema();
  }


  // ==========================================================
  // API PÚBLICA
  // ==========================================================

  window.OrvixConfiguracoes = {
    carregarConfiguracoes,
    carregarUsuarioAtual,
    salvarEmpresa,
    salvarPreferencias,
    salvarAparencia,
    salvarDocumentos,
    salvarAgenda,
    restaurarTema,
    atualizarPreviewTema
  };


  // ==========================================================
  // DOM READY
  // ==========================================================

  if (
    document.readyState === 'loading'
  ) {

    document.addEventListener(
      'DOMContentLoaded',
      inicializarConfiguracoes,
      {
        once: true
      }
    );

  } else {

    inicializarConfiguracoes();
  }

})();