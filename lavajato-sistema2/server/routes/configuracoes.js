
'use strict';

const express = require('express');
const pool = require('../db');
const autenticar = require('../middleware/auth');
const verificarAssinatura = require('../middleware/assinatura');

const router = express.Router();

router.use(autenticar);
router.use(verificarAssinatura);

// ============================================================
// CONSTANTES
// ============================================================

const PERMISSAO_CONFIGURACOES = 'configuracoes';

const NICHOS_VALIDOS = [
  'lavajato',
  'barbearia',
  'clinica',
  'pet',
  'oficina',
  'personal',
  'personalizados',
  'moveis',
  'grafica',
  'confeccao',
  'eletronicos',
  'construcao',
  'fotografia',
  'eventos',
  'limpeza',
  'tecnologia',
  'generico'
];

const MOEDAS_VALIDAS = ['BRL', 'USD', 'EUR'];

const FORMATOS_DATA_VALIDOS = [
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'YYYY-MM-DD'
];

const FORMATOS_HORA_VALIDOS = ['24h', '12h'];

const IDIOMAS_VALIDOS = ['pt-BR', 'en-US', 'es-ES'];

const FUSOS_VALIDOS = [
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

const INTERVALOS_AGENDA_VALIDOS = [15, 30, 45, 60, 90, 120];

const LIMITES = {
  nome: 150,
  nomeExibicao: 150,
  email: 254,
  telefone: 30,
  logoUrl: 500,
  rodapeDocumentos: 500,
  bodyCampos: 40,
  bodyString: 1000,
  slug: 180
};

const CAMPOS_EMPRESA = `
  id,
  nome,
  email,
  telefone,
  nicho,
  nome_exibicao,
  slug_agendamento,
  logo_url,
  moeda,
  formato_data,
  formato_hora,
  fuso_horario,
  idioma,
  notificacoes_ativas,
  mostrar_valores,
  dashboard_inicial,
  modo_compacto,
  rodape_documentos,
  telefone_documentos,
  agenda_horario_inicio,
  agenda_horario_fim,
  agenda_intervalo,
  cor_primaria,
  cor_destaque,
  cor_fundo,
  criado_em,
  atualizado_em
`;

const CAMPOS_PERMITIDOS = new Set([
  'nome',
  'email',
  'telefone',
  'nicho',
  'nome_exibicao',
  'logo_url',
  'moeda',
  'formato_data',
  'formato_hora',
  'fuso_horario',
  'idioma',
  'notificacoes_ativas',
  'mostrar_valores',
  'dashboard_inicial',
  'modo_compacto',
  'rodape_documentos',
  'telefone_documentos',
  'agenda_horario_inicio',
  'agenda_horario_fim',
  'agenda_intervalo',
  'cor_primaria',
  'cor_destaque',
  'cor_fundo'
]);

// ============================================================
// SLUG DE AGENDAMENTO
// ============================================================

function gerarSlugAgendamento(nome) {
  const slug = String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITES.slug)
    .replace(/-+$/g, '');

  return slug || 'empresa';
}

function validarSlugAgendamento(slug) {
  return (
    typeof slug === 'string' &&
    slug.length > 0 &&
    slug.length <= LIMITES.slug &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  );
}

/**
 * Gera um slug exclusivo para a empresa.
 *
 * Deve ser chamada dentro de uma transação.
 * A empresa deve estar bloqueada com SELECT ... FOR UPDATE.
 *
 * O bloqueio consultivo evita que duas empresas tentem reservar
 * simultaneamente o mesmo slug candidato.
 */
