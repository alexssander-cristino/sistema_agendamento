'use strict';

/* ============================================================
   ORVIX — CONFIGURAÇÕES
   Arquivo: public/js/configs.js
   ============================================================ */

const CONFIGS_TOKEN_KEY = 'lavajato_auth_token';

const CONFIGS_CORES_PADRAO = {
  primaria: '#0E3A4C',
  destaque: '#06B6D4',
  fundo: '#F5F7FA'
};

const CONFIGS_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let empresaConfiguracoes = null;
let usuarioConfiguracoes = null;
let carregandoConfiguracoes = false;
let salvandoConfiguracoes = false;

  // ============================================================
  // NICHOS DE EMPRESA
  // ------------------------------------------------------------
  // Os campos extras reaproveitam as colunas já existentes:
  //   extra1 -> "placa"   (campo ap-plate)
  //   extra2 -> "veiculo" (campo ap-vehicle)
  // Assim o backend continua funcionando sem mudanças.
  // Use extra = null para esconder o campo naquele nicho.
  // ============================================================

  const NICHO_PADRAO = 'lavajato';

  const NICHOS = {
    lavajato: {
      nome: 'Lava-jato / Estética automotiva',
      cliente: 'Cliente',
      servico: 'Serviço',
      servicos: 'Serviços',
      novoServico: 'Novo serviço',
      extra1: { label: 'Placa', placeholder: 'ABC1D23', upper: true },
      extra2: { label: 'Veículo', placeholder: 'Modelo / cor' }
    },
    barbearia: {
      nome: 'Barbearia / Salão de beleza',
      cliente: 'Cliente',
      servico: 'Serviço',
      servicos: 'Serviços',
      novoServico: 'Novo serviço',
      extra1: { label: 'Profissional', placeholder: 'Quem vai atender' },
      extra2: null
    },
    clinica: {
      nome: 'Clínica / Consultório',
      cliente: 'Paciente',
      servico: 'Procedimento',
      servicos: 'Procedimentos',
      novoServico: 'Novo procedimento',
      extra1: { label: 'Convênio', placeholder: 'Particular, Unimed...' },
      extra2: { label: 'Profissional', placeholder: 'Médico / dentista' }
    },
    pet: {
      nome: 'Pet shop / Veterinária',
      cliente: 'Tutor',
      servico: 'Serviço',
      servicos: 'Serviços',
      novoServico: 'Novo serviço',
      extra1: { label: 'Nome do pet', placeholder: 'Ex: Thor' },
      extra2: { label: 'Raça / porte', placeholder: 'Ex: Golden, grande' }
    },
    oficina: {
      nome: 'Oficina mecânica',
      cliente: 'Cliente',
      servico: 'Serviço',
      servicos: 'Serviços',
      novoServico: 'Novo serviço',
      extra1: { label: 'Placa', placeholder: 'ABC1D23', upper: true },
      extra2: { label: 'Veículo', placeholder: 'Modelo / ano' }
    },
    personal: {
      nome: 'Personal / Aulas / Consultoria',
      cliente: 'Aluno / Cliente',
      servico: 'Aula / Sessão',
      servicos: 'Aulas e sessões',
      novoServico: 'Nova aula / sessão',
      extra1: null,
      extra2: null
    },
    generico: {
      nome: 'Outro',
      cliente: 'Cliente',
      servico: 'Serviço',
      servicos: 'Serviços',
      novoServico: 'Novo serviço',
      extra1: null,
      extra2: null
    }
  };


  function getNicho(){
    const chave = empresaLogada && empresaLogada.nicho;
    return NICHOS[chave] || NICHOS[NICHO_PADRAO];
  }


  function aplicarNicho(chave){

    // Sem nicho informado (ex.: resposta que ainda não traz o campo),
    // mantém o último nicho aplicado em vez de voltar para o padrão.
    if(!chave){
      chave =
        window.nichoAtual ||
        (empresaLogada && empresaLogada.nicho) ||
        NICHO_PADRAO;
    }

    const chaveValida = NICHOS[chave] ? chave : NICHO_PADRAO;
    const n = NICHOS[chaveValida];

    window.nichoAtual = chaveValida;

    // Garante que getNicho() reflita a escolha mesmo antes do /auth/me
    if(empresaLogada){
      empresaLogada.nicho = chaveValida;
    }

    // Modal de agendamento
    const lblServico = document.getElementById('ap-service-label');
    if(lblServico){ lblServico.textContent = n.servico; }

    const lblCliente = document.getElementById('ap-client-label');
    if(lblCliente){ lblCliente.textContent = n.cliente; }

    [
      ['extra1', 'ap-plate'],
      ['extra2', 'ap-vehicle']
    ].forEach(([chaveExtra, inputId]) => {

      const cfg = n[chaveExtra];
      const campo = document.getElementById('ap-' + chaveExtra + '-field');
      const input = document.getElementById(inputId);
      const label = document.getElementById('ap-' + chaveExtra + '-label');

      if(!campo || !input){ return; }

      if(cfg){
        campo.style.display = '';
        if(label){ label.textContent = cfg.label; }
        input.placeholder = cfg.placeholder;
      }else{
        campo.style.display = 'none';
        input.value = '';
      }
    });

    // Menu e títulos de Serviços
    const navServicos = document.querySelector('[data-tab="servicos"] .nav-text');
    if(navServicos){ navServicos.textContent = n.servicos; }

    const h1Servicos = document.querySelector('#panel-servicos h1');
    if(h1Servicos){ h1Servicos.textContent = n.servicos; }

    const btnNovoServico = document.getElementById('btn-new-service');
    if(btnNovoServico){ btnNovoServico.textContent = n.novoServico; }

    // Busca de clientes
    const buscaCli = document.getElementById('cli-search-input');
    if(buscaCli){
      buscaCli.placeholder =
        n.extra1
          ? 'Nome, telefone ou ' + n.extra1.label.toLowerCase() + '...'
          : 'Nome ou telefone...';
    }

    // Seletor de nicho nas configurações
    const selConfig = document.getElementById('config-empresa-nicho');
    if(selConfig){ selConfig.value = chaveValida; }
  }


  // Valor do campo extra (respeita maiúsculas quando necessário)
  function formatExtra(valor, cfg){
    const v = String(valor || '');
    return cfg && cfg.upper ? v.toUpperCase() : v;
  }


  // Spans de detalhes (extra2, extra1 e observações) para listagens
  function detalhesHtml(ap){

    const n = getNicho();
    let html = '';

    if(ap.veiculo){
      html += '<span title="' + escapeHtml(n.extra2 ? n.extra2.label : 'Detalhe') + '">' +
        escapeHtml(ap.veiculo) + '</span>';
    }

    if(ap.placa){
      html += '<span title="' + escapeHtml(n.extra1 ? n.extra1.label : 'Detalhe') + '">' +
        escapeHtml(formatExtra(ap.placa, n.extra1)) + '</span>';
    }

    if(ap.observacoes){
      html += '<span title="Observações">' + escapeHtml(ap.observacoes) + '</span>';
    }

    return html;
  }
