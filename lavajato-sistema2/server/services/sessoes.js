'use strict';

const pool = require('../db');

// Deve corresponder ao tempo de validade do JWT.
const TEMPO_SESSAO_DIAS = 7;

const REGEX_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// VALIDAR UUID
// ============================================================

function uuidValido(valor) {
  return typeof valor === 'string' && REGEX_UUID.test(valor);
}

// ============================================================
// INTERPRETAR NAVEGADOR E SISTEMA OPERACIONAL
// ============================================================

function interpretarUserAgent(userAgent) {
  const texto = String(userAgent || '').slice(0, 400);

  const pegar = (regex) => {
    const resultado = texto.match(regex);
    return resultado ? resultado[1] : null;
  };

  let navegador = 'Navegador desconhecido';
  let versao;

  if ((versao = pegar(/EdgA?\/(\d+)/))) {
    navegador = `Edge ${versao}`;
  } else if ((versao = pegar(/OPR\/(\d+)/))) {
    navegador = `Opera ${versao}`;
  } else if ((versao = pegar(/SamsungBrowser\/(\d+)/))) {
    navegador = `Samsung Internet ${versao}`;
  } else if ((versao = pegar(/(?:Firefox|FxiOS)\/(\d+)/))) {
    navegador = `Firefox ${versao}`;
  } else if ((versao = pegar(/(?:Chrome|CriOS)\/(\d+)/))) {
    navegador = `Chrome ${versao}`;
  } else if ((versao = pegar(/Version\/([\d.]+).*Safari/))) {
    navegador = `Safari ${versao}`;
  } else if (/Safari/i.test(texto)) {
    navegador = 'Safari';
  }

  let sistema = 'Sistema desconhecido';

  if (/Windows NT/i.test(texto)) {
    sistema = 'Windows';
  } else if (/Android/i.test(texto)) {
    sistema = 'Android';
  } else if (/iPhone|iPad|iPod/i.test(texto)) {
    sistema = 'iOS';
  } else if (/CrOS/i.test(texto)) {
    sistema = 'ChromeOS';
  } else if (/Mac OS X|Macintosh/i.test(texto)) {
    sistema = 'macOS';
  } else if (/Linux/i.test(texto)) {
    sistema = 'Linux';
  }

  let tipo = 'computador';

  if (
    /iPad|Tablet/i.test(texto) ||
    (/Android/i.test(texto) && !/Mobi/i.test(texto))
  ) {
    tipo = 'tablet';
  } else if (/Mobi|iPhone|iPod/i.test(texto)) {
    tipo = 'celular';
  }

  return {
    navegador,
    sistema,
    tipo_dispositivo: tipo,
    user_agent: texto || null,
  };
}

// ============================================================
// OBTER IP DO CLIENTE
// ============================================================

function obterIp(req) {
  if (!req) {
    return null;
  }

  // O primeiro IP pode vir de um proxy reverso.
  const forwarded = req.headers?.['x-forwarded-for'];

  if (forwarded) {
    const ip = String(forwarded)
      .split(',')[0]
      .trim()
      .replace(/^::ffff:/, '')
      .slice(0, 64);

    return ip || null;
  }

  const ip = String(
    req.ip ||
      req.socket?.remoteAddress ||
      ''
  )
    .replace(/^::ffff:/, '')
    .slice(0, 64);

  return ip || null;
}

// ============================================================
// CRIAR SESSÃO
//
// Uso recomendado:
// await criarSessao(req, usuario);
//
// Também aceita chamadas antigas:
// await criarSessao(pool, usuario);
//
// Nesse segundo formato, a sessão será criada sem os dados
// de navegador e IP, pois a requisição HTTP não foi fornecida.
// ============================================================

