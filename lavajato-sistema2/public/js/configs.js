'use strict';

/**
 * ============================================================
 * ORVIX — CONFIGURAÇÕES
 * ============================================================
 *
 * Responsável por:
 * - Carregar configurações da empresa
 * - Salvar dados da empresa
 * - Salvar preferências
 * - Salvar aparência
 * - Salvar documentos
 * - Salvar agenda
 * - Aplicar nicho da empresa
 * - Sincronizar dados com a aplicação principal
 * - Atualizar preview de aparência
 *
 * IMPORTANTE:
 * Este arquivo deve ser a fonte principal dos salvamentos
 * da tela de configurações.
 * ============================================================
 */

const CONFIGS_TOKEN_KEY = 'lavajato_auth_token';

const CONFIGS_CORES_PADRAO = {
  primaria: '#0E3A4C',
  destaque: '#06B6D4',
  fundo: '#F5F7FA'
};

const CONFIGS_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CONFIGS_INTERVALOS_AGENDA = [
  15,
  30,
  45,
  60,
  90,
  120
];

const CONFIGS_NICHOS = [
  'lavajato',
  'barbearia',
  'clinica',
  'pet',
  'oficina',
  'personal',
  'generico'
];

const CONFIGS_MOEDAS = [
  'BRL',
  'USD',
  'EUR'
];

const CONFIGS_FORMATOS_DATA = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD'
];

const CONFIGS_FORMATOS_HORA = [
  '24h',
  '12h'
];

const CONFIGS_IDIOMAS = [
  'pt-BR',
  'en-US',
  'es-ES'
];

const CONFIGS_FUSOS = [
  'America/Sao_Paulo',
  'America/Fortaleza',
  'America/Recife',
  'America/Manaus',
  'America/Belem',
  'America/Cuiaba',
  'America/Porto_Velho',
  'America/Boa_Vista',
  'America/Rio_Branco',
  'America/Noronha',
  'UTC'
];

let empresaConfiguracoes = null;
let usuarioConfiguracoes = null;

let carregandoConfiguracoes = false;
let salvandoConfiguracoes = false;


/* ============================================================
 * UTILITÁRIOS
 * ============================================================ */

function elemento(id) {
  return document.getElementById(id);
}


function obterValor(id) {
  const campo = elemento(id);

  if (!campo) {
    return '';
  }

  return String(campo.value ?? '').trim();
}


function obterNumero(id) {
  const valor = obterValor(id);

  if (valor === '') {
    return NaN;
  }

  const numero = Number(valor);

  return Number.isFinite(numero)
    ? numero
    : NaN;
}


function obterBooleano(id) {
  const campo = elemento(id);

  if (!campo) {
    return false;
  }

  return Boolean(campo.checked);
}


function preencherCampo(id, valor) {
  const campo = elemento(id);

  if (!campo) {
    return;
  }

  if (valor === null || valor === undefined) {
    campo.value = '';
    return;
  }

  campo.value = String(valor);
}


function definirCheckbox(id, valor) {
  const campo = elemento(id);

  if (!campo) {
    return;
  }

  campo.checked = Boolean(valor);
}