/* ============================================================
   ELEMENTOS
   ============================================================ */

function elemento(id) {
  return document.getElementById(id);
}

/* ============================================================
   TOKEN
   ============================================================ */

function obterToken() {
  try {
    return localStorage.getItem(CONFIGS_TOKEN_KEY);
  } catch (erro) {
    console.warn(
      'Não foi possível acessar o localStorage:',
      erro
    );

    return null;
  }
}

/* ============================================================
   HEADERS
   ============================================================ */

function headersAutenticacao() {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };

  const token = obterToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

/* ============================================================
   FETCH PADRÃO
   ============================================================ */

async function requisicaoConfiguracoes(url, opcoes = {}) {
  const headers = {
    ...headersAutenticacao(),
    ...(opcoes.headers || {})
  };

  return fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    ...opcoes,
    headers
  });
}

/* ============================================================
   JSON SEGURO
   ============================================================ */

async function lerJsonSeguro(resposta) {
  try {
    return await resposta.json();
  } catch {
    return {};
  }
}

/* ============================================================
   MENSAGENS
   ============================================================ */

function mostrarMensagem(
  id,
  mensagem,
  tipo = 'sucesso'
) {
  const campo = elemento(id);

  if (!campo) {
    return;
  }

  campo.textContent = mensagem || '';

  campo.classList.remove(
    'sucesso',
    'erro',
    'success',
    'error'
  );

  if (tipo === 'erro') {
    campo.classList.add('erro');
  } else {
    campo.classList.add('sucesso');
  }

  if (mensagem) {
    campo.style.display = '';
  }
}

function limparMensagens() {
  [
    'configuracoes-message',
    'config-aparencia-message'
  ].forEach(id => {
    const campo = elemento(id);

    if (!campo) {
      return;
    }

    campo.textContent = '';

    campo.classList.remove(
      'sucesso',
      'erro',
      'success',
      'error'
    );
  });
}

/* ============================================================
   VALOR DE INPUT
   ============================================================ */

function obterValor(id) {
  const campo = elemento(id);

  if (!campo) {
    return '';
  }

  return typeof campo.value === 'string'
    ? campo.value.trim()
    : campo.value;
}

/* ============================================================
   BOOLEAN
   ============================================================ */

function obterBoolean(id) {
  const campo = elemento(id);

  if (!campo) {
    return false;
  }

  if (campo.type === 'checkbox') {
    return campo.checked;
  }

  return campo.value === 'true';
}

/* ============================================================
   PREENCHER INPUT
   ============================================================ */

function preencherCampo(id, valor) {
  const campo = elemento(id);

  if (!campo) {
    return;
  }

  if (
    valor === null ||
    valor === undefined
  ) {
    campo.value = '';
    return;
  }

  campo.value = String(valor);
}

/* ============================================================
   PREENCHER SELECT/BOOLEAN
   ============================================================ */