async function garantirSlugAgendamento(client, empresa) {
  if (empresa.slug_agendamento) {
    return empresa.slug_agendamento;
  }

  const nomeBase = gerarSlugAgendamento(
    empresa.nome_exibicao || empresa.nome
  );

  for (let tentativa = 1; tentativa <= 1000; tentativa++) {
    const sufixo = tentativa === 1 ? '' : `-${tentativa}`;

    const baseLimitada = nomeBase
      .slice(0, LIMITES.slug - sufixo.length)
      .replace(/-+$/g, '');

    const slug = `${baseLimitada}${sufixo}`;

    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
      ['slug_agendamento', slug]
    );

    const existente = await client.query(
      `
        SELECT id
        FROM empresas
        WHERE slug_agendamento = $1
        LIMIT 1
      `,
      [slug]
    );

    if (
      existente.rows.length > 0 &&
      String(existente.rows[0].id) !== String(empresa.id)
    ) {
      continue;
    }

    const atualizado = await client.query(
      `
        UPDATE empresas
        SET
          slug_agendamento = $1,
          atualizado_em = CURRENT_TIMESTAMP
        WHERE id = $2
          AND slug_agendamento IS NULL
        RETURNING slug_agendamento
      `,
      [slug, empresa.id]
    );

    if (atualizado.rows.length > 0) {
      return atualizado.rows[0].slug_agendamento;
    }

    const atual = await client.query(
      `
        SELECT slug_agendamento
        FROM empresas
        WHERE id = $1
        LIMIT 1
      `,
      [empresa.id]
    );

    if (atual.rows[0]?.slug_agendamento) {
      return atual.rows[0].slug_agendamento;
    }
  }

  throw new Error(
    'Não foi possível gerar um slug exclusivo para o agendamento.'
  );
}

function montarLinkAgendamento(req, slug) {
  if (!slug) {
    return null;
  }

  const protocolo = req.protocol || 'http';
  const host = req.get('host');

  if (!host) {
    return `/agendar/${slug}`;
  }

  return `${protocolo}://${host}/agendar/${slug}`;
}

function montarEmpresaResposta(req, empresa) {
  return {
    ...empresa,
    link_agendamento: montarLinkAgendamento(
      req,
      empresa.slug_agendamento
    )
  };
}

// ============================================================
// HEADERS
// ============================================================

function aplicarHeadersConfiguracoes(res) {
  res.setHeader(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );

  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

// ============================================================
// VALIDAÇÕES
// ============================================================

function validarString(valor, limite, permitirVazio = false) {
  if (typeof valor !== 'string') {
    return false;
  }

  const texto = valor.trim();

  if (!permitirVazio && texto.length === 0) {
    return false;
  }

  return texto.length <= limite;
}

function validarEmail(email) {
  if (typeof email !== 'string') {
    return false;
  }

  const valor = email.trim();

  if (!valor || valor.length > LIMITES.email) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

function validarCor(cor) {
  if (typeof cor !== 'string') {
    return false;
  }

  const valor = cor.trim();

  return (
    valor.length > 0 &&
    valor.length <= 7 &&
    /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(valor)
  );
}

function validarBoolean(valor) {
  return typeof valor === 'boolean';
}

function campoFoiEnviado(valor) {
  return valor !== undefined;
}

function validarBody(body) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body)
  ) {
    return {
      valido: false,
      erro: 'O corpo da requisição é inválido.'
    };
  }

  const quantidadeCampos = Object.keys(body).length;

  if (quantidadeCampos === 0) {
    return {
      valido: false,
      erro: 'Nenhuma configuração foi enviada.'
    };
  }

  if (quantidadeCampos > LIMITES.bodyCampos) {
    return {
      valido: false,
      erro: 'Quantidade de campos enviada excede o limite permitido.'
    };
  }

  return { valido: true };
}

function validarTamanhoDasStrings(body) {
  for (const [campo, valor] of Object.entries(body)) {
    if (
      typeof valor === 'string' &&
      valor.length > LIMITES.bodyString
    ) {
      return {
        valido: false,
        campo
      };
    }
  }

  return { valido: true };
}

function encontrarCamposDesconhecidos(body) {
  return Object.keys(body || {}).filter(
    campo => !CAMPOS_PERMITIDOS.has(campo)
  );
}

function validarHora(hora) {
  return (
    typeof hora === 'string' &&
    /^([01]\d|2[0-3]):([0-5]\d)$/.test(hora.trim())
  );
}

function normalizarHora(hora) {
  return typeof hora === 'string' ? hora.trim() : null;
}

function normalizarStringOpcional(valor) {
  if (valor === null || valor === undefined) {
    return null;
  }

  return valor.trim();
}

// ============================================================
// PERMISSÃO
// ============================================================