function escaparTexto(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


/* ============================================================
 * HORÁRIOS
 * ============================================================ */

/**
 * Converte valores como:
 *
 * 08:00
 * 08:00:00
 * "08:00:00"
 *
 * para:
 *
 * 08:00
 */
function normalizarHorarioInput(valor) {
  if (
    valor === null ||
    valor === undefined ||
    valor === ''
  ) {
    return '';
  }

  const texto = String(valor).trim();

  const match = texto.match(
    /^(\d{1,2}):(\d{2})(?::\d{2})?$/
  );

  if (!match) {
    return texto;
  }

  const hora = Number(match[1]);
  const minuto = Number(match[2]);

  if (
    !Number.isInteger(hora) ||
    !Number.isInteger(minuto) ||
    hora < 0 ||
    hora > 23 ||
    minuto < 0 ||
    minuto > 59
  ) {
    return texto;
  }

  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}


function horarioValido(valor) {
  if (typeof valor !== 'string') {
    return false;
  }

  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(valor);
}


function horarioParaMinutos(valor) {
  if (!horarioValido(valor)) {
    return NaN;
  }

  const [hora, minuto] = valor.split(':').map(Number);

  return (hora * 60) + minuto;
}


/* ============================================================
 * CORES
 * ============================================================ */

function corHexValida(valor) {
  if (typeof valor !== 'string') {
    return false;
  }

  return /^#[0-9A-Fa-f]{6}$/.test(valor.trim());
}


function normalizarCor(valor, fallback) {
  const cor = String(valor ?? '').trim();

  if (corHexValida(cor)) {
    return cor.toUpperCase();
  }

  return fallback;
}


/* ============================================================
 * MENSAGENS
 * ============================================================ */

function mostrarMensagem(id, mensagem, sucesso = true) {
  const elementoMensagem = elemento(id);

  if (!elementoMensagem) {
    return;
  }

  elementoMensagem.textContent = mensagem;

  elementoMensagem.style.display = '';

  elementoMensagem.classList.remove(
    'success',
    'sucesso',
    'error',
    'erro'
  );

  elementoMensagem.classList.add(
    sucesso ? 'success' : 'error'
  );

  clearTimeout(elementoMensagem._timeoutOrvix);

  elementoMensagem._timeoutOrvix = setTimeout(() => {
    elementoMensagem.style.display = 'none';
  }, 5000);
}


function mostrarErroPadrao(erro, mensagemId) {
  console.error('[Orvix] Erro:', erro);

  const mensagem =
    erro?.message ||
    'Não foi possível salvar as configurações.';

  mostrarMensagem(
    mensagemId,
    mensagem,
    false
  );
}


/* ============================================================
 * BOTÕES
 * ============================================================ */

function alterarEstadoBotao(
  botao,
  carregando,
  textoOriginal
) {
  if (!botao) {
    return;
  }

  if (carregando) {
    if (!botao.dataset.textoOriginal) {
      botao.dataset.textoOriginal =
        botao.textContent;
    }

    botao.disabled = true;

    botao.textContent = 'Salvando...';

    botao.setAttribute(
      'aria-busy',
      'true'
    );

    return;
  }

  botao.disabled = false;

  botao.removeAttribute('aria-busy');

  botao.textContent =
    botao.dataset.textoOriginal ||
    textoOriginal ||
    botao.textContent;
}


/* ============================================================
 * AUTENTICAÇÃO / REQUISIÇÕES
 * ============================================================ */

function obterTokenConfiguracoes() {
  try {
    return localStorage.getItem(
      CONFIGS_TOKEN_KEY
    );
  } catch (erro) {
    console.warn(
      '[Orvix] Não foi possível acessar localStorage.',
      erro
    );

    return null;
  }
}


async function requisicaoConfiguracoes(
  url,
  opcoes = {}
) {
  const token = obterTokenConfiguracoes();

  const headers = {
    Accept: 'application/json',
    ...(opcoes.headers || {})
  };

  if (
    opcoes.body !== undefined &&
    !headers['Content-Type']
  ) {
    headers['Content-Type'] =
      'application/json';
  }

  if (token) {
    headers.Authorization =
      `Bearer ${token}`;
  }

  const resposta = await fetch(
    url,
    {
      ...opcoes,
      credentials: 'include',
      cache: 'no-store',
      headers
    }
  );

  let dados = null;

  const contentType =
    resposta.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      dados = await resposta.json();
    } catch (erro) {
      console.warn(
        '[Orvix] Resposta JSON inválida.',
        erro
      );
    }
  } else {
    try {
      const texto = await resposta.text();

      if (texto) {
        dados = {
          mensagem: texto
        };
      }
    } catch (erro) {
      console.warn(
        '[Orvix] Não foi possível ler a resposta.',
        erro
      );
    }
  }

  if (!resposta.ok) {
    const mensagem =
      dados?.erro ||
      dados?.mensagem ||
      `Erro HTTP ${resposta.status}.`;

    throw new Error(mensagem);
  }

  return dados || {};
}


/* ============================================================
 * SINCRONIZAÇÃO COM A APLICAÇÃO PRINCIPAL
 * ============================================================ */

/**
 * Mantém a empresa retornada pela API sincronizada com
 * o restante da aplicação.
 *
 * Isso é especialmente importante para o nicho:
 *
 * empresa.nicho
 *       ↓
 * window.nichoAtual
 *       ↓
 * aplicarNicho()
 *       ↓
 * labels / serviços / clientes / sidebar
 */
function sincronizarEmpresaComAplicacao(
  dados,
  empresa
) {
  if (!empresa) {
    return;
  }

  empresaConfiguracoes = empresa;

  window.lavajatoEmpresa = empresa;
  window.orvixEmpresa = empresa;

  /**
   * Se o app.js disponibilizar uma função para sincronizar
   * a empresa principal, utilizamos ela.
   *
   * O retorno da API é mantido no mesmo formato:
   *
   * {
   *   mensagem,
   *   empresa
   * }
   */
  if (
    typeof window.atualizarEmpresaLocal ===
    'function'
  ) {
    try {
      window.atualizarEmpresaLocal(dados);
    } catch (erro) {
      console.warn(
        '[Orvix] Falha ao sincronizar empresa com app.js:',
        erro
      );
    }
  }

  /**
   * Atualiza diretamente o nome mostrado na sidebar.
   * Isso evita depender exclusivamente do estado interno
   * do app.js.
   */
  const sidebarEmpresa =
    elemento('sidebar-company');

  if (
    sidebarEmpresa &&
    empresa.nome
  ) {
    sidebarEmpresa.textContent =
      empresa.nome;
  }

  /**
   * Atualização do nicho.
   */
  if (empresa.nicho) {
    window.nichoAtual =
      empresa.nicho;

    const selectNicho =
      elemento('config-empresa-nicho');

    if (selectNicho) {
      selectNicho.value =
        empresa.nicho;
    }

    if (
      typeof window.aplicarNicho ===
      'function'
    ) {
      try {
        window.aplicarNicho(
          empresa.nicho
        );
      } catch (erro) {
        console.warn(
          '[Orvix] Falha ao aplicar nicho:',
          erro
        );
      }
    }
  }

  /**
   * Depois que atualizarEmpresaLocal() tiver
   * sincronizado empresaLogada, podemos atualizar
   * a sidebar inteira.
   */
  if (
    typeof window.atualizarEmpresaLocal ===
      'function' &&
    typeof window.atualizarSidebarUsuario ===
      'function'
  ) {
    try {
      window.atualizarSidebarUsuario();
    } catch (erro) {
      console.warn(
        '[Orvix] Falha ao atualizar sidebar:',
        erro
      );
    }
  }
}