function preencherBoolean(id, valor) {
  const campo = elemento(id);

  if (!campo) {
    return;
  }

  const booleano = Boolean(valor);

  if (campo.type === 'checkbox') {
    campo.checked = booleano;
    return;
  }

  campo.value = booleano
    ? 'true'
    : 'false';
}

/* ============================================================
   NICHOS — FUNÇÕES
   ============================================================ */

function normalizarNicho(valor) {
  const chave = String(valor || '')
    .trim()
    .toLowerCase();

  return NICHOS_CONFIG[chave]
    ? chave
    : 'generico';
}

function definirTexto(id, texto) {
  const campo = elemento(id);

  if (campo && texto) {
    campo.textContent = texto;
  }
}

function configurarCampoExtra(
  idCampo,
  idLabel,
  idInput,
  extra
) {
  const campo = elemento(idCampo);

  if (!campo) {
    return;
  }

  if (!extra) {
    campo.style.display = 'none';

    const input = elemento(idInput);

    if (input) {
      input.value = '';
    }

    return;
  }

  campo.style.display = '';

  definirTexto(
    idLabel,
    extra.label
  );

  const input = elemento(idInput);

  if (input) {
    input.placeholder =
      extra.placeholder || '';
  }
}

function aplicarNichoNaInterface(valor) {
  const chave = normalizarNicho(valor);
  const cfg = NICHOS_CONFIG[chave];
  const t = cfg.termos;

  document.body.dataset.nicho = chave;

  window.orvixNicho = {
    chave,
    nome: cfg.nome,
    termos: t,
    extra1: cfg.extra1,
    extra2: cfg.extra2
  };

  /* Qualquer elemento com data-nicho-termo="cliente" etc. */
  document
    .querySelectorAll('[data-nicho-termo]')
    .forEach(el => {
      const termo =
        t[el.dataset.nichoTermo];

      if (termo) {
        el.textContent = termo;
      }
    });

  /* Modal de agendamento */
  definirTexto(
    'ap-client-label',
    t.cliente
  );

  definirTexto(
    'ap-service-label',
    t.servico
  );

  configurarCampoExtra(
    'ap-extra1-field',
    'ap-extra1-label',
    'ap-plate',
    cfg.extra1
  );

  configurarCampoExtra(
    'ap-extra2-field',
    'ap-extra2-label',
    'ap-vehicle',
    cfg.extra2
  );

  document.dispatchEvent(
    new CustomEvent(
      'orvix:nicho-alterado',
      {
        detail: window.orvixNicho
      }
    )
  );
}

function configurarTrocaDeNicho() {
  const select =
    elemento('config-empresa-nicho');

  select?.addEventListener(
    'change',
    () => {
      aplicarNichoNaInterface(
        select.value
      );
    }
  );
}

/* ============================================================
   PREENCHER DADOS DA EMPRESA
   ============================================================ */

function preencherDadosEmpresa(empresa) {
  if (!empresa) {
    return;
  }

  /* ----------------------------------------------------------
     DADOS DA EMPRESA
     ---------------------------------------------------------- */

  preencherCampo(
    'config-empresa-nome',
    empresa.nome
  );

  preencherCampo(
    'config-empresa-nome-exibicao',
    empresa.nome_exibicao
  );

  preencherCampo(
    'config-empresa-email',
    empresa.email
  );

  preencherCampo(
    'config-empresa-telefone',
    empresa.telefone
  );

  preencherCampo(
    'config-empresa-nicho',
    normalizarNicho(empresa.nicho)
  );

  preencherCampo(
    'config-logo-url',
    empresa.logo_url
  );

  /* ----------------------------------------------------------
     NICHO + INFORMAÇÕES DA EMPRESA
     ---------------------------------------------------------- */

  aplicarNichoNaInterface(
    empresa.nicho
  );

  preencherCampo(
    'config-info-empresa',
    empresa.nome_exibicao ||
      empresa.nome
  );

  const empresaSidebar =
    elemento('sidebar-company');

  if (empresaSidebar) {
    empresaSidebar.textContent =
      empresa.nome_exibicao ||
      empresa.nome ||
      'Empresa';
  }

  /* ----------------------------------------------------------
     REGIONAL
     ---------------------------------------------------------- */

  preencherCampo(
    'config-moeda',
    empresa.moeda
  );

  preencherCampo(
    'config-idioma',
    empresa.idioma
  );

  preencherCampo(
    'config-formato-data',
    empresa.formato_data
  );

  preencherCampo(
    'config-formato-hora',
    empresa.formato_hora
  );

  preencherCampo(
    'config-fuso-horario',
    empresa.fuso_horario
  );

  /* ----------------------------------------------------------
     PREFERÊNCIAS
     ---------------------------------------------------------- */

  preencherBoolean(
    'config-notificacoes-ativas',
    empresa.notificacoes_ativas
  );

  preencherBoolean(
    'config-mostrar-valores',
    empresa.mostrar_valores
  );

  preencherBoolean(
    'config-dashboard-inicial',
    empresa.dashboard_inicial
  );

  preencherBoolean(
    'config-modo-compacto',
    empresa.modo_compacto
  );

  /* ----------------------------------------------------------
     DOCUMENTOS
     ---------------------------------------------------------- */

  preencherCampo(
    'config-rodape-documentos',
    empresa.rodape_documentos
  );

  preencherBoolean(
    'config-telefone-documentos',
    empresa.telefone_documentos
  );

  /* ----------------------------------------------------------
     AGENDA
     ---------------------------------------------------------- */

  preencherCampo(
    'config-agenda-inicio',
    empresa.agenda_horario_inicio
  );

  preencherCampo(
    'config-agenda-fim',
    empresa.agenda_horario_fim
  );

  preencherCampo(
    'config-agenda-intervalo',
    empresa.agenda_intervalo
  );

  /* ----------------------------------------------------------
     CORES
     ---------------------------------------------------------- */

  const primaria =
    empresa.cor_primaria ||
    CONFIGS_CORES_PADRAO.primaria;

  const destaque =
    empresa.cor_destaque ||
    CONFIGS_CORES_PADRAO.destaque;

  const fundo =
    empresa.cor_fundo ||
    CONFIGS_CORES_PADRAO.fundo;

  preencherCampo(
    'config-cor-principal',
    primaria
  );

  preencherCampo(
    'config-cor-principal-text',
    primaria
  );

  preencherCampo(
    'config-cor-destaque',
    destaque
  );

  preencherCampo(
    'config-cor-destaque-text',
    destaque
  );

  preencherCampo(
    'config-cor-fundo',
    fundo
  );

  preencherCampo(
    'config-cor-fundo-text',
    fundo
  );

  aplicarCoresEmpresa(empresa);
  atualizarPreviewTema();
}

