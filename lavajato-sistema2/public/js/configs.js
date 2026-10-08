/* =========================================================
   ORVIX — CONFIGURAÇÕES
   Arquivo: public/js/configs.js
   ========================================================= */

'use strict';


/* =========================================================
   CONSTANTES
   ========================================================= */

const TOKEN_KEY = 'lavajato_auth_token';

const COR_PRIMARIA_PADRAO = '#0E3A4C';
const COR_DESTAQUE_PADRAO = '#06B6D4';
const COR_FUNDO_PADRAO = '#F2F5F8';

const REGEX_COR = /^#[0-9A-F]{6}$/i;


/* =========================================================
   ESTADO GLOBAL
   ========================================================= */

window.lavajatoEmpresa =
  window.lavajatoEmpresa || null;


/* =========================================================
   TOKEN
   ========================================================= */

function obterToken() {

  return localStorage.getItem(
    TOKEN_KEY
  ) || '';
}


/* =========================================================
   HEADERS
   ========================================================= */

function headersAutenticacao() {

  const token =
    obterToken();

  const headers = {
    'Accept': 'application/json'
  };

  if (token) {

    headers.Authorization =
      `Bearer ${token}`;
  }

  return headers;
}


/* =========================================================
   LOCALIZAR ELEMENTO
   ========================================================= */

function obterElemento(...ids) {

  for (const id of ids) {

    if (!id) {
      continue;
    }

    const elemento =
      document.getElementById(id);

    if (elemento) {
      return elemento;
    }
  }

  return null;
}


/* =========================================================
   OBTER VALOR DE CAMPO
   ========================================================= */

function obterValorCampo(...ids) {

  const elemento =
    obterElemento(...ids);

  if (!elemento) {
    return '';
  }

  if (
    typeof elemento.value ===
    'string'
  ) {

    return elemento.value.trim();
  }

  return elemento.value;
}


/* =========================================================
   OBTER CHECKBOX
   ========================================================= */

function obterValorCheckbox(...ids) {

  const elemento =
    obterElemento(...ids);

  if (!elemento) {
    return undefined;
  }

  return Boolean(
    elemento.checked
  );
}


/* =========================================================
   PREENCHER CAMPO
   ========================================================= */

function preencherCampo(
  id,
  valor
) {

  const elemento =
    document.getElementById(id);

  if (!elemento) {
    return;
  }

  if (
    valor === null ||
    valor === undefined
  ) {
    return;
  }

  elemento.value =
    valor;
}


/* =========================================================
   PREENCHER CHECKBOX
   ========================================================= */

function preencherCheckbox(
  id,
  valor
) {

  const elemento =
    document.getElementById(id);

  if (!elemento) {
    return;
  }

  elemento.checked =
    Boolean(valor);
}


/* =========================================================
   CORES — APLICAR NA INTERFACE
   ========================================================= */

function aplicarCoresEmpresa(
  empresa
) {

  if (!empresa) {
    return;
  }

  const root =
    document.documentElement;

  const primaria =
    empresa.cor_primaria ||
    COR_PRIMARIA_PADRAO;

  const destaque =
    empresa.cor_destaque ||
    COR_DESTAQUE_PADRAO;

  const fundo =
    empresa.cor_fundo ||
    COR_FUNDO_PADRAO;


  /* Variáveis principais */

  root.style.setProperty(
    '--primary',
    primaria
  );

  root.style.setProperty(
    '--primary-2',
    primaria
  );

  root.style.setProperty(
    '--primary-dark',
    primaria
  );

  root.style.setProperty(
    '--accent',
    destaque
  );

  root.style.setProperty(
    '--accent-2',
    destaque
  );

  root.style.setProperty(
    '--bg',
    fundo
  );


  /* Variáveis alternativas */

  root.style.setProperty(
    '--cor-primaria',
    primaria
  );

  root.style.setProperty(
    '--cor-destaque',
    destaque
  );

  root.style.setProperty(
    '--cor-fundo',
    fundo
  );
}


/* =========================================================
   DEFINIR CAMPOS DE COR
   ========================================================= */