/* ============================================================
 * PREENCHER DADOS DA EMPRESA
 * ============================================================ */

function preencherDadosEmpresa(
  empresa
) {
  if (!empresa) {
    return;
  }

  /* ----------------------------------------------------------
   * EMPRESA
   * ---------------------------------------------------------- */

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
    empresa.nicho
  );

  preencherCampo(
    'config-logo-url',
    empresa.logo_url
  );


  /* ----------------------------------------------------------
   * REGIONAL
   * ---------------------------------------------------------- */

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
   * PREFERÊNCIAS
   * ---------------------------------------------------------- */

  definirCheckbox(
    'config-notificacoes-ativas',
    empresa.notificacoes_ativas
  );

  definirCheckbox(
    'config-mostrar-valores',
    empresa.mostrar_valores
  );

  preencherCampo(
    'config-dashboard-inicial',
    empresa.dashboard_inicial
  );

  definirCheckbox(
    'config-modo-compacto',
    empresa.modo_compacto
  );


  /* ----------------------------------------------------------
   * DOCUMENTOS
   * ---------------------------------------------------------- */

  preencherCampo(
    'config-rodape-documentos',
    empresa.rodape_documentos
  );

  preencherCampo(
    'config-telefone-documentos',
    empresa.telefone_documentos
  );


  /* ----------------------------------------------------------
   * AGENDA
   * ---------------------------------------------------------- */

  preencherCampo(
    'config-agenda-inicio',
    normalizarHorarioInput(
      empresa.agenda_horario_inicio
    )
  );

  preencherCampo(
    'config-agenda-fim',
    normalizarHorarioInput(
      empresa.agenda_horario_fim
    )
  );

  preencherCampo(
    'config-agenda-intervalo',
    empresa.agenda_intervalo
  );


  /* ----------------------------------------------------------
   * APARÊNCIA
   * ---------------------------------------------------------- */

  preencherCampo(
    'config-cor-principal',
    normalizarCor(
      empresa.cor_primaria,
      CONFIGS_CORES_PADRAO.primaria
    )
  );

  preencherCampo(
    'config-cor-principal-text',
    normalizarCor(
      empresa.cor_primaria,
      CONFIGS_CORES_PADRAO.primaria
    )
  );

  preencherCampo(
    'config-cor-destaque',
    normalizarCor(
      empresa.cor_destaque,
      CONFIGS_CORES_PADRAO.destaque
    )
  );

  preencherCampo(
    'config-cor-destaque-text',
    normalizarCor(
      empresa.cor_destaque,
      CONFIGS_CORES_PADRAO.destaque
    )
  );

  preencherCampo(
    'config-cor-fundo',
    normalizarCor(
      empresa.cor_fundo,
      CONFIGS_CORES_PADRAO.fundo
    )
  );

  preencherCampo(
    'config-cor-fundo-text',
    normalizarCor(
      empresa.cor_fundo,
      CONFIGS_CORES_PADRAO.fundo
    )
  );


  aplicarCoresEmpresa(empresa);
}


/* ============================================================
 * CARREGAR USUÁRIO
 * ============================================================ */

async function carregarUsuarioConfiguracoes() {
  try {
    const dados =
      await requisicaoConfiguracoes(
        '/api/auth/me',
        {
          method: 'GET'
        }
      );

    usuarioConfiguracoes =
      dados?.usuario ||
      dados?.user ||
      dados ||
      null;

    if (
      usuarioConfiguracoes &&
      typeof usuarioConfiguracoes === 'object'
    ) {
      window.orvixUsuario =
        usuarioConfiguracoes;

      const nome =
        elemento('config-usuario-nome');

      const email =
        elemento('config-usuario-email');

      const perfil =
        elemento('config-usuario-perfil');

      if (nome) {
        nome.value =
          usuarioConfiguracoes.nome || '';
      }

      if (email) {
        email.value =
          usuarioConfiguracoes.email || '';
      }

      if (perfil) {
        const perfilValor =
          usuarioConfiguracoes.perfil ||
          usuarioConfiguracoes.role ||
          '';

        perfil.value =
          perfilValor === 'administrador'
            ? 'Administrador'
            : perfilValor === 'funcionario'
              ? 'Funcionário'
              : perfilValor;
      }
    }

    return usuarioConfiguracoes;
  } catch (erro) {
    console.warn(
      '[Orvix] Não foi possível carregar usuário:',
      erro
    );

    return null;
  }
}


/* ============================================================
 * CARREGAR CONFIGURAÇÕES
 * ============================================================ */