/* ============================================================
   PREENCHER USUÁRIO
   ============================================================ */

function preencherDadosUsuario(usuario) {
  if (!usuario) {
    return;
  }

  preencherCampo(
    'config-usuario-nome',
    usuario.nome
  );

  preencherCampo(
    'config-usuario-email',
    usuario.email
  );

  const perfil =
    elemento('config-usuario-perfil');

  if (perfil) {
    if (
      usuario.perfil ===
      'administrador'
    ) {
      perfil.value =
        'Administrador';
    } else if (
      usuario.perfil === 'dev'
    ) {
      perfil.value =
        'Desenvolvedor';
    } else {
      perfil.value =
        'Funcionário';
    }
  }

  const nomeSidebar =
    elemento('sidebar-user-name');

  if (nomeSidebar) {
    nomeSidebar.textContent =
      usuario.nome ||
      usuario.email ||
      'Usuário';
  }

  const emailSidebar =
    elemento('sidebar-user-email');

  if (emailSidebar) {
    emailSidebar.textContent =
      usuario.email || '';
  }
}

/* ============================================================
   GUARDAR EMPRESA NA MEMÓRIA
   ============================================================ */

function guardarEmpresa(empresa) {
  empresaConfiguracoes =
    empresa;

  window.lavajatoEmpresa =
    empresa;

  window.orvixEmpresa =
    empresa;

  /*
   * Mantém compatibilidade com o app.js,
   * caso ele use empresaLogada.
   */
  if (
    typeof window.empresaLogada !==
    'undefined'
  ) {
    try {
      window.empresaLogada =
        empresa;
    } catch (erro) {
      console.warn(
        'Não foi possível atualizar empresaLogada:',
        erro
      );
    }
  }

  /*
   * Se a variável existir globalmente no app.js,
   * sincroniza também.
   */
  try {
    if (
      typeof empresaLogada !==
      'undefined'
    ) {
      empresaLogada =
        empresa;
    }
  } catch {
    /*
     * Ignorado.
     */
  }

  /*
   * Mantém o nicho atualizado para o restante
   * da aplicação.
   */
  if (empresa?.nicho) {
    window.nichoAtual =
      normalizarNicho(
        empresa.nicho
      );
  }

  /*
   * Atualiza a interface de nicho imediatamente.
   */
  if (
    empresa?.nicho &&
    typeof window.aplicarNicho ===
      'function'
  ) {
    try {
      window.aplicarNicho(
        normalizarNicho(
          empresa.nicho
        )
      );
    } catch (erro) {
      console.warn(
        'Não foi possível aplicar o nicho pelo app.js:',
        erro
      );
    }
  }

  /*
   * Atualiza a sidebar caso o app.js disponibilize
   * a função.
   */
  if (
    typeof window.atualizarSidebarUsuario ===
    'function'
  ) {
    try {
      window.atualizarSidebarUsuario();
    } catch (erro) {
      console.warn(
        'Não foi possível atualizar a sidebar:',
        erro
      );
    }
  }
}

/* ============================================================
   CARREGAR USUÁRIO
   ============================================================ */

