'use strict';

/*
============================================================
 ORVIX — CONFIGURAÇÕES
============================================================

 Responsável por:

 - Carregar configurações da empresa
 - Preencher todos os campos
 - Salvar dados da empresa
 - Salvar preferências
 - Salvar aparência
 - Salvar documentos
 - Salvar agenda
 - Carregar usuário logado
 - Atualizar sidebar
 - Aplicar cores do tema
 - Sincronizar color picker + campo hexadecimal
 - Temas rápidos
 - Restaurar aparência padrão

============================================================
*/

(() => {

  /* =========================================================
     CONFIGURAÇÕES
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
     UTILITÁRIOS
  ========================================================= */

  function obterToken() {
    return localStorage.getItem(TOKEN_KEY);
  }


  function headersAuth(json = false) {

    const token = obterToken();

    const headers = {
      Accept: 'application/json'
    };

    if (json) {
      headers['Content-Type'] = 'application/json';
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }


  function elemento(id) {
    return document.getElementById(id);
  }


  function valor(id, fallback = '') {

    const el = elemento(id);

    if (!el) {
      return fallback;
    }

    return typeof el.value === 'string'
      ? el.value.trim()
      : el.value;
  }


  function valorBruto(id, fallback = '') {

    const el = elemento(id);

    if (!el) {
      return fallback;
    }

    return el.value ?? fallback;
  }


  function valorBooleano(id, fallback = false) {

    const el = elemento(id);

    if (!el) {
      return fallback;
    }

    if (typeof el.checked === 'boolean') {
      return el.checked;
    }

    return el.value === 'true';
  }


  function definirValor(id, novoValor) {

    const el = elemento(id);

    if (!el || novoValor === undefined || novoValor === null) {
      return;
    }

    el.value = String(novoValor);
  }


  function definirBooleano(id, novoValor) {

    const el = elemento(id);

    if (!el || novoValor === undefined || novoValor === null) {
      return;
    }

    const valorNormalizado =
      novoValor === true ||
      novoValor === 'true' ||
      novoValor === 1 ||
      novoValor === '1';

    if ('checked' in el && el.type === 'checkbox') {
      el.checked = valorNormalizado;
      return;
    }

    el.value = valorNormalizado ? 'true' : 'false';
  }


  function mostrarMensagem(id, mensagem, tipo = 'sucesso') {

    const el = elemento(id);

    if (!el) {
      return;
    }

    el.textContent = mensagem || '';

    el.style.display = mensagem ? 'block' : 'none';

    if (tipo === 'sucesso') {

      el.style.background = '#ecfdf5';
      el.style.color = '#047857';
      el.style.borderColor = '#a7f3d0';

    } else {

      el.style.background = '#fef2f2';
      el.style.color = '#b91c1c';
      el.style.borderColor = '#fecaca';
    }
  }


  function limparMensagem(id) {

    const el = elemento(id);

    if (!el) {
      return;
    }

    el.textContent = '';
    el.style.display = 'none';
  }


  function bloquearBotao(id, texto) {

    const botao = elemento(id);

    if (!botao) {
      return;
    }

    botao.disabled = true;

    if (texto) {
      botao.textContent = texto;
    }
  }


  function liberarBotao(id, textoOriginal) {

    const botao = elemento(id);

    if (!botao) {
      return;
    }

    botao.disabled = false;

    if (textoOriginal) {
      botao.textContent = textoOriginal;
    }
  }


  /* =========================================================
     CORES
  ========================================================= */

  function corValida(cor) {

    if (typeof cor !== 'string') {
      return false;
    }

    return /^#[0-9A-Fa-f]{6}$/.test(cor.trim());
  }


  function normalizarCor(cor, fallback) {

    if (!cor) {
      return fallback;
    }

    const valorNormalizado = String(cor).trim().toUpperCase();

    return corValida(valorNormalizado)
      ? valorNormalizado
      : fallback;
  }


  function aplicarCoresEmpresa(empresa = {}) {

    const primaria = normalizarCor(
      empresa.cor_primaria,
      CORES_PADRAO.primaria
    );

    const destaque = normalizarCor(
      empresa.cor_destaque,
      CORES_PADRAO.destaque
    );

    const fundo = normalizarCor(
      empresa.cor_fundo,
      CORES_PADRAO.fundo
    );


    document.documentElement.style.setProperty(
      '--primary',
      primaria
    );

    document.documentElement.style.setProperty(
      '--primary-color',
      primaria
    );

    document.documentElement.style.setProperty(
      '--cor-primaria',
      primaria
    );


    document.documentElement.style.setProperty(
      '--accent',
      destaque
    );

    document.documentElement.style.setProperty(
      '--accent-color',
      destaque
    );

    document.documentElement.style.setProperty(
      '--cor-destaque',
      destaque
    );


    document.documentElement.style.setProperty(
      '--bg',
      fundo
    );

    document.documentElement.style.setProperty(
      '--background',
      fundo
    );

    document.documentElement.style.setProperty(
      '--cor-fundo',
      fundo
    );


    definirValor('config-cor-principal', primaria);
    definirValor('config-cor-principal-text', primaria);

    definirValor('config-cor-destaque', destaque);
    definirValor('config-cor-destaque-text', destaque);

    definirValor('config-cor-fundo', fundo);
    definirValor('config-cor-fundo-text', fundo);


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

    const preview = elemento('config-tema-preview');
    const badge = elemento('config-tema-preview-badge');
    const button = elemento('config-tema-preview-button');

    if (preview) {
      preview.style.background = fundo;
    }

    if (badge) {
      badge.style.background = destaque;
    }

    if (button) {
      button.style.background = primaria;
    }
  }


  function sincronizarCampoCor(colorId, textId) {

    const color = elemento(colorId);
    const text = elemento(textId);

    if (!color || !text) {
      return;
    }


    color.addEventListener('input', () => {

      const novaCor = color.value.toUpperCase();

      text.value = novaCor;

      atualizarPreviewDasCores();
    });


    text.addEventListener('input', () => {

      let novaCor = text.value.trim().toUpperCase();

      if (!novaCor.startsWith('#') && novaCor.length === 6) {
        novaCor = `#${novaCor}`;
      }

      if (corValida(novaCor)) {

        color.value = novaCor;

        atualizarPreviewDasCores();
      }
    });


    text.addEventListener('blur', () => {

      let novaCor = text.value.trim().toUpperCase();

      if (!novaCor.startsWith('#') && novaCor.length === 6) {
        novaCor = `#${novaCor}`;
      }

      if (!corValida(novaCor)) {

        text.value = color.value.toUpperCase();

        return;
      }

      text.value = novaCor;
      color.value = novaCor;

      atualizarPreviewDasCores();
    });
  }


  function atualizarPreviewDasCores() {

    const primaria = valor(
      'config-cor-principal',
      CORES_PADRAO.primaria
    );

    const destaque = valor(
      'config-cor-destaque',
      CORES_PADRAO.destaque
    );

    const fundo = valor(
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


    document.querySelectorAll('.theme-preset').forEach(botao => {

      botao.addEventListener('click', () => {

        const primaria =
          botao.dataset.primary ||
          CORES_PADRAO.primaria;

        const destaque =
          botao.dataset.accent ||
          CORES_PADRAO.destaque;

        const fundo =
          botao.dataset.background ||
          CORES_PADRAO.fundo;


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
      });

    });
  }


  /* =========================================================
     PREENCHER EMPRESA
  ========================================================= */

  function preencherDadosEmpresa(empresa) {

    if (!empresa) {
      return;
    }


    /* DADOS PRINCIPAIS */

    definirValor(
      'config-empresa-nome',
      empresa.nome
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


    /* NOME EXIBIÇÃO */

    definirValor(
      'config-empresa-nome-exibicao',
      empresa.nome_exibicao
    );


    /* LOGO */

    definirValor(
      'config-logo-url',
      empresa.logo_url
    );


    /* PREFERÊNCIAS REGIONAIS */

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


    /* PREFERÊNCIAS */

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

    aplicarCoresEmpresa(empresa);


    /* INFORMAÇÕES */

    definirValor(
      'config-info-empresa',
      empresa.nome
    );


    if (empresa.conta_teste === true) {

      definirValor(
        'config-info-status',
        'Conta de teste'
      );

    } else {

      definirValor(
        'config-info-status',
        'Ativa'
      );
    }


    /* SIDEBAR */

    const sidebarCompany =
      elemento('sidebar-company');

    if (sidebarCompany) {

      sidebarCompany.textContent =
        empresa.nome_exibicao ||
        empresa.nome ||
        'Minha empresa';

      sidebarCompany.title =
        sidebarCompany.textContent;
    }
  }


  /* =========================================================
     PREENCHER USUÁRIO
  ========================================================= */

  function preencherDadosUsuario(usuario) {

    if (!usuario) {
      return;
    }

    usuarioAtual = usuario;


    definirValor(
      'config-usuario-nome',
      usuario.nome
    );

    definirValor(
      'config-usuario-email',
      usuario.email
    );


    let perfil = usuario.perfil || '';

    if (perfil === 'administrador') {
      perfil = 'Administrador';
    } else if (perfil === 'funcionario') {
      perfil = 'Funcionário';
    } else if (perfil === 'dev') {
      perfil = 'Desenvolvedor';
    }


    definirValor(
      'config-usuario-perfil',
      perfil
    );


    const nomeSidebar =
      elemento('sidebar-user-name');

    const perfilSidebar =
      elemento('sidebar-user-profile');

    const avatar =
      elemento('sidebar-user-avatar');


    if (nomeSidebar) {

      nomeSidebar.textContent =
        usuario.nome || 'Usuário';
    }


    if (perfilSidebar) {

      perfilSidebar.textContent =
        perfil || '—';
    }


    if (avatar) {

      avatar.textContent =
        (usuario.nome || 'U')
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
      Array.isArray(usuario.permissoes)
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
        podeUsuarios ? 'flex' : 'none';
    }


    if (configuracoesNav) {
      configuracoesNav.style.display =
        podeConfiguracoes ? 'flex' : 'none';
    }
  }


  /* =========================================================
     CARREGAR USUÁRIO
  ========================================================= */

  async function carregarUsuario() {

    try {

      const resposta = await fetch(
        '/api/auth/me',
        {
          method: 'GET',
          headers: headersAuth(),
          credentials: 'include',
          cache: 'no-store'
        }
      );


      const dados =
        await resposta.json().catch(() => ({}));


      if (!resposta.ok) {

        if (resposta.status === 401) {

          localStorage.removeItem(TOKEN_KEY);

          return;
        }

        console.error(
          'Erro ao carregar usuário:',
          dados.erro
        );

        return;
      }


      usuarioAtual =
        dados.usuario || dados.user || null;


      empresaAtual =
        dados.empresa || null;


      preencherDadosUsuario(usuarioAtual);


      if (empresaAtual) {

        preencherDadosEmpresa(empresaAtual);
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

      const resposta = await fetch(
        '/api/configuracoes',
        {
          method: 'GET',
          headers: headersAuth(),
          credentials: 'include',
          cache: 'no-store'
        }
      );


      const dados =
        await resposta.json().catch(() => ({}));


      if (!resposta.ok) {

        console.error(
          'Erro ao carregar configurações:',
          dados.erro
        );

        mostrarMensagem(
          'configuracoes-message',
          dados.erro ||
          'Não foi possível carregar as configurações.',
          'erro'
        );

        return;
      }


      const empresa =
        dados.empresa || dados;


      if (!empresa || typeof empresa !== 'object') {

        console.error(
          'Resposta de configurações inválida:',
          dados
        );

        return;
      }


      empresaAtual = empresa;


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


    } catch (erro) {

      console.error(
        'Erro ao carregar configurações:',
        erro
      );
    }
  }


  /* =========================================================
     PAYLOAD — DADOS DA EMPRESA
  ========================================================= */

  function montarPayloadEmpresa() {

    return {

      nome:
        valor('config-empresa-nome'),

      email:
        valor('config-empresa-email'),

      telefone:
        valor('config-empresa-telefone'),

      nicho:
        valor('config-empresa-nicho'),

      nome_exibicao:
        valorBruto('config-empresa-nome-exibicao'),

      logo_url:
        valorBruto('config-logo-url')

    };
  }


  /* =========================================================
     PAYLOAD — PREFERÊNCIAS
  ========================================================= */

  function montarPayloadPreferencias() {

    return {

      moeda:
        valor('config-moeda'),

      idioma:
        valor('config-idioma'),

      formato_data:
        valor('config-formato-data'),

      formato_hora:
        valor('config-formato-hora'),

      fuso_horario:
        valor('config-fuso-horario'),

      notificacoes_ativas:
        valorBooleano('config-notificacoes-ativas'),

      mostrar_valores:
        valorBooleano('config-mostrar-valores'),

      dashboard_inicial:
        valorBooleano('config-dashboard-inicial'),

      modo_compacto:
        valorBooleano('config-modo-compacto')

    };
  }


  /* =========================================================
     PAYLOAD — APARÊNCIA
  ========================================================= */

  function montarPayloadAparencia() {

    return {

      cor_primaria:
        valor('config-cor-principal'),

      cor_destaque:
        valor('config-cor-destaque'),

      cor_fundo:
        valor('config-cor-fundo')

    };
  }


  /* =========================================================
     PAYLOAD — DOCUMENTOS
  ========================================================= */

  function montarPayloadDocumentos() {

    return {

      rodape_documentos:
        valorBruto('config-rodape-documentos'),

      telefone_documentos:
        valorBooleano('config-telefone-documentos')

    };
  }


  /* =========================================================
     PAYLOAD — AGENDA
  ========================================================= */

  function montarPayloadAgenda() {

    return {

      agenda_horario_inicio:
        valor('config-agenda-inicio'),

      agenda_horario_fim:
        valor('config-agenda-fim'),

      agenda_intervalo:
        Number(
          valor('config-agenda-intervalo', 30)
        )

    };
  }


  /* =========================================================
     VALIDAR CORES
  ========================================================= */

  function validarPayloadAparencia(payload) {

    if (!corValida(payload.cor_primaria)) {

      return 'A cor principal é inválida.';
    }


    if (!corValida(payload.cor_destaque)) {

      return 'A cor de destaque é inválida.';
    }


    if (!corValida(payload.cor_fundo)) {

      return 'A cor de fundo é inválida.';
    }


    return null;
  }


  /* =========================================================
     SALVAR NO BACKEND
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
        'Payload enviado para /api/configuracoes:',
        payload
      );


      const resposta = await fetch(
        '/api/configuracoes',
        {
          method: 'PUT',
          headers: headersAuth(true),
          credentials: 'include',
          body: JSON.stringify(payload)
        }
      );


      const dados =
        await resposta.json().catch(() => ({}));


      if (!resposta.ok) {

        throw new Error(
          dados.erro ||
          dados.message ||
          'Não foi possível salvar as configurações.'
        );
      }


      const empresa =
        dados.empresa || null;


      if (empresa) {

        empresaAtual = empresa;

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
      ========================================================
       RECARREGA DO BANCO

       Isso confirma que o valor realmente foi persistido.
      ========================================================
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
     SALVAR DADOS DA EMPRESA
  ========================================================= */

  async function salvarDadosEmpresa() {

    const nome =
      valor('config-empresa-nome');

    const email =
      valor('config-empresa-email');


    if (!nome) {

      mostrarMensagem(
        'configuracoes-message',
        'Informe o nome da empresa.',
        'erro'
      );

      return;
    }


    if (!email) {

      mostrarMensagem(
        'configuracoes-message',
        'Informe o e-mail da empresa.',
        'erro'
      );

      return;
    }


    const payload =
      montarPayloadEmpresa();


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
      validarPayloadAparencia(payload);


    if (erro) {

      mostrarMensagem(
        'config-aparencia-message',
        erro,
        'erro'
      );

      return;
    }


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

    const inicio =
      valor('config-agenda-inicio');

    const fim =
      valor('config-agenda-fim');

    const intervalo =
      Number(
        valor('config-agenda-intervalo', 30)
      );


    if (!inicio || !fim) {

      mostrarMensagem(
        'configuracoes-message',
        'Informe o horário inicial e final da agenda.',
        'erro'
      );

      return;
    }


    if (inicio >= fim) {

      mostrarMensagem(
        'configuracoes-message',
        'O horário inicial deve ser menor que o horário final.',
        'erro'
      );

      return;
    }


    if (!Number.isFinite(intervalo) || intervalo <= 0) {

      mostrarMensagem(
        'configuracoes-message',
        'Informe um intervalo válido para a agenda.',
        'erro'
      );

      return;
    }


    const payload =
      montarPayloadAgenda();


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
      cor_primaria: CORES_PADRAO.primaria,
      cor_destaque: CORES_PADRAO.destaque,
      cor_fundo: CORES_PADRAO.fundo
    });


    limparMensagem(
      'config-aparencia-message'
    );
  }


  /* =========================================================
     EVENTOS DOS FORMULÁRIOS
  ========================================================= */

  function configurarEventos() {

    const form =
      elemento('form-configuracoes');


    if (form) {

      form.addEventListener(
        'submit',
        event => {

          event.preventDefault();

          salvarDadosEmpresa();
        }
      );
    }


    const btnPreferencias =
      elemento('btn-salvar-preferencias');


    if (btnPreferencias) {

      btnPreferencias.addEventListener(
        'click',
        salvarPreferencias
      );
    }


    const btnAparencia =
      elemento('btn-salvar-tema');


    if (btnAparencia) {

      btnAparencia.addEventListener(
        'click',
        salvarAparencia
      );
    }


    const btnDocumentos =
      elemento('btn-salvar-documentos');


    if (btnDocumentos) {

      btnDocumentos.addEventListener(
        'click',
        salvarDocumentos
      );
    }


    const btnAgenda =
      elemento('btn-salvar-agenda');


    if (btnAgenda) {

      btnAgenda.addEventListener(
        'click',
        salvarAgenda
      );
    }


    const btnRestaurar =
      elemento('btn-restaurar-tema');


    if (btnRestaurar) {

      btnRestaurar.addEventListener(
        'click',
        restaurarTema
      );
    }
  }


  /* =========================================================
     API PÚBLICA
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


  /*
  Compatibilidade com código antigo.
  */

  window.preencherDadosConfiguracoes =
    function(usuario, empresa) {

      if (usuario) {
        preencherDadosUsuario(usuario);
      }

      if (empresa) {
        preencherDadosEmpresa(empresa);
      }
    };


  window.configurarSelecaoDeCores =
    configurarSelecaoDeCores;


  window.configurarSalvarTema =
    function() {
      /* Mantido apenas para compatibilidade. */
    };


  window.carregarCoresEmpresa =
    carregarConfiguracoes;


  /* =========================================================
     INICIALIZAÇÃO
  ========================================================= */

  document.addEventListener(
    'DOMContentLoaded',
    async () => {

      configurarSelecaoDeCores();

      configurarEventos();

      /*
      Carrega usuário primeiro para preencher
      sidebar e permissões.
      */

      await carregarUsuario();

      /*
      Depois carrega as configurações diretamente
      do banco.
      */

      await carregarConfiguracoes();

    }
  );

})();