async function carregarConfiguracoes() {
  if (carregandoConfiguracoes) {
    return empresaConfiguracoes;
  }

  carregandoConfiguracoes = true;

  try {
    const dados =
      await requisicaoConfiguracoes(
        '/api/configuracoes',
        {
          method: 'GET'
        }
      );

    const empresa =
      dados?.empresa ||
      null;

    if (!empresa) {
      throw new Error(
        'Dados da empresa não foram encontrados.'
      );
    }

    empresaConfiguracoes =
      empresa;

    window.lavajatoEmpresa =
      empresa;

    window.orvixEmpresa =
      empresa;

    preencherDadosEmpresa(
      empresa
    );

    sincronizarEmpresaComAplicacao(
      dados,
      empresa
    );

    atualizarInformacoesSistema(
      empresa
    );

    atualizarPreviewTema();

    return empresa;
  } catch (erro) {
    console.error(
      '[Orvix] Erro ao carregar configurações:',
      erro
    );

    mostrarMensagem(
      'configuracoes-message',
      erro?.message ||
        'Não foi possível carregar as configurações.',
      false
    );

    throw erro;
  } finally {
    carregandoConfiguracoes =
      false;
  }
}


/* ============================================================
 * INFORMAÇÕES DO SISTEMA
 * ============================================================ */

function atualizarInformacoesSistema(
  empresa
) {
  if (!empresa) {
    return;
  }

  const status =
    elemento('config-info-status');

  const empresaElemento =
    elemento('config-info-empresa');

  if (status) {
    status.textContent =
      'Ativa';
  }

  if (empresaElemento) {
    empresaElemento.textContent =
      empresa.nome ||
      'Minha empresa';
  }
}


/* ============================================================
 * PAYLOAD — EMPRESA
 * ============================================================ */

function montarPayloadEmpresa() {
  return {
    nome: obterValor(
      'config-empresa-nome'
    ),

    nome_exibicao: obterValor(
      'config-empresa-nome-exibicao'
    ),

    email: obterValor(
      'config-empresa-email'
    ),

    telefone: obterValor(
      'config-empresa-telefone'
    ),

    nicho: obterValor(
      'config-empresa-nicho'
    ).toLowerCase(),

    logo_url: obterValor(
      'config-logo-url'
    )
  };
}


function validarPayloadEmpresa(
  payload
) {
  if (
    !payload.nome
  ) {
    throw new Error(
      'Informe o nome da empresa.'
    );
  }

  if (
    payload.nome.length > 150
  ) {
    throw new Error(
      'O nome da empresa deve ter no máximo 150 caracteres.'
    );
  }

  if (
    !payload.nome_exibicao
  ) {
    throw new Error(
      'Informe o nome de exibição.'
    );
  }

  if (
    payload.nome_exibicao.length > 150
  ) {
    throw new Error(
      'O nome de exibição deve ter no máximo 150 caracteres.'
    );
  }

  if (
    payload.email &&
    !CONFIGS_EMAIL_REGEX.test(
      payload.email
    )
  ) {
    throw new Error(
      'Informe um e-mail válido.'
    );
  }

  if (
    payload.nicho &&
    !CONFIGS_NICHOS.includes(
      payload.nicho
    )
  ) {
    throw new Error(
      'O nicho informado é inválido.'
    );
  }

  return true;
}


/* ============================================================
 * PAYLOAD — PREFERÊNCIAS
 * ============================================================ */

function montarPayloadPreferencias() {
  return {
    moeda: obterValor(
      'config-moeda'
    ),

    idioma: obterValor(
      'config-idioma'
    ),

    formato_data: obterValor(
      'config-formato-data'
    ),

    formato_hora: obterValor(
      'config-formato-hora'
    ),

    fuso_horario: obterValor(
      'config-fuso-horario'
    ),

    notificacoes_ativas:
      obterBooleano(
        'config-notificacoes-ativas'
      ),

    mostrar_valores:
      obterBooleano(
        'config-mostrar-valores'
      ),

    dashboard_inicial:
      obterValor(
        'config-dashboard-inicial'
      ),

    modo_compacto:
      obterBooleano(
        'config-modo-compacto'
      )
  };
}


function validarPayloadPreferencias(
  payload
) {
  if (
    payload.moeda &&
    !CONFIGS_MOEDAS.includes(
      payload.moeda
    )
  ) {
    throw new Error(
      'Moeda selecionada inválida.'
    );
  }

  if (
    payload.idioma &&
    !CONFIGS_IDIOMAS.includes(
      payload.idioma
    )
  ) {
    throw new Error(
      'Idioma selecionado inválido.'
    );
  }

  if (
    payload.formato_data &&
    !CONFIGS_FORMATOS_DATA.includes(
      payload.formato_data
    )
  ) {
    throw new Error(
      'Formato de data inválido.'
    );
  }

  if (
    payload.formato_hora &&
    !CONFIGS_FORMATOS_HORA.includes(
      payload.formato_hora
    )
  ) {
    throw new Error(
      'Formato de hora inválido.'
    );
  }

  if (
    payload.fuso_horario &&
    !CONFIGS_FUSOS.includes(
      payload.fuso_horario
    )
  ) {
    throw new Error(
      'Fuso horário inválido.'
    );
  }

  return true;
}


/* ============================================================
 * PAYLOAD — APARÊNCIA
 * ============================================================ */

