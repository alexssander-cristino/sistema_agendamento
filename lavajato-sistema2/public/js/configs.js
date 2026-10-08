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

const CONFIGS_EMAIL_REGEX =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CONFIGS_NICHOS_VALIDOS = [
  'lavajato',
  'barbearia',
  'clinica',
  'pet',
  'oficina',
  'personal',
  'generico'
];

const CONFIGS_INTERVALOS_AGENDA = [
  15,
  30,
  45,
  60,
  90,
  120
];

let empresaConfiguracoes = null;
let usuarioConfiguracoes = null;
let carregandoConfiguracoes = false;
let salvandoConfiguracoes = false;


/* ============================================================
   HELPERS
   ============================================================ */

function elemento(id) {
  return document.getElementById(id);
}

function obterValor(id, fallback = '') {
  const campo = elemento(id);

  if (!campo) {
    return fallback;
  }

  if (typeof campo.value === 'string') {
    const valor = campo.value.trim();

    return valor || fallback;
  }

  return campo.value ?? fallback;
}

function obterNumero(id, fallback = 0) {
  const campo = elemento(id);

  if (!campo) {
    return fallback;
  }

  const valor = Number(campo.value);

  return Number.isFinite(valor)
    ? valor
    : fallback;
}

function obterBoolean(id, fallback = false) {
  const campo = elemento(id);

  if (!campo) {
    return fallback;
  }

  if (campo.type === 'checkbox') {
    return Boolean(campo.checked);
  }

  const valor = String(
    campo.value || ''
  )
    .trim()
    .toLowerCase();

  if (valor === 'true') {
    return true;
  }

  if (valor === 'false') {
    return false;
  }

  return fallback;
}

function preencherCampo(id, valor) {
  const campo = elemento(id);

  if (!campo) {
    return;
  }

  campo.value =
    valor === null ||
    valor === undefined
      ? ''
      : String(valor);
}

function preencherBoolean(id, valor) {
  const campo = elemento(id);

  if (!campo) {
    return;
  }

  const booleano = Boolean(valor);

  if (campo.type === 'checkbox') {
    campo.checked = booleano;
  } else {
    campo.value = booleano
      ? 'true'
      : 'false';
  }
}

function escapeHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


/* ============================================================
   TOKEN / AUTENTICAÇÃO
   ============================================================ */

function obterTokenConfiguracoes() {
  try {
    return localStorage.getItem(
      CONFIGS_TOKEN_KEY
    );
  } catch (erro) {
    console.warn(
      'Não foi possível acessar o token:',
      erro
    );

    return null;
  }
}

function headersConfiguracoes() {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };

  const token =
    obterTokenConfiguracoes();

  if (token) {
    headers.Authorization =
      `Bearer ${token}`;
  }

  return headers;
}


/* ============================================================
   REQUISIÇÃO
   ============================================================ */

async function requisicaoConfiguracoes(
  url,
  opcoes = {}
) {
  const headers = {
    ...headersConfiguracoes(),
    ...(opcoes.headers || {})
  };

  return fetch(url, {
    ...opcoes,
    credentials: 'include',
    cache: 'no-store',
    headers
  });
}

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

  campo.textContent =
    mensagem || '';

  campo.classList.remove(
    'sucesso',
    'erro',
    'success',
    'error'
  );

  campo.classList.add(
    tipo === 'erro'
      ? 'erro'
      : 'sucesso'
  );

  campo.style.display =
    mensagem ? '' : 'none';
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
    campo.style.display = 'none';

    campo.classList.remove(
      'sucesso',
      'erro',
      'success',
      'error'
    );
  });
}


/* ============================================================
   EMPRESA
   ============================================================ */

function obterEmpresaAtual() {
  try {
    if (
      typeof empresaLogada !== 'undefined' &&
      empresaLogada
    ) {
      return empresaLogada;
    }
  } catch {
    // Ignorado.
  }

  if (
    typeof window !== 'undefined' &&
    window.empresaLogada
  ) {
    return window.empresaLogada;
  }

  if (
    typeof window !== 'undefined' &&
    window.orvixEmpresa
  ) {
    return window.orvixEmpresa;
  }

  return empresaConfiguracoes;
}