async function carregarUsuarioConfiguracoes() {
  try {
    const resposta =
      await requisicaoConfiguracoes(
        '/api/auth/me',
        {
          method: 'GET'
        }
      );

    const dados =
      await lerJsonSeguro(
        resposta
      );

    if (!resposta.ok) {
      console.warn(
        'Não foi possível carregar o usuário:',
        dados
      );

      return;
    }

    usuarioConfiguracoes =
      dados.usuario ||
      dados.user ||
      null;

    if (dados.empresa) {
      guardarEmpresa(
        dados.empresa
      );
    }

    preencherDadosUsuario(
      usuarioConfiguracoes
    );

    if (dados.empresa) {
      preencherDadosEmpresa(
        dados.empresa
      );
    }
  } catch (erro) {
    console.error(
      'Erro ao carregar usuário:',
      erro
    );
  }
}

/* ============================================================
   CARREGAR CONFIGURAÇÕES
   ============================================================ */

async function carregarConfiguracoes() {
  if (carregandoConfiguracoes) {
    return;
  }

  carregandoConfiguracoes =
    true;

  try {
    const resposta =
      await requisicaoConfiguracoes(
        '/api/configuracoes',
        {
          method: 'GET'
        }
      );

    const dados =
      await lerJsonSeguro(
        resposta
      );

    if (!resposta.ok) {
      throw new Error(
        dados.erro ||
        'Não foi possível carregar as configurações.'
      );
    }

    const empresa =
      dados.empresa ||
      dados;

    if (!empresa) {
      throw new Error(
        'Os dados da empresa não foram retornados.'
      );
    }

    guardarEmpresa(
      empresa
    );

    preencherDadosEmpresa(
      empresa
    );

    console.log(
      'Configurações carregadas:',
      empresa
    );
  } catch (erro) {
    console.error(
      'Erro ao carregar configurações:',
      erro
    );

    mostrarMensagem(
      'configuracoes-message',
      erro.message ||
        'Não foi possível carregar as configurações.',
      'erro'
    );
  } finally {
    carregandoConfiguracoes =
      false;
  }
}

/* ============================================================
   APLICAR CORES
   ============================================================ */

function aplicarCoresEmpresa(empresa) {
  if (!empresa) {
    return;
  }

  const primaria =
    empresa.cor_primaria ||
    CONFIGS_CORES_PADRAO.primaria;

  const destaque =
    empresa.cor_destaque ||
    CONFIGS_CORES_PADRAO.destaque;

  const fundo =
    empresa.cor_fundo ||
    CONFIGS_CORES_PADRAO.fundo;

  const root =
    document.documentElement;

  /*
   * Variáveis mais comuns.
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
    '--background-color',
    fundo
  );

  root.style.setProperty(
    '--cor-fundo',
    fundo
  );
}

/* ============================================================
   VALIDA COR
   ============================================================ */

function corValida(cor) {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(
    String(cor || '').trim()
  );
}

/* ============================================================
   SINCRONIZAR CAMPOS DE COR
   ============================================================ */

function normalizarTextoCor(valor) {
  let texto =
    String(valor || '')
      .trim()
      .toUpperCase();

  if (
    !texto.startsWith('#') &&
    /^[0-9A-F]{3,6}$/.test(texto)
  ) {
    texto = `#${texto}`;
  }

  return texto;
}

function sincronizarCampoCor(
  inputId,
  textoId
) {
  const input =
    elemento(inputId);

  const texto =
    elemento(textoId);

  if (!input || !texto) {
    return;
  }

  input.addEventListener(
    'input',
    () => {
      texto.value =
        input.value.toUpperCase();

      atualizarPreviewTema();
    }
  );

  texto.addEventListener(
    'input',
    () => {
      const valor =
        normalizarTextoCor(
          texto.value
        );

      if (corValida(valor)) {
        input.value =
          valor;

        texto.value =
          valor;
      }

      atualizarPreviewTema();
    }
  );

  texto.addEventListener(
    'blur',
    () => {
      const valor =
        normalizarTextoCor(
          texto.value
        );

      if (corValida(valor)) {
        input.value =
          valor;

        texto.value =
          valor;
      }
    }
  );
}

/* ============================================================
   SELEÇÃO DE CORES
   ============================================================ */

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

  const presets =
    document.querySelectorAll(
      '.theme-preset'
    );

  presets.forEach(
    preset => {
      preset.addEventListener(
        'click',
        () => {
          const primaria =
            preset.dataset.primary;

          const destaque =
            preset.dataset.accent;

          const fundo =
            preset.dataset.background;

          if (corValida(primaria)) {
            preencherCampo(
              'config-cor-principal',
              primaria
            );

            preencherCampo(
              'config-cor-principal-text',
              primaria
            );
          }

          if (corValida(destaque)) {
            preencherCampo(
              'config-cor-destaque',
              destaque
            );

            preencherCampo(
              'config-cor-destaque-text',
              destaque
            );
          }

          if (corValida(fundo)) {
            preencherCampo(
              'config-cor-fundo',
              fundo
            );

            preencherCampo(
              'config-cor-fundo-text',
              fundo
            );
          }

          atualizarPreviewTema();
        }
      );
    }
  );
}

/* ============================================================
   PREVIEW
   ============================================================ */