function montarPayloadAparencia() {
  return {
    cor_primaria:
      normalizarCor(
        obterValor(
          'config-cor-principal'
        ),
        CONFIGS_CORES_PADRAO.primaria
      ),

    cor_destaque:
      normalizarCor(
        obterValor(
          'config-cor-destaque'
        ),
        CONFIGS_CORES_PADRAO.destaque
      ),

    cor_fundo:
      normalizarCor(
        obterValor(
          'config-cor-fundo'
        ),
        CONFIGS_CORES_PADRAO.fundo
      )
  };
}


function validarPayloadAparencia(
  payload
) {
  if (
    !corHexValida(
      payload.cor_primaria
    )
  ) {
    throw new Error(
      'A cor principal informada é inválida.'
    );
  }

  if (
    !corHexValida(
      payload.cor_destaque
    )
  ) {
    throw new Error(
      'A cor de destaque informada é inválida.'
    );
  }

  if (
    !corHexValida(
      payload.cor_fundo
    )
  ) {
    throw new Error(
      'A cor de fundo informada é inválida.'
    );
  }

  return true;
}


/* ============================================================
 * PAYLOAD — DOCUMENTOS
 * ============================================================ */

function montarPayloadDocumentos() {
  return {
    rodape_documentos:
      obterValor(
        'config-rodape-documentos'
      ),

    telefone_documentos:
      obterValor(
        'config-telefone-documentos'
      )
  };
}


/* ============================================================
 * PAYLOAD — AGENDA
 * ============================================================ */

function montarPayloadAgenda() {
  const inicio =
    normalizarHorarioInput(
      obterValor(
        'config-agenda-inicio'
      )
    );

  const fim =
    normalizarHorarioInput(
      obterValor(
        'config-agenda-fim'
      )
    );

  const intervaloTexto =
    obterValor(
      'config-agenda-intervalo'
    );

  const intervalo =
    Number(intervaloTexto);

  return {
    agenda_horario_inicio:
      inicio,

    agenda_horario_fim:
      fim,

    agenda_intervalo:
      intervalo
  };
}


function validarPayloadAgenda(
  payload
) {
  /* ----------------------------------------------------------
   * INÍCIO
   * ---------------------------------------------------------- */

  if (
    !horarioValido(
      payload.agenda_horario_inicio
    )
  ) {
    throw new Error(
      'Horário inicial da agenda inválido.'
    );
  }


  /* ----------------------------------------------------------
   * FIM
   * ---------------------------------------------------------- */

  if (
    !horarioValido(
      payload.agenda_horario_fim
    )
  ) {
    throw new Error(
      'Horário final da agenda inválido.'
    );
  }


  /* ----------------------------------------------------------
   * ORDEM DOS HORÁRIOS
   * ---------------------------------------------------------- */

  const inicio =
    horarioParaMinutos(
      payload.agenda_horario_inicio
    );

  const fim =
    horarioParaMinutos(
      payload.agenda_horario_fim
    );

  if (
    Number.isFinite(inicio) &&
    Number.isFinite(fim) &&
    fim <= inicio
  ) {
    throw new Error(
      'O horário final da agenda deve ser posterior ao horário inicial.'
    );
  }


  /* ----------------------------------------------------------
   * INTERVALO
   * ---------------------------------------------------------- */

  if (
    !Number.isFinite(
      payload.agenda_intervalo
    )
  ) {
    throw new Error(
      'Intervalo da agenda inválido.'
    );
  }

  if (
    !CONFIGS_INTERVALOS_AGENDA.includes(
      Number(payload.agenda_intervalo)
    )
  ) {
    throw new Error(
      'Intervalo da agenda inválido.'
    );
  }

  return true;
}


/* ============================================================
 * SALVAMENTO PRINCIPAL
 * ============================================================ */

/**
 * Função central de salvamento.
 *
 * Retorna o objeto completo da API:
 *
 * {
 *   mensagem,
 *   empresa
 * }
 *
 * Isso mantém compatibilidade com outras partes do app
 * que eventualmente chamem window.salvarConfiguracoes().
 */
async function salvarConfiguracoes(
  payload,
  mensagemId = 'configuracoes-message'
) {
  if (
    salvandoConfiguracoes
  ) {
    return false;
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    throw new Error(
      'Dados de configuração inválidos.'
    );
  }

  salvandoConfiguracoes = true;

  try {
    const dados =
      await requisicaoConfiguracoes(
        '/api/configuracoes',
        {
          method: 'PUT',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify(
            payload
          )
        }
      );

    const empresa =
      dados?.empresa ||
      null;

    if (empresa) {
      sincronizarEmpresaComAplicacao(
        dados,
        empresa
      );

      preencherDadosEmpresa(
        empresa
      );

      atualizarInformacoesSistema(
        empresa
      );

      aplicarCoresEmpresa(
        empresa
      );

      atualizarPreviewTema();
    }

    mostrarMensagem(
      mensagemId,
      dados?.mensagem ||
        'Configurações salvas com sucesso.',
      true
    );

    return dados;
  } catch (erro) {
    mostrarErroPadrao(
      erro,
      mensagemId
    );

    throw erro;
  } finally {
    salvandoConfiguracoes =
      false;
  }
}


/* ============================================================
 * ATUALIZAR DADOS APÓS SALVAMENTO
 * ============================================================ */