function guardarEmpresa(empresa) {
  if (!empresa) {
    return;
  }

  empresaConfiguracoes = {
    ...empresa
  };

  window.empresaLogada =
    empresaConfiguracoes;

  window.orvixEmpresa =
    empresaConfiguracoes;

  /*
   * Compatibilidade com código antigo.
   * Não é usado como fonte principal.
   */
  window.lavajatoEmpresa =
    empresaConfiguracoes;

  try {
    if (
      typeof empresaLogada !==
      'undefined'
    ) {
      empresaLogada =
        empresaConfiguracoes;
    }
  } catch {
    // Ignorado.
  }

  /*
   * Atualiza o nicho usando a função
   * ORIGINAL do app.js.
   */
  if (
    empresa.nicho &&
    typeof aplicarNicho === 'function'
  ) {
    try {
      aplicarNicho(
        normalizarNicho(
          empresa.nicho
        )
      );
    } catch (erro) {
      console.warn(
        'Erro ao aplicar nicho:',
        erro
      );
    }
  }

  /*
   * NÃO sobrescrevemos
   * window.atualizarSidebarUsuario.
   *
   * O app.js continua sendo o dono
   * dessa função.
   */
  try {
    if (
      typeof atualizarSidebarUsuario ===
      'function'
    ) {
      atualizarSidebarUsuario();
    }
  } catch (erro) {
    console.warn(
      'Erro ao atualizar sidebar:',
      erro
    );
  }
}


/* ============================================================
   NICHO
   ============================================================ */

function normalizarNicho(valor) {
  const nicho = String(
    valor || ''
  )
    .trim()
    .toLowerCase();

  return CONFIGS_NICHOS_VALIDOS.includes(
    nicho
  )
    ? nicho
    : 'generico';
}

function aplicarNichoNaInterface(nicho) {
  const chave =
    normalizarNicho(nicho);

  window.nichoAtual =
    chave;

  try {
    /*
     * Usa a função existente no app.js.
     */
    if (
      typeof aplicarNicho ===
      'function'
    ) {
      aplicarNicho(chave);
    }
  } catch (erro) {
    console.warn(
      'Erro ao aplicar nicho:',
      erro
    );
  }
}

function configurarTrocaDeNicho() {
  const seletor =
    elemento(
      'config-empresa-nicho'
    );

  if (!seletor) {
    return;
  }

  if (
    seletor.dataset
      .configsNichoListener ===
    'true'
  ) {
    return;
  }

  seletor.dataset
    .configsNichoListener =
    'true';

  seletor.addEventListener(
    'change',
    () => {
      const nicho =
        normalizarNicho(
          seletor.value
        );

      aplicarNichoNaInterface(
        nicho
      );
    }
  );
}


/* ============================================================
   SIDEBAR
   ============================================================ */

function atualizarSidebarConfiguracoes() {
  const empresa =
    obterEmpresaAtual();

  const empresaElemento =
    elemento(
      'sidebar-company'
    );

  if (
    empresaElemento &&
    empresa
  ) {
    empresaElemento.textContent =
      empresa.nome_exibicao ||
      empresa.nome ||
      'Minha empresa';
  }

  /*
   * Chama a função ORIGINAL do app.js,
   * sem sobrescrevê-la.
   */
  try {
    if (
      typeof atualizarSidebarUsuario ===
      'function'
    ) {
      atualizarSidebarUsuario();
    }
  } catch (erro) {
    console.warn(
      'Erro ao atualizar sidebar:',
      erro
    );
  }
}


/* ============================================================
   PREENCHER EMPRESA
   ============================================================ */