function definirCamposDeCor(
  primaria,
  destaque,
  fundo
) {

  primaria =
    primaria ||
    COR_PRIMARIA_PADRAO;

  destaque =
    destaque ||
    COR_DESTAQUE_PADRAO;

  fundo =
    fundo ||
    COR_FUNDO_PADRAO;


  const campos = {

    'config-cor-principal':
      primaria,

    'config-cor-principal-text':
      primaria,

    'config-cor-destaque':
      destaque,

    'config-cor-destaque-text':
      destaque,

    'config-cor-fundo':
      fundo,

    'config-cor-fundo-text':
      fundo,

    'cor_primaria':
      primaria,

    'cor_destaque':
      destaque,

    'cor_fundo':
      fundo
  };


  Object.keys(campos)
    .forEach(id => {

      const elemento =
        document.getElementById(id);

      if (!elemento) {
        return;
      }

      elemento.value =
        String(
          campos[id]
        ).toUpperCase();
    });
}


/* =========================================================
   PREVIEW DAS CORES
   ========================================================= */

function aplicarPreviewCores() {

  const primaria =
    obterValorCampo(
      'config-cor-principal',
      'cor_primaria'
    ) ||
    COR_PRIMARIA_PADRAO;


  const destaque =
    obterValorCampo(
      'config-cor-destaque',
      'cor_destaque'
    ) ||
    COR_DESTAQUE_PADRAO;


  const fundo =
    obterValorCampo(
      'config-cor-fundo',
      'cor_fundo'
    ) ||
    COR_FUNDO_PADRAO;


  const root =
    document.documentElement;


  root.style.setProperty(
    '--primary',
    primaria
  );

  root.style.setProperty(
    '--primary-2',
    primaria
  );

  root.style.setProperty(
    '--primary-dark',
    primaria
  );

  root.style.setProperty(
    '--accent',
    destaque
  );

  root.style.setProperty(
    '--accent-2',
    destaque
  );

  root.style.setProperty(
    '--bg',
    fundo
  );

  root.style.setProperty(
    '--cor-primaria',
    primaria
  );

  root.style.setProperty(
    '--cor-destaque',
    destaque
  );

  root.style.setProperty(
    '--cor-fundo',
    fundo
  );
}


/* =========================================================
   SINCRONIZAR COLOR PICKER
   ========================================================= */

function sincronizarCorInput(
  inputColorId,
  inputTextId
) {

  const inputColor =
    document.getElementById(
      inputColorId
    );

  const inputText =
    document.getElementById(
      inputTextId
    );


  if (
    !inputColor ||
    !inputText
  ) {
    return;
  }


  inputColor.addEventListener(
    'input',
    () => {

      inputText.value =
        inputColor.value
          .toUpperCase();

      aplicarPreviewCores();
    }
  );


  inputText.addEventListener(
    'input',
    () => {

      let valor =
        inputText.value
          .trim()
          .toUpperCase();


      if (
        !valor.startsWith('#')
      ) {

        valor =
          '#' +
          valor.replace(
            /^#+/,
            ''
          );
      }


      inputText.value =
        valor;


      if (
        REGEX_COR.test(valor)
      ) {

        inputColor.value =
          valor;

        aplicarPreviewCores();
      }
    }
  );


  inputText.addEventListener(
    'blur',
    () => {

      const valor =
        inputText.value
          .trim()
          .toUpperCase();


      if (
        !REGEX_COR.test(valor)
      ) {

        inputText.value =
          inputColor.value
            .toUpperCase();
      }
    }
  );
}


/* =========================================================
   CONFIGURAR CORES
   ========================================================= */

function configurarSelecaoDeCores() {

  sincronizarCorInput(
    'config-cor-principal',
    'config-cor-principal-text'
  );

  sincronizarCorInput(
    'config-cor-destaque',
    'config-cor-destaque-text'
  );

  sincronizarCorInput(
    'config-cor-fundo',
    'config-cor-fundo-text'
  );


  /* Presets */

  document
    .querySelectorAll(
      '.theme-preset'
    )
    .forEach(botao => {

      botao.addEventListener(
        'click',
        () => {

          definirCamposDeCor(

            botao.dataset.primary ||
            COR_PRIMARIA_PADRAO,

            botao.dataset.accent ||
            COR_DESTAQUE_PADRAO,

            botao.dataset.background ||
            COR_FUNDO_PADRAO
          );

          aplicarPreviewCores();
        }
      );
    });


  /* Restaurar */

  const btnRestaurar =
    document.getElementById(
      'btn-restaurar-tema'
    );


  if (btnRestaurar) {

    btnRestaurar.addEventListener(
      'click',
      () => {

        definirCamposDeCor(
          COR_PRIMARIA_PADRAO,
          COR_DESTAQUE_PADRAO,
          COR_FUNDO_PADRAO
        );


        const tema =
          document.getElementById(
            'config-tema'
          );


        if (tema) {
          tema.value =
            'claro';
        }


        aplicarPreviewCores();
      }
    );
  }
}