async function atualizarDadosDepoisDeSalvar() {
  try {
    const dados =
      await requisicaoConfiguracoes(
        '/api/configuracoes',
        {
          method: 'GET'
        }
      );

    const empresa =
      dados?.empresa ||
      null;

    if (!empresa) {
      return null;
    }

    empresaConfiguracoes =
      empresa;

    window.lavajatoEmpresa =
      empresa;

    window.orvixEmpresa =
      empresa;

    preencherDadosEmpresa(
      empresa
    );

    sincronizarEmpresaComAplicacao(
      dados,
      empresa
    );

    atualizarInformacoesSistema(
      empresa
    );

    aplicarCoresEmpresa(
      empresa
    );

    atualizarPreviewTema();

    return empresa;
  } catch (erro) {
    console.warn(
      '[Orvix] Falha ao atualizar dados após salvamento:',
      erro
    );

    return null;
  }
}


/* ============================================================
 * SALVAR EMPRESA
 * ============================================================ */

async function salvarDadosEmpresa() {
  const botao =
    elemento(
      'btn-salvar-configuracoes'
    );

  alterarEstadoBotao(
    botao,
    true,
    'Salvar configurações'
  );

  try {
    const payload =
      montarPayloadEmpresa();

    validarPayloadEmpresa(
      payload
    );

    await salvarConfiguracoes(
      payload,
      'configuracoes-message'
    );

    await atualizarDadosDepoisDeSalvar();

    mostrarMensagem(
      'configuracoes-message',
      'Dados da empresa salvos com sucesso.',
      true
    );

    return true;
  } catch (erro) {
    console.error(
      '[Orvix] Erro ao salvar empresa:',
      erro
    );

    return false;
  } finally {
    alterarEstadoBotao(
      botao,
      false,
      'Salvar configurações'
    );
  }
}


/* ============================================================
 * SALVAR PREFERÊNCIAS
 * ============================================================ */

async function salvarPreferencias() {
  const botao =
    elemento(
      'btn-salvar-preferencias'
    );

  alterarEstadoBotao(
    botao,
    true,
    'Salvar preferências'
  );

  try {
    const payload =
      montarPayloadPreferencias();

    validarPayloadPreferencias(
      payload
    );

    await salvarConfiguracoes(
      payload,
      'configuracoes-message'
    );

    await atualizarDadosDepoisDeSalvar();

    mostrarMensagem(
      'configuracoes-message',
      'Preferências salvas com sucesso.',
      true
    );

    return true;
  } catch (erro) {
    console.error(
      '[Orvix] Erro ao salvar preferências:',
      erro
    );

    return false;
  } finally {
    alterarEstadoBotao(
      botao,
      false,
      'Salvar preferências'
    );
  }
}


/* ============================================================
 * SALVAR APARÊNCIA
 * ============================================================ */

async function salvarAparencia() {
  const botao =
    elemento(
      'btn-salvar-tema'
    );

  alterarEstadoBotao(
    botao,
    true,
    'Salvar aparência'
  );

  try {
    const payload =
      montarPayloadAparencia();

    validarPayloadAparencia(
      payload
    );

    await salvarConfiguracoes(
      payload,
      'config-aparencia-message'
    );

    await atualizarDadosDepoisDeSalvar();

    mostrarMensagem(
      'config-aparencia-message',
      'Aparência salva com sucesso.',
      true
    );

    return true;
  } catch (erro) {
    console.error(
      '[Orvix] Erro ao salvar aparência:',
      erro
    );

    mostrarMensagem(
      'config-aparencia-message',
      erro?.message ||
        'Não foi possível salvar a aparência.',
      false
    );

    return false;
  } finally {
    alterarEstadoBotao(
      botao,
      false,
      'Salvar aparência'
    );
  }
}


/* ============================================================
 * SALVAR DOCUMENTOS
 * ============================================================ */

async function salvarDocumentos() {
  const botao =
    elemento(
      'btn-salvar-documentos'
    );

  alterarEstadoBotao(
    botao,
    true,
    'Salvar documentos'
  );

  try {
    const payload =
      montarPayloadDocumentos();

    await salvarConfiguracoes(
      payload,
      'configuracoes-message'
    );

    await atualizarDadosDepoisDeSalvar();

    mostrarMensagem(
      'configuracoes-message',
      'Configurações dos documentos salvas com sucesso.',
      true
    );

    return true;
  } catch (erro) {
    console.error(
      '[Orvix] Erro ao salvar documentos:',
      erro
    );

    return false;
  } finally {
    alterarEstadoBotao(
      botao,
      false,
      'Salvar documentos'
    );
  }
}


/* ============================================================
 * SALVAR AGENDA
 * ============================================================ */