function preencherDadosEmpresa(
  empresa
) {
  if (!empresa) {
    return;
  }

  preencherCampo(
    'config-empresa-nome',
    empresa.nome
  );

  preencherCampo(
    'config-empresa-nome-exibicao',
    empresa.nome_exibicao ||
      empresa.nome ||
      ''
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
    normalizarNicho(
      empresa.nicho
    )
  );

  preencherCampo(
    'config-logo-url',
    empresa.logo_url
  );

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

  preencherCampo(
    'config-rodape-documentos',
    empresa.rodape_documentos
  );

  preencherBoolean(
    'config-telefone-documentos',
    empresa.telefone_documentos
  );

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

  preencherCampo(
    'config-cor-principal',
    empresa.cor_primaria ||
      CONFIGS_CORES_PADRAO.primaria
  );

  preencherCampo(
    'config-cor-principal-text',
    empresa.cor_primaria ||
      CONFIGS_CORES_PADRAO.primaria
  );

  preencherCampo(
    'config-cor-destaque',
    empresa.cor_destaque ||
      CONFIGS_CORES_PADRAO.destaque
  );

  preencherCampo(
    'config-cor-destaque-text',
    empresa.cor_destaque ||
      CONFIGS_CORES_PADRAO.destaque
  );

  preencherCampo(
    'config-cor-fundo',
    empresa.cor_fundo ||
      CONFIGS_CORES_PADRAO.fundo
  );

  preencherCampo(
    'config-cor-fundo-text',
    empresa.cor_fundo ||
      CONFIGS_CORES_PADRAO.fundo
  );

  preencherCampo(
    'config-info-empresa',
    empresa.nome_exibicao ||
      empresa.nome ||
      ''
  );

  aplicarNichoNaInterface(
    empresa.nicho
  );

  aplicarCoresEmpresa(
    empresa
  );

  atualizarSidebarConfiguracoes();
}


/* ============================================================
   USUÁRIO
   ============================================================ */

function preencherDadosUsuario(
  usuario
) {
  if (!usuario) {
    return;
  }

  usuarioConfiguracoes =
    usuario;

  preencherCampo(
    'config-usuario-nome',
    usuario.nome
  );

  preencherCampo(
    'config-usuario-email',
    usuario.email
  );

  const perfil =
    elemento(
      'config-usuario-perfil'
    );

  if (perfil) {
    perfil.value =
      usuario.perfil ===
      'administrador'
        ? 'Administrador'
        : usuario.perfil === 'dev'
          ? 'Desenvolvedor'
          : 'Funcionário';
  }
}


/* ============================================================
   CARREGAR
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
        'Não foi possível carregar usuário:',
        dados
      );

      return;
    }

    preencherDadosUsuario(
      dados.usuario ||
      dados.user
    );

    if (dados.empresa) {
      guardarEmpresa(
        dados.empresa
      );

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

    if (
      resposta.status === 401
    ) {
      throw new Error(
        'Sua sessão expirou. Faça login novamente.'
      );
    }

    if (
      resposta.status === 403
    ) {
      throw new Error(
        dados.erro ||
        'Você não possui permissão para acessar estas configurações.'
      );
    }

    if (!resposta.ok) {
      throw new Error(
        dados.erro ||
        dados.mensagem ||
        'Não foi possível carregar as configurações.'
      );
    }

    const empresa =
      dados.empresa ||
      dados;

    guardarEmpresa(
      empresa
    );

    preencherDadosEmpresa(
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
   CORES
   ============================================================ */

function corValida(cor) {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(
    String(cor || '').trim()
  );
}

function normalizarTextoCor(valor) {
  let cor = String(
    valor || ''
  )
    .trim()
    .toUpperCase();

  if (
    !cor.startsWith('#') &&
    /^[0-9A-F]{3}$/.test(cor)
  ) {
    cor = `#${cor}`;
  }

  if (
    !cor.startsWith('#') &&
    /^[0-9A-F]{6}$/.test(cor)
  ) {
    cor = `#${cor}`;
  }

  return cor;
}

function aplicarCoresEmpresa(
  empresa
) {
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

function atualizarPreviewTema() {
  const primaria =
    normalizarTextoCor(
      obterValor(
        'config-cor-principal',
        CONFIGS_CORES_PADRAO.primaria
      )
    ) ||
    CONFIGS_CORES_PADRAO.primaria;

  const destaque =
    normalizarTextoCor(
      obterValor(
        'config-cor-destaque',
        CONFIGS_CORES_PADRAO.destaque
      )
    ) ||
    CONFIGS_CORES_PADRAO.destaque;

  const fundo =
    normalizarTextoCor(
      obterValor(
        'config-cor-fundo',
        CONFIGS_CORES_PADRAO.fundo
      )
    ) ||
    CONFIGS_CORES_PADRAO.fundo;

  const preview =
    elemento(
      'config-tema-preview'
    );

  const titulo =
    elemento(
      'config-tema-preview-title'
    );

  const badge =
    elemento(
      'config-tema-preview-badge'
    );

  const botao =
    elemento(
      'config-tema-preview-button'
    );

  if (preview) {
    preview.style.background =
      fundo;
  }

  if (titulo) {
    titulo.style.color =
      primaria;
  }

  if (badge) {
    badge.style.background =
      destaque;
  }

  if (botao) {
    botao.style.background =
      primaria;
  }
}

function configurarCores() {
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
      const color =
        elemento(colorId);

      const text =
        elemento(textId);

      if (!color || !text) {
        return;
      }

      if (
        color.dataset
          .configsListener ===
        'true'
      ) {
        return;
      }

      color.dataset
        .configsListener =
        'true';

      color.addEventListener(
        'input',
        () => {
          const valor =
            normalizarTextoCor(
              color.value
            );

          text.value =
            valor;

          atualizarPreviewTema();
        }
      );

      text.addEventListener(
        'input',
        () => {
          const valor =
            normalizarTextoCor(
              text.value
            );

          if (corValida(valor)) {
            color.value =
              valor;

            text.value =
              valor;
          }

          atualizarPreviewTema();
        }
      );

      text.addEventListener(
        'blur',
        () => {
          const valor =
            normalizarTextoCor(
              text.value
            );

          if (corValida(valor)) {
            color.value =
              valor;

            text.value =
              valor;
          }
        }
      );
    }
  );
}