/* =========================================================
   PREENCHER CORES
   ========================================================= */

function preencherCoresConfiguracoes(
  empresa
) {

  if (!empresa) {
    return;
  }


  definirCamposDeCor(

    (
      empresa.cor_primaria ||
      COR_PRIMARIA_PADRAO
    ).toUpperCase(),

    (
      empresa.cor_destaque ||
      COR_DESTAQUE_PADRAO
    ).toUpperCase(),

    (
      empresa.cor_fundo ||
      COR_FUNDO_PADRAO
    ).toUpperCase()
  );


  aplicarCoresEmpresa(
    empresa
  );
}


/* =========================================================
   PREENCHER DADOS DA EMPRESA
   ========================================================= */

function preencherDadosEmpresa(
  empresa
) {

  if (!empresa) {
    return;
  }


  /* Dados básicos */

  preencherCampo(
    'config-empresa-nome',
    empresa.nome
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


  /* IDs genéricos */

  preencherCampo(
    'nome',
    empresa.nome
  );

  preencherCampo(
    'email',
    empresa.email
  );

  preencherCampo(
    'telefone',
    empresa.telefone
  );

  preencherCampo(
    'nicho',
    empresa.nicho
  );


  /* Exibição */

  preencherCampo(
    'nome_exibicao',
    empresa.nome_exibicao
  );

  preencherCampo(
    'logo_url',
    empresa.logo_url
  );


  /* Preferências regionais */

  preencherCampo(
    'moeda',
    empresa.moeda
  );

  preencherCampo(
    'formato_data',
    empresa.formato_data
  );

  preencherCampo(
    'formato_hora',
    empresa.formato_hora
  );

  preencherCampo(
    'fuso_horario',
    empresa.fuso_horario
  );

  preencherCampo(
    'idioma',
    empresa.idioma
  );


  /* Preferências */

  preencherCheckbox(
    'notificacoes_ativas',
    empresa.notificacoes_ativas
  );

  preencherCheckbox(
    'mostrar_valores',
    empresa.mostrar_valores
  );

  preencherCheckbox(
    'dashboard_inicial',
    empresa.dashboard_inicial
  );

  preencherCheckbox(
    'modo_compacto',
    empresa.modo_compacto
  );


  /* Documentos */

  preencherCampo(
    'rodape_documentos',
    empresa.rodape_documentos
  );

  preencherCheckbox(
    'telefone_documentos',
    empresa.telefone_documentos
  );


  /* Agenda */

  preencherCampo(
    'agenda_horario_inicio',
    empresa.agenda_horario_inicio
  );

  preencherCampo(
    'agenda_horario_fim',
    empresa.agenda_horario_fim
  );

  preencherCampo(
    'agenda_intervalo',
    empresa.agenda_intervalo
  );


  /* Cores */

  preencherCoresConfiguracoes(
    empresa
  );


  /* Nicho */

  if (
    empresa.nicho &&
    typeof window.aplicarNicho ===
    'function'
  ) {

    window.aplicarNicho(
      empresa.nicho
    );
  }
}


/* =========================================================
   PREENCHER USUÁRIO
   ========================================================= */

function preencherDadosUsuario(
  usuario
) {

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
    document.getElementById(
      'config-usuario-perfil'
    );


  if (!perfil) {
    return;
  }


  if (
    usuario.perfil ===
    'administrador'
  ) {

    perfil.value =
      'Administrador';

  } else if (
    usuario.perfil ===
    'dev'
  ) {

    perfil.value =
      'Desenvolvedor';

  } else {

    perfil.value =
      'Funcionário';
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

          credentials: 'include',

          headers:
            headersAutenticacao(),

          cache: 'no-store'
        }
      );


    const dados =
      await resposta
        .json()
        .catch(() => ({}));


    if (!resposta.ok) {

      throw new Error(
        dados.erro ||
        'Não foi possível carregar as configurações.'
      );
    }


    const empresa =
      dados.empresa;


    if (!empresa) {

      throw new Error(
        'Os dados da empresa não foram encontrados.'
      );
    }


    window.lavajatoEmpresa =
      empresa;


    preencherDadosEmpresa(
      empresa
    );


    aplicarCoresEmpresa(
      empresa
    );


    document.dispatchEvent(
      new CustomEvent(
        'configuracoesCarregadas',
        {
          detail: empresa
        }
      )
    );


    return empresa;

  } catch (erro) {

    console.error(
      'Erro ao carregar configurações:',
      erro
    );


    mostrarMensagemConfiguracoes(
      erro.message ||
      'Não foi possível carregar as configurações.',
      'erro'
    );


    return null;
  }
}