async function salvarAgenda() {
  const botao =
    elemento(
      'btn-salvar-agenda'
    );

  alterarEstadoBotao(
    botao,
    true,
    'Salvar agenda'
  );

  try {
    const payload =
      montarPayloadAgenda();

    console.log(
      '[Orvix] Salvando agenda:',
      payload
    );

    validarPayloadAgenda(
      payload
    );

    const resultado =
      await salvarConfiguracoes(
        payload,
        'configuracoes-message'
      );

    /**
     * Garante que o retorno da API seja aplicado
     * imediatamente nos campos da tela.
     */
    if (
      resultado?.empresa
    ) {
      empresaConfiguracoes =
        resultado.empresa;

      preencherDadosEmpresa(
        resultado.empresa
      );

      sincronizarEmpresaComAplicacao(
        resultado,
        resultado.empresa
      );
    }

    /**
     * Busca novamente os dados do servidor.
     *
     * Isso garante que o estado da tela seja exatamente
     * o que está salvo no banco.
     */
    await atualizarDadosDepoisDeSalvar();

    mostrarMensagem(
      'configuracoes-message',
      'Configurações da agenda salvas com sucesso.',
      true
    );

    return true;
  } catch (erro) {
    console.error(
      '[Orvix] Erro ao salvar agenda:',
      erro
    );

    mostrarMensagem(
      'configuracoes-message',
      erro?.message ||
        'Não foi possível salvar a agenda.',
      false
    );

    return false;
  } finally {
    alterarEstadoBotao(
      botao,
      false,
      'Salvar agenda'
    );
  }
}


/* ============================================================
 * APARÊNCIA — APLICAÇÃO
 * ============================================================ */

function aplicarCoresEmpresa(
  empresa
) {
  if (!empresa) {
    return;
  }

  const primaria =
    normalizarCor(
      empresa.cor_primaria,
      CONFIGS_CORES_PADRAO.primaria
    );

  const destaque =
    normalizarCor(
      empresa.cor_destaque,
      CONFIGS_CORES_PADRAO.destaque
    );

  const fundo =
    normalizarCor(
      empresa.cor_fundo,
      CONFIGS_CORES_PADRAO.fundo
    );

  const root =
    document.documentElement;

  if (!root) {
    return;
  }

  root.style.setProperty(
    '--cor-primaria',
    primaria
  );

  root.style.setProperty(
    '--primary-color',
    primaria
  );

  root.style.setProperty(
    '--cor-destaque',
    destaque
  );

  root.style.setProperty(
    '--accent-color',
    destaque
  );

  root.style.setProperty(
    '--cor-fundo',
    fundo
  );

  root.style.setProperty(
    '--background-color',
    fundo
  );


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
}


/* ============================================================
 * PREVIEW DO TEMA
 * ============================================================ */

function atualizarPreviewTema() {
  const primaria =
    normalizarCor(
      obterValor(
        'config-cor-principal'
      ),
      CONFIGS_CORES_PADRAO.primaria
    );

  const destaque =
    normalizarCor(
      obterValor(
        'config-cor-destaque'
      ),
      CONFIGS_CORES_PADRAO.destaque
    );

  const fundo =
    normalizarCor(
      obterValor(
        'config-cor-fundo'
      ),
      CONFIGS_CORES_PADRAO.fundo
    );

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
    preview.style.backgroundColor =
      fundo;

    preview.style.setProperty(
      '--preview-primary',
      primaria
    );

    preview.style.setProperty(
      '--preview-accent',
      destaque
    );
  }

  if (titulo) {
    titulo.style.color =
      primaria;
  }

  if (badge) {
    badge.style.backgroundColor =
      destaque;
  }

  if (botao) {
    botao.style.backgroundColor =
      primaria;
  }
}


/* ============================================================
 * PRESETS DE TEMA
 * ============================================================ */

function aplicarPresetTema(preset) {
  if (!preset) {
    return;
  }

  const primaria =
    preset.dataset.primary;

  const destaque =
    preset.dataset.accent;

  const fundo =
    preset.dataset.background;

  if (corHexValida(primaria)) {
    preencherCampo(
      'config-cor-principal',
      primaria
    );

    preencherCampo(
      'config-cor-principal-text',
      primaria
    );
  }

  if (corHexValida(destaque)) {
    preencherCampo(
      'config-cor-destaque',
      destaque
    );

    preencherCampo(
      'config-cor-destaque-text',
      destaque
    );
  }

  if (corHexValida(fundo)) {
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


/* ============================================================
 * SINCRONIZAÇÃO DOS INPUTS DE COR
 * ============================================================ */

function configurarCampoCor(
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
      const valor =
        color.value;

      if (
        corHexValida(valor)
      ) {
        text.value =
          valor.toUpperCase();

        atualizarPreviewTema();
      }
    }
  );

  text.addEventListener(
    'input',
    () => {
      let valor =
        text.value
          .trim()
          .toUpperCase();

      if (
        !valor.startsWith('#') &&
        /^[0-9A-F]{6}$/.test(valor)
      ) {
        valor = `#${valor}`;
      }

      if (
        corHexValida(valor)
      ) {
        color.value =
          valor;

        atualizarPreviewTema();
      }
    }
  );

  text.addEventListener(
    'blur',
    () => {
      const valor =
        text.value
          .trim()
          .toUpperCase();

      if (
        corHexValida(valor)
      ) {
        color.value =
          valor;

        text.value =
          valor;
      }
    }
  );
}


/* ============================================================
 * RESTAURAR TEMA
 * ============================================================ */

function restaurarTema() {
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

  atualizarPreviewTema();

  mostrarMensagem(
    'config-aparencia-message',
    'Tema padrão restaurado. Clique em salvar para aplicar.',
    true
  );
}