/* ============================================================
   PRESETS DE TEMA
   ============================================================ */

function configurarPresetsTema() {
  const presets =
    document.querySelectorAll(
      '.theme-preset'
    );

  presets.forEach(
    preset => {
      if (
        preset.dataset
          .configsPresetListener ===
        'true'
      ) {
        return;
      }

      preset.dataset
        .configsPresetListener =
        'true';

      preset.addEventListener(
        'click',
        () => {
          const primaria =
            normalizarTextoCor(
              preset.dataset.primary ||
              CONFIGS_CORES_PADRAO.primaria
            );

          const destaque =
            normalizarTextoCor(
              preset.dataset.accent ||
              CONFIGS_CORES_PADRAO.destaque
            );

          const fundo =
            normalizarTextoCor(
              preset.dataset.background ||
              CONFIGS_CORES_PADRAO.fundo
            );

          if (
            corValida(primaria)
          ) {
            preencherCampo(
              'config-cor-principal',
              primaria
            );

            preencherCampo(
              'config-cor-principal-text',
              primaria
            );
          }

          if (
            corValida(destaque)
          ) {
            preencherCampo(
              'config-cor-destaque',
              destaque
            );

            preencherCampo(
              'config-cor-destaque-text',
              destaque
            );
          }

          if (
            corValida(fundo)
          ) {
            preencherCampo(
              'config-cor-fundo',
              fundo
            );

            preencherCampo(
              'config-cor-fundo-text',
              fundo
            );
          }

          aplicarCoresEmpresa({
            cor_primaria: primaria,
            cor_destaque: destaque,
            cor_fundo: fundo
          });

          atualizarPreviewTema();
        }
      );
    }
  );
}


/* ============================================================
   PAYLOADS
   ============================================================ */

function montarPayloadEmpresa() {
  const nome =
    obterValor(
      'config-empresa-nome'
    );

  return {
    nome,

    nome_exibicao:
      obterValor(
        'config-empresa-nome-exibicao'
      ) || nome,

    email:
      obterValor(
        'config-empresa-email'
      ),

    telefone:
      obterValor(
        'config-empresa-telefone'
      ),

    nicho:
      normalizarNicho(
        obterValor(
          'config-empresa-nicho'
        )
      ),

    logo_url:
      obterValor(
        'config-logo-url'
      )
  };
}

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

function montarPayloadAparencia() {
  return {
    cor_primaria:
      normalizarTextoCor(
        obterValor(
          'config-cor-principal'
        )
      ),

    cor_destaque:
      normalizarTextoCor(
        obterValor(
          'config-cor-destaque'
        )
      ),

    cor_fundo:
      normalizarTextoCor(
        obterValor(
          'config-cor-fundo'
        )
      )
  };
}

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

function montarPayloadAgenda() {
  return {
    agenda_horario_inicio:
      normalizarHorario(
        obterValor(
          'config-agenda-inicio'
        )
      ),

    agenda_horario_fim:
      normalizarHorario(
        obterValor(
          'config-agenda-fim'
        )
      ),

    agenda_intervalo:
      obterNumero(
        'config-agenda-intervalo'
      )
  };
}

