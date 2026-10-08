'use strict';

/*
============================================================
 ORVIX — CONFIGURAÇÕES
============================================================

 Responsável por:

 - Carregar usuário
 - Carregar empresa
 - Carregar configurações
 - Salvar dados da empresa
 - Salvar preferências
 - Salvar aparência
 - Salvar documentos
 - Salvar agenda
 - Aplicar cores
 - Temas rápidos
 - Restaurar tema
 - Atualizar sidebar
 - Compatibilidade com código antigo

============================================================
*/

(() => {

  /* =========================================================
     CONFIGURAÇÕES GERAIS
  ========================================================= */

  const TOKEN_KEY = 'lavajato_auth_token';

  const CORES_PADRAO = {
    primaria: '#0E3A4C',
    destaque: '#06B6D4',
    fundo: '#F5F7FA'
  };


  /* =========================================================
     ESTADO
  ========================================================= */

  let empresaAtual = null;
  let usuarioAtual = null;
  let salvando = false;


  /* =========================================================
     ELEMENTOS
  ========================================================= */

  function elemento(id) {
    return document.getElementById(id);
  }


  /* =========================================================
     TOKEN / HEADERS
  ========================================================= */

  function obterToken() {

    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (erro) {
      console.warn(
        'Não foi possível acessar o token:',
        erro
      );

      return null;
    }
  }


  function headersAuth(json = false) {

    const token = obterToken();

    const headers = {
      Accept: 'application/json'
    };


    if (json) {
      headers['Content-Type'] =
        'application/json';
    }


    if (token) {
      headers.Authorization =
        `Bearer ${token}`;
    }


    return headers;
  }


  /* =========================================================
     VALORES
  ========================================================= */

  function valor(id, fallback = '') {

    const el = elemento(id);

    if (!el) {
      return fallback;
    }


    if (
      el.value === undefined ||
      el.value === null
    ) {
      return fallback;
    }


    return String(el.value).trim();
  }


  function valorBruto(id, fallback = '') {

    const el = elemento(id);

    if (!el) {
      return fallback;
    }


    if (
      el.value === undefined ||
      el.value === null
    ) {
      return fallback;
    }


    return String(el.value);
  }


  function valorBooleano(id, fallback = false) {

    const el = elemento(id);

    if (!el) {
      return fallback;
    }


    if (
      el.type === 'checkbox'
    ) {
      return Boolean(el.checked);
    }


    return (
      el.value === 'true' ||
      el.value === '1' ||
      el.value === 'on'
    );
  }


  function definirValor(id, novoValor) {

    const el = elemento(id);

    if (!el) {
      return;
    }


    if (
      novoValor === undefined ||
      novoValor === null
    ) {
      return;
    }


    el.value = String(novoValor);
  }


  function definirBooleano(id, novoValor) {

    const el = elemento(id);

    if (!el) {
      return;
    }


    const booleano =
      novoValor === true ||
      novoValor === 'true' ||
      novoValor === 1 ||
      novoValor === '1';


    if (el.type === 'checkbox') {

      el.checked = booleano;

      return;
    }


    el.value =
      booleano
        ? 'true'
        : 'false';
  }


  /* =========================================================
     MENSAGENS
  ========================================================= */

  function mostrarMensagem(
    id,
    mensagem,
    tipo = 'sucesso'
  ) {

    const el = elemento(id);

    if (!el) {
      return;
    }


    el.textContent =
      mensagem || '';


    el.style.display =
      mensagem
        ? 'block'
        : 'none';


    if (tipo === 'sucesso') {

      el.style.background =
        '#ecfdf5';

      el.style.color =
        '#047857';

      el.style.borderColor =
        '#a7f3d0';

    } else {

      el.style.background =
        '#fef2f2';

      el.style.color =
        '#b91c1c';

      el.style.borderColor =
        '#fecaca';
    }
  }


  function limparMensagem(id) {

    const el = elemento(id);

    if (!el) {
      return;
    }


    el.textContent = '';

    el.style.display =
      'none';
  }


  /* =========================================================
     BOTÕES
  ========================================================= */

  function bloquearBotao(
    id,
    texto
  ) {

    const botao =
      elemento(id);

    if (!botao) {
      return;
    }


    botao.disabled = true;


    if (texto) {
      botao.textContent =
        texto;
    }
  }


  function liberarBotao(
    id,
    textoOriginal
  ) {

    const botao =
      elemento(id);

    if (!botao) {
      return;
    }


    botao.disabled =
      false;


    if (textoOriginal) {

      botao.textContent =
        textoOriginal;
    }
  }


  /* =========================================================
     CORES
  ========================================================= */

  function corValida(cor) {

    if (
      typeof cor !== 'string'
    ) {
      return false;
    }


    return /^#[0-9A-Fa-f]{6}$/
      .test(cor.trim());
  }


  function normalizarCor(
    cor,
    fallback
  ) {

    if (
      cor === null ||
      cor === undefined
    ) {
      return fallback;
    }


    const normalizada =
      String(cor)
        .trim()
        .toUpperCase();


    return corValida(normalizada)
      ? normalizada
      : fallback;
  }


  function aplicarCoresEmpresa(
    empresa = {}
  ) {

    const primaria =
      normalizarCor(
        empresa.cor_primaria,
        CORES_PADRAO.primaria
      );


    const destaque =
      normalizarCor(
        empresa.cor_destaque,
        CORES_PADRAO.destaque
      );


    const fundo =
      normalizarCor(
        empresa.cor_fundo,
        CORES_PADRAO.fundo
      );


    const root =
      document.documentElement;


    /*
    Variáveis utilizadas pelo sistema
    */

    root.style.setProperty(
      '--primary',
      primaria
    );

    root.style.setProperty(
      '--primary-color',
      primaria
    );

    root.style.setProperty(
      '--cor-primaria',
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
      '--cor-destaque',
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

    root.style.setProperty(
      '--cor-fundo',
      fundo
    );


    /*
    Atualiza os campos da aparência
    */

    definirValor(
      'config-cor-principal',
      primaria
    );

    definirValor(
      'config-cor-principal-text',
      primaria
    );


    definirValor(
      'config-cor-destaque',
      destaque
    );

    definirValor(
      'config-cor-destaque-text',
      destaque
    );


    definirValor(
      'config-cor-fundo',
      fundo
    );

    definirValor(
      'config-cor-fundo-text',
      fundo
    );


    atualizarPreviewTema(
      primaria,
      destaque,
      fundo
    );
  }


  function atualizarPreviewTema(
    primaria,
    destaque,
    fundo
  ) {

    const preview =
      elemento('config-tema-preview');

    const badge =
      elemento('config-tema-preview-badge');

    const button =
      elemento('config-tema-preview-button');


    if (preview) {

      preview.style.background =
        fundo;
    }


    if (badge) {

      badge.style.background =
        destaque;
    }


    if (button) {

      button.style.background =
        primaria;
    }
  }


  /* =========================================================
     CAMPOS DE COR
  ========================================================= */

  function sincronizarCampoCor(
    colorId,
    textId
  ) {

    const color =
      elemento(colorId);

    const text =
      elemento(textId);


    if (!color || !text) {
      return;
    }


    color.addEventListener(
      'input',
      () => {

        text.value =
          color.value
            .toUpperCase();


        atualizarPreviewDasCores();
      }
    );


    text.addEventListener(
      'input',
      () => {

        let novaCor =
          text.value
            .trim()
            .toUpperCase();


        if (
          !novaCor.startsWith('#') &&
          novaCor.length === 6
        ) {
          novaCor =
            `#${novaCor}`;
        }


        if (corValida(novaCor)) {

          color.value =
            novaCor;

          atualizarPreviewDasCores();
        }
      }
    );


    text.addEventListener(
      'blur',
      () => {

        let novaCor =
          text.value
            .trim()
            .toUpperCase();


        if (
          !novaCor.startsWith('#') &&
          novaCor.length === 6
        ) {
          novaCor =
            `#${novaCor}`;
        }


        if (!corValida(novaCor)) {

          text.value =
            color.value
              .toUpperCase();

          return;
        }


        text.value =
          novaCor;

        color.value =
          novaCor;


        atualizarPreviewDasCores();
      }
    );
  }


  function atualizarPreviewDasCores() {

    const primaria =
      valor(
        'config-cor-principal',
        CORES_PADRAO.primaria
      );


    const destaque =
      valor(
        'config-cor-destaque',
        CORES_PADRAO.destaque
      );


    const fundo =
      valor(
        'config-cor-fundo',
        CORES_PADRAO.fundo
      );


    atualizarPreviewTema(

      corValida(primaria)
        ? primaria
        : CORES_PADRAO.primaria,

      corValida(destaque)
        ? destaque
        : CORES_PADRAO.destaque,

      corValida(fundo)
        ? fundo
        : CORES_PADRAO.fundo
    );
  }


  function configurarSelecaoDeCores() {

    sincronizarCampoCor(
      'config-cor-principal',
      'config-cor-principal-text'
    );


    sincronizarCampoCor(
      'config-cor-destaque',
      'config-cor-destaque-text'
    );


    sincronizarCampoCor(
      'config-cor-fundo',
      'config-cor-fundo-text'
    );


    document
      .querySelectorAll('.theme-preset')
      .forEach(botao => {

        botao.addEventListener(
          'click',
          () => {

            const primaria =
              normalizarCor(
                botao.dataset.primary,
                CORES_PADRAO.primaria
              );


            const destaque =
              normalizarCor(
                botao.dataset.accent,
                CORES_PADRAO.destaque
              );


            const fundo =
              normalizarCor(
                botao.dataset.background,
                CORES_PADRAO.fundo
              );


            definirValor(
              'config-cor-principal',
              primaria
            );

            definirValor(
              'config-cor-principal-text',
              primaria
            );


            definirValor(
              'config-cor-destaque',
              destaque
            );

            definirValor(
              'config-cor-destaque-text',
              destaque
            );


            definirValor(
              'config-cor-fundo',
              fundo
            );

            definirValor(
              'config-cor-fundo-text',
              fundo
            );


            atualizarPreviewTema(
              primaria,
              destaque,
              fundo
            );
          }
        );
      });
  }


  /* =========================================================
     PREENCHER EMPRESA
  ========================================================= */

  function preencherDadosEmpresa(
    empresa
  ) {

    if (
      !empresa ||
      typeof empresa !== 'object'
    ) {
      return;
    }


    /* DADOS DA EMPRESA */

    definirValor(
      'config-empresa-nome',
      empresa.nome
    );


    definirValor(
      'config-empresa-nome-exibicao',
      empresa.nome_exibicao
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
      empresa.nicho
    );


    definirValor(
      'config-logo-url',
      empresa.logo_url
    );


    /* REGIONAL */

    definirValor(
      'config-moeda',
      empresa.moeda
    );


    definirValor(
      'config-idioma',
      empresa.idioma
    );


    definirValor(
      'config-formato-data',
      empresa.formato_data
    );


    definirValor(
      'config-formato-hora',
      empresa.formato_hora
    );


    definirValor(
      'config-fuso-horario',
      empresa.fuso_horario
    );


    /* SISTEMA */

    definirBooleano(
      'config-notificacoes-ativas',
      empresa.notificacoes_ativas
    );


    definirBooleano(
      'config-mostrar-valores',
      empresa.mostrar_valores
    );


    definirBooleano(
      'config-dashboard-inicial',
      empresa.dashboard_inicial
    );


    definirBooleano(
      'config-modo-compacto',
      empresa.modo_compacto
    );


    /* DOCUMENTOS */

    definirValor(
      'config-rodape-documentos',
      empresa.rodape_documentos
    );


    definirBooleano(
      'config-telefone-documentos',
      empresa.telefone_documentos
    );


    /* AGENDA */

    definirValor(
      'config-agenda-inicio',
      empresa.agenda_horario_inicio
    );


    definirValor(
      'config-agenda-fim',
      empresa.agenda_horario_fim
    );


    definirValor(
      'config-agenda-intervalo',
      empresa.agenda_intervalo
    );


    /* APARÊNCIA */

    aplicarCoresEmpresa(
      empresa
    );


    /* INFORMAÇÕES */

    definirValor(
      'config-info-empresa',
      empresa.nome || ''
    );


    definirValor(
      'config-info-status',
      empresa.conta_teste === true
        ? 'Conta de teste'
        : 'Ativa'
    );


    /* SIDEBAR */

    const sidebarCompany =
      elemento('sidebar-company');


    if (sidebarCompany) {

      sidebarCompany.textContent =
        empresa.nome_exibicao ||
        empresa.nome ||
        'Minha empresa';
    }
  }


  /* =========================================================
     PREENCHER USUÁRIO
  ========================================================= */

  function preencherDadosUsuario(
    usuario
  ) {

    if (
      !usuario ||
      typeof usuario !== 'object'
    ) {
      return;
    }


    usuarioAtual =
      usuario;


    definirValor(
      'config-usuario-nome',
      usuario.nome
    );


    definirValor(
      'config-usuario-email',
      usuario.email
    );


    let perfil =
      usuario.perfil || '';


    if (
      perfil === 'administrador'
    ) {

      perfil =
        'Administrador';

    } else if (
      perfil === 'funcionario'
    ) {

      perfil =
        'Funcionário';

    } else if (
      perfil === 'dev'
    ) {

      perfil =
        'Desenvolvedor';
    }


    definirValor(
      'config-usuario-perfil',
      perfil
    );


    /* SIDEBAR */

    const nomeSidebar =
      elemento('sidebar-user-name');


    const perfilSidebar =
      elemento('sidebar-user-profile');


    const avatar =
      elemento('sidebar-user-avatar');


    if (nomeSidebar) {

      nomeSidebar.textContent =
        usuario.nome ||
        'Usuário';
    }


    if (perfilSidebar) {

      perfilSidebar.textContent =
        perfil ||
        '—';
    }


    if (avatar) {

      avatar.textContent =
        (
          usuario.nome ||
          'U'
        )
          .trim()
          .charAt(0)
          .toUpperCase();
    }


    /* PERMISSÕES */

    const usuariosNav =
      elemento('nav-usuarios');


    const configuracoesNav =
      elemento('nav-configuracoes');


    const permissoes =
      Array.isArray(
        usuario.permissoes
      )
        ? usuario.permissoes
        : [];


    const podeUsuarios =
      usuario.perfil === 'administrador' ||
      usuario.perfil === 'dev' ||
      permissoes.includes('usuarios');


    const podeConfiguracoes =
      usuario.perfil === 'administrador' ||
      usuario.perfil === 'dev' ||
      permissoes.includes('configuracoes');


    if (usuariosNav) {

      usuariosNav.style.display =
        podeUsuarios
          ? ''
          : 'none';
    }


    if (configuracoesNav) {

      configuracoesNav.style.display =
        podeConfiguracoes
          ? ''
          : 'none';
    }
  }


  /* =========================================================
     CARREGAR USUÁRIO
  ========================================================= */

  async function carregarUsuario() {

    try {

      const resposta =
        await fetch(
          '/api/auth/me',
          {
            method: 'GET',
            headers: headersAuth(),
            credentials: 'include',
            cache: 'no-store'
          }
        );


      const dados =
        await resposta
          .json()
          .catch(() => ({}));


      if (!resposta.ok) {

        if (
          resposta.status === 401
        ) {

          try {
            localStorage.removeItem(
              TOKEN_KEY
            );
          } catch (_) {}

          return;
        }


        console.error(
          'Erro ao carregar usuário:',
          dados.erro ||
          dados.message
        );

        return;
      }


      usuarioAtual =
        dados.usuario ||
        dados.user ||
        null;


      empresaAtual =
        dados.empresa ||
        null;


      preencherDadosUsuario(
        usuarioAtual
      );


      if (empresaAtual) {

        preencherDadosEmpresa(
          empresaAtual
        );
      }


      window.lavajatoUsuario =
        usuarioAtual;


      window.lavajatoEmpresa =
        empresaAtual;


    } catch (erro) {

      console.error(
        'Erro ao carregar usuário:',
        erro
      );
    }
  }


  /* =========================================================
     CARREGAR CONFIGURAÇÕES
  ========================================================= */

  async function carregarConfiguracoes() {

    try {

      const resposta =
        await fetch(
          '/api/configuracoes',
          {
            method: 'GET',
            headers: headersAuth(),
            credentials: 'include',
            cache: 'no-store'
          }
        );


      const dados =
        await resposta
          .json()
          .catch(() => ({}));


      if (!resposta.ok) {

        console.error(
          'Erro ao carregar configurações:',
          dados.erro ||
          dados.message
        );

        mostrarMensagem(
          'configuracoes-message',
          dados.erro ||
          'Não foi possível carregar as configurações.',
          'erro'
        );

        return null;
      }


      const empresa =
        dados.empresa ||
        dados.configuracoes ||
        dados;


      if (
        !empresa ||
        typeof empresa !== 'object'
      ) {

        console.error(
          'Resposta inválida de /api/configuracoes:',
          dados
        );

        return null;
      }


      empresaAtual =
        empresa;


      window.lavajatoEmpresa =
        empresa;


      preencherDadosEmpresa(
        empresa
      );


      if (usuarioAtual) {

        preencherDadosUsuario(
          usuarioAtual
        );
      }


      console.log(
        'Configurações carregadas:',
        empresa
      );


      return empresa;


    } catch (erro) {

      console.error(
        'Erro ao carregar configurações:',
        erro
      );

      return null;
    }
  }


  /* =========================================================
     PAYLOAD — EMPRESA
  ========================================================= */

  function montarPayloadEmpresa() {

    return {

      nome:
        valorBruto(
          'config-empresa-nome'
        ).trim(),

      email:
        valorBruto(
          'config-empresa-email'
        ).trim(),

      telefone:
        valorBruto(
          'config-empresa-telefone'
        ).trim(),

      nicho:
        valorBruto(
          'config-empresa-nicho'
        ).trim(),

      nome_exibicao:
        valorBruto(
          'config-empresa-nome-exibicao'
        ).trim(),

      logo_url:
        valorBruto(
          'config-logo-url'
        ).trim()

    };
  }


  /* =========================================================
     PAYLOAD — PREFERÊNCIAS
  ========================================================= */

  function montarPayloadPreferencias() {

    return {

      moeda:
        valor(
          'config-moeda'
        ),

      idioma:
        valor(
          'config-idioma'
        ),

      formato_data:
        valor(
          'config-formato-data'
        ),

      formato_hora:
        valor(
          'config-formato-hora'
        ),

      fuso_horario:
        valor(
          'config-fuso-horario'
        ),

      notificacoes_ativas:
        valorBooleano(
          'config-notificacoes-ativas'
        ),

      mostrar_valores:
        valorBooleano(
          'config-mostrar-valores'
        ),

      dashboard_inicial:
        valorBooleano(
          'config-dashboard-inicial'
        ),

      modo_compacto:
        valorBooleano(
          'config-modo-compacto'
        )

    };
  }


  /* =========================================================
     PAYLOAD — APARÊNCIA
  ========================================================= */

  function montarPayloadAparencia() {

    return {

      cor_primaria:
        valor(
          'config-cor-principal'
        ).toUpperCase(),

      cor_destaque:
        valor(
          'config-cor-destaque'
        ).toUpperCase(),

      cor_fundo:
        valor(
          'config-cor-fundo'
        ).toUpperCase()

    };
  }


  /* =========================================================
     PAYLOAD — DOCUMENTOS
  ========================================================= */

  function montarPayloadDocumentos() {

    return {

      rodape_documentos:
        valorBruto(
          'config-rodape-documentos'
        ),

      telefone_documentos:
        valorBooleano(
          'config-telefone-documentos'
        )

    };
  }


  /* =========================================================
     PAYLOAD — AGENDA
  ========================================================= */

  function montarPayloadAgenda() {

    const inicio =
      valorBruto(
        'config-agenda-inicio'
      ).trim();


    const fim =
      valorBruto(
        'config-agenda-fim'
      ).trim();


    const intervaloRaw =
      valorBruto(
        'config-agenda-intervalo'
      ).trim();


    const intervalo =
      Number(intervaloRaw);


    return {

      agenda_horario_inicio:
        inicio || null,

      agenda_horario_fim:
        fim || null,

      agenda_intervalo:
        Number.isFinite(intervalo)
          ? intervalo
          : null

    };
  }


  /* =========================================================
     VALIDAR EMPRESA
  ========================================================= */

  function validarEmpresa(payload) {

    if (!payload.nome) {

      return (
        'Informe o nome da empresa.'
      );
    }


    if (!payload.email) {

      return (
        'Informe o e-mail da empresa.'
      );
    }


    const emailValido =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(payload.email);


    if (!emailValido) {

      return (
        'Informe um e-mail válido.'
      );
    }


    return null;
  }


  /* =========================================================
     VALIDAR APARÊNCIA
  ========================================================= */

  function validarAparencia(
    payload
  ) {

    if (
      !corValida(
        payload.cor_primaria
      )
    ) {

      return (
        'A cor principal é inválida.'
      );
    }


    if (
      !corValida(
        payload.cor_destaque
      )
    ) {

      return (
        'A cor de destaque é inválida.'
      );
    }


    if (
      !corValida(
        payload.cor_fundo
      )
    ) {

      return (
        'A cor de fundo é inválida.'
      );
    }


    return null;
  }


  /* =========================================================
     VALIDAR AGENDA
  ========================================================= */

  function validarAgenda(
    payload
  ) {

    if (
      !payload.agenda_horario_inicio ||
      !payload.agenda_horario_fim
    ) {

      return (
        'Informe o horário inicial e final da agenda.'
      );
    }


    /*
    Como os horários são HH:mm,
    a comparação textual funciona
    corretamente.
    */

    if (
      payload.agenda_horario_inicio >=
      payload.agenda_horario_fim
    ) {

      return (
        'O horário inicial deve ser menor que o horário final.'
      );
    }


    if (
      !Number.isInteger(
        payload.agenda_intervalo
      )
    ) {

      return (
        'O intervalo da agenda deve ser um número inteiro.'
      );
    }


    if (
      payload.agenda_intervalo <= 0
    ) {

      return (
        'O intervalo da agenda deve ser maior que zero.'
      );
    }


    return null;
  }


  /* =========================================================
     SALVAR
  ========================================================= */

  async function salvarConfiguracoes(
    payload,
    botaoId,
    textoOriginal,
    mensagemId
  ) {

    if (salvando) {
      return false;
    }


    salvando = true;


    limparMensagem(
      mensagemId
    );


    bloquearBotao(
      botaoId,
      'Salvando...'
    );


    try {

      console.log(
        '=================================================='
      );

      console.log(
        'PUT /api/configuracoes'
      );

      console.log(
        'Payload:',
        payload
      );

      console.log(
        JSON.stringify(
          payload,
          null,
          2
        )
      );

      console.log(
        '=================================================='
      );


      const resposta =
        await fetch(
          '/api/configuracoes',
          {
            method: 'PUT',

            headers: {
              ...headersAuth(true),
              'Cache-Control':
                'no-cache'
            },

            credentials: 'include',

            cache: 'no-store',

            body:
              JSON.stringify(payload)
          }
        );


      const textoResposta =
        await resposta.text();


      let dados = {};


      try {

        dados =
          textoResposta
            ? JSON.parse(
                textoResposta
              )
            : {};

      } catch (_) {

        dados = {
          erro:
            textoResposta ||
            `Erro HTTP ${resposta.status}.`
        };
      }


      console.log(
        'Status:',
        resposta.status
      );


      console.log(
        'Resposta:',
        dados
      );


      if (!resposta.ok) {

        throw new Error(
          dados.erro ||
          dados.message ||
          dados.mensagem ||
          `Erro HTTP ${resposta.status}.`
        );
      }


      const empresa =
        dados.empresa ||
        dados.configuracoes ||
        null;


      if (empresa) {

        empresaAtual =
          empresa;


        window.lavajatoEmpresa =
          empresa;


        preencherDadosEmpresa(
          empresa
        );
      }


      mostrarMensagem(
        mensagemId,
        dados.mensagem ||
        'Configurações salvas com sucesso.',
        'sucesso'
      );


      /*
      Confirmação diretamente do banco.
      */

      await carregarConfiguracoes();


      return true;


    } catch (erro) {

      console.error(
        'Erro ao salvar configurações:',
        erro
      );


      mostrarMensagem(
        mensagemId,
        erro.message ||
        'Não foi possível salvar as configurações.',
        'erro'
      );


      return false;


    } finally {

      liberarBotao(
        botaoId,
        textoOriginal
      );


      salvando = false;
    }
  }


  /* =========================================================
     SALVAR EMPRESA
  ========================================================= */

  async function salvarDadosEmpresa() {

    const payload =
      montarPayloadEmpresa();


    const erro =
      validarEmpresa(
        payload
      );


    if (erro) {

      mostrarMensagem(
        'configuracoes-message',
        erro,
        'erro'
      );

      return;
    }


    await salvarConfiguracoes(

      payload,

      'btn-salvar-configuracoes',

      'Salvar alterações',

      'configuracoes-message'
    );
  }


  /* =========================================================
     SALVAR PREFERÊNCIAS
  ========================================================= */

  async function salvarPreferencias() {

    const payload =
      montarPayloadPreferencias();


    await salvarConfiguracoes(

      payload,

      'btn-salvar-preferencias',

      'Salvar preferências',

      'configuracoes-message'
    );
  }


  /* =========================================================
     SALVAR APARÊNCIA
  ========================================================= */

  async function salvarAparencia() {

    const payload =
      montarPayloadAparencia();


    const erro =
      validarAparencia(
        payload
      );


    if (erro) {

      mostrarMensagem(
        'config-aparencia-message',
        erro,
        'erro'
      );

      return;
    }


    /*
    Aplica imediatamente na interface.
    */

    aplicarCoresEmpresa(
      payload
    );


    await salvarConfiguracoes(

      payload,

      'btn-salvar-tema',

      'Salvar aparência',

      'config-aparencia-message'
    );
  }


  /* =========================================================
     SALVAR DOCUMENTOS
  ========================================================= */

  async function salvarDocumentos() {

    const payload =
      montarPayloadDocumentos();


    await salvarConfiguracoes(

      payload,

      'btn-salvar-documentos',

      'Salvar documentos',

      'configuracoes-message'
    );
  }


  /* =========================================================
     SALVAR AGENDA
  ========================================================= */

  async function salvarAgenda() {

    const payload =
      montarPayloadAgenda();


    console.log(
      'Payload da agenda:',
      payload
    );


    const erro =
      validarAgenda(
        payload
      );


    if (erro) {

      mostrarMensagem(
        'configuracoes-message',
        erro,
        'erro'
      );

      return;
    }


    await salvarConfiguracoes(

      payload,

      'btn-salvar-agenda',

      'Salvar agenda',

      'configuracoes-message'
    );
  }


  /* =========================================================
     RESTAURAR TEMA
  ========================================================= */

  function restaurarTema() {

    definirValor(
      'config-cor-principal',
      CORES_PADRAO.primaria
    );


    definirValor(
      'config-cor-principal-text',
      CORES_PADRAO.primaria
    );


    definirValor(
      'config-cor-destaque',
      CORES_PADRAO.destaque
    );


    definirValor(
      'config-cor-destaque-text',
      CORES_PADRAO.destaque
    );


    definirValor(
      'config-cor-fundo',
      CORES_PADRAO.fundo
    );


    definirValor(
      'config-cor-fundo-text',
      CORES_PADRAO.fundo
    );


    aplicarCoresEmpresa({

      cor_primaria:
        CORES_PADRAO.primaria,

      cor_destaque:
        CORES_PADRAO.destaque,

      cor_fundo:
        CORES_PADRAO.fundo

    });


    limparMensagem(
      'config-aparencia-message'
    );
  }


  /* =========================================================
     EVENTOS
  ========================================================= */

  function configurarEventos() {

    /* EMPRESA */

    const form =
      elemento(
        'form-configuracoes'
      );


    if (form) {

      form.addEventListener(
        'submit',
        event => {

          event.preventDefault();

          salvarDadosEmpresa();
        }
      );
    }


    /* PREFERÊNCIAS */

    const btnPreferencias =
      elemento(
        'btn-salvar-preferencias'
      );


    if (btnPreferencias) {

      btnPreferencias.addEventListener(
        'click',
        event => {

          event.preventDefault();

          salvarPreferencias();
        }
      );
    }


    /* APARÊNCIA */

    const btnAparencia =
      elemento(
        'btn-salvar-tema'
      );


    if (btnAparencia) {

      btnAparencia.addEventListener(
        'click',
        event => {

          event.preventDefault();

          salvarAparencia();
        }
      );
    }


    /* DOCUMENTOS */

    const btnDocumentos =
      elemento(
        'btn-salvar-documentos'
      );


    if (btnDocumentos) {

      btnDocumentos.addEventListener(
        'click',
        event => {

          event.preventDefault();

          salvarDocumentos();
        }
      );
    }


    /* AGENDA */

    const btnAgenda =
      elemento(
        'btn-salvar-agenda'
      );


    if (btnAgenda) {

      btnAgenda.addEventListener(
        'click',
        event => {

          event.preventDefault();

          salvarAgenda();
        }
      );
    }


    /* RESTAURAR TEMA */

    const btnRestaurar =
      elemento(
        'btn-restaurar-tema'
      );


    if (btnRestaurar) {

      btnRestaurar.addEventListener(
        'click',
        event => {

          event.preventDefault();

          restaurarTema();
        }
      );
    }
  }


  /* =========================================================
     COMPATIBILIDADE
  ========================================================= */

  window.carregarConfiguracoes =
    carregarConfiguracoes;


  window.carregarUsuarioSidebar =
    carregarUsuario;


  window.salvarConfiguracoes =
    salvarConfiguracoes;


  window.salvarDadosEmpresa =
    salvarDadosEmpresa;


  window.salvarPreferencias =
    salvarPreferencias;


  window.salvarAparencia =
    salvarAparencia;


  window.salvarDocumentos =
    salvarDocumentos;


  window.salvarAgenda =
    salvarAgenda;


  window.aplicarCoresEmpresa =
    aplicarCoresEmpresa;


  window.configurarSelecaoDeCores =
    configurarSelecaoDeCores;


  window.configurarSalvarTema =
    function () {
      /*
      Mantido para compatibilidade
      com código antigo.
      */
    };


  window.carregarCoresEmpresa =
    carregarConfiguracoes;


  window.preencherDadosConfiguracoes =
    function (
      usuario,
      empresa
    ) {

      if (usuario) {

        preencherDadosUsuario(
          usuario
        );
      }


      if (empresa) {

        preencherDadosEmpresa(
          empresa
        );
      }
    };


  /* =========================================================
     INICIALIZAÇÃO
  ========================================================= */

  document.addEventListener(
    'DOMContentLoaded',
    async () => {

      try {

        configurarSelecaoDeCores();

        configurarEventos();


        /*
        Usuário primeiro.
        */

        await carregarUsuario();


        /*
        Configurações depois.
        */

        await carregarConfiguracoes();


      } catch (erro) {

        console.error(
          'Erro ao inicializar configurações:',
          erro
        );
      }
    }
  );

})();