function atualizarPreviewTema() {
  const primaria =
    obterValor(
      'config-cor-principal'
    ) ||
    CONFIGS_CORES_PADRAO.primaria;

  const destaque =
    obterValor(
      'config-cor-destaque'
    ) ||
    CONFIGS_CORES_PADRAO.destaque;

  const fundo =
    obterValor(
      'config-cor-fundo'
    ) ||
    CONFIGS_CORES_PADRAO.fundo;

  const preview =
    elemento(
      'config-tema-preview'
    );

  if (preview) {
    preview.style.background =
      fundo;
  }

  const titulo =
    elemento(
      'config-tema-preview-title'
    );

  if (titulo) {
    titulo.style.color =
      primaria;
  }

  const badge =
    elemento(
      'config-tema-preview-badge'
    );

  if (badge) {
    badge.style.background =
      destaque;
  }

  const botao =
    elemento(
      'config-tema-preview-button'
    );

  if (botao) {
    botao.style.background =
      primaria;
  }
}

/* ============================================================
   PAYLOAD — DADOS DA EMPRESA
   ============================================================ */

function montarPayloadEmpresa() {
  const nome =
    obterValor(
      'config-empresa-nome'
    );

  /*
   * Nome de exibição é opcional na interface.
   * Caso esteja vazio, usamos o nome da empresa.
   */
  const nomeExibicao =
    obterValor(
      'config-empresa-nome-exibicao'
    ) || nome;

  return {
    nome,

    nome_exibicao:
      nomeExibicao,

    email:
      obterValor(
        'config-empresa-email'
      ),

    telefone:
      obterValor(
        'config-empresa-telefone'
      ),

    nicho:
      obterValor(
        'config-empresa-nicho'
      ),

    logo_url:
      obterValor(
        'config-logo-url'
      )
  };
}

/* ============================================================
   PAYLOAD — PREFERÊNCIAS
   ============================================================ */

function montarPayloadPreferencias() {
  return {
    moeda:
      obterValor(
        'config-moeda'
      ),

    idioma:
      obterValor(
        'config-idioma'
      ),

    formato_data:
      obterValor(
        'config-formato-data'
      ),

    formato_hora:
      obterValor(
        'config-formato-hora'
      ),

    fuso_horario:
      obterValor(
        'config-fuso-horario'
      ),

    notificacoes_ativas:
      obterBoolean(
        'config-notificacoes-ativas'
      ),

    mostrar_valores:
      obterBoolean(
        'config-mostrar-valores'
      ),

    dashboard_inicial:
      obterBoolean(
        'config-dashboard-inicial'
      ),

    modo_compacto:
      obterBoolean(
        'config-modo-compacto'
      )
  };
}

/* ============================================================
   PAYLOAD — APARÊNCIA
   ============================================================ */

function montarPayloadAparencia() {
  return {
    cor_primaria:
      obterValor(
        'config-cor-principal'
      ).toUpperCase(),

    cor_destaque:
      obterValor(
        'config-cor-destaque'
      ).toUpperCase(),

    cor_fundo:
      obterValor(
        'config-cor-fundo'
      ).toUpperCase()
  };
}

/* ============================================================
   PAYLOAD — DOCUMENTOS
   ============================================================ */

function montarPayloadDocumentos() {
  return {
    rodape_documentos:
      obterValor(
        'config-rodape-documentos'
      ),

    telefone_documentos:
      obterBoolean(
        'config-telefone-documentos'
      )
  };
}

/* ============================================================
   PAYLOAD — AGENDA
   ============================================================ */

function montarPayloadAgenda() {
  const inicio =
    obterValor(
      'config-agenda-inicio'
    );

  const fim =
    obterValor(
      'config-agenda-fim'
    );

  const intervalo =
    Number(
      obterValor(
        'config-agenda-intervalo'
      )
    );

  return {
    agenda_horario_inicio:
      inicio,

    agenda_horario_fim:
      fim,

    agenda_intervalo:
      intervalo
  };
}

/* ============================================================
   VALIDAR EMPRESA
   ============================================================ */

function validarPayloadEmpresa(
  payload
) {
  if (
    !payload.nome ||
    payload.nome.length === 0
  ) {
    return 'Informe o nome da empresa.';
  }

  if (
    payload.nome.length > 150
  ) {
    return 'O nome da empresa é muito grande.';
  }

  if (
    !payload.email ||
    !CONFIGS_EMAIL_REGEX.test(
      payload.email
    )
  ) {
    return 'Informe um e-mail válido.';
  }

  if (
    payload.email.length > 254
  ) {
    return 'O e-mail informado é muito grande.';
  }

  if (
    payload.telefone &&
    payload.telefone.length > 30
  ) {
    return 'O telefone possui caracteres demais.';
  }

  if (
    payload.nicho &&
    payload.nicho.length > 30
  ) {
    return 'O tipo de negócio informado é inválido.';
  }

  if (
    payload.nome_exibicao &&
    payload.nome_exibicao.length > 150
  ) {
    return 'O nome de exibição é muito grande.';
  }

  if (
    payload.logo_url &&
    payload.logo_url.length > 500
  ) {
    return 'O endereço da logo é muito grande.';
  }

  return null;
}