function normalizarHorario(valor) {
  if (!valor) {
    return '';
  }

  const texto =
    String(valor).trim();

  const match =
    texto.match(
      /^(\d{2}):(\d{2})(?::\d{2})?$/
    );

  if (!match) {
    return '';
  }

  const horas =
    Number(match[1]);

  const minutos =
    Number(match[2]);

  if (
    horas < 0 ||
    horas > 23 ||
    minutos < 0 ||
    minutos > 59
  ) {
    return '';
  }

  return (
    String(horas).padStart(2, '0') +
    ':' +
    String(minutos).padStart(2, '0')
  );
}


/* ============================================================
   SALVAR — ÚNICA FUNÇÃO
   ============================================================ */

async function salvarConfiguracoes(
  payload,
  mensagemId =
    'configuracoes-message'
) {
  if (salvandoConfiguracoes) {
    return false;
  }

  salvandoConfiguracoes =
    true;

  try {
    console.log(
      '[Orvix] PUT /api/configuracoes:',
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

    if (
      resposta.status === 401
    ) {
      try {
        localStorage.removeItem(
          CONFIGS_TOKEN_KEY
        );
      } catch {
        // Ignorado.
      }

      throw new Error(
        'Sua sessão expirou. Faça login novamente.'
      );
    }

    if (
      resposta.status === 403
    ) {
      throw new Error(
        dados.erro ||
        'Você não possui permissão para alterar estas configurações.'
      );
    }

    if (
      resposta.status === 429
    ) {
      window.location.replace(
        '/429.html'
      );

      return false;
    }

    if (!resposta.ok) {
      throw new Error(
        dados.erro ||
        dados.mensagem ||
        'Não foi possível salvar as configurações.'
      );
    }

    if (dados.empresa) {
      guardarEmpresa(
        dados.empresa
      );

      preencherDadosEmpresa(
        dados.empresa
      );
    }

    mostrarMensagem(
      mensagemId,
      dados.mensagem ||
      'Configurações salvas com sucesso.',
      'sucesso'
    );

    return dados;
  } catch (erro) {
    console.error(
      '[Orvix] Erro ao salvar configurações:',
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

  if (!payload.nome) {
    mostrarMensagem(
      'configuracoes-message',
      'Informe o nome da empresa.',
      'erro'
    );

    return false;
  }

  if (
    !CONFIGS_EMAIL_REGEX.test(
      payload.email
    )
  ) {
    mostrarMensagem(
      'configuracoes-message',
      'Informe um e-mail válido.',
      'erro'
    );

    return false;
  }

  return salvarConfiguracoes(
    payload,
    'configuracoes-message'
  );
}


/* ============================================================
   SALVAR PREFERÊNCIAS
   ============================================================ */

async function salvarPreferencias() {
  return salvarConfiguracoes(
    montarPayloadPreferencias(),
    'configuracoes-message'
  );
}


/* ============================================================
   SALVAR APARÊNCIA
   ============================================================ */

async function salvarAparencia() {
  const payload =
    montarPayloadAparencia();

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
    mostrarMensagem(
      'config-aparencia-message',
      'Uma ou mais cores informadas são inválidas.',
      'erro'
    );

    return false;
  }

  const resultado =
    await salvarConfiguracoes(
      payload,
      'config-aparencia-message'
    );

  if (resultado) {
    const empresa =
      resultado.empresa ||
      {
        ...obterEmpresaAtual(),
        ...payload
      };

    aplicarCoresEmpresa(
      empresa
    );

    atualizarPreviewTema();
  }

  return resultado;
}


/* ============================================================
   SALVAR DOCUMENTOS
   ============================================================ */

async function salvarDocumentos() {
  return salvarConfiguracoes(
    montarPayloadDocumentos(),
    'configuracoes-message'
  );
}


/* ============================================================
   SALVAR AGENDA
   ============================================================ */

async function salvarAgenda() {
  const payload =
    montarPayloadAgenda();

  if (
    !payload.agenda_horario_inicio
  ) {
    mostrarMensagem(
      'configuracoes-message',
      'Informe o horário inicial da agenda.',
      'erro'
    );

    return false;
  }

  if (
    !payload.agenda_horario_fim
  ) {
    mostrarMensagem(
      'configuracoes-message',
      'Informe o horário final da agenda.',
      'erro'
    );

    return false;
  }

  const inicio =
    Number(
      payload.agenda_horario_inicio
        .slice(0, 2)
    ) * 60 +
    Number(
      payload.agenda_horario_inicio
        .slice(3, 5)
    );

  const fim =
    Number(
      payload.agenda_horario_fim
        .slice(0, 2)
    ) * 60 +
    Number(
      payload.agenda_horario_fim
        .slice(3, 5)
    );

  if (fim <= inicio) {
    mostrarMensagem(
      'configuracoes-message',
      'O horário final deve ser maior que o horário inicial.',
      'erro'
    );

    return false;
  }

  if (
    !CONFIGS_INTERVALOS_AGENDA.includes(
      payload.agenda_intervalo
    )
  ) {
    mostrarMensagem(
      'configuracoes-message',
      'Selecione um intervalo de agenda válido.',
      'erro'
    );

    return false;
  }

  return salvarConfiguracoes(
    payload,
    'configuracoes-message'
  );
}


/* ============================================================
   BOTÕES
   ============================================================ */

function alterarEstadoBotao(
  botao,
  carregando,
  textoNormal
) {
  if (!botao) {
    return;
  }

  if (carregando) {
    botao.disabled = true;

    if (
      !botao.dataset
        .textoOriginal
    ) {
      botao.dataset
        .textoOriginal =
        botao.textContent;
    }

    botao.textContent =
      'Salvando...';
  } else {
    botao.disabled = false;

    botao.textContent =
      botao.dataset
        .textoOriginal ||
      textoNormal ||
      'Salvar';
  }
}

function configurarBotao(
  id,
  funcao
) {
  const botao =
    elemento(id);

  if (!botao) {
    return;
  }

  if (
    botao.dataset
      .configsListener ===
    'true'
  ) {
    return;
  }

  botao.dataset
    .configsListener =
    'true';

  botao.addEventListener(
    'click',
    async evento => {
      evento.preventDefault();

      const textoOriginal =
        botao.textContent;

      alterarEstadoBotao(
        botao,
        true,
        textoOriginal
      );

      try {
        await funcao();
      } finally {
        alterarEstadoBotao(
          botao,
          false,
          textoOriginal
        );
      }
    }
  );
}


/* ============================================================
   FORMULÁRIO
   ============================================================ */

function configurarFormulario() {
  const form =
    elemento(
      'form-configuracoes'
    );

  if (!form) {
    return;
  }

  if (
    form.dataset
      .configsListener ===
    'true'
  ) {
    return;
  }

  form.dataset
    .configsListener =
    'true';

  form.addEventListener(
    'submit',
    async evento => {
      evento.preventDefault();

      await salvarDadosEmpresa();
    }
  );
}


/* ============================================================
   EXPOSIÇÃO GLOBAL
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
    configurarCores();

    configurarPresetsTema();

    configurarTrocaDeNicho();

    configurarFormulario();

    configurarBotao(
      'btn-salvar-preferencias',
      salvarPreferencias
    );

    configurarBotao(
      'btn-salvar-tema',
      salvarAparencia
    );

    configurarBotao(
      'btn-restaurar-tema',
      () => {
        preencherCampo(
          'config-cor-principal',
          CONFIGS_CORES_PADRAO.primaria
        );

        preencherCampo(
          'config-cor-principal-text',
          CONFIGS_CORES_PADRAO.primaria
        );

        preencherCampo(
          'config-cor-destaque',
          CONFIGS_CORES_PADRAO.destaque
        );

        preencherCampo(
          'config-cor-destaque-text',
          CONFIGS_CORES_PADRAO.destaque
        );

        preencherCampo(
          'config-cor-fundo',
          CONFIGS_CORES_PADRAO.fundo
        );

        preencherCampo(
          'config-cor-fundo-text',
          CONFIGS_CORES_PADRAO.fundo
        );

        aplicarCoresEmpresa({
          cor_primaria:
            CONFIGS_CORES_PADRAO.primaria,

          cor_destaque:
            CONFIGS_CORES_PADRAO.destaque,

          cor_fundo:
            CONFIGS_CORES_PADRAO.fundo
        });

        atualizarPreviewTema();
      }
    );

    configurarBotao(
      'btn-salvar-documentos',
      salvarDocumentos
    );

    configurarBotao(
      'btn-salvar-agenda',
      salvarAgenda
    );

    limparMensagens();

    await carregarUsuarioConfiguracoes();

    await carregarConfiguracoes();

    configurarCores();

    atualizarPreviewTema();
  }
);