async function verificarPermissaoConfiguracoes(req, res, next) {
  try {
    if (!req.usuario || !req.usuario.id) {
      return res.status(401).json({
        erro: 'Usuário não autenticado.'
      });
    }

    if (!req.usuario.empresa_id) {
      return res.status(403).json({
        erro: 'Usuário não está vinculado a uma empresa.'
      });
    }

    if (req.usuario.perfil === 'administrador') {
      return next();
    }

    const { rows } = await pool.query(
      `
        SELECT 1
        FROM usuario_permissoes up
        INNER JOIN permissoes p
          ON p.id = up.permissao_id
        WHERE up.usuario_id = $1
          AND p.codigo = $2
        LIMIT 1
      `,
      [req.usuario.id, PERMISSAO_CONFIGURACOES]
    );

    if (rows.length === 0) {
      return res.status(403).json({
        erro: 'Você não possui permissão para acessar as configurações.'
      });
    }

    return next();
  } catch (err) {
    console.error(
      'Erro ao verificar permissão de configurações:',
      err
    );

    return res.status(500).json({
      erro: 'Não foi possível verificar a permissão.'
    });
  }
}

// ============================================================
// GET /api/configuracoes
// Retorna as configurações e garante o slug da empresa.
// ============================================================

router.get(
  '/',
  verificarPermissaoConfiguracoes,
  async (req, res) => {
    aplicarHeadersConfiguracoes(res);

    let client;
    let transacaoIniciada = false;

    try {
      client = await pool.connect();

      await client.query('BEGIN');
      transacaoIniciada = true;

      const resultado = await client.query(
        `
          SELECT ${CAMPOS_EMPRESA}
          FROM empresas
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [req.usuario.empresa_id]
      );

      if (resultado.rows.length === 0) {
        await client.query('ROLLBACK');
        transacaoIniciada = false;

        return res.status(404).json({
          erro: 'Empresa não encontrada.'
        });
      }

      const empresa = resultado.rows[0];

      const slug = await garantirSlugAgendamento(
        client,
        empresa
      );

      empresa.slug_agendamento = slug;

      await client.query('COMMIT');
      transacaoIniciada = false;

      return res.status(200).json({
        empresa: montarEmpresaResposta(req, empresa)
      });
    } catch (err) {
      if (client && transacaoIniciada) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error(
            'Erro ao reverter transação das configurações:',
            rollbackError
          );
        }
      }

      console.error('Erro ao buscar configurações:', {
        empresa_id: req.usuario?.empresa_id,
        codigo: err.code,
        erro: err.message
      });

      if (err.code === '42703') {
        return res.status(500).json({
          erro:
            'A coluna slug_agendamento ainda não existe no banco. Execute a migração SQL.'
        });
      }

      return res.status(500).json({
        erro: 'Não foi possível carregar as configurações.'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

// ============================================================
// PUT /api/configuracoes
// Atualiza as configurações e retorna o link público.
// ============================================================

router.put(
  '/',
  verificarPermissaoConfiguracoes,
  async (req, res) => {
    aplicarHeadersConfiguracoes(res);

    // --------------------------------------------------------
    // BODY
    // --------------------------------------------------------

    const validacaoBody = validarBody(req.body);

    if (!validacaoBody.valido) {
      return res.status(400).json({
        erro: validacaoBody.erro
      });
    }

    const body = req.body;

    // --------------------------------------------------------
    // TAMANHO
    // --------------------------------------------------------

    const validacaoStrings = validarTamanhoDasStrings(body);

    if (!validacaoStrings.valido) {
      return res.status(400).json({
        erro: 'Um ou mais campos possuem conteúdo acima do limite permitido.',
        campo: validacaoStrings.campo
      });
    }

    // --------------------------------------------------------
    // CAMPOS DESCONHECIDOS
    // --------------------------------------------------------

    const camposDesconhecidos = encontrarCamposDesconhecidos(body);

    if (camposDesconhecidos.length > 0) {
      console.warn('Tentativa de enviar campos não permitidos:', {
        usuario_id: req.usuario.id,
        empresa_id: req.usuario.empresa_id,
        campos: camposDesconhecidos
      });

      return res.status(400).json({
        erro: 'Um ou mais campos enviados não são permitidos.',
        campos: camposDesconhecidos
      });
    }

    // --------------------------------------------------------
    // CAMPOS
    // --------------------------------------------------------

    const {
      nome,
      email,
      telefone,
      nicho,
      nome_exibicao,
      logo_url,
      moeda,
      formato_data,
      formato_hora,
      fuso_horario,
      idioma,
      notificacoes_ativas,
      mostrar_valores,
      dashboard_inicial,
      modo_compacto,
      rodape_documentos,
      telefone_documentos,
      agenda_horario_inicio,
      agenda_horario_fim,
      agenda_intervalo,
      cor_primaria,
      cor_destaque,
      cor_fundo
    } = body;

    // --------------------------------------------------------
    // NOME
    // --------------------------------------------------------

    if (
      campoFoiEnviado(nome) &&
      nome !== null &&
      !validarString(nome, LIMITES.nome)
    ) {
      return res.status(400).json({
        erro: `O nome da empresa deve ter entre 1 e ${LIMITES.nome} caracteres.`
      });
    }

    // --------------------------------------------------------
    // E-MAIL
    // --------------------------------------------------------

    if (
      campoFoiEnviado(email) &&
      email !== null &&
      !validarEmail(email)
    ) {
      return res.status(400).json({
        erro: 'Informe um e-mail válido.'
      });
    }

    // --------------------------------------------------------
    // TELEFONE
    // --------------------------------------------------------

    if (
      campoFoiEnviado(telefone) &&
      telefone !== null &&
      telefone !== '' &&
      !validarString(telefone, LIMITES.telefone)
    ) {
      return res.status(400).json({
        erro: `O telefone deve ter no máximo ${LIMITES.telefone} caracteres.`
      });
    }

    // --------------------------------------------------------
    // NICHO
    // --------------------------------------------------------

    if (
      campoFoiEnviado(nicho) &&
      nicho !== null &&
      (
        typeof nicho !== 'string' ||
        !NICHOS_VALIDOS.includes(nicho.trim().toLowerCase())
      )
    ) {
      return res.status(400).json({
        erro: 'Tipo de negócio inválido.'
      });
    }

    // --------------------------------------------------------
    // NOME DE EXIBIÇÃO
    // --------------------------------------------------------

    if (
      campoFoiEnviado(nome_exibicao) &&
      nome_exibicao !== null &&
      !validarString(nome_exibicao, LIMITES.nomeExibicao)
    ) {
      return res.status(400).json({
        erro: 'O nome exibido possui tamanho inválido.'
      });
    }

    // --------------------------------------------------------
    // LOGO
    // --------------------------------------------------------

    if (
      campoFoiEnviado(logo_url) &&
      logo_url !== null &&
      logo_url !== '' &&
      !validarString(logo_url, LIMITES.logoUrl)
    ) {
      return res.status(400).json({
        erro: 'O endereço da logo é inválido.'
      });
    }

    // --------------------------------------------------------
    // MOEDA
    // --------------------------------------------------------

    if (
      campoFoiEnviado(moeda) &&
      moeda !== null &&
      !MOEDAS_VALIDAS.includes(moeda)
    ) {
      return res.status(400).json({
        erro: 'Moeda selecionada é inválida.'
      });
    }

    // --------------------------------------------------------
    // FORMATO DE DATA
    // --------------------------------------------------------

    if (
      campoFoiEnviado(formato_data) &&
      formato_data !== null &&
      !FORMATOS_DATA_VALIDOS.includes(formato_data)
    ) {
      return res.status(400).json({
        erro: 'Formato de data inválido.'
      });
    }

    // --------------------------------------------------------
    // FORMATO DE HORA
    // --------------------------------------------------------

    if (
      campoFoiEnviado(formato_hora) &&
      formato_hora !== null &&
      !FORMATOS_HORA_VALIDOS.includes(formato_hora)
    ) {
      return res.status(400).json({
        erro: 'Formato de hora inválido.'
      });
    }

    // --------------------------------------------------------
    // FUSO HORÁRIO
    // --------------------------------------------------------

    if (
      campoFoiEnviado(fuso_horario) &&
      fuso_horario !== null &&
      !FUSOS_VALIDOS.includes(fuso_horario)
    ) {
      return res.status(400).json({
        erro: 'Fuso horário inválido.'
      });
    }

    // --------------------------------------------------------
    // IDIOMA
    // --------------------------------------------------------

    if (
      campoFoiEnviado(idioma) &&
      idioma !== null &&
      !IDIOMAS_VALIDOS.includes(idioma)
    ) {
      return res.status(400).json({
        erro: 'Idioma selecionado é inválido.'
      });
    }

    // --------------------------------------------------------
    // BOOLEANOS
    // --------------------------------------------------------

    const booleanos = {
      notificacoes_ativas,
      mostrar_valores,
      dashboard_inicial,
      modo_compacto,
      telefone_documentos
    };

    for (const [campo, valor] of Object.entries(booleanos)) {
      if (
        campoFoiEnviado(valor) &&
        valor !== null &&
        !validarBoolean(valor)
      ) {
        return res.status(400).json({
          erro: `O campo ${campo} deve ser verdadeiro ou falso.`
        });
      }
    }

    // --------------------------------------------------------
    // RODAPÉ DOS DOCUMENTOS
    // --------------------------------------------------------

    if (
      campoFoiEnviado(rodape_documentos) &&
      rodape_documentos !== null &&
      !validarString(
        rodape_documentos,
        LIMITES.rodapeDocumentos,
        true
      )
    ) {
      return res.status(400).json({
        erro: 'O rodapé dos documentos excede o limite permitido.'
      });
    }

    // --------------------------------------------------------
    // HORÁRIO INICIAL
    // --------------------------------------------------------

    if (
      campoFoiEnviado(agenda_horario_inicio) &&
      agenda_horario_inicio !== null &&
      !validarHora(agenda_horario_inicio)
    ) {
      return res.status(400).json({
        erro: 'Horário inicial da agenda inválido.'
      });
    }

    // --------------------------------------------------------
    // HORÁRIO FINAL
    // --------------------------------------------------------

    if (
      campoFoiEnviado(agenda_horario_fim) &&
      agenda_horario_fim !== null &&
      !validarHora(agenda_horario_fim)
    ) {
      return res.status(400).json({
        erro: 'Horário final da agenda inválido.'
      });
    }

    // --------------------------------------------------------
    // INTERVALO
    // --------------------------------------------------------

    if (
      campoFoiEnviado(agenda_intervalo) &&
      agenda_intervalo !== null &&
      !INTERVALOS_AGENDA_VALIDOS.includes(Number(agenda_intervalo))
    ) {
      return res.status(400).json({
        erro: 'Intervalo da agenda inválido.'
      });
    }

    // --------------------------------------------------------
    // CORES
    // --------------------------------------------------------

    const cores = {
      cor_primaria,
      cor_destaque,
      cor_fundo
    };

    for (const [campo, valor] of Object.entries(cores)) {
      if (
        campoFoiEnviado(valor) &&
        valor !== null &&
        valor !== '' &&
        !validarCor(valor)
      ) {
        return res.status(400).json({
          erro: `A cor informada no campo ${campo} é inválida.`
        });
      }
    }

    // --------------------------------------------------------
    // TRANSAÇÃO
    // --------------------------------------------------------

    let client;
    let transacaoIniciada = false;

    try {
      client = await pool.connect();

      await client.query('BEGIN');
      transacaoIniciada = true;

      // ------------------------------------------------------
      // EMPRESA ATUAL
      // ------------------------------------------------------

      const empresaAtualResultado = await client.query(
        `
          SELECT ${CAMPOS_EMPRESA}
          FROM empresas
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
        `,
        [req.usuario.empresa_id]
      );

      if (empresaAtualResultado.rows.length === 0) {
        await client.query('ROLLBACK');
        transacaoIniciada = false;

        return res.status(404).json({
          erro: 'Empresa não encontrada.'
        });
      }

      const empresaAtual = empresaAtualResultado.rows[0];

      // ------------------------------------------------------
      // E-MAIL DUPLICADO
      // ------------------------------------------------------

      if (campoFoiEnviado(email) && email !== null) {
        const emailLimpo = email.trim().toLowerCase();

        const empresaExistente = await client.query(
          `
            SELECT id
            FROM empresas
            WHERE LOWER(email) = LOWER($1)
              AND id <> $2
            LIMIT 1
          `,
          [emailLimpo, req.usuario.empresa_id]
        );

        if (empresaExistente.rows.length > 0) {
          await client.query('ROLLBACK');
          transacaoIniciada = false;

          return res.status(409).json({
            erro: 'Já existe outra empresa cadastrada com esse e-mail.'
          });
        }
      }

      // ------------------------------------------------------
      // UPDATE DINÂMICO
      // ------------------------------------------------------

      const camposUpdate = [];
      const valores = [];

      function adicionarCampo(campo, valor) {
        camposUpdate.push(`${campo} = $${valores.length + 1}`);
        valores.push(valor);
      }

      // ------------------------------------------------------
      // DADOS DA EMPRESA
      // ------------------------------------------------------

      if (campoFoiEnviado(nome)) {
        adicionarCampo('nome', normalizarStringOpcional(nome));
      }

      if (campoFoiEnviado(email)) {
        adicionarCampo(
          'email',
          email === null ? null : email.trim().toLowerCase()
        );
      }

      if (campoFoiEnviado(telefone)) {
        adicionarCampo(
          'telefone',
          telefone === null || telefone === ''
            ? null
            : telefone.trim()
        );
      }

      if (campoFoiEnviado(nicho)) {
        adicionarCampo(
          'nicho',
          nicho === null ? null : nicho.trim().toLowerCase()
        );
      }

      if (campoFoiEnviado(nome_exibicao)) {
        adicionarCampo(
          'nome_exibicao',
          nome_exibicao === null ? null : nome_exibicao.trim()
        );
      }

      if (campoFoiEnviado(logo_url)) {
        adicionarCampo(
          'logo_url',
          logo_url === null || logo_url === ''
            ? null
            : logo_url.trim()
        );
      }

      // ------------------------------------------------------
      // PREFERÊNCIAS REGIONAIS
      // ------------------------------------------------------

      if (campoFoiEnviado(moeda)) {
        adicionarCampo('moeda', moeda);
      }

      if (campoFoiEnviado(formato_data)) {
        adicionarCampo('formato_data', formato_data);
      }

      if (campoFoiEnviado(formato_hora)) {
        adicionarCampo('formato_hora', formato_hora);
      }

      if (campoFoiEnviado(fuso_horario)) {
        adicionarCampo('fuso_horario', fuso_horario);
      }

      if (campoFoiEnviado(idioma)) {
        adicionarCampo('idioma', idioma);
      }

      // ------------------------------------------------------
      // PREFERÊNCIAS
      // ------------------------------------------------------

      if (campoFoiEnviado(notificacoes_ativas)) {
        adicionarCampo('notificacoes_ativas', notificacoes_ativas);
      }

      if (campoFoiEnviado(mostrar_valores)) {
        adicionarCampo('mostrar_valores', mostrar_valores);
      }

      if (campoFoiEnviado(dashboard_inicial)) {
        adicionarCampo('dashboard_inicial', dashboard_inicial);
      }

      if (campoFoiEnviado(modo_compacto)) {
        adicionarCampo('modo_compacto', modo_compacto);
      }

      // ------------------------------------------------------
      // DOCUMENTOS
      // ------------------------------------------------------

      if (campoFoiEnviado(rodape_documentos)) {
        adicionarCampo(
          'rodape_documentos',
          rodape_documentos === null || rodape_documentos === ''
            ? null
            : rodape_documentos.trim()
        );
      }

      if (campoFoiEnviado(telefone_documentos)) {
        adicionarCampo('telefone_documentos', telefone_documentos);
      }

      // ------------------------------------------------------
      // AGENDA
      // ------------------------------------------------------

      if (campoFoiEnviado(agenda_horario_inicio)) {
        adicionarCampo(
          'agenda_horario_inicio',
          agenda_horario_inicio === null
            ? null
            : normalizarHora(agenda_horario_inicio)
        );
      }

      if (campoFoiEnviado(agenda_horario_fim)) {
        adicionarCampo(
          'agenda_horario_fim',
          agenda_horario_fim === null
            ? null
            : normalizarHora(agenda_horario_fim)
        );
      }

      if (campoFoiEnviado(agenda_intervalo)) {
        adicionarCampo(
          'agenda_intervalo',
          agenda_intervalo === null ? null : Number(agenda_intervalo)
        );
      }

      // ------------------------------------------------------
      // CORES
      // ------------------------------------------------------

      if (campoFoiEnviado(cor_primaria)) {
        adicionarCampo(
          'cor_primaria',
          cor_primaria === null || cor_primaria === ''
            ? null
            : cor_primaria.trim().toLowerCase()
        );
      }

      if (campoFoiEnviado(cor_destaque)) {
        adicionarCampo(
          'cor_destaque',
          cor_destaque === null || cor_destaque === ''
            ? null
            : cor_destaque.trim().toLowerCase()
        );
      }

      if (campoFoiEnviado(cor_fundo)) {
        adicionarCampo(
          'cor_fundo',
          cor_fundo === null || cor_fundo === ''
            ? null
            : cor_fundo.trim().toLowerCase()
        );
      }

      // ------------------------------------------------------
      // ATUALIZAÇÃO
      // ------------------------------------------------------

      let empresaAtualizada;

      if (camposUpdate.length > 0) {
        valores.push(req.usuario.empresa_id);

        const atualizacao = await client.query(
          `
            UPDATE empresas
            SET
              ${camposUpdate.join(', ')},
              atualizado_em = CURRENT_TIMESTAMP
            WHERE id = $${valores.length}
            RETURNING ${CAMPOS_EMPRESA}
          `,
          valores
        );

        if (atualizacao.rows.length === 0) {
          await client.query('ROLLBACK');
          transacaoIniciada = false;

          return res.status(404).json({
            erro: 'Empresa não encontrada.'
          });
        }

        empresaAtualizada = atualizacao.rows[0];
      } else {
        empresaAtualizada = empresaAtual;
      }

      // ------------------------------------------------------
      // GARANTE O SLUG PÚBLICO
      // ------------------------------------------------------

      const slug = await garantirSlugAgendamento(
        client,
        empresaAtualizada
      );

      empresaAtualizada.slug_agendamento = slug;

      // ------------------------------------------------------
      // AUDITORIA
      // ------------------------------------------------------

      try {
        await client.query('SAVEPOINT configuracoes_auditoria');

        await client.query(
          `
            INSERT INTO logs_auditoria (
              empresa_id,
              usuario_id,
              acao,
              entidade,
              entidade_id,
              detalhes,
              criado_em
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              CURRENT_TIMESTAMP
            )
          `,
          [
            req.usuario.empresa_id,
            req.usuario.id,
            'atualizacao',
            'empresa',
            req.usuario.empresa_id,
            JSON.stringify({
              origem: 'configuracoes',
              campos: Object.keys(body)
            })
          ]
        );

        await client.query('RELEASE SAVEPOINT configuracoes_auditoria');
      } catch (auditError) {
        try {
          await client.query(
            'ROLLBACK TO SAVEPOINT configuracoes_auditoria'
          );
        } catch (rollbackAuditError) {
          console.error(
            'Erro ao reverter auditoria:',
            rollbackAuditError
          );
        }

        if (auditError.code === '42P01') {
          console.warn(
            'Tabela logs_auditoria ainda não configurada. Auditoria ignorada.'
          );
        } else {
          throw auditError;
        }
      }

      // ------------------------------------------------------
      // COMMIT
      // ------------------------------------------------------

      await client.query('COMMIT');
      transacaoIniciada = false;

      // ------------------------------------------------------
      // RESPOSTA
      // ------------------------------------------------------

      return res.status(200).json({
        mensagem: 'Configurações salvas com sucesso.',
        empresa: montarEmpresaResposta(req, empresaAtualizada)
      });
    } catch (err) {
      if (client && transacaoIniciada) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error(
            'Erro ao executar rollback:',
            rollbackError
          );
        }
      }

      console.error('Erro ao atualizar configurações:', {
        empresa_id: req.usuario?.empresa_id,
        usuario_id: req.usuario?.id,
        erro: err.message,
        codigo: err.code
      });

      if (err.code === '23505') {
        return res.status(409).json({
          erro: 'Já existe uma empresa cadastrada com esses dados.'
        });
      }

      if (err.code === '23514') {
        return res.status(400).json({
          erro: 'Um dos valores informados não é permitido.'
        });
      }

      if (err.code === '23503') {
        return res.status(400).json({
          erro: 'Não foi possível atualizar os dados relacionados à empresa.'
        });
      }

      if (err.code === '22001') {
        return res.status(400).json({
          erro: 'Um dos campos informados excede o tamanho permitido.'
        });
      }

      if (err.code === '22P02') {
        return res.status(400).json({
          erro: 'Um dos valores informados possui formato inválido.'
        });
      }

      if (err.code === '42703') {
        return res.status(500).json({
          erro:
            'Uma coluna necessária não existe no banco de dados. Verifique se a migração de slug_agendamento foi executada.'
        });
      }

      if (err.code === '42P01') {
        return res.status(500).json({
          erro:
            'Uma tabela necessária para as configurações ainda não foi criada no banco de dados.'
        });
      }

      return res.status(500).json({
        erro: 'Não foi possível salvar as configurações.'
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

// ============================================================
// EXPORTAÇÃO
// ============================================================

module.exports = router;