/* =========================================================
   CARREGAR USUÁRIO LOGADO
   ========================================================= */

async function carregarUsuarioLogado() {

  try {

    const resposta =
      await fetch(
        '/api/auth/me',
        {
          method: 'GET',

          credentials: 'include',

          headers:
            headersAutenticacao(),

          cache: 'no-store'
        }
      );


    const dados =
      await resposta
        .json()
        .catch(() => ({}));


    if (!resposta.ok) {
      return;
    }


    const usuario =
      dados.usuario ||
      dados;


    const empresa =
      dados.empresa ||
      window.lavajatoEmpresa;


    if (empresa) {

      preencherDadosEmpresa(
        empresa
      );
    }


    preencherDadosUsuario(
      usuario
    );

  } catch (erro) {

    console.error(
      'Erro ao carregar usuário:',
      erro
    );
  }
}


/* =========================================================
   MONTAR PAYLOAD
   ========================================================= */

function montarPayloadConfiguracoes() {

  const payload = {};


  /* =======================================================
     DADOS DA EMPRESA
     ======================================================= */

  const nome =
    obterValorCampo(
      'config-empresa-nome',
      'nome'
    );

  const email =
    obterValorCampo(
      'config-empresa-email',
      'email'
    );

  const telefone =
    obterValorCampo(
      'config-empresa-telefone',
      'telefone'
    );

  const nicho =
    obterValorCampo(
      'config-empresa-nicho',
      'nicho'
    );


  if (nome) {
    payload.nome = nome;
  }


  if (email) {
    payload.email = email;
  }


  payload.telefone =
    telefone || null;


  if (nicho) {
    payload.nicho = nicho;
  }


  /* =======================================================
     DADOS OPCIONAIS
     ======================================================= */

  const nomeExibicao =
    obterValorCampo(
      'nome_exibicao'
    );

  const logoUrl =
    obterValorCampo(
      'logo_url'
    );


  if (
    nomeExibicao !== ''
  ) {

    payload.nome_exibicao =
      nomeExibicao;
  }


  if (
    logoUrl !== ''
  ) {

    payload.logo_url =
      logoUrl;
  }


  /* =======================================================
     PREFERÊNCIAS REGIONAIS
     ======================================================= */

  const moeda =
    obterValorCampo(
      'moeda'
    );

  const formatoData =
    obterValorCampo(
      'formato_data'
    );

  const formatoHora =
    obterValorCampo(
      'formato_hora'
    );

  const fusoHorario =
    obterValorCampo(
      'fuso_horario'
    );

  const idioma =
    obterValorCampo(
      'idioma'
    );


  if (moeda) {
    payload.moeda =
      moeda;
  }

  if (formatoData) {
    payload.formato_data =
      formatoData;
  }

  if (formatoHora) {
    payload.formato_hora =
      formatoHora;
  }

  if (fusoHorario) {
    payload.fuso_horario =
      fusoHorario;
  }

  if (idioma) {
    payload.idioma =
      idioma;
  }


  /* =======================================================
     CHECKBOXES
     ======================================================= */

  const camposCheckbox = [

    'notificacoes_ativas',
    'mostrar_valores',
    'dashboard_inicial',
    'modo_compacto',
    'telefone_documentos'

  ];


  camposCheckbox.forEach(
    campo => {

      const valor =
        obterValorCheckbox(
          campo
        );


      if (
        valor !== undefined
      ) {

        payload[campo] =
          valor;
      }
    }
  );


  /* =======================================================
     DOCUMENTOS
     ======================================================= */

  const rodape =
    obterValorCampo(
      'rodape_documentos'
    );


  if (
    rodape !== ''
  ) {

    payload.rodape_documentos =
      rodape;
  }


  /* =======================================================
     AGENDA
     ======================================================= */

  const horarioInicio =
    obterValorCampo(
      'agenda_horario_inicio'
    );

  const horarioFim =
    obterValorCampo(
      'agenda_horario_fim'
    );

  const intervalo =
    obterValorCampo(
      'agenda_intervalo'
    );


  if (horarioInicio) {

    payload.agenda_horario_inicio =
      horarioInicio;
  }


  if (horarioFim) {

    payload.agenda_horario_fim =
      horarioFim;
  }


  if (intervalo !== '') {

    const numero =
      Number(intervalo);


    if (
      Number.isFinite(numero)
    ) {

      payload.agenda_intervalo =
        numero;
    }
  }


  /* =======================================================
     CORES
     ======================================================= */

  let corPrimaria =
    obterValorCampo(
      'config-cor-principal',
      'cor_primaria'
    ) ||
    window.lavajatoEmpresa?.cor_primaria ||
    COR_PRIMARIA_PADRAO;


  let corDestaque =
    obterValorCampo(
      'config-cor-destaque',
      'cor_destaque'
    ) ||
    window.lavajatoEmpresa?.cor_destaque ||
    COR_DESTAQUE_PADRAO;


  let corFundo =
    obterValorCampo(
      'config-cor-fundo',
      'cor_fundo'
    ) ||
    window.lavajatoEmpresa?.cor_fundo ||
    COR_FUNDO_PADRAO;


  corPrimaria =
    corPrimaria
      .trim()
      .toUpperCase();


  corDestaque =
    corDestaque
      .trim()
      .toUpperCase();


  corFundo =
    corFundo
      .trim()
      .toUpperCase();


  if (
    !corPrimaria.startsWith('#')
  ) {

    corPrimaria =
      '#' + corPrimaria;
  }


  if (
    !corDestaque.startsWith('#')
  ) {

    corDestaque =
      '#' + corDestaque;
  }


  if (
    !corFundo.startsWith('#')
  ) {

    corFundo =
      '#' + corFundo;
  }


  if (
    REGEX_COR.test(
      corPrimaria
    )
  ) {

    payload.cor_primaria =
      corPrimaria;
  }


  if (
    REGEX_COR.test(
      corDestaque
    )
  ) {

    payload.cor_destaque =
      corDestaque;
  }


  if (
    REGEX_COR.test(
      corFundo
    )
  ) {

    payload.cor_fundo =
      corFundo;
  }


  return payload;
}