/* ============================================================
 * EVENTOS
 * ============================================================ */

function configurarEventosConfiguracoes() {
  /* ----------------------------------------------------------
   * EMPRESA
   * ---------------------------------------------------------- */

  const btnEmpresa =
    elemento(
      'btn-salvar-configuracoes'
    );

  if (btnEmpresa) {
    btnEmpresa.addEventListener(
      'click',
      async (evento) => {
        evento.preventDefault();

        await salvarDadosEmpresa();
      }
    );
  }


  /* ----------------------------------------------------------
   * PREFERÊNCIAS
   * ---------------------------------------------------------- */

  const btnPreferencias =
    elemento(
      'btn-salvar-preferencias'
    );

  if (btnPreferencias) {
    btnPreferencias.addEventListener(
      'click',
      async (evento) => {
        evento.preventDefault();

        await salvarPreferencias();
      }
    );
  }


  /* ----------------------------------------------------------
   * APARÊNCIA
   * ---------------------------------------------------------- */

  const btnTema =
    elemento(
      'btn-salvar-tema'
    );

  if (btnTema) {
    btnTema.addEventListener(
      'click',
      async (evento) => {
        evento.preventDefault();

        await salvarAparencia();
      }
    );
  }


  const btnRestaurar =
    elemento(
      'btn-restaurar-tema'
    );

  if (btnRestaurar) {
    btnRestaurar.addEventListener(
      'click',
      (evento) => {
        evento.preventDefault();

        restaurarTema();
      }
    );
  }


  /* ----------------------------------------------------------
   * DOCUMENTOS
   * ---------------------------------------------------------- */

  const btnDocumentos =
    elemento(
      'btn-salvar-documentos'
    );

  if (btnDocumentos) {
    btnDocumentos.addEventListener(
      'click',
      async (evento) => {
        evento.preventDefault();

        await salvarDocumentos();
      }
    );
  }


  /* ----------------------------------------------------------
   * AGENDA
   * ---------------------------------------------------------- */

  const btnAgenda =
    elemento(
      'btn-salvar-agenda'
    );

  if (btnAgenda) {
    btnAgenda.addEventListener(
      'click',
      async (evento) => {
        evento.preventDefault();

        await salvarAgenda();
      }
    );
  }


  /* ----------------------------------------------------------
   * CORES
   * ---------------------------------------------------------- */

  configurarCampoCor(
    'config-cor-principal',
    'config-cor-principal-text'
  );

  configurarCampoCor(
    'config-cor-destaque',
    'config-cor-destaque-text'
  );

  configurarCampoCor(
    'config-cor-fundo',
    'config-cor-fundo-text'
  );


  /* ----------------------------------------------------------
   * PRESETS
   * ---------------------------------------------------------- */

  document
    .querySelectorAll(
      '.theme-preset'
    )
    .forEach(
      (preset) => {
        preset.addEventListener(
          'click',
          () => {
            aplicarPresetTema(
              preset
            );
          }
        );
      }
    );


  /* ----------------------------------------------------------
   * PREVIEW EM TEMPO REAL
   * ---------------------------------------------------------- */

  [
    'config-cor-principal',
    'config-cor-destaque',
    'config-cor-fundo'
  ].forEach(
    (id) => {
      const campo =
        elemento(id);

      if (!campo) {
        return;
      }

      campo.addEventListener(
        'input',
        atualizarPreviewTema
      );
    }
  );


  /* ----------------------------------------------------------
   * SELECT DE NICHO
   * ---------------------------------------------------------- */

  const selectNicho =
    elemento(
      'config-empresa-nicho'
    );

  if (selectNicho) {
    selectNicho.addEventListener(
      'change',
      () => {
        const nicho =
          String(
            selectNicho.value || ''
          ).toLowerCase();

        if (
          nicho &&
          typeof window.aplicarNicho ===
            'function'
        ) {
          try {
            window.nichoAtual =
              nicho;

            window.aplicarNicho(
              nicho
            );
          } catch (erro) {
            console.warn(
              '[Orvix] Erro ao atualizar preview do nicho:',
              erro
            );
          }
        }
      }
    );
  }


  /* ----------------------------------------------------------
   * FORM CONFIGURAÇÕES
   *
   * Evita submit tradicional do formulário.
   * ---------------------------------------------------------- */

  const form =
    elemento(
      'form-configuracoes'
    );

  if (form) {
    form.addEventListener(
      'submit',
      (evento) => {
        evento.preventDefault();
      }
    );
  }
}


/* ============================================================
 * INICIALIZAÇÃO
 * ============================================================ */

async function inicializarConfiguracoes() {
  try {
    configurarEventosConfiguracoes();

    await carregarUsuarioConfiguracoes();

    await carregarConfiguracoes();

    atualizarPreviewTema();
  } catch (erro) {
    console.error(
      '[Orvix] Falha ao inicializar configurações:',
      erro
    );
  }
}


/* ============================================================
 * EXPORTAÇÕES DE COMPATIBILIDADE
 * ============================================================ */

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

window.atualizarPreviewTema =
  atualizarPreviewTema;


/* ============================================================
 * DOM READY
 * ============================================================ */

if (
  document.readyState ===
  'loading'
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