/* ============================================================
   VALIDAR APARÊNCIA
   ============================================================ */

function validarPayloadAparencia(
  payload
) {
  if (
    !corValida(
      payload.cor_primaria
    ) ||
    !corValida(
      payload.cor_destaque
    ) ||
    !corValida(
      payload.cor_fundo
    )
  ) {
    return 'Uma ou mais cores informadas são inválidas.';
  }

  return null;
}

/* ============================================================
   VALIDAR AGENDA
   ============================================================ */

function validarPayloadAgenda(
  payload
) {
  const horariosValidos =
    /^([01]\d|2[0-3]):([0-5]\d)$/;

  if (
    !horariosValidos.test(
      payload.agenda_horario_inicio
    )
  ) {
    return 'Informe um horário inicial válido.';
  }

  if (
    !horariosValidos.test(
      payload.agenda_horario_fim
    )
  ) {
    return 'Informe um horário final válido.';
  }

  const intervalosValidos = [
    15,
    30,
    45,
    60,
    90,
    120
  ];

  if (
    !intervalosValidos.includes(
      payload.agenda_intervalo
    )
  ) {
    return 'Selecione um intervalo de agenda válido.';
  }

  return null;
}

/* ============================================================
   SALVAR NO BACKEND
   ============================================================ */

async function salvarConfiguracoes(
  payload,
  mensagemId
) {
  if (salvandoConfiguracoes) {
    return false;
  }

  salvandoConfiguracoes =
    true;

  try {
    console.log(
      'Payload enviado para /api/configuracoes:',
      payload
    );

    const resposta =
      await requisicaoConfiguracoes(
        '/api/configuracoes',
        {
          method: 'PUT',
          body: JSON.stringify(
            payload
          )
        }
      );

    const dados =
      await lerJsonSeguro(
        resposta
      );

    if (!resposta.ok) {
      throw new Error(
        dados.erro ||
        'Não foi possível salvar as configurações.'
      );
    }

    const empresa =
      dados.empresa ||
      null;

    if (empresa) {
      guardarEmpresa(
        empresa
      );

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
    salvandoConfiguracoes =
      false;
  }
}

/* ============================================================
   SALVAR EMPRESA
   ============================================================ */

async function salvarDadosEmpresa() {
  const payload =
    montarPayloadEmpresa();

  const erro =
    validarPayloadEmpresa(
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

  const salvou =
    await salvarConfiguracoes(
      payload,
      'configuracoes-message'
    );

  if (salvou) {
    await atualizarDadosDepoisDeSalvar();
  }
}

/* ============================================================
   SALVAR PREFERÊNCIAS
   ============================================================ */

async function salvarPreferencias() {
  const payload =
    montarPayloadPreferencias();

  const salvou =
    await salvarConfiguracoes(
      payload,
      'configuracoes-message'
    );

  if (salvou) {
    await atualizarDadosDepoisDeSalvar();
  }
}

/* ============================================================
   SALVAR APARÊNCIA
   ============================================================ */

async function salvarAparencia() {
  const payload =
    montarPayloadAparencia();

  const erro =
    validarPayloadAparencia(
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

  const salvou =
    await salvarConfiguracoes(
      payload,
      'config-aparencia-message'
    );

  if (salvou) {
    aplicarCoresEmpresa({
      ...empresaConfiguracoes,
      ...payload
    });

    atualizarPreviewTema();

    await atualizarDadosDepoisDeSalvar();
  }
}

/* ============================================================
   SALVAR DOCUMENTOS
   ============================================================ */

async function salvarDocumentos() {
  const payload =
    montarPayloadDocumentos();

  const salvou =
    await salvarConfiguracoes(
      payload,
      'configuracoes-message'
    );

  if (salvou) {
    await atualizarDadosDepoisDeSalvar();
  }
}

/* ============================================================
   SALVAR AGENDA
   ============================================================ */

async function salvarAgenda() {
  const payload =
    montarPayloadAgenda();

  const erro =
    validarPayloadAgenda(
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

  /*
   * IMPORTANTE:
   * agenda_intervalo é enviado como NUMBER.
   *
   * Exemplo:
   * 30
   *
   * e não:
   * "30"
   */

  console.log(
    'Salvando configuração da agenda:',
    payload
  );

  const salvou =
    await salvarConfiguracoes(
      payload,
      'configuracoes-message'
    );

  if (salvou) {
    await atualizarDadosDepoisDeSalvar();
  }
}

/* ============================================================
   RECARREGAR APÓS SALVAR
   ============================================================ */

async function atualizarDadosDepoisDeSalvar() {
  try {
    const resposta =
      await requisicaoConfiguracoes(
        '/api/configuracoes',
        {
          method: 'GET'
        }
      );

    const dados =
      await lerJsonSeguro(
        resposta
      );

    if (!resposta.ok) {
      return;
    }

    const empresa =
      dados.empresa ||
      dados;

    if (!empresa) {
      return;
    }

    guardarEmpresa(
      empresa
    );

    preencherDadosEmpresa(
      empresa
    );
  } catch (erro) {
    console.warn(
      'Não foi possível atualizar os dados após salvar:',
      erro
    );
  }
}

/* ============================================================
   RESTAURAR TEMA
   ============================================================ */

async function restaurarTema() {
  const primaria =
    CONFIGS_CORES_PADRAO.primaria;

  const destaque =
    CONFIGS_CORES_PADRAO.destaque;

  const fundo =
    CONFIGS_CORES_PADRAO.fundo;

  preencherCampo(
    'config-cor-principal',
    primaria
  );

  preencherCampo(
    'config-cor-principal-text',
    primaria
  );

  preencherCampo(
    'config-cor-destaque',
    destaque
  );

  preencherCampo(
    'config-cor-destaque-text',
    destaque
  );

  preencherCampo(
    'config-cor-fundo',
    fundo
  );

  preencherCampo(
    'config-cor-fundo-text',
    fundo
  );

  atualizarPreviewTema();

  aplicarCoresEmpresa({
    cor_primaria: primaria,
    cor_destaque: destaque,
    cor_fundo: fundo
  });

  mostrarMensagem(
    'config-aparencia-message',
    'Tema padrão restaurado. Clique em "Salvar tema" para confirmar.',
    'sucesso'
  );
}

/* ============================================================
   FORMULÁRIO DA EMPRESA
   ============================================================ */

function configurarFormularioEmpresa() {
  const form =
    elemento(
      'form-configuracoes'
    );

  if (!form) {
    return;
  }

  form.addEventListener(
    'submit',
    async evento => {
      evento.preventDefault();

      await salvarDadosEmpresa();
    }
  );
}

/* ============================================================
   BOTÕES
   ============================================================ */

function configurarBotao(
  id,
  acao
) {
  const botao =
    elemento(id);

  if (!botao) {
    return;
  }

  botao.addEventListener(
    'click',
    async evento => {
      evento.preventDefault();

      await acao();
    }
  );
}

function configurarBotaoPreferencias() {
  configurarBotao(
    'btn-salvar-preferencias',
    salvarPreferencias
  );
}

function configurarBotaoAparencia() {
  configurarBotao(
    'btn-salvar-tema',
    salvarAparencia
  );
}

function configurarBotaoRestaurarTema() {
  configurarBotao(
    'btn-restaurar-tema',
    restaurarTema
  );
}

function configurarBotaoDocumentos() {
  configurarBotao(
    'btn-salvar-documentos',
    salvarDocumentos
  );
}

function configurarBotaoAgenda() {
  configurarBotao(
    'btn-salvar-agenda',
    salvarAgenda
  );
}

/* ============================================================
   TECLAS / INPUTS DE AGENDA
   ============================================================ */

function configurarCamposAgenda() {
  const inicio =
    elemento(
      'config-agenda-inicio'
    );

  const fim =
    elemento(
      'config-agenda-fim'
    );

  const intervalo =
    elemento(
      'config-agenda-intervalo'
    );

  if (inicio) {
    inicio.addEventListener(
      'change',
      () => {
        console.log(
          'Horário inicial:',
          inicio.value
        );
      }
    );
  }

  if (fim) {
    fim.addEventListener(
      'change',
      () => {
        console.log(
          'Horário final:',
          fim.value
        );
      }
    );
  }

  if (intervalo) {
    intervalo.addEventListener(
      'change',
      () => {
        console.log(
          'Intervalo selecionado:',
          intervalo.value,
          'Número:',
          Number(intervalo.value)
        );
      }
    );
  }
}

/* ============================================================
   COMPATIBILIDADE
   ============================================================ */

window.carregarConfiguracoes =
  carregarConfiguracoes;

window.carregarUsuarioConfiguracoes =
  carregarUsuarioConfiguracoes;

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

window.restaurarTema =
  restaurarTema;

window.aplicarCoresEmpresa =
  aplicarCoresEmpresa;

window.aplicarNichoNaInterface =
  aplicarNichoNaInterface;

window.normalizarNicho =
  normalizarNicho;

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */

document.addEventListener(
  'DOMContentLoaded',
  async () => {
    console.log(
      'Orvix: inicializando configurações...'
    );

    configurarSelecaoDeCores();

    configurarFormularioEmpresa();

    configurarBotaoPreferencias();

    configurarBotaoAparencia();

    configurarBotaoRestaurarTema();

    configurarBotaoDocumentos();

    configurarBotaoAgenda();

    configurarCamposAgenda();

    configurarTrocaDeNicho();

    limparMensagens();

    /*
     * Carrega primeiro o usuário.
     */

    await carregarUsuarioConfiguracoes();

    /*
     * Depois busca diretamente as configurações
     * no endpoint específico.
     */

    await carregarConfiguracoes();

    atualizarPreviewTema();

    console.log(
      'Orvix: configurações inicializadas.'
    );
  }
);