async function criarSessao(req, usuario, executor = pool) {
  let requisicao = req;

  // Compatibilidade com chamadas antigas que passam o pool
  // como primeiro argumento.
  if (req && typeof req.query === 'function') {
    executor = req;
    requisicao = null;
  }

  if (!usuario || !usuario.id) {
    throw new Error(
      'Não foi possível criar a sessão: usuário inválido.'
    );
  }

  if (!executor || typeof executor.query !== 'function') {
    throw new Error(
      'Não foi possível criar a sessão: executor inválido.'
    );
  }

  const userAgent =
    requisicao?.headers?.['user-agent'] || null;

  const info = interpretarUserAgent(userAgent);

  // ==========================================================
  // LIMPAR SESSÕES ANTIGAS
  // ==========================================================

  try {
    await executor.query(
      `
        DELETE FROM sessoes
        WHERE usuario_id = $1
          AND (
            expira_em < NOW() - INTERVAL '30 days'
            OR revogada_em < NOW() - INTERVAL '30 days'
          )
      `,
      [usuario.id]
    );
  } catch (erro) {
    // A limpeza é auxiliar e não deve impedir a criação.
    console.warn(
      '[SESSÕES] Não foi possível limpar sessões antigas:',
      erro.message
    );
  }

  // ==========================================================
  // DEFINIR EXPIRAÇÃO
  // ==========================================================

  const expiraEm = new Date(
    Date.now() +
      TEMPO_SESSAO_DIAS * 24 * 60 * 60 * 1000
  );

  // ==========================================================
  // REGISTRAR SESSÃO
  // ==========================================================

  const { rows } = await executor.query(
    `
      INSERT INTO sessoes (
        usuario_id,
        empresa_id,
        navegador,
        sistema,
        tipo_dispositivo,
        user_agent,
        ip,
        expira_em
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, expira_em
    `,
    [
      usuario.id,
      usuario.empresa_id ?? null,
      info.navegador,
      info.sistema,
      info.tipo_dispositivo,
      info.user_agent,
      obterIp(requisicao),
      expiraEm,
    ]
  );

  return rows[0] || null;
}

// ============================================================
// REVOGAR UMA SESSÃO
// ============================================================

async function revogarSessao(
  executor,
  usuarioId,
  sessaoId,
  motivo = 'encerrada_pelo_usuario'
) {
  if (!executor || typeof executor.query !== 'function') {
    throw new Error('Executor inválido ao revogar sessão.');
  }

  if (!uuidValido(sessaoId)) {
    return false;
  }

  const resultado = await executor.query(
    `
      UPDATE sessoes
      SET
        revogada_em = NOW(),
        motivo_revogacao = $3
      WHERE id = $1
        AND usuario_id = $2
        AND revogada_em IS NULL
    `,
    [sessaoId, usuarioId, motivo]
  );

  return resultado.rowCount > 0;
}

// ============================================================
// REVOGAR TODAS AS SESSÕES DO USUÁRIO
// ============================================================

async function revogarTodasSessoes(
  executor,
  usuarioId,
  {
    exceto = null,
    motivo = 'encerradas_em_massa',
  } = {}
) {
  if (!executor || typeof executor.query !== 'function') {
    throw new Error(
      'Executor inválido ao revogar todas as sessões.'
    );
  }

  const sessaoExceto = uuidValido(exceto)
    ? exceto
    : null;

  const resultado = await executor.query(
    `
      UPDATE sessoes
      SET
        revogada_em = NOW(),
        motivo_revogacao = $3
      WHERE usuario_id = $1
        AND revogada_em IS NULL
        AND ($2::uuid IS NULL OR id <> $2::uuid)
    `,
    [usuarioId, sessaoExceto, motivo]
  );

  return resultado.rowCount;
}

// ============================================================
// LISTAR SESSÕES ATIVAS
// ============================================================

async function listarSessoesAtivas(usuarioId) {
  const { rows } = await pool.query(
    `
      SELECT
        id,
        navegador,
        sistema,
        tipo_dispositivo,
        ip,
        criada_em,
        ultimo_acesso,
        expira_em
      FROM sessoes
      WHERE usuario_id = $1
        AND revogada_em IS NULL
        AND expira_em > NOW()
      ORDER BY ultimo_acesso DESC
    `,
    [usuarioId]
  );

  return rows;
}

// ============================================================
// EXPORTAÇÕES
// ============================================================

module.exports = {
  TEMPO_SESSAO_DIAS,
  uuidValido,
  interpretarUserAgent,
  criarSessao,
  revogarSessao,
  revogarTodasSessoes,
  listarSessoesAtivas,
};