/* =========================================================
   SALVAR CONFIGURAÇÕES
   ========================================================= */

async function salvarConfiguracoes() {

  const botao =
    document.getElementById(
      'btn-salvar-tema'
    );


  const token =
    obterToken();


  if (!token) {

    mostrarMensagemConfiguracoes(
      'Sessão expirada. Faça login novamente.',
      'erro'
    );

    return;
  }


  const payload =
    montarPayloadConfiguracoes();


  /* =======================================================
     VALIDAÇÕES
     ======================================================= */

  if (!payload.nome) {

    mostrarMensagemConfiguracoes(
      'Informe o nome da empresa.',
      'erro'
    );

    return;
  }


  if (!payload.email) {

    mostrarMensagemConfiguracoes(
      'Informe o e-mail da empresa.',
      'erro'
    );

    return;
  }


  if (
    payload.cor_primaria &&
    !REGEX_COR.test(
      payload.cor_primaria
    )
  ) {

    mostrarMensagemConfiguracoes(
      'A cor principal é inválida.',
      'erro'
    );

    return;
  }


  if (
    payload.cor_destaque &&
    !REGEX_COR.test(
      payload.cor_destaque
    )
  ) {

    mostrarMensagemConfiguracoes(
      'A cor de destaque é inválida.',
      'erro'
    );

    return;
  }


  if (
    payload.cor_fundo &&
    !REGEX_COR.test(
      payload.cor_fundo
    )
  ) {

    mostrarMensagemConfiguracoes(
      'A cor de fundo é inválida.',
      'erro'
    );

    return;
  }


  /* =======================================================
     BOTÃO
     ======================================================= */

  const textoOriginal =
    botao
      ? botao.textContent
      : 'Salvar';


  if (botao) {

    botao.disabled =
      true;

    botao.textContent =
      'Salvando...';
  }


  try {

    console.log(
      'Payload enviado para /api/configuracoes:',
      payload
    );


    const resposta =
      await fetch(
        '/api/configuracoes',
        {
          method: 'PUT',

          credentials: 'include',

          headers: {
            ...headersAutenticacao(),

            'Content-Type':
              'application/json'
          },

          body:
            JSON.stringify(
              payload
            )
        }
      );


    const dados =
      await resposta
        .json()
        .catch(() => ({}));


    if (!resposta.ok) {

      console.error(
        'Erro retornado pela API:',
        dados
      );


      if (
        resposta.status === 401
      ) {

        throw new Error(
          'Sessão expirada. Faça login novamente.'
        );
      }


      if (
        resposta.status === 403
      ) {

        throw new Error(
          dados.erro ||
          'Você não possui permissão para alterar as configurações.'
        );
      }


      throw new Error(
        dados.erro ||
        dados.detalhe ||
        'Não foi possível salvar as configurações.'
      );
    }


    /* =====================================================
       ATUALIZAR ESTADO LOCAL
       ===================================================== */

    if (
      dados.empresa
    ) {

      window.lavajatoEmpresa =
        dados.empresa;

    } else {

      window.lavajatoEmpresa = {
        ...(window.lavajatoEmpresa || {}),
        ...payload
      };
    }


    /* =====================================================
       APLICAR IMEDIATAMENTE
       ===================================================== */

    aplicarCoresEmpresa(
      window.lavajatoEmpresa
    );


    preencherDadosEmpresa(
      window.lavajatoEmpresa
    );


    /* =====================================================
       CONFIRMAR NOVAMENTE COM O BANCO
       ===================================================== */

    const empresaAtualizada =
      await carregarConfiguracoes();


    if (
      empresaAtualizada
    ) {

      window.lavajatoEmpresa =
        empresaAtualizada;
    }


    mostrarMensagemConfiguracoes(
      'Configurações salvas com sucesso!',
      'sucesso'
    );


    if (botao) {

      botao.textContent =
        'Salvo!';


      setTimeout(
        () => {

          botao.textContent =
            textoOriginal;

        },
        2000
      );
    }

  } catch (erro) {

    console.error(
      'Erro ao salvar configurações:',
      erro
    );


    mostrarMensagemConfiguracoes(
      erro.message ||
      'Não foi possível salvar as configurações.',
      'erro'
    );


    if (botao) {

      botao.textContent =
        textoOriginal;
    }

  } finally {

    if (botao) {

      botao.disabled =
        false;
    }
  }
}


/* =========================================================
   MENSAGEM DE CONFIGURAÇÕES
   ========================================================= */

function mostrarMensagemConfiguracoes(
  mensagem,
  tipo
) {

  const elemento =
    document.getElementById(
      'configuracoes-message'
    );


  if (!elemento) {

    if (
      tipo === 'erro'
    ) {

      console.error(
        mensagem
      );

    } else {

      console.log(
        mensagem
      );
    }

    return;
  }


  elemento.textContent =
    mensagem;


  elemento.style.display =
    'block';


  if (
    tipo === 'sucesso'
  ) {

    elemento.style.color =
      '#166534';

    elemento.style.background =
      '#dcfce7';

    elemento.style.border =
      '1px solid #bbf7d0';

  } else {

    elemento.style.color =
      '#991b1b';

    elemento.style.background =
      '#fee2e2';

    elemento.style.border =
      '1px solid #fecaca';
  }


  elemento.style.padding =
    '10px 12px';

  elemento.style.borderRadius =
    '8px';


  clearTimeout(
    window.timerMensagemConfiguracoes
  );


  window.timerMensagemConfiguracoes =
    setTimeout(
      () => {

        elemento.style.display =
          'none';

      },
      4000
    );
}


/* =========================================================
   COMPATIBILIDADE COM CÓDIGO ANTIGO
   ========================================================= */

function configurarSalvarTema() {

  configurarSalvarConfiguracoes();
}


/* =========================================================
   INICIALIZAÇÃO
   ========================================================= */

document.addEventListener(
  'DOMContentLoaded',
  async () => {

    configurarSelecaoDeCores();

    const botao =
      document.getElementById(
        'btn-salvar-tema'
      );


    if (botao) {

      /*
       * Evita duplicar o evento caso
       * outro script chame a função.
       */

      if (
        botao.dataset.configuracoesListener !==
        'true'
      ) {

        botao.dataset.configuracoesListener =
          'true';


        botao.addEventListener(
          'click',
          salvarConfiguracoes
        );
      }
    }


    await carregarConfiguracoes();

    await carregarUsuarioLogado();